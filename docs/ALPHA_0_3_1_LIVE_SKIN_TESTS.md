# WhiskeyPose Alpha 0.3.1 — Live Envelope Skin (experimental)

## Problem fixed

In Alpha 0.3.0 envelope capsules were rendered at *source-marker rest coordinates*
while the model was now a Blender-exported, posed FBX. The overlay could be invisible
or misplaced. Rebuild Skin also re-imported the FBX, losing all pose transforms.

## Architecture (no new dependencies)

- Three.js **reads the imported SkinnedMesh bind pose** (vertex coordinates transformed by
  mesh.bindMatrix; bone positions reconstructed from inverse bind matrices).
- `src/live_skin.js` caches distances from every rest-pose vertex to each deform bone.
  On an envelope Radius, Strength or Smooth/Rigid change, it recalculates the four
  normalized weights and replaces `skinIndex`/`skinWeight` BufferAttributes in memory.
  The skeleton, scene and posed bone transforms are not replaced. Cache updates are
  coalesced into a render frame. On heavy meshes, adjustments may still stutter.
- `src/envelope_tool.js` anchors selected capsule geometry to **current posed bones**,
  updates the positions each animation frame, and renders the selected envelope in
  translucent amber with an outline, independent of current model materials.
- `Show influence heatmap` temporarily displays per-vertex influence of the selected
  bone. It restores original materials when turned off.
- Pose Test (X/Y/Z rotations) is now in the Skin panel, so the artist can bend an
  articulation while changing Radius or Influence Strength in real time.
- `Save Edited Skin FBX` calls the existing Blender Worker with original source FBX,
  approved markers and new envelopes. It downloads the FBX **without reloading it**;
  therefore the current browser pose does not reset. FBX is exported in **Rest Pose**;
  save pose JSON separately. Experimental posed FBX export remains a distinct action.
- Strength defaults to 1.0 for existing config and is accepted in both Python and JS.
  Strength=0 excludes that bone from normal influence/fallback, unless *all* envelopes
  have zero Strength. This is a relative weight control, not absolute vertex painting.

## Regression checklist (artist on Windows)

1. Launch via `Iniciar-WhiskeyPose.bat`, import source FBX, set/approve 16 markers.
2. Generate **Envelope Skin**, open **Skin**, choose one shoulder or forearm envelope.
3. Bend the selected articulation in **Pose Test**. Check capsule follows it and the
   mesh preserves its pose while moving Radius and Strength.
4. Toggle Show influence heatmap and Show all envelopes.
5. Save Edited Skin FBX; confirm the **browser pose is unchanged**.
6. Re-import saved FBX separately and verify weights, rig, scale, materials and bone
   influences in Blender/Unreal. Note: saved file uses Rest Pose, not current pose.
7. Test the old marker workflow and launcher again.

## Verification status

Pure JS/Python influence math and mock Three.js skin buffers can be tested locally.
Actual WebGL material/skinning behavior and Blender Steam FBX round-trip require a
Windows render/FBX acceptance test. If imported bone naming differs significantly,
Live Skin reports missing bone names and disables the fast preview rather than silently
using incorrect weights.
