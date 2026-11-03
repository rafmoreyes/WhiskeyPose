> **Historical test plan for Alpha 0.2.0 (failed artist acceptance).** Superseded by [Alpha 0.2.1 marker-to-FBX tests](ALPHA_0_2_1_MARKER_PIPELINE_TESTS.md). Do not apply this older checklist to current builds.

# WhiskeyPose Alpha 0.2.0 — Joint Marker Testing

## Setup

Only `start-whiskeypose.cmd` is required to test markers. The Blender worker is **optional** and not used by the new marker workflow. Import an unrigged A/T-pose FBX, ideally the character you already used to test rigging.

## Artist acceptance checklist

- [ ] Import FBX; confirm geometry displays exactly as before.
- [ ] Open Rig. Eight blue suggested markers appear; none is marked confirmed by default.
- [ ] Select each marker from the Inspector; it turns gold.
- [ ] In Front view, click the model to place an elbow, then drag it. Confirm gold/green markers remain visible.
- [ ] Switch to Side view and drag the same marker to correct its depth. Switch back to Front to verify.
- [ ] With Mirror ON, move a wrist and verify its counterpart mirrors around character center X. With Mirror OFF, the opposite wrist stays unchanged.
- [ ] Toggle Skeleton guide; lines hide/show without changing FBX geometry.
- [ ] Click Confirm all: the indicator shows 8/8 confirmed.
- [ ] Save markers JSON; reset suggestions; load that JSON; placements and confirmations return.
- [ ] Change to Skin/Pose/Import; markers are hidden. Return to Rig; placements remain.
- [ ] On the legacy Auto-Rig, note the button says it **ignores markers**. Do not expect it to use custom positions in this Alpha.
- [ ] Check model alignment and identify any problems with capes, broad sleeves, oversized heads or unusual character poses.

## Automated tests

- `node --check src/main.js`
- `node --check src/marker_tool.js`
- `node --test tests/marker_math.test.mjs`
- `python -m unittest discover -s tests -v`

**Limitations:** Markers are placed in world space (Y up) after import. Suggestions use overall mesh dimensions; props, asymmetry or very large clothing can misplace them. No backend joint fitting is active yet. Front is +Z and Side is +X in Three.js, which may differ from the original authoring tool's axes.
