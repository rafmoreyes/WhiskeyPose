# Alpha 0.3.3 — SSR integrated validation

1. Close old Worker/Vite terminals and run Iniciar-WhiskeyPose.bat. Check Alpha 0.3.3.
2. Import the original unrigged FBX, place/confirm 16 markers, approve Skeleton Preview, generate Envelope Skin.
3. In Skin enable Smart Skin Regions and Show anatomical regions. Confirm Head, Neck, Torso, Left/Right arms and Left/Right legs are visibly separated.
4. Run Deformation Test: Head and Neck, Shoulders/Arms, Hips/Thighs and Knees separately. Compare SSR enabled against head-only fallback; inspect large radius envelopes.
5. A very large upper-arm envelope must not claim opposite arm or legs. A compact disconnected accessory may be rigid; a large loose garment should not automatically become rigid.
6. Tune Radius/Strength while moving. Stop must restore the prior pose. Save Edited Skin FBX and compare exported results in Blender.

Limits: synthetic tests validate classification and JavaScript/Python parity; real FBX import/export and exact Blender skinning are not verified in this build. This is a heuristic, not AI segmentation. Keep screenshots of misclassified regions.
