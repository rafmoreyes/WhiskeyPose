# WhiskeyPose Alpha 0.3.7 — Contact Repair Pilot

## Evidence and limits
Source: the user's unrigged `female athletic figure 3d model.fbx` and subsequent `_Rig_SIB.fbx`. Source and rig FBX have matching 5,376 source vertices / 5,910 source polygons. Across the two audited arm/thigh contacts, 42 faces connect bone-weight regions that deform independently. This code ships a guarded profile, NOT an automatic universal topology detector.

## What this build actually does
- In `Skin`, enable the **Experimental Contact Repair** checkbox (automatically suggested only for the exact source filename).
- Worker checks exact control point/face counts, eight original face witnesses, both connector edges, both 44-vertex contact boundary loops, face winding and manifold closure.
- On a private Blender Mesh copy, removes the two known strips; builds 20/24-vertex side caps plus a small four-vertex top bridge per side. UVs/materials on untouched faces are preserved; new cap UVs are approximated locally.
- Verifies 5,380 vertices / 5,958 faces with no open/nonmanifold BMesh edges and source vertex indexing preserved.
- Restricts SSR weights for border vertices to same-side arm or leg groups and locks cap centers to `forearm.L/R` or `thigh.L/R`. Recomputes full Smart Automatic Skin afterward.
- Report includes `contactRepair.status: repaired` and patch statistics; the browser rejects a Worker response missing the verified repair.

## Manual validation on Windows
1. Shut down **both old Worker and Vite**; update main via GUI launcher / `git pull`; reopen.
2. Import **original unrigged** female athletic FBX. Approve the same 16 markers. In Skin select Automatic Skin and leave Experimental Contact Repair enabled.
3. Generate once. Confirm `Contact Repair Pilot applied` and a filename containing `ContactRepair_Pilot`. If the Worker reports source mismatch, STOP; do not force it.
4. Run Deformation Test on upper_arm.L and upper_arm.R. Compare before/after contact artifacts around the waist and arms against the previous _Rig_SIB file. Check armpit contours and skirt/hip area from front, side, and back.
5. Test head, shoulder, forearm, thigh, knee, SIB/SSR edits and Undo; inspect that the heatmap still changes. Check repaired FBX in Blender and Unreal Engine if desired.
6. In Blender Edit Mode check that no unwanted flat caps, holes, flipped normals, unexpected UV/material patch or pinched surface occurred at either contact; any such defect is **a failed pilot test**.
7. Repeat with the checkbox disabled; ordinary automatic SSR remains available for baseline comparison.

## Automated validation
- `python -m unittest tests.test_contact_repair` (topology guard and SSR mask logic)
- `python -m unittest tests.test_server_contact_repair` (HTTP flag forwarding)
- `python -m unittest tests.test_automatic_skin` (existing SSR regressions)
- Original FBX offline profile sanity (available only to the author): 5,376 -> 5,380 vertices, 5,910 -> 5,958 polygons, no boundary or nonmanifold edge, and consistent winding after reconstruction.

## Safeguards
The original FBX is never modified. The repair only runs when explicitly requested and source topology matches. Unknown files are rejected; no guessed cuts. No new packages or online services. Blender-only appearance and FBX export still need the artist's real-system validation.
