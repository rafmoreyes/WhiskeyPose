# WhiskeyPose 🥃

**Automating Rig → Skin → Pose for stylized 3D characters.**

WhiskeyPose is a small, FBX-first web application. The eventual goal is to import an unrigged character, automatically create a skeleton and skin weights, edit a pose, and export a usable FBX without a heavyweight DCC workflow.

## Current version — Alpha 0.0.1 (technical preview)

**Already implemented:**
- Import local `.fbx` files in the browser (binary FBX supported by Three.js).
- Orbit, pan, zoom, framing (`F`), grid, wireframe, and bone overlay.
- Inspect mesh count, vertices, triangles, materials, animations, detected bones and skinned meshes.
- Inspect bones and existing skin bindings.
- On already-rigged FBX characters: rotate an individual bone on X/Y/Z, reset and export pose to `.json`.
- **Experimental** FBX re-export through an optional local Blender worker. Pose transfer is **not validated** for all FBX transform conventions.

**Not yet implemented:** automatic skeleton generation, automatic skin weights, IK, image-to-pose, high-quality pose transfer, facial rigging, or guaranteed round-trip equivalence. An unrigged model will still be unrigged after this prototype's FBX round-trip.

## Run on Windows 11

Requirements: **Node.js 20.19+** and a modern browser. To use experimental FBX export, also install **Blender** and **Python 3.10+**.

1. Clone this repository with `git clone https://github.com/rafmoreyes/WhiskeyPose.git` (one time), or run `git pull` inside an existing clone.
2. Double-click `start-whiskeypose.cmd`. It runs `npm install` on first use, then starts the UI at `http://127.0.0.1:5173`.
3. Drop a `.fbx` file in the viewport or click **Import FBX**.

Alternative using a terminal:

```powershell
npm install
npm run dev
```

### Optional experimental export worker

To enable the **Export FBX** button, run `start-worker.cmd` in a second console. This worker launches Blender locally in background mode; no file goes to the cloud. If Blender is not found, set `BLENDER_PATH` to the path of `blender.exe` in the same console before starting the worker. For example:

```cmd
set "BLENDER_PATH=C:\Program Files\Blender Foundation\Blender 4.5\blender.exe"
python backend\server.py
```

The worker listens **only on `127.0.0.1:8765`**. Vite proxies `/api` to it. Use trusted source FBX files. The input FBX must be at most 50 MB for worker export; browser inspection allows up to 200 MB. Exporting can take time, particularly with detailed meshes.

**Important:** Blender uses different FBX bone conventions than Three.js. Pose rotations are sent as experimental local quaternion deltas, and may need correction. Verify exported scale, axes, geometry, bone orientation and final pose in Blender and Unreal Engine. Treat the output as an experiment, not production-safe rigging.

## Scope and roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/ALPHA_0_0_TESTS.md](docs/ALPHA_0_0_TESTS.md).

The project deliberately targets humanoids first. Creature rigs, advanced weight painting, animation timelines and physical simulations are outside the initial MVP.

## Architecture

- **Frontend:** Vite + plain JavaScript + Three.js (lightweight feasibility baseline).
- **FBX inspection:** Three.js `FBXLoader`.
- **Local worker:** Python standard-library HTTP server + headless Blender.
- **Future intelligent rig/skin:** a separate Python GPU inference service (TokenRig/UniRig feasibility before integration).

No user FBX files are stored in the repository or uploaded to remote services by this prototype.

## Git workflow

Development is on **`main`** with small, reviewable commits. Approved milestones become tagged baselines. Pull updates locally with `git pull`. Do not commit user character assets; `.fbx`, `.glb` and `.gltf` are git-ignored by default.