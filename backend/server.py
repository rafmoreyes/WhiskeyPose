"""Local FBX export bridge for the WhiskeyPose browser prototype.

Runs exclusively on loopback. No external account or cloud upload is required.
The bridge invokes an existing local Blender installation in background mode.
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

HOST = "127.0.0.1"
PORT = 8765
MAX_POST_BYTES = 75 * 1024 * 1024
MAX_FBX_BYTES = 50 * 1024 * 1024
EXPORT_SCRIPT = Path(__file__).with_name("fbx_roundtrip.py")


def find_blender() -> str | None:
    override = os.environ.get("BLENDER_PATH", "").strip().strip('"')
    if override and Path(override).is_file():
        return override
    found = shutil.which("blender")
    if found:
        return found
    if os.name == "nt":
        paths = glob.glob(r"C:\Program Files\Blender Foundation\Blender *\blender.exe")
        if paths:
            return sorted(paths, reverse=True)[0]
    return None


class Handler(BaseHTTPRequestHandler):
    def reply_json(self, status: int, obj: dict) -> None:
        data = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path != "/api/health":
            self.reply_json(404, {"error": "Not found"})
            return
        blender = find_blender()
        self.reply_json(200, {"service": "whiskeypose-local-worker", "blenderAvailable": bool(blender)})

    def do_POST(self) -> None:
        if self.path != "/api/export-fbx":
            self.reply_json(404, {"error": "Not found"})
            return
        blender = find_blender()
        if not blender:
            self.reply_json(503, {"error": "Blender not found. Set BLENDER_PATH or install Blender."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_POST_BYTES:
                self.reply_json(413, {"error": "Invalid/oversized upload (max 50 MB FBX)."})
                return
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            source_name = str(payload.get("name") or "")
            if not source_name.lower().endswith(".fbx"):
                self.reply_json(400, {"error": "FBX input required."})
                return
            content = base64.b64decode(payload.get("fbxBase64", ""), validate=True)
            if not content or len(content) > MAX_FBX_BYTES:
                self.reply_json(413, {"error": "FBX input must be 1 byte–50 MB."})
                return
            pose = payload.get("pose")
            if pose is not None and (not isinstance(pose, dict) or not isinstance(pose.get("bones"), list)):
                self.reply_json(400, {"error": "Invalid pose payload."})
                return
            with tempfile.TemporaryDirectory(prefix="whiskeypose_") as folder:
                directory = Path(folder)
                source = directory / "source.fbx"
                target = directory / "result.fbx"
                pose_path = directory / "pose.json"
                source.write_bytes(content)
                pose_path.write_text(json.dumps(pose or {"bones": []}), encoding="utf-8")
                command = [blender, "--background", "--factory-startup", "--python", str(EXPORT_SCRIPT), "--", "--input", str(source), "--output", str(target), "--pose", str(pose_path)]
                try:
                    proc = subprocess.run(command, text=True, capture_output=True, timeout=180, check=False)
                except subprocess.TimeoutExpired:
                    self.reply_json(504, {"error": "Blender export timed out (180 seconds)."})
                    return
                if proc.returncode != 0 or not target.is_file():
                    error_lines = (proc.stderr + "\n" + proc.stdout).strip().splitlines()
                    self.reply_json(500, {"error": "Blender export failed: " + " | ".join(error_lines[-4:])[:600]})
                    return
                result = target.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Disposition", 'attachment; filename="WhiskeyPose_Experimental.fbx"')
                self.send_header("Content-Length", str(len(result)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(result)
        except (ValueError, TypeError, KeyError, json.JSONDecodeError, binascii.Error) as exc:
            self.reply_json(400, {"error": "Invalid export request: " + str(exc)[:150]})
        except (ConnectionAbortedError, BrokenPipeError):
            pass
        except Exception as exc:
            self.reply_json(500, {"error": "Worker error: " + str(exc)[:200]})


if __name__ == "__main__":
    print(f"WhiskeyPose Blender worker: http://{HOST}:{PORT}")
    print("Blender:", find_blender() or "NOT FOUND — set BLENDER_PATH")
    print("Local-only experimental FBX round-trip. Never expose this port to the internet.")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
