"""Discover and manage local Blender installations for WhiskeyPose.

No installers, remote services or third-party Python packages are used.
Selections live in the current user's config directory, outside the Git repo.
"""

from __future__ import annotations

import glob
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from threading import Lock

ENGINE_LOCK = Lock()


def config_path() -> Path:
    base = os.environ.get('APPDATA') if os.name == 'nt' else None
    return (Path(base) if base else Path.home() / '.config') / 'WhiskeyPose' / 'engines.json'


def _normalize(path: str | os.PathLike | None) -> Path | None:
    if not path:
        return None
    try:
        return Path(str(path).strip().strip('"')).expanduser()
    except (OSError, ValueError):
        return None


def valid_blender_path(path: str | os.PathLike | None) -> bool:
    p = _normalize(path)
    if not p or p.name.lower() not in ('blender.exe', 'blender'):
        return False
    try:
        return p.is_file()
    except OSError:
        return False


def read_config() -> dict:
    try:
        data = json.loads(config_path().read_text(encoding='utf-8'))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_path(path: str | None) -> None:
    """Persist an explicit choice, or reset to auto detection with None."""
    if path is not None and not valid_blender_path(path):
        raise ValueError('Select an existing Blender executable (blender.exe).')
    with ENGINE_LOCK:
        destination = config_path()
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=str(destination.parent),
                                             prefix='engines-', suffix='.tmp', delete=False) as handle:
                temp_path = Path(handle.name)
                json.dump({'blenderPath': str(_normalize(path)) if path else None}, handle, indent=2)
            temp_path.replace(destination)
        finally:
            if temp_path:
                temp_path.unlink(missing_ok=True)


def steam_library_paths(contents: str) -> list[str]:
    """Read Steam's old and new libraryfolders.vdf formats without a VDF dependency."""
    paths = []
    for value in re.findall(r'"path"\s*"([^"]+)"', contents, flags=re.I):
        paths.append(value.replace('\\\\', '\\'))
    # Legacy: "1" "D:\\SteamLibrary", without nested path objects.
    for value in re.findall(r'(?m)^\s*"\d+"\s*"([^"]+)"', contents):
        paths.append(value.replace('\\\\', '\\'))
    return list(dict.fromkeys(paths))


def steam_roots() -> list[Path]:
    raw = [os.environ.get('STEAM_PATH'), os.environ.get('STEAM_DIR')]
    for env in ('PROGRAMFILES(X86)', 'PROGRAMFILES', 'ProgramFiles(x86)', 'ProgramFiles'):
        value = os.environ.get(env)
        if value:
            raw.append(str(Path(value) / 'Steam'))
    if os.name == 'nt':
        try:
            import winreg
            keys = (
                (winreg.HKEY_CURRENT_USER, r'Software\Valve\Steam', ('SteamPath', 'SteamExe')),
                (winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\WOW6432Node\Valve\Steam', ('InstallPath',)),
                (winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Valve\Steam', ('InstallPath',)),
            )
            for root, key_name, fields in keys:
                try:
                    with winreg.OpenKey(root, key_name) as key:
                        for field in fields:
                            try:
                                value, _ = winreg.QueryValueEx(key, field)
                                if field == 'SteamExe':
                                    value = str(Path(value).parent)
                                raw.append(value)
                            except OSError:
                                continue
                except OSError:
                    continue
        except ImportError:
            pass
        for letter in 'CDEFGHIJKLMNOPQRSTUVWXYZ':
            drive = Path(letter + ':\\')
            if drive.exists():
                raw.extend(str(drive / name) for name in ('Steam', 'SteamLibrary', 'Games/SteamLibrary'))
    raw.extend((r'C:\Program Files (x86)\Steam', r'C:\Program Files\Steam'))
    return list(dict.fromkeys(p for v in raw if (p := _normalize(v)) is not None))


def steam_libraries() -> list[Path]:
    libraries: list[Path] = []
    seen: set[str] = set()
    for root in steam_roots():
        candidates = [root]
        vdf = root / 'steamapps' / 'libraryfolders.vdf'
        if vdf.is_file():
            try:
                candidates += [Path(p) for p in steam_library_paths(vdf.read_text(encoding='utf-8-sig', errors='replace'))]
            except OSError:
                pass
        for lib in candidates:
            key = str(lib).casefold()
            if key not in seen:
                seen.add(key)
                libraries.append(lib)
    return libraries


def discover_blenders() -> list[dict]:
    """Return existing Blender executables, with user's selection taking priority."""
    found: list[dict] = []
    seen: set[str] = set()

    def add(path, source):
        p = _normalize(path)
        if not valid_blender_path(p):
            return
        key = str(p.resolve()).casefold() if os.name == 'nt' else str(p.resolve())
        if key in seen:
            return
        seen.add(key)
        found.append({'path': str(p), 'source': source})

    config = read_config()
    add(config.get('blenderPath'), 'Selected')
    add(os.environ.get('BLENDER_PATH'), 'Environment')

    for library in steam_libraries():
        add(library / 'steamapps' / 'common' / 'Blender' / 'blender.exe', 'Steam')

    for root in (os.environ.get('ProgramW6432'), os.environ.get('PROGRAMFILES'),
                 os.environ.get('ProgramFiles'), r'C:\Program Files'):
        if root:
            for path in sorted(glob.glob(str(Path(root) / 'Blender Foundation' / 'Blender *' / 'blender.exe')), reverse=True):
                add(path, 'Blender Foundation')
    add(shutil.which('blender'), 'PATH')
    return found


def active_blender() -> dict | None:
    candidates = discover_blenders()
    return candidates[0] if candidates else None


def test_blender(path: str | None = None) -> dict:
    """Confirm the selected executable is actually Blender, not just a file."""
    resolved = path or (active_blender() or {}).get('path')
    if not valid_blender_path(resolved):
        raise ValueError('Blender executable not found. Select blender.exe or run Auto Detect.')
    try:
        job = subprocess.run([str(_normalize(resolved)), '--version'], text=True,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             timeout=20, check=False, stdin=subprocess.DEVNULL)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ValueError(f'Could not start Blender: {exc}') from exc
    output = (job.stdout or '') + '\n' + (job.stderr or '')
    match = re.search(r'(?m)^Blender\s+(\d+(?:\.\d+){1,3})\b', output)
    if job.returncode != 0 or not match:
        raise ValueError('The selected executable did not respond as Blender (--version).')
    return {'ok': True, 'path': str(_normalize(resolved)), 'version': match.group(1)}


def browse_blender() -> str | None:
    """Show an OS-native chooser from the local worker (never a fake browser path)."""
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError as exc:
        raise RuntimeError('The Python Tkinter GUI is unavailable. Paste the Blender path manually.') from exc
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        path = filedialog.askopenfilename(
            parent=root, title='WhiskeyPose - Select blender.exe',
            filetypes=[('Blender executable', 'blender.exe'), ('All files', '*.*')],
        )
        root.destroy()
        return path or None
    except (tk.TclError, OSError) as exc:
        raise RuntimeError('Unable to open the native file picker. Paste the Blender path manually.') from exc
