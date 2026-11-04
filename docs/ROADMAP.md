# WhiskeyPose — Progressive MVP

## Guiding principles

- FBX is the primary input/output format.
- Keep the original character silhouette, proportions, UVs and materials.
- The artist can fix problems without restarting the whole pipeline.
- Features must be demonstrable and tested, not just visible in the UI.
- Start with stylized bipeds in A-pose or T-pose.

## Alpha 0.0 — Feasibility and diagnostics

- [x] Project skeleton and local browser viewport
- [x] FBX import, mesh diagnostics, existing rig/skin inspection
- [x] Basic per-bone rotation controls and pose JSON (only pre-rigged models)
- [x] Experimental Blender FBX re-export bridge; **not validated**
- [ ] Verify import with three user-supplied FBX characters
- [ ] Verify Blender and Unreal FBX export against reference files
- [ ] Benchmark TokenRig auto-rig/auto-skin against three test characters
- [ ] Decide which AI model, if any, meets quality and hardware constraints

## Alpha 0.1 — First complete end-to-end pipeline

- [ ] Generate a usable initial humanoid skeleton from an unrigged FBX
- [ ] Assign initial skin weights automatically
- [ ] Validate deformable mesh by rotating joints
- [ ] Export FBX with functioning skeleton and weights
- [ ] Round-trip FBX compatibility tests in Blender/Unreal

## Alpha 0.2 — Rig correction

- [ ] Interactive bone placement and mirror
- [ ] Recompute weights without redoing the rig
- [ ] Skeleton naming/mapping convention and retargeting metadata

## Alpha 0.3 — Smart skin

- [ ] Weights visualization, normalization, smoothing
- [ ] Region-aware corrections for elbows, shoulders, hips and knees
- [ ] Hard-binding clothes and rigid accessories when appropriate

## Alpha 0.4 — Smart pose

- [ ] IK controls for limbs and torso
- [ ] Line of action, contact points, poses library
- [ ] Mirror, save/reset, compare pose to imported state

## Alpha 0.5 — Pose from image

- [ ] Detect 2D landmarks and estimate initial 3D pose
- [ ] Retarget to character proportions, preserve artistic intent
- [ ] Depth/camera correction and IK polish

## Out of scope for first MVP

Advanced face rigs, quadrupeds, animation timeline, cloth physics, realtime mocap, arbitrary creature anatomy.

## Alpha 0.1.0 — experimental humanoid Auto-Rig + Auto-Skin

- Procedural 19-bone humanoid template generated from FBX mesh bounds (Z-up after Blender import).
- Blender bone-heat automatic skinning with a normalized 4-influence spatial fallback.
- Generate/download a new rigged FBX, inspect joint rotations in the existing browser pose panel.
- Requires Windows Blender worker and unrigged upright T/A-pose humanoid.
- Model-fitting/weight quality requires user validation; **not AI-based yet**.
- Next: better skeleton fitting, editable joint landmarks, bone-weight correction and rigged export verification.

## Alpha 0.2.0 — Assisted joint markers preview (first build)

- [x] Eight adjustable marker points: chin, groin, bilateral elbows, wrists, knees.
- [x] Rough starting positions, selectable marker list, drag and click-to-place.
- [x] Front/side/perspective viewport presets and X-axis mirror editing.
- [x] Independent skeleton guide, confirmed marker status, JSON save/load.
- [x] Keep Alpha 0.1 procedural generator unchanged and clearly labeled as ignoring markers.
- [ ] Artist validation with both A-Pose and T-Pose FBX assets.
- [ ] True joint inference and fitting, including 3D joint centers.
- [ ] Integrate validated markers into Blender rig creation and Auto-Skin.

### Alpha 0.2.1 (corrective build)

- 13 markers including Chest, both Heels and Foot points.
- Marker-to-Blender pipeline implemented; old fixed T-pose rig is no longer silently used by the interactive UI.
- Worker validates and consumes normalized, confirmed landmarks, then creates bones before automatic weights.
- Reset suggestions clears confirmation; edit-source workflow allows regenerating from new marker positions.
- Manual real-FBX tests and deformation QA are still required.


### Alpha 0.2.2 — Anatomy & Skeleton Preview (candidate)

- [x] 16 anatomical markers: add bilateral Shoulder and central Neck.
- [x] Pure-JS 19-bone preview using matching bone hierarchy/positions from the Python solver.
- [x] Explicit *Approve skeleton* gate; moving landmarks revokes approval.
- [x] Worker requires 16-marker payload v2 and explicit skeleton approval before creating skin.
- [x] Save markers as JSON v3; import prior v1/v2 drafts with missing landmarks unconfirmed.
- [x] Automated JavaScript, Python and coordinate-parity regression tests.
- [ ] Artist validation of UI and generated Blender FBX on real A-Pose/T-Pose models.
- [ ] Blender/Unreal round-trip validation of vertex weights, axes and clothing deformation.
- [ ] Future: expose hip pivots if pelvis width heuristics are insufficient.

 
## Alpha 0.3.0 — Smart Skin Envelopes (experimental)

- Bone-owned capsule envelopes auto-fit to sampled geometry, with Radius and Smooth/Rigid settings in Skin.
- User adjustments are passed to the Blender Worker and become actual normalized vertex-group weights in FBX.
- Existing Blender Auto Weights kept as a selectable fallback for comparison.
- After generation, envelopes can be edited and weights rebuilt from the original FBX.
- Fallback vertices outside all capsules are counted and reported.
- Next: mesh-island ownership and exclusions, controlled deformation tests, then live weight feedback.

## Alpha 0.3.2 — Head/Neck Smart Skin Regions

- Head pivot derived from Neck and Chin landmarks (Chin no longer becomes the Head pivot)
- Protected head, head/neck and neck/chest ownership; shoulders and pectoral excluded from Head/Neck even when envelopes are large
- Detached head/hair mesh island detection using topology and UV-seam position welding
- Browser and Blender worker implement matching region constraints; no new packages
- Next: Alpha 0.3.3 expands region ownership to arms, legs, body, clothing and props


## Alpha 0.3.4 — Automatic Skin Solver (experimental)

Implemented: Automatic Skin is the recommended default. SSR protects anatomical
regions; Blender bone-heat seeds are filtered by allowed bone chains and smoothed
along mesh connectivity. A deterministic anatomical-distance fallback handles
failed bone-heat assignments. No capsule radius/strength setup is needed.

Live Skin now preserves and displays actual imported automatic FBX weights;
Advanced Envelope Override remains opt-in and reversible, including restoring
the original automatic FBX for download. Deformation Test is unchanged.

**Acceptance gate:** on at least three actual stylized FBX characters, generate
from confirmed markers without tuning envelopes, run Head/Neck, shoulders,
elbows, hips and knees in Deformation Test; compare artifacts and time to fix
against Alpha 0.3.3. Inspect exports in Blender and Unreal. If it fails,
investigate topology, region boundary conditions and detached mesh ownership
before adding more UI controls.

## Alpha 0.3.7 — Guarded Contact Repair Pilot

Experimental: exact-match repair for the audited female athletic FBX (2 × 21
fused arm/thigh contact faces). Source stays unchanged, Worker reconstructs
two capped surfaces per side and constrains local SSR bone ownership before
Blender auto skin. Unknown topology is rejected. A Windows/Blender FBX
roundtrip and deformation-test approval are mandatory before expanding to
other characters or enabling general auto-cutting.
