"""Local-only WhiskeyPose FBX processor (Blender required).

Alpha 0.1 adds procedural humanoid Auto-Rig + Auto-Skin. No cloud service.
The worker is loopback-only, and reads files only from ephemeral temp folders.
"""

from __future__ import annotations

import base64
import binascii
import glob
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

from marker_rig import validate_payload
from envelope_skin import validate_envelopes
from blender_engine import (active_blender, browse_blender, discover_blenders,
                            read_config, save_path, test_blender)

HOST = '127.0.0.1'
PORT = 8765
MAX_POST_BYTES = 75 * 1024 * 1024
MAX_FBX_BYTES = 50 * 1024 * 1024
ROUNDTRIP_SCRIPT = Path(__file__).with_name('fbx_roundtrip.py')
AUTORIG_SCRIPT = Path(__file__).with_name('auto_rig.py')
PROCESS_LOCK = Lock()
ENGINE_DIALOG_LOCK = Lock()


def find_blender() -> str | None:
    chosen = active_blender()
    return chosen['path'] if chosen else None


class Handler(BaseHTTPRequestHandler):
    def reply_json(self, status: int, data: dict) -> None:
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == '/api/health':
            blender = active_blender()
            self.reply_json(200, {
                'service': 'whiskeypose-local-worker',
                'version': '0.3.0',
                'blenderAvailable': bool(blender),
                'blenderPath': blender['path'] if blender else None,
                'autoRigAvailable': AUTORIG_SCRIPT.is_file() and bool(blender),
            })
            return
        if self.path == '/api/engines':
            self.reply_json(200, {
                'active': active_blender(),
                'candidates': discover_blenders(),
                'savedPath': read_config().get('blenderPath'),
            })
            return
        self.reply_json(404, {'error': 'Not found'})

    def do_POST(self) -> None:
        if self.path in ('/api/engines/select', '/api/engines/test', '/api/engines/browse'):
            self.engine_action()
            return
        if self.path not in ('/api/export-fbx', '/api/auto-rig'):
            self.reply_json(404, {'error': 'Not found'})
            return
        blender = find_blender()
        if not blender:
            self.reply_json(503, {'error': 'Blender not found. Open External Engines to select blender.exe.'})
            return
        if not PROCESS_LOCK.acquire(blocking=False):
            self.reply_json(409, {'error': 'Blender is already processing another job.'})
            return
        try:
            self.process_fbx(blender)
        finally:
            PROCESS_LOCK.release()

    def engine_action(self) -> None:
        """Local-only configuration. The browser cannot discover arbitrary disk paths."""
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 0 or length > 8192:
                self.reply_json(413, {'error': 'Engine settings request is too large.'})
                return
            if 'application/json' not in self.headers.get('Content-Type', ''):
                self.reply_json(415, {'error': 'Expected application/json.'})
                return
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
            if not isinstance(payload, dict):
                raise ValueError('Invalid engine settings.')
            if self.path == '/api/engines/browse':
                if not ENGINE_DIALOG_LOCK.acquire(blocking=False):
                    self.reply_json(409, {'error': 'File chooser is already open.'})
                    return
                try:
                    chosen = browse_blender()
                except RuntimeError as exc:
                    self.reply_json(503, {'error': str(exc)})
                    return
                finally:
                    ENGINE_DIALOG_LOCK.release()
                self.reply_json(200, {'path': chosen, 'cancelled': chosen is None})
                return
            path = payload.get('path')
            if path is not None and (not isinstance(path, str) or len(path) > 2048):
                raise ValueError('Invalid Blender path.')
            if self.path == '/api/engines/test':
                self.reply_json(200, test_blender(path or None))
                return
            if path:
                report = test_blender(path)
                save_path(path)
            else:
                save_path(None)
                report = {'ok': True, 'mode': 'auto'}
            self.reply_json(200, {**report, 'active': active_blender()})
        except (ValueError, UnicodeError, json.JSONDecodeError) as exc:
            self.reply_json(422, {'error': str(exc)[:320]})
        except OSError as exc:
            self.reply_json(500, {'error': 'Cannot save engine settings: ' + str(exc)[:240]})
    def process_fbx(self, blender: str) -> None:
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > MAX_POST_BYTES:
                self.reply_json(413, {'error': 'Upload too large (max 50 MB FBX).'}); return
            if 'application/json' not in self.headers.get('Content-Type', ''):
                self.reply_json(415, {'error': 'Expected application/json.'}); return
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
            if not isinstance(payload, dict) or not str(payload.get('name', '')).lower().endswith('.fbx'):
                self.reply_json(400, {'error': 'An FBX filename and content are required.'}); return
            content = base64.b64decode(payload.get('fbxBase64', ''), validate=True)
            if not content or len(content) > MAX_FBX_BYTES:
                self.reply_json(413, {'error': 'FBX input must be between 1 byte and 50 MB.'}); return

            with tempfile.TemporaryDirectory(prefix='whiskeypose_') as folder:
                directory = Path(folder)
                source = directory / 'source.fbx'
                target = directory / 'result.fbx'
                report = directory / 'report.json'
                source.write_bytes(content)
                if self.path == '/api/auto-rig':
                    # Never silently fall back to the old bounding-box rig.
                    if payload.get('skeletonApproved') is not True:
                        self.reply_json(400, {'error': 'Approve skeleton preview before generating rig and skin.'}); return
                    landmarks = payload.get('markers')
                    validate_payload(landmarks)
                    marker_path = directory / 'markers.json'
                    marker_path.write_text(json.dumps(landmarks), encoding='utf-8')
                    method = payload.get('method', 'auto')
                    if method not in ('auto', 'proximity', 'envelope'):
                        self.reply_json(400, {'error': 'Unsupported weight method.'}); return
                    command = [blender, '--background', '--factory-startup', '--python', str(AUTORIG_SCRIPT), '--', '--input', str(source), '--output', str(target), '--report', str(report), '--method', method, '--markers', str(marker_path)]
                    if method == 'envelope':
                        names = ['pelvis','spine','chest','neck','head'] + [f'{segment}.{side}' for side in ('L','R') for segment in ('shoulder','upper_arm','forearm','hand','thigh','shin','foot')]
                        validate_envelopes(payload.get('envelopes'), [{'name':name} for name in names])
                        envelope_path = directory / 'envelopes.json'
                        envelope_path.write_text(json.dumps(payload['envelopes']), encoding='utf-8')
                        command += ['--envelopes', str(envelope_path)]
                else:
                    pose = payload.get('pose')
                    if pose is not None and (not isinstance(pose, dict) or not isinstance(pose.get('bones'), list)):
                        self.reply_json(400, {'error': 'Invalid pose payload.'}); return
                    pose_path = directory / 'pose.json'
                    pose_path.write_text(json.dumps(pose or {'bones': []}), encoding='utf-8')
                    command = [blender, '--background', '--factory-startup', '--python', str(ROUNDTRIP_SCRIPT), '--', '--input', str(source), '--output', str(target), '--pose', str(pose_path)]
                try:
                    job = subprocess.run(command, capture_output=True, text=True, timeout=300, check=False)
                except subprocess.TimeoutExpired:
                    self.reply_json(504, {'error': 'Blender timed out after 300 seconds.'}); return
                if job.returncode != 0 or not target.is_file():
                    lines = (job.stderr + '\n' + job.stdout).strip().splitlines()
                    self.reply_json(500, {'error': 'Blender processing failed: ' + ' | '.join(lines[-6:])[:800]}); return
                metadata = json.loads(report.read_text(encoding='utf-8')) if report.is_file() else {}
                result = target.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'application/octet-stream')
                self.send_header('Content-Disposition', 'attachment; filename="WhiskeyPose_Result.fbx"')
                self.send_header('Content-Length', str(len(result)))
                self.send_header('X-WhiskeyPose-Report', json.dumps(metadata, separators=(',', ':')))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(result)
        except (ValueError, TypeError, KeyError, json.JSONDecodeError, binascii.Error) as exc:
            self.reply_json(400, {'error': 'Invalid request: ' + str(exc)[:160]})
        except (ConnectionAbortedError, BrokenPipeError):
            pass
        except Exception as exc:
            self.reply_json(500, {'error': 'Worker error: ' + str(exc)[:250]})


if __name__ == '__main__':
    print(f'WhiskeyPose Blender worker: http://{HOST}:{PORT}')
    print('Blender:', find_blender() or 'NOT FOUND — set BLENDER_PATH')
    print('Alpha 0.3.0 envelope skin + 16-marker rig (experimental).')
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
