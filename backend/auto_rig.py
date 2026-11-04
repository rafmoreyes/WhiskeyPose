"""WhiskeyPose Alpha 0.3: FBX -> procedural humanoid rig -> weights -> FBX.

Launched inside Blender by the local loopback worker. Requires an upright,
roughly symmetric humanoid in A/T pose. Output MUST be artist-reviewed.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
from rig_math import proximity_weights
from marker_rig import make_marker_template
from envelope_skin import validate_envelopes, envelope_weights
from smart_regions import head_neck_ownership, head_owned_components, mesh_region_ownerships
from automatic_skin import solve_automatic_skin
from contact_repair import plan_contact_repair,apply_blender_repair


def arguments():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--report', required=True)
    parser.add_argument('--method', choices=('auto', 'proximity', 'envelope', 'smart-auto'), default='auto')
    parser.add_argument('--envelopes')
    parser.add_argument('--markers', required=True)
    parser.add_argument('--contact-repair', action='store_true')
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


def assign_envelopes(mesh, rig, definitions, height, config, region_mode='smart', report=False):
    """Generate actual Blender vertex groups from user-controlled bone envelopes."""
    remove_bone_groups(mesh, definitions)
    groups = {b['name']: mesh.vertex_groups.new(name=b['name']) for b in definitions}
    world = mesh.matrix_world.copy()
    rest_points = [tuple(world @ vert.co) for vert in mesh.data.vertices]
    faces = [tuple(poly.vertices) for poly in getattr(mesh.data,'polygons',())]
    owned = head_owned_components(rest_points,faces,definitions,height) if region_mode=='head-only' else []
    ownerships = mesh_region_ownerships(rest_points,faces,definitions,height) if region_mode=='smart' else []
    region_counts = {}
    fallback_count = 0
    for vert,pos in zip(mesh.data.vertices,rest_points):
        ownership = (ownerships[vert.index] if region_mode=='smart' else
                     ({'zone':'detached-head','weights':[('head',1.)]} if owned[vert.index]
                      else head_neck_ownership(pos,definitions,height)))
        zone = ownership.get('zone','unclassified') if ownership else 'unclassified'
        region_counts[zone] = region_counts.get(zone,0)+1
        weights, used_fallback = envelope_weights(pos, definitions, config, height, ownership=ownership)
        if used_fallback:
            fallback_count += 1
        for bone_name, weight in weights:
            groups[bone_name].add([vert.index], weight, 'REPLACE')
    old_world = mesh.matrix_world.copy()
    mesh.parent = rig
    mesh.matrix_world = old_world
    if not any(m.type == 'ARMATURE' and m.object == rig for m in mesh.modifiers):
        modifier = mesh.modifiers.new('WhiskeyPose Envelope Skin', 'ARMATURE')
        modifier.object = rig
    return (fallback_count, region_counts) if report else fallback_count


def assign_smart_auto(mesh, rig, definitions, height, contact_ownership=None):
    """Bone-heat initialization + SSR filtering + topology-aware weight smoothing."""
    heat_ok = try_bone_heat(mesh, rig, definitions)
    world = mesh.matrix_world.copy()
    points = [tuple(world @ v.co) for v in mesh.data.vertices]
    faces = [tuple(poly.vertices) for poly in getattr(mesh.data,'polygons',())]
    seed = None
    if heat_ok:
        indexes={group.index:group.name for group in mesh.vertex_groups
                 if group.name in {bone['name'] for bone in definitions}}
        seed=[{indexes[item.group]:item.weight for item in v.groups
               if item.group in indexes and item.weight>0} for v in mesh.data.vertices]
    weights,diagnostics=solve_automatic_skin(points,faces,definitions,height,seed,
        ownership_override=contact_ownership)
    remove_bone_groups(mesh,definitions)
    groups={name:mesh.vertex_groups.new(name=name) for name in (b['name'] for b in definitions)}
    for vertex,per_bone in zip(mesh.data.vertices,weights):
        for name,value in per_bone.items():
            groups[name].add([vertex.index],value,'REPLACE')
    original_world=mesh.matrix_world.copy()
    mesh.parent=rig
    mesh.matrix_world=original_world
    if not any(m.type=='ARMATURE' and m.object==rig for m in mesh.modifiers):
        modifier=mesh.modifiers.new('WhiskeyPose Automatic Skin','ARMATURE')
        modifier.object=rig
    diagnostics['seedMethod']='bone-heat' if heat_ok else 'anatomical-distance'
    return diagnostics


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
    marker_data=json.loads(Path(args.markers).read_text(encoding='utf-8'))
    definitions, dimensions = make_marker_template(get_bounds(meshes), marker_data)
    contact_report=None
    contact_ownership={}
    if args.contact_repair:
        # The pilot only runs on the known audited original topology. Fail
        # closed without modifying the original FBX or other characters.
        if args.method != 'smart-auto' or len(meshes)!=1:
            raise ValueError('Contact Repair Pilot requires Automatic Skin and one original unrigged mesh')
        mesh=meshes[0]
        coordinates=[tuple(v.co) for v in mesh.data.vertices]
        polygons=[tuple(poly.vertices) for poly in mesh.data.polygons]
        repair_plan=plan_contact_repair(coordinates,polygons)
        contact_report=apply_blender_repair(mesh,repair_plan)
        contact_ownership[mesh.name]=repair_plan['ownership']
    rig = create_armature(definitions)
    envelope_config = None
    if args.method == 'envelope':
        if not args.envelopes:
            raise RuntimeError('Envelope settings are required for envelope skinning')
        envelope_payload = json.loads(Path(args.envelopes).read_text(encoding='utf-8'))
        region_mode = envelope_payload.get('regionMode','smart')
        if region_mode not in ('smart','head-only'):
            raise ValueError('Invalid Smart Regions mode')
        envelope_config = validate_envelopes(envelope_payload, definitions)
    methods = []
    for mesh in meshes:
        if args.method == 'smart-auto':
            diag=assign_smart_auto(mesh,rig,definitions,dimensions['height'],
                contact_ownership.get(mesh.name))
            methods.append({'mesh':mesh.name,'weights':'smart-auto',**diag})
            continue
        if envelope_config is not None:
            fallback_count, region_counts = assign_envelopes(mesh, rig, definitions, dimensions['height'], envelope_config, region_mode=region_mode, report=True)
            methods.append({'mesh': mesh.name, 'weights': 'envelopes',
                            'fallbackVertices': fallback_count,
                            'totalVertices': len(mesh.data.vertices),
                            'regionMode': region_mode, 'regions': region_counts})
            continue
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
    report = {'version': '0.3.7', 'contactRepair':contact_report or {'status':'disabled'}, 'bones': len(definitions), 'meshes': len(meshes), 'weights': methods, 'template': 'confirmed-markers', 'landmarkCount':16, 'skinMode':args.method, 'envelopeCount':len(envelope_config) if envelope_config else 0, 'boneEndpoints':{b['name']:{'head':b['head'],'tail':b['tail']} for b in definitions}, 'warnings': ['SSR automatic weights are experimental. Bone-heat may fail on disconnected meshes; the solver then uses anatomical-distance fallback. Check shoulder, hips, long coats and hair before production.']}
    with open(args.report, 'w', encoding='utf-8') as handle:
        json.dump(report, handle)
    print('WhiskeyPose Alpha 0.3.7 output:', json.dumps(report))


if __name__ == '__main__':
    main()
