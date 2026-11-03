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

HOST = '127.0.0.1'
PORT = 8765
MAX_POST_BYTES = 75 * 1024 * 1024
MAX_FBX_BYTES = 50 * 1024 * 1024
ROUNDTRIP_SCRIPT = Path(__file__).with_name('fbx_roundtrip.py')
AUTORIG_SCRIPT = Path(__file__).with_name('auto_rig.py')
PROCESS_LOCK = Lock()


def find_blender() -> str | None:
    override = os.environ.get('BLENDER_PATH', '').strip().strip('"')
    if override and Path(override).is_file():
        return override
    found = shutil.which('blender')
    if found:
        return found
    if os.name == 'nt':
        paths = glob.glob(r'C:\Program Files\Blender Foundation\Blender *\blender.exe')
        if paths:
            return sorted(paths, reverse=True)[0]
    return None


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
        if self.path != '/api/health':
            self.reply_json(404, {'error': 'Not found'})
            return
        self.reply_json(200, {
            'service': 'whiskeypose-local-worker',
            'version': '0.1.0',
            'blenderAvailable': bool(find_blender()),
            'autoRigAvailable': AUTORIG_SCRIPT.is_file() and bool(find_blender()),
        })

    def do_POST(self) -> None:
        if self.path not in ('/api/export-fbx', '/api/auto-rig'):
            self.reply_json(404, {'error': 'Not found'})
            return
        blender = find_blender()
        if not blender:
            self.reply_json(503, {'error': 'Blender not found. Install Blender or set BLENDER_PATH.'})
            return
        if not PROCESS_LOCK.acquire(blocking=False):
            self.reply_json(409, {'error': 'Blender is already processing another job.'})
            return
        try:
            self.process_fbx(blender)
        finally:
            PROCESS_LOCK.release()

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
                    method = payload.get('method', 'auto')
                    if method not in ('auto', 'proximity'):
                        self.reply_json(400, {'error': 'Unsupported weight method.'}); return
                    command = [blender, '--background', '--factory-startup', '--python', str(AUTORIG_SCRIPT), '--', '--input', str(source), '--output', str(target), '--report', str(report), '--method', method]
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
    print('Alpha 0.1 local humanoid rig/skin + FBX export (experimental).')
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
