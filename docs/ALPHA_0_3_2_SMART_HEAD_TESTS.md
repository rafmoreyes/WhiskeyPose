# Alpha 0.3.2 — Smart Head / Neck Regions

No new dependencies, no Blender installation changes. FBX remains the input and output format.

## What changed

- 16 markers stay as before, but Chin is **only a landmark**. The 19-bone skeleton places the Head pivot 72% of the way from the Neck landmark towards Chin. Neck ends exactly at that pivot, Head starts there.
- Semantic skin priority in both browser Live Skin and Blender export: above the head pivot is Head-owned; a narrow neck-to-head transition blends Head/Neck; the neck base blends Neck/Chest; other body vertices exclude Head/Neck even if their envelopes are enlarged.
- Disconnected face/hair islands can be assigned rigid Head ownership in a single FBX mesh using triangle connectivity plus seam welding. Heuristics intentionally conservative; very long hair merged into body and unusual poses can still be misclassified.
- All remaining skin continues using editable bone envelopes. Existing Blender Auto Weights is unaffected. The Smart Region rule overrides radius/strength within fixed Head/Neck regions; sliders still affect other regions.

## Artist validation

1. Close prior Worker/Vite consoles; restart with Iniciar-WhiskeyPose.bat.
2. **Re-import the original unrigged FBX**, confirm markers and approve Skeleton Preview. The new pivot requires regenerating the armature; an old rig cannot be migrated in place.
3. Generate Rig + Envelope Skin. In Pose, run the Head and Neck sections separately under Deformation Test.
4. Head rotation should move skull/face and detached hair, *not* shoulders or pectorals. Neck rotation should move the child Head as well, without dragging the shoulder geometry.
5. In Skin, enable heatmap; increase Head and Neck envelope radius and verify shoulder weights remain zero. Save Edited Skin FBX and reopen in Blender to compare.
6. Try a stylized model with joined hair/body and detached hair to document remaining gaps for Alpha 0.3.3.

## Validation limits

Unit and JS/Python parity tests exercise markers, region ownership and envelope buffer calculations. Real FBX importer orientation, full Three.js WebGL rendering and Blender Steam reimport/export have not been validated in this automated environment. This is an experimental skin region pilot, not a general anatomically aware ML model.
