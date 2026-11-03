"""Executed inside Blender by server.py. Experimental FBX import/pose/export.

Important: Three.js and Blender have different FBX transform conventions. The
local delta quaternion transfer here is a feasibility experiment, NOT a
validated pose retargeting solution. Verify every result in Blender/Unreal.
"""

import argparse
import json
import sys

import bpy
from mathutils import Quaternion


def parse_args():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--pose", required=True)
    return parser.parse_args(args)


def main():
    args = parse_args()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.fbx(filepath=args.input)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("Imported FBX contains no meshes")

    with open(args.pose, "r", encoding="utf-8") as stream:
        pose = json.load(stream)
    rotations = {}
    for record in pose.get("bones", []):
        name = record.get("name")
        delta = record.get("deltaQuaternion")
        if isinstance(name, str) and isinstance(delta, list) and len(delta) == 4:
            rotations[name] = delta

    for armature in (o for o in bpy.context.scene.objects if o.type == "ARMATURE"):
        for bone in armature.pose.bones:
            if bone.name not in rotations:
                continue
            x, y, z, w = (float(v) for v in rotations[bone.name])
            delta = Quaternion((w, x, y, z))
            # Experimental transfer: local Blender and Three.js bone bases may differ.
            bone.rotation_mode = "QUATERNION"
            bone.rotation_quaternion = delta @ bone.rotation_quaternion

    bpy.context.view_layer.update()
    bpy.ops.export_scene.fbx(
        filepath=args.output,
        use_selection=False,
        object_types={"ARMATURE", "MESH", "EMPTY"},
        add_leaf_bones=False,
        bake_anim=False,
        apply_unit_scale=True,
        mesh_smooth_type="OFF",
    )
    print("WhiskeyPose export written:", args.output)


if __name__ == "__main__":
    main()
