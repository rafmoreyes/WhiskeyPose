# Alpha 0.0.1 — Manual acceptance checklist

## Test environment

- Windows 11, Chrome/Edge, Node 20.19+, Blender optional.
- Character A: simple humanoid without bones, ASCII/binary FBX as available.
- Character B: skinned humanoid with existing bones and weight influences.
- Character C: stylized humanoid with multiple meshes, clothes and materials.

## Browser preview

- [ ] Drop FBX file: model appears and is centered in the viewport.
- [ ] Second import replaces first model without duplicated geometry.
- [ ] Frame (button or F), orbit, pan and zoom work.
- [ ] Grid, wireframe and skeleton toggles work.
- [ ] Mesh/vertices/triangles/bone counts are plausible.
- [ ] Unrigged FBX correctly reports no skeleton and cannot be posed.
- [ ] Existing rig shows a bone list; X/Y/Z slider moves only its associated hierarchy.
- [ ] Reset one bone and reset all return to the imported pose.
- [ ] Save pose JSON downloads a readable file.
- [ ] Invalid FBX results in a visible error, not a blank screen.

## Experimental FBX export

- [ ] Without worker, Export FBX remains disabled with a helpful tooltip.
- [ ] With Blender installed and worker running, Export FBX becomes available.
- [ ] Export file reimports into Blender and Unreal Engine.
- [ ] Compare scale, axes, UVs, materials, skeleton hierarchy, weights.
- [ ] Test a rotated elbow: assess if pose transfer is correct or not.
- [ ] Record all bone-axis discrepancies before promising pose export.

## Limits and known risks

- There is no auto-rig or auto-skin model integrated yet.
- Relative texture file references may not resolve when a FBX is imported via browser file picker. Embedded textures can work depending on the FBX.
- Three.js FBXLoader has compatibility limits with some older/ASCII or unusual FBX files.
- Browser parsing is synchronous and large FBX may stall temporarily.
- Blender round-trip is not guaranteed to preserve every FBX feature.
- Pose quaternion deltas are experimental and may have incorrect axes.
- No user FBX sample or Blender test has been executed by this commit.
