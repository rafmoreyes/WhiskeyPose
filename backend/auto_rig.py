"""WhiskeyPose Alpha 0.1: FBX -> procedural humanoid rig -> weights -> FBX.

Launched inside Blender by the local loopback worker. Requires an upright,
roughly symmetric humanoid in A/T pose. Output MUST be artist-reviewed.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
from rig_math import make_humanoid_template, proximity_weights


def arguments():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--report', required=True)
    parser.add_argument('--method', choices=('auto', 'proximity'), default='auto')
    return parser.parse_args(args)


def get_bounds(meshes):
    coords = [obj.matrix_world @ vert.co for obj in meshes for vert in obj.data.vertices]
    if not coords:
        raise RuntimeError('FBX has no mesh vertices')
    minimum = [min(v[i] for v in coords) for i in range(3)]
    maximum = [max(v[i] for v in coords) for i in range(3)]
    return (*minimum, *maximum)


def create_armature(definitions):
    arm_data = bpy.data.armatures.new('WhiskeyPose_Humanoid')
    rig = bpy.data.objects.new('WhiskeyPose_Rig', arm_data)
    bpy.context.collection.objects.link(rig)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for definition in definitions:
        b = arm_data.edit_bones.new(definition['name'])
        b.head = definition['head']
        b.tail = definition['tail']
        b.use_deform = True
    for definition in definitions:
        if definition['parent']:
            arm_data.edit_bones[definition['name']].parent = arm_data.edit_bones[definition['parent']]
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.show_in_front = True
    return rig


def remove_bone_groups(obj, bones):
    for item in bones:
        group = obj.vertex_groups.get(item['name'])
        if group:
            obj.vertex_groups.remove(group)


def has_complete_weights(mesh, definitions):
    bone_names = {bone['name'] for bone in definitions}
    indices = {group.index for group in mesh.vertex_groups if group.name in bone_names}
    if not indices:
        return False
    for vert in mesh.data.vertices:
        if not any(group.group in indices and group.weight > 1e-6 for group in vert.groups):
            return False
    return True


def assign_proximity(mesh, rig, definitions, height):
    remove_bone_groups(mesh, definitions)
    groups = {b['name']: mesh.vertex_groups.new(name=b['name']) for b in definitions}
    world = mesh.matrix_world.copy()
    for vert in mesh.data.vertices:
        xyz = tuple(world @ vert.co)
        for bone_name, weight in proximity_weights(xyz, definitions, height):
            groups[bone_name].add([vert.index], weight, 'REPLACE')
    # Explicit parent/modifier path avoids auto-weight operator's failure states.
    old_world = mesh.matrix_world.copy()
    mesh.parent = rig
    mesh.matrix_world = old_world
    if not any(m.type == 'ARMATURE' and m.object == rig for m in mesh.modifiers):
        modifier = mesh.modifiers.new('WhiskeyPose Skin', 'ARMATURE')
        modifier.object = rig


def try_bone_heat(mesh, rig, definitions):
    # Bone heat is Blender's native automatic weights, not an AI model.
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    try:
        bpy.ops.object.parent_set(type='ARMATURE_AUTO', keep_transform=True)
        bpy.context.view_layer.update()
        return has_complete_weights(mesh, definitions)
    except (RuntimeError, ValueError):
        return False


def main():
    args = arguments()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.fbx(filepath=args.input)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not meshes:
        raise RuntimeError('Input FBX contains no meshes')
    if any(obj.type == 'ARMATURE' for obj in bpy.context.scene.objects):
        raise RuntimeError('This FBX already contains a skeleton; import an unrigged model')
    definitions, dimensions = make_humanoid_template(get_bounds(meshes))
    rig = create_armature(definitions)
    methods = []
    for mesh in meshes:
        success = args.method == 'auto' and try_bone_heat(mesh, rig, definitions)
        if not success:
            assign_proximity(mesh, rig, definitions, dimensions['height'])
        methods.append({'mesh': mesh.name, 'weights': 'bone-heat' if success else 'proximity-fallback'})

    bpy.context.view_layer.update()
    for obj in bpy.context.scene.objects:
        obj.select_set(obj == rig or obj in meshes)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.fbx(
        filepath=args.output,
        use_selection=True,
        object_types={'ARMATURE', 'MESH'},
        add_leaf_bones=False,
        bake_anim=False,
        apply_unit_scale=True,
        mesh_smooth_type='OFF',
    )
    report = {'version': '0.1.0', 'bones': len(definitions), 'meshes': len(meshes), 'weights': methods, 'template': 'upright-humanoid-t-pose', 'warnings': ['Experimental procedural fit; inspect shoulders, hips, knees and cloth deformations before production use.']}
    with open(args.report, 'w', encoding='utf-8') as handle:
        json.dump(report, handle)
    print('WhiskeyPose Alpha 0.1 output:', json.dumps(report))


if __name__ == '__main__':
    main()
