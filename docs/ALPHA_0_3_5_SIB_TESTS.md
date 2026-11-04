# Alpha 0.3.5 — SIB + SSR validation

## Goal
**The default is still Automatic Skin / Smart Regions (SSR).** The artist should no longer need to tune capsule radii. The Soft Influence Brush (SIB) edits only problematic areas, with real-time deformation and explicit FBX export.

## Manual acceptance (Windows, Blender via Steam)

1. Stop older Worker/Vite services, update main and relaunch.
2. Import original unrigged humanoid FBX; approve all 16 markers; generate **Automatic Skin — SSR + topology**. Preserve the original generated FBX.
3. Select upper_arm.L. In Skin, enable **Paint influence on mesh**. The selected bone heatmap should appear, and moving the mouse over skinned triangles should show the circular brush cursor.
4. Pose the arm ~30–60 degrees (or run the Deformation Test). Paint over one small area of upper arm. The deformation must change without restarting Blender or resetting the current pose.
5. Test **Shift + paint** to reduce bone influence; try the explicit Reduce option. Check that weight decreases and other bones receive the removed weight without black/unweighted vertices.
6. Paint over two close but **disconnected** pieces; ensure a stroke on one does not affect the other. Test UV seams on a textured model.
7. Use **Undo stroke**, repeat and then **Reset brush**. The automatic baseline should return exactly; no envelope tuning is required.
8. Paint again, choose **Save SIB Skin FBX**. The Worker must confirm *all* requested edited vertex samples or reject the operation. No partial success. The current viewport pose must remain.
9. Reimport the downloaded _SIB.fbx in Blender and verify altered vertex groups, normals, scale and rig hierarchy. Compare skin at shoulders, chest, sleeves, pelvis, skirt and forearm.
10. Test with a second character having multiple separately named mesh objects. If the name or normalized rest positions cannot match, the Worker must show an error and **not** export a misleading file.

## Expected fallback
The older Envelope Override stays available as an alternative; **do not mix it with unreset SIB edits** in this first implementation. No third-party dependencies added.

## Automated tests
- Node: tests/soft_influence_math.test.mjs and tests/live_skin.test.mjs
- Python: tests/test_skin_paint.py and tests/test_server_skin_paint.py
- Existing marker, SSR and Deformation Test regression suites should continue passing.

## Important limitations
No actual Steam Blender/FBX or WebGL interaction was available to the code test environment; validate visually. Transfer uses nearest normalized **rest positions**, not stable FBX vertex IDs; it rejects unmatched samples but identical overlapping positions or re-imported mesh differences can be ambiguous. A future iteration may introduce stable mesh-vertex IDs or region-level edits if these cases appear in practice.

## Alpha 0.3.5a — Live SIB GPU upload fix

The `Uint16BufferAttribute` and `Float32BufferAttribute` constructors in Three.js 0.181 **copy** input typed arrays. In 0.3.5 the SIB updated intermediate CPU arrays and its diagnostic heatmap, but not necessarily the geometry attributes the renderer reads. The live skin now holds references to `skinIndexAttribute.array` / `skinWeightAttribute.array` and marks those actual GPU attributes `needsUpdate` on every real stroke. Tests now mock the typed-array copies and verify that changes reach the render attributes, respond to a synthetic posed-bone translation and survive Undo. Full-strength center brush effects may reach 100%; Reduce mode and zero-change feedback are more explicit.

**Acceptance:** select thigh.L in Skin, enable SIB, leave **Reduce influence unchecked** to add influence, and apply a stroke. Heatmap and skin weights should respond. Bend thigh.L in Pose Test to see actual shape changes; in an unrotated rest pose, changing weights does not itself move the model. Check the reverse with Reduce. Real WebGL, FBX save and Windows Blender remain to be validated.
