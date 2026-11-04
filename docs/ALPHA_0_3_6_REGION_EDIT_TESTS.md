# WhiskeyPose Alpha 0.3.6 — SSR Region Influence + Ctrl+Z + Deformation Speed

## Goal
Reach **every vertex classified into an anatomical SSR region**, including inaccessible thin garment triangles, without raycasting or an envelope radius. Preserve automatic SSR skin as the baseline, full live deformation, Undo, and SIB FBX export.

## Artist acceptance (Windows 11 / Steam Blender)

1. Close old Worker and Vite sessions, update main and relaunch the GUI launcher. Generate a new **Automatic Skin — SSR + topology** rig from the unrigged original.
2. Open Skin. Find **Anatomical Region Influence**, select **Left Leg** or **Right Leg** corresponding to the cloth wing from the screenshots. Selecting it highlights the SSR region and auto-selects the recommended limb bone in **Inspect Bone**.
3. Set Influence Change to 25%, click **+ Increase**. The selected bone heatmap and geometry under a rotated pose must respond immediately, *including vertices that the SIB cursor could not reach*.
4. Click **− Reduce**, then **Ctrl+Z** to undo that change. Ctrl+Z again should undo the prior increase. Undo button should behave identically. Ctrl+Z while a text input is focused must retain normal text editing behavior.
5. If SSR finds distinct topology-connected pieces inside a region, a `↳ ... part` option appears. Select one to limit the edit to that piece. The region map should grey out everything else.
6. Use Deformation Test → Speed = **0×**. The pose should hold. Set **5×**; it should advance faster. Stop must still restore the initial artist pose.
7. Apply an SSR region correction, then a SIB brush stroke; Undo twice should restore them in reverse order. Select Reset edits to restore the original automatic weights.
8. Save SIB Skin FBX, re-import into Blender and compare vertex group changes with the in-app heatmap. The file is exported in Rest Pose; the current viewport pose must not reset.

## Automated regression checks
- `node --test tests/region_edit.test.mjs`: semantic groups and disconnected topology pieces.
- `node --test tests/live_skin.test.mjs`: region edits update actual skin buffers, share SIB Undo, and supply exporter payload.
- `node --test tests/deformation_test.test.mjs`: 0–5×, stop/restore and joint isolation.

## Limitations
- Whole-region edits affect all vertices in that region. At 100% Increase, they can make a limb rigid; smaller strengths are better for transitions.
- A welded skirt and leg may be indistinguishable to the SSR spatial classifier; a region operation cannot automatically isolate a piece that is both topologically connected and classified identically. Independent disconnected pieces can be targeted when detected.
- No additional external dependencies. **Real FBX, GPU deformation, Windows keyboard events and Blender export must be validated on the user's machine.**
