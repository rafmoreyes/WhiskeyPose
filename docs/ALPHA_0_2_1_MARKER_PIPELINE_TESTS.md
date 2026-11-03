# WhiskeyPose Alpha 0.2.1 — Marker-driven Auto-Rig (validation)

## Change summary

This is a corrective build after the Alpha 0.2.0 user test failed. The older rig was bounding-box based and ignored all markers. This build requires 13 confirmed markers and passes normalized coordinates through the local worker to the Blender rig generator.

No new external executables: Node/Vite for UI; existing Python worker and Blender Steam/standalone to generate FBX.

## Critical artist acceptance tests (Windows, actual FBX)

- [ ] Run `git pull` and restart **both** `start-whiskeypose.cmd` and `start-worker.cmd`. Confirm Blender worker Ready.
- [ ] Import an unrigged humanoid FBX. Enter **Rig**. Check 13 markers: Chin, Chest, Groin, both Elbows, Wrists, Knees, Heels and Foot points.
- [ ] Change the Chest and one elbow; **Reset suggestions** restores the positions, switches all indicators to blue, and displays **0/13**.
- [ ] Place Chest, one Heel and one Foot point at desired anatomical positions. Turn Mirror OFF if feet are asymmetric.
- [ ] Click **Confirm all**: **13/13**. The **Generate Rig + Skin from 13 markers** button becomes enabled when Blender worker is Ready.
- [ ] Move the right elbow far enough to create a clearly different upper-arm direction (within anatomy), Confirm all, generate. Inspect the **upper_arm.R** tail and verify its position follows your marked elbow, not a horizontal template.
- [ ] Return to the source with **Edit source markers**, change the same elbow position, Confirm all, regenerate, compare. The bone must move accordingly.
- [ ] Inspect foot bones with different heel and toe placements; verify shin/foot direction matches the intended locations.
- [ ] Bend elbows/knees to inspect skinning. Reimport the resulting FBX in Blender and check axis/scale. Skin quality and independent clothing islands remain experimental.
- [ ] Test both T-Pose and A-Pose, in front/side views.

## Automated checks

```sh
node --check src/main.js
node --check src/marker_tool.js
node --test tests/marker_math.test.mjs
python -m unittest discover -s tests -v
```

The Python HTTP integration test mocks Blender to check that marker data actually reaches the backend. The Python solver test verifies that altering elbow and foot points changes generated bone coordinates. These are **not** substitutes for an actual Blender FBX roundtrip/deformation test; that still needs to be performed on the user's Windows installation. The Three.js/Blender coordinate conversion assumes a front-facing upright FBX; inspect results for rotated/mirrored source exports.
