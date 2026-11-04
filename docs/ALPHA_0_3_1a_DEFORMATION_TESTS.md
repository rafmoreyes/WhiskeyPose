# Alpha 0.3.1a — Deformation Test: validation

This adds a reversible joint-scanning animation with no Blender / Python changes.

## Functional acceptance
1. Rig a character, pose it manually and remember the pose.
2. Open Pose, select Head and click Play. Head moves without any other direct-bone animation. Run Neck separately to investigate head ownership.
3. Choose Full Scan: verify sequential Head, Neck, Shoulders + arms, Elbows + wrists, Torso, Hips/thighs, Knees and Feet. Limbs should return to their baseline between sections.
4. Pause and Resume at a non-neutral frame. Stop: the exact manual pose from before Play must be restored.
5. Switch to Skin while playing. Change an envelope radius/strength; the animation should continue and the deform should update live.
6. Stop; save pose JSON and confirm the file reflects only the artist pose, not the transient test. Re-import a different model and verify animation has stopped.
7. Imported FBX skeletons with other naming conventions must fail gracefully (unsupported tracks skipped) rather than corrupting the rig.

## Limitations
The test is deterministic bone-space motion, not a production animation or IK solver. The chosen axes are world-reference motions mapped to the parent's local frame at capture. Bone roll / axes from unusual rigs still need artist testing; a positive knee bend may not correspond to anatomical flexion for every FBX.
