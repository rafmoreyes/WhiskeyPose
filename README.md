# WhiskeyPose 🥃

**Automating Rig → Skin → Pose for stylized 3D characters.**

WhiskeyPose is a small, FBX-first web application. The eventual goal is to import an unrigged character, automatically create a skeleton and skin weights, edit a pose, and export a usable FBX without a heavyweight DCC workflow.

## Current version — Alpha 0.2.2 (marker-driven Auto-Rig pilot)

**Implemented:**
- Import/inspect `.fbx` models in the browser, with viewport orbit/pan/zoom, framing, grid, wireframe and bone visualization.
- **Auto-Rig + Auto-Skin** for upright, roughly symmetric humanoids in T/A pose **without an existing rig**, via local Blender worker.
  - Generate a **19-bone humanoid template** from **13 user-confirmed markers** (shoulders, ankles, hand ends and head top inferred).
  - Use Blender's **bone-heat automatic weights** when possible; if it fails or leaves unweighted vertices, calculate normalized nearest-bone proximity weights (4 influences maximum).
  - Return a new skinned `.fbx` to the browser, render it for inspection and enable a **Download Rigged FBX** button.
- Inspect generated bones and skinned meshes and rotate bones to test skin deformations.
- Experimental FBX round-trip export for existing rigs and pose JSON saving (pose transfer is not fully validated).

**Known limitations:** This Auto-Rig is procedural and **NOT powered by TokenRig/UniRig AI**. Some bones are inferred from user markers and mesh bounds; placement can be inaccurate for large heads, asymmetry, unusual limbs, wings, tails, props and loose clothing. No IK, reliable pose export, topology-aware weight editor, anatomy detection, or guaranteed Unreal-ready result yet. Always verify deformation and scale in Blender before production use.

## Run on Windows 11

Requirements: **Node.js 20.19+** and a modern browser. To use Auto-Rig and FBX export, also install **Blender** and **Python 3.10+**.

1. Clone this repository with `git clone https://github.com/rafmoreyes/WhiskeyPose.git` (one time), or run `git pull` inside an existing clone.
2. Double-click `start-whiskeypose.cmd`. It runs `npm install` on first use, then starts the UI at `http://127.0.0.1:5173`.
3. In **a second CMD window**, double-click `start-worker.cmd`. Keep both terminals open.
4. Drop an unrigged humanoid `.fbx` (T/A pose) into the viewport, switch to **Rig**, place **13 markers**, select **Confirm all**, then click **Generate Rig + Skin from 13 markers**.
5. When it finishes, inspect bones in **Rig** and bend joints in **Pose**; use **Download Rigged FBX** to save the result.

Alternative using a terminal:

```powershell
npm install
npm run dev
```

### Local Blender worker — required for Auto-Rig

To enable **Auto-Rig + Auto-Skin** and **Export FBX**, run `start-worker.cmd` in a second console. This worker launches Blender locally in background mode; no file goes to the cloud. If Blender is not found, set `BLENDER_PATH` to the path of `blender.exe` in the same console before starting the worker. For example:

```cmd
set "BLENDER_PATH=C:\Program Files\Blender Foundation\Blender 4.5\blender.exe"
python backend\server.py
```

The worker listens **only on `127.0.0.1:8765`**. Vite proxies `/api` to it. Use trusted source FBX files. The input FBX must be at most 50 MB for worker processing; browser inspection allows up to 200 MB. Exporting can take time, particularly with detailed meshes.

**Important:** Marker normalization and axis conversion are experimental. Blender uses different FBX bone conventions than Three.js. Pose rotations are sent as experimental local quaternion deltas, and may need correction. Verify exported scale, axes, geometry, bone orientation and final pose in Blender and Unreal Engine. Treat the output as an experiment, not production-safe rigging.

## Validation

Run the pure-python rig-template tests with `python -m unittest discover -s tests -v`.
These test skeleton hierarchy and normalized fallback weights. They **do not** validate Blender FBX import/export or deformation quality; those require artist testing with actual models on a machine with Blender installed. Test with the model already imported in Alpha 0.0, and review shoulder, elbow, hip and knee bends, clothes, normals and unit scale.

## Scope and roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/ALPHA_0_0_TESTS.md](docs/ALPHA_0_0_TESTS.md).

The project deliberately targets humanoids first. Creature rigs, advanced weight painting, animation timelines and physical simulations are outside the initial MVP.

## Architecture

- **Frontend:** Vite + plain JavaScript + Three.js (lightweight feasibility baseline).
- **FBX inspection:** Three.js `FBXLoader`.
- **Local worker:** Python standard-library HTTP server + headless Blender.
- **Future learned rig/skin:** a separate Python GPU inference service (TokenRig/UniRig feasibility before integration).

No user FBX files are stored in the repository or uploaded to remote services by this prototype.

## Git workflow

Development is on **`main`** with small, reviewable commits. Approved milestones become tagged baselines. Pull updates locally with `git pull`. Do not commit user character assets; `.fbx`, `.glb` and `.gltf` are git-ignored by default.


## Blender Engine setup (Steam + standalone)

Alpha 0.1.1 adds **External Engines**. The local Python worker automatically searches
for Blender in Steam installations (including additional libraries from
`steamapps/libraryfolders.vdf`), Blender Foundation installations and `PATH`.

1. Run `start-whiskeypose.cmd` and `start-worker.cmd` in separate windows.
2. Click the **gear icon** next to **Blender worker** in the lower-right corner.
3. Choose a detected installation, click **Test Engine**, then **Use This Blender**.
4. If Blender is not listed, click **Browse...** to choose `blender.exe` via the
   native dialog. You can paste the full path if the dialog is unavailable.
5. **Use Auto** resets to autodetection. A custom selection survives `git pull`.

Selections are kept in `%APPDATA%\WhiskeyPose\engines.json` on Windows (or
`~/.config/WhiskeyPose/engines.json` on Linux), not in the Git repository.
No Blender installation is downloaded or modified. Everything runs locally.
See `docs/BLENDER_ENGINES.md` for troubleshooting and security considerations.

## Alpha 0.2.1 — Marker-driven Auto-Rig (corrective build)

The Alpha 0.2.0 preview showed markers that the Auto-Rig explicitly ignored. Alpha 0.2.1 connects the complete chain:

1. Import unrigged FBX (T-Pose or A-Pose) and place **13 joint markers**: Chin, Chest, Groin, both Elbows, Wrists, Knees, Heels and Foot points.
2. Use Front / Side views, Mirror and Skeleton guide to edit. **Reset suggestions** restores suggested positions and clears all confirmations. Older 8-marker JSON files load with five new points suggested.
3. **Confirm all (13/13)**, then select **Generate Rig + Skin from 13 markers**. Without confirmation, the button stays disabled.
4. The browser normalizes markers against model bounds (Three.js Y-up). The local Python worker validates all 13 positions and Blender maps these coordinates to its imported FBX bounds (Blender Z-up). The generator positions 19 bones from the user landmarks before calculating skin weights. Shoulders, ankles, hand ends and head tip remain inferred.
5. Inspect resulting skeleton/skin. Use **Edit source markers** to return to the original unrigged FBX, change the landmarks and regenerate. **Download rigged FBX** saves the result.

Blender and worker are **required** for rig generation, but not for marker placement. No learned AI, cloud service or new dependencies have been added. The app does not make topology-aware skin corrections. This iteration targets upright front-facing humanoids only.

**Caution:** tests verify the marker-to-bone math and HTTP forwarding, not real Blender FBX deformation. Check bones, axis conversion, scale and skinning on actual character files before adopting results. Read [docs/ALPHA_0_2_1_MARKER_PIPELINE_TESTS.md](docs/ALPHA_0_2_1_MARKER_PIPELINE_TESTS.md).


## Alpha 0.2.2 — Anatomy & Skeleton Preview

This is an incremental upgrade to the existing local architecture, **with no new external dependencies**.

1. Start the Vite UI (`start-whiskeypose.cmd`) and Python/Blender worker (`start-worker.cmd`) as before.
2. Import an unrigged FBX and open **Rig**.
3. Place **16 markers**: Chin, Neck, Chest, Groin; bilateral Shoulders, Elbows, Wrists, Knees, Heels and Foot points. Center markers (Neck, Chest, Groin, Chin) help define the torso, neck and head alignment. Shoulder markers define the arm-pivot locations.
4. Click **Confirm all**, then enable **Skeleton preview**. The cyan bone segments are calculated from the same procedural rules used by the Python worker; the mesh is not altered and no skin is calculated at this stage.
5. Inspect Front and Side, adjust markers, then click **Approve skeleton**. If you move a marker after approving, the approval is automatically revoked. Repeat review to reapprove.
6. With Blender Worker ready, click **Generate Rig + Skin from 16 markers**. The worker rejects old marker payloads and requires the approved workflow flag.
7. Inspect the generated FBX and its deformation; use **Edit source markers** to retry with corrected positions.

Marker JSON files are now v3. Older v1/v2 files still load, but new Shoulder/Neck points start as suggestions and must be reviewed. The actual bone count remains **19**; this release adds explicit landmarks, not additional deform bones.

### Verification limits

The JavaScript preview and Python generator have automated coordinate-parity tests using matched synthetic bounds, with axis conversion. They do **not** prove FBX importer orientation agreement for every file nor validate Blender's bone-heat skinning on your Steam installation. Complex clothing, isolated meshes and soft accessories still require artistic verification. This is a *skeleton-structure* release, not the promised Smart Skin pass.


## One-click launcher (Windows 11)

Run **`Iniciar-WhiskeyPose.bat`** from a Git clone of this repository to start everything with one double click.

1. Executes `git pull --ff-only` on the current branch (stops if an update cannot be applied safely).
2. Starts the Python/Blender Worker in its own CMD window unless port `8765` already responds.
3. Starts the Vite frontend in its own CMD window unless port `5173` already responds.
4. Waits for the web app to respond, then launches **Microsoft Edge as a separate instance** using a persistent, dedicated profile stored at `%LOCALAPPDATA%\WhiskeyPose\EdgeProfile` and opens `http://127.0.0.1:5173/`.

**Requirements:** Git, Node.js, Python, Blender, Microsoft Edge and Windows 11 `curl.exe`. Close previously running Worker/Vite terminals before launching after an update; already-responding services are reused rather than restarted. No new packages are required.

The standalone `start-whiskeypose.cmd` still works; the launcher uses `--no-browser` to avoid opening a duplicate browser tab.
