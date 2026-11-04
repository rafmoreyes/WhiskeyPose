# WhiskeyPose Alpha 0.3.4 — Automatic Skin Solver

Goal: make SSR automatic weight generation the **default**, so artists need not tune capsule radii or influence strengths.

## Architecture (existing dependencies only)

- The existing local Blender worker invokes `backend/auto_rig.py --method smart-auto`.
- Blender first attempts **ARMATURE_AUTO bone-heat**. When it fails or leaves incomplete vertices, the solver uses deterministic anatomical-distance seeds.
- `backend/automatic_skin.py` filters seed weights through `mesh_region_ownerships()`, preserving fixed head/neck and rigid accessories. The mesh face graph then smooths unrestricted transitions for four iterations, with UV seam welding and a local distance cutoff. The resulting maximum-four normalized weights are written into real Blender vertex groups and exported in the FBX.
- No envelope radius or influence strength is used by this method. Legacy `envelope` and `auto` modes are preserved for comparison.
- The browser's `src/live_skin.js` **does not recompute automatic skin weights**: it shows the imported FBX weights as supplied by Blender. The bone heatmap displays those values. In Advanced Envelope Override it uses the existing live capsule calculations, and switching back restores the imported buffers.
- The Deformation Test and existing rig/marker pipeline are unchanged.

## Windows acceptance test

1. Close Vite / Worker terminal windows, run `Iniciar-WhiskeyPose.bat` (performs git pull).
2. Import an unrigged A-/T-Pose humanoid FBX, place all 16 joint markers, approve the skeleton.
3. Open Skin and leave **Automatic Skin — SSR + topology** selected. Do not touch envelope controls. Generate Rig + Skin.
4. Run Deformation Test: isolate Head, Neck, shoulders/arms, elbows and knees. Check no shoulder motion from Head, no opposite-limb leakage, and look for natural elbow/knee gradients.
5. Select individual bones and toggle the influence heatmap and region map. The heatmap is the **actual Blender-generated skin**.
6. Enable Advanced Envelope Override and deliberately alter one elbow capsule. Verify that the deformation changes immediately while the pose stays put; disable Override and confirm the original automatic skin returns.
7. Download Automatic Skin FBX and re-import in Blender/Unreal. Compare the bone names, influences and Rest Pose to the in-app visualization.
8. Repeat with detached hair, an accessory and a loose garment. Record which pieces are still misclassified rather than manually fixing every envelope.

## Known limitations and reporting

- The implementation uses deterministic SSR regions and Blender's bone heat, **not learned AI**. A long coat, loose skirt, asymmetrical mesh, or clothing merged into the body may still confuse automatic ownership.
- The procedural fallback is topology-smoothed anatomical distance, not a true global harmonic/heat equation solver; no claim of equivalent deformation quality.
- Bone-heat can fail on disconnected accessories; diagnostics list whether its seed was used and the count of fallback vertices.
- Automatic skin uses four smoothing passes on connected faces and welds only nearly identical positions. It does not paint per-vertex weights or install anything.
- Python tests can validate normalization, exclusion, group writing and HTTP forwarding; Node mock tests can verify no-pose-reset buffer changes. **Real FBX, WebGL and Blender/Steam results require artist verification.**
