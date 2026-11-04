"""Blender worker for surface-paint SIB edits to an already-rigged FBX."""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree
from skin_paint import validate_paint_edits,normalized_blender_point,match_mesh

def arguments():
    source=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    parser=argparse.ArgumentParser()
    for arg in ('input','output','report','edits'):
        parser.add_argument('--'+arg,required=True)
    return parser.parse_args(source)

def get_bounds(meshes):
    points=[obj.matrix_world @ v.co for obj in meshes for v in obj.data.vertices]
    if not points:raise ValueError('Rigged FBX has no mesh vertices')
    return tuple(min(p[i] for p in points) for i in range(3))+tuple(max(p[i] for p in points) for i in range(3))

def apply_sib(meshes,rig,sections):
    bounds=get_bounds(meshes)
    bone_names={bone.name for bone in rig.data.bones if bone.use_deform}
    totals={'matched':0,'verticesUpdated':0,'meshCount':0}
    for part in sections:
        mesh=match_mesh(part['name'],meshes)
        groups={g.name:g for g in mesh.vertex_groups}
        for sample in part['samples']:
            unknown=[name for name,_ in sample['w'] if name not in bone_names]
            if unknown:raise ValueError('Unknown SIB bone: '+','.join(unknown))
        points=[normalized_blender_point(tuple(mesh.matrix_world @ v.co),bounds) for v in mesh.data.vertices]
        if not points:raise ValueError('SIB target mesh contains no vertices')
        tree=KDTree(len(points))
        for i,p in enumerate(points):tree.insert(Vector(p),i)
        tree.balance()
        painted={}
        unmatched=0
        for sample in part['samples']:
            q=Vector(sample['p'])
            _,nearest,distance=tree.find(q)
            # Tight 0.2% rest-space tolerance: if FBX axes, transforms or
            # mesh topology differ, refuse to export rather than guess.
            if nearest is None or distance>.002:
                unmatched+=1
                continue
            near=tree.find_range(q,.0008)
            hits=[idx for _,idx,_ in near] or [nearest]
            for vertex_index in hits:painted[vertex_index]=sample['w']
            totals['matched']+=1
        if unmatched:
            raise ValueError(f'{unmatched}/{len(part["samples"])} SIB samples could not be located on mesh {mesh.name}. Nothing exported; verify FBX axes and mesh names.')
        for index,weights in painted.items():
            vertex=mesh.data.vertices[index]
            bone_group_indexes={g.index for g in mesh.vertex_groups if g.name in bone_names}
            for membership in list(vertex.groups):
                if membership.group in bone_group_indexes:
                    name=mesh.vertex_groups[membership.group].name
                    groups[name].remove([index])
            for name,weight in weights:
                group=groups.get(name)
                if group is None:group=mesh.vertex_groups.new(name=name);groups[name]=group
                group.add([index],float(weight),'REPLACE')
        totals['verticesUpdated']+=len(painted)
        totals['meshCount']+=1
    return totals

def main():
    args=arguments()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.fbx(filepath=args.input)
    meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
    rigs=[obj for obj in bpy.context.scene.objects if obj.type=='ARMATURE']
    if len(rigs)!=1 or not meshes:
        raise ValueError('SIB requires an existing rigged FBX containing one armature and at least one mesh')
    rig=rigs[0]
    sections,expected=validate_paint_edits(json.loads(Path(args.edits).read_text(encoding='utf-8')))
    result=apply_sib(meshes,rig,sections)
    if result['matched']!=expected:raise ValueError('SIB export rejected incomplete vertex transfer')
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for mesh in meshes:mesh.select_set(True)
    bpy.context.view_layer.objects.active=rig
    bpy.ops.export_scene.fbx(filepath=args.output,use_selection=True,object_types={'ARMATURE','MESH'},
        add_leaf_bones=False,bake_anim=False,apply_unit_scale=True,mesh_smooth_type='OFF')
    Path(args.report).write_text(json.dumps({
        'version':'0.3.5','skinMode':'soft-influence-brush','matched':result['matched'],
        'verticesUpdated':result['verticesUpdated'],'meshCount':result['meshCount'],
        'warnings':['SIB is an experimental spatial correspondence transfer. Validate rendered weights and deformation in Blender.']
    }),encoding='utf-8')

if __name__=='__main__':
    main()
