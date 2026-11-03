# WhiskeyPose Alpha 0.2.2 — Anatomy & Skeleton Preview

## Architecture

No additional program or cloud service. Vite + Three.js renders the markers and the **same 19-bone structural template** calculated in Python for Blender. The worker uses confirmed normalized marker data to create a rig, and only then applies automatic weights (bone heat, with existing fallback).

The 16 markers are: Chin, Neck, Chest, Groin, and L/R Shoulder, Elbow, Wrist, Knee, Heel and Toe. Extra markers do not increase the 19-bone template count; they specify joint locations more precisely.

## Manual artist acceptance tests

1. `git pull` in the WhiskeyPose repository; restart both `start-whiskeypose.cmd` and `start-worker.cmd`. Verify UI says **Alpha 0.2.2** and worker is Ready.
2. Import an unrigged A-Pose FBX. Open **Rig**; verify **16 markers** appear and both Shoulder points and Neck can be dragged individually.
3. With **Mirror L/R** enabled, move Left Shoulder and verify Right Shoulder reflects. Turn Mirror off and verify it can move independently.
4. Click **Reset suggestions** and verify marker positions return to initial proposals, 0/16 confirmed and skeleton approval is cleared.
5. Click **Confirm all**, then turn on **Skeleton preview**. Verify **19 cyan bone segments**; they should connect Chest→Neck, Neck→Chin, Neck→Shoulder, Shoulder→Elbow and knee→foot.
6. Move a Shoulder marker and verify the upper-arm bone head follows *before* generating skin. Move Neck and confirm neck/chest bones follow too. Inspect in **Front** and **Side** views.
7. Click **Approve skeleton** and verify the Generate button becomes available if the Blender Worker is Ready. Move any point after approval; the Generate button must disable and another review/approval is required.
8. Generate the rig. Verify reported `landmarkCount` is **16**, that a 19-bone FBX loads and the bone endpoints agree with the preview at plausible scale and orientation.
9. Bend the shoulder and elbow in Pose. Check which distortions are weight issues rather than misplaced joints. Validate clothing and footwear before declaring production usability.
10. Click **Edit source markers**, readjust, reapprove and regenerate. Test **Save/Load markers JSON** and older v2 marker drafts; new points must require review.

## Automated checks

From the project root:

```sh
node --test tests/marker_math.test.mjs
python -m unittest discover -s tests -v
npm run build
```

The last command requires the Node packages to be installed. Python runs a cross-language comparison of JS preview bone coordinates and Python worker coordinates with normalized axis conversion. **Neither test executes Blender**, so real FBX export must be verified on the artist workstation.

## Known limitations

- The preview is structural and is not a skin, IK, or deformation preview.
- Hip joints, ankles and head tip still use heuristics, and meshes with unconventional axes or huge loose garments may fit poorly.
- The JavaScript preview uses the Three.js model bounds, while Blender uses FBX-imported bounds; differences in FBX transforms/axes can affect real-world placement. Use the generated FBX to verify.
- Web frontend and actual FBX round-trip need acceptance testing on Windows with the selected Steam Blender engine.
