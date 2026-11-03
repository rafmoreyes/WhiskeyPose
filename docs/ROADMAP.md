# WhiskeyPose — Progressive MVP

## Guiding principles

- FBX is the primary input/output format.
- Keep the original character silhouette, proportions, UVs and materials.
- The artist can fix problems without restarting the whole pipeline.
- Features must be demonstrable and tested, not just visible in the UI.
- Start with stylized bipeds in A-pose or T-pose.

## Alpha 0.0 — Feasibility and diagnostics

- [x] Project skeleton and local browser viewport
- [x] FBX import, mesh diagnostics, existing rig/skin inspection
- [x] Basic per-bone rotation controls and pose JSON (only pre-rigged models)
- [x] Experimental Blender FBX re-export bridge; **not validated**
- [ ] Verify import with three user-supplied FBX characters
- [ ] Verify Blender and Unreal FBX export against reference files
- [ ] Benchmark TokenRig auto-rig/auto-skin against three test characters
- [ ] Decide which AI model, if any, meets quality and hardware constraints

## Alpha 0.1 — First complete end-to-end pipeline

- [ ] Generate a usable initial humanoid skeleton from an unrigged FBX
- [ ] Assign initial skin weights automatically
- [ ] Validate deformable mesh by rotating joints
- [ ] Export FBX with functioning skeleton and weights
- [ ] Round-trip FBX compatibility tests in Blender/Unreal

## Alpha 0.2 — Rig correction

- [ ] Interactive bone placement and mirror
- [ ] Recompute weights without redoing the rig
- [ ] Skeleton naming/mapping convention and retargeting metadata

## Alpha 0.3 — Smart skin

- [ ] Weights visualization, normalization, smoothing
- [ ] Region-aware corrections for elbows, shoulders, hips and knees
- [ ] Hard-binding clothes and rigid accessories when appropriate

## Alpha 0.4 — Smart pose

- [ ] IK controls for limbs and torso
- [ ] Line of action, contact points, poses library
- [ ] Mirror, save/reset, compare pose to imported state

## Alpha 0.5 — Pose from image

- [ ] Detect 2D landmarks and estimate initial 3D pose
- [ ] Retarget to character proportions, preserve artistic intent
- [ ] Depth/camera correction and IK polish

## Out of scope for first MVP

Advanced face rigs, quadrupeds, animation timeline, cloth physics, realtime mocap, arbitrary creature anatomy.
