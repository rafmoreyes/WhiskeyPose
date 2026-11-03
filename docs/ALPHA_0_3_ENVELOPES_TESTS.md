# WhiskeyPose Alpha 0.3.0 — Smart Skin Envelopes

## Windows 11 validation (Steam Blender)

1. Close old Worker/Vite CMD windows and launch `Iniciar-WhiskeyPose.bat`. Verify **Alpha 0.3.0**.
2. Import the **original unrigged** character FBX. Confirm the 16 markers and approve the 19-bone Skeleton Preview.
3. Open **Skin**, select `upper_arm.L` and increase its capsule radius. Use **Show all envelopes** to see the other capsules.
4. Select **Envelope Skin** and generate the rig. The generated FBX should include real skinned meshes. Skin should show "Envelope skin: Used" plus nearest-bone fallback counts.
5. In **Pose**, test the arm, knee and shoulder. Go back to Skin, change a radius and select **Rebuild Skin from Source FBX**.
6. Test **Rigid** on an isolated armor area and confirm the output weights in Blender. Rigid uses proximity, not topology, so this requires artistic review.
7. Switch to **Blender Auto Weights — legacy** as a baseline comparison. This mode ignores envelope parameters.
8. Confirm the 16-marker preview, Engine settings, existing FBX export and the one-click Edge launcher still work.

## Automated coverage

- `node --test tests/*.test.mjs`
- `python -m unittest discover -s tests -v`
- `node --check src/main.js` and Python compile checks.

Unit tests exercise envelope settings, smooth/rigid weight math, HTTP forwarding to Blender and mocked Blender vertex groups. **They do not prove real-world FBX deformation quality**.

## Known limitations

- Capsules are assigned to bone names. Region-based mesh-island ownership/exclusions is not implemented yet.
- Vertices outside all capsules are given nearest-bone weights and reported.
- Separated clothing or accessories can still inherit neighboring bones.
- Changes to radius/mode take effect after **Rebuild Skin**; no live deformation update.
- Non-humanoid rigs, production-grade deformation and automatic IK are outside this pilot.
