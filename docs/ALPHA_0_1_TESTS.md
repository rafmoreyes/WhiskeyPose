# WhiskeyPose — Alpha 0.1.0 test checklist

Use an unrigged **FBX humanoid in T- or A-pose**. Keep the Vite app and the Blender worker open simultaneously.

1. Click **Import FBX** and load your model. Confirm visible mesh, correct orientation, zero bones and zero skinned meshes.
2. Start `start-worker.cmd`; bottom-right should say **Ready**. If not, install Blender / Python or set `BLENDER_PATH`, and click ↻.
3. Open **Rig**, click **Auto-Rig + Auto-Skin**. The button should show a busy state; do not close the worker CMD.
4. Expect a generated `_WhiskeyPose_Rigged.fbx` preview with ~19 bones and >=1 skinned mesh. Turn on Bones if not already visible.
5. Open **Pose** and bend upper arms, forearms, thighs and shins; visually inspect shoulders, elbows, hips and knees. Restore neutral pose.
6. Click **Download rigged FBX**, import it into Blender and check skeleton, armature modifiers, weight groups and vertex deformation.
7. Confirm export scale, handedness, normals and material assignment; report any discrepancies.
8. Try one multi-mesh humanoid (separate hair/shoes). Inspect whether parts follow the correct bones.
9. Try a nonhumanoid or existing rig. Current tool should not overwrite an existing rig or promise automatic creature support.

## Expected limitations

- This is a **heuristic** rig; landmarks are not AI predicted.
- Large sleeves, unusual silhouettes and intersecting meshes may create skinning artifacts.
- Export of *edited poses* is still an independent experimental path (FBX bone conventions can differ).
- Test results on actual FBX models are pending; unit tests do not replace visual verification.
