# WhiskeyPose — External Engines (Alpha 0.1.1)

## What runs where

- **Browser / Vite (127.0.0.1:5173):** Three.js viewport, controls, FBX import.
- **Local worker (127.0.0.1:8765):** Python HTTP server, reads only local requests through Vite proxy, launches Blender.
- **Blender (Steam or standalone):** batch-mode FBX import, procedural rig/skin generation, export.

Neither the worker nor the browser installs Blender. Blender is executed only when a job is requested or the user presses **Test Engine**.

## Setup (Windows)

1. Install Python and Node.js if needed; keep the current WhiskeyPose startup scripts.
2. Run `start-whiskeypose.cmd`, then `start-worker.cmd`.
3. Open WhiskeyPose in the browser at `http://127.0.0.1:5173`.
4. Click the gear icon by **Blender worker** in the bottom-right Inspector footer.
5. The engine picker scans Steam libraries and regular Blender installations.
6. Select a candidate, press **Test Engine** to run `blender.exe --version`, then **Use This Blender** to persist it.
7. If Steam is installed on another drive, it should be detected from Steam's `libraryfolders.vdf`. If not, use **Browse...** to pick `blender.exe` or paste its full path.
8. **Use Auto** resets the preference and scans again.

Supported locations include Steam's main and additional library folders, the Valve Steam registry keys, common SteamLibrary directories on local drives, Blender Foundation under Program Files, and `BLENDER_PATH`/`PATH` overrides.

When using an independent Blender installation only for WhiskeyPose, use Browse/Use This Blender. You don't need to uninstall or alter the Steam version.

## File chooser

A browser cannot reliably reveal the full local executable path. The **Browse** button therefore opens a local native file dialog through the Python worker (Tkinter). If Tkinter is missing, paste the executable path manually. Only `blender.exe` is accepted on Windows. The worker confirms Blender version before saving it.

## Persistence and privacy

The selection is stored at `%APPDATA%\WhiskeyPose\engines.json` and not committed to Git. Model files are processed in the worker's temporary directory. There is no cloud upload in this alpha. The worker binds to `127.0.0.1`, so it is not intended for public network hosting. Do not expose the Vite or Worker port to untrusted networks.

## Troubleshooting

- **Offline**: the Python worker isn't reachable; run `start-worker.cmd` and check its console.
- **No Blender**: worker is running but couldn't find the executable. Open External Engines and select one.
- **Test failed**: verify that the chosen path points to a real Blender executable. Steam must have fully installed the Blender application.
- **Native file dialog unavailable**: paste the full path to `blender.exe` and click **Test Engine**.
- **Auto-Rig still experimental**: successful engine detection does not guarantee correct skeleton/weights. Test with the original A/T-pose FBX and inspect joint deformations.
