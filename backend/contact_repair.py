"""WhiskeyPose 0.3.7 — guarded *model-specific* fused-contact repair pilot.

No learned segmentation and no arbitrary topology cuts: this profile is based on
the user's audited, unrigged female athletic FBX, which already contains two
21-face arm/thigh bridges. Unknown geometry is REJECTED if repair is requested.
Blender/BMesh is imported only by apply_blender_repair().
"""
from collections import defaultdict

PROFILE_NAME = 'female-athletic-arm-thigh-v1'
CONTACTS = {
    'L': {
        'faces': (3839,3840,3841,4094,4095,4097,4098,4107,4108,
                  5356,5360,5361,5362,5363,5385,5386,5416,5418,5425,5427,5432),
        'connector_edges': ((1348,5037),(3904,3907)),
    },
    'R': {
        'faces': (1557,1558,1559,1746,1748,1750,1753,1761,1770,
                  2902,2908,2910,2912,2913,3094,3096,3107,3108,3109,3127,3128),
        'connector_edges': ((623,3204),(2007,1998)),
    },
}
WITNESSES = {
    3839:(3723,3717,3716,3720),
    3840:(3717,3723,3724,3718),
    4108:(3907,3904,3903,3906),
    5416:(1347,5012,5037,1348),
    1557:(1764,1766,1773,1770),
    1558:(1774,1773,1766,1767),
    1770:(1995,1998,2007,1996),
    3127:(3204,3186,624,623),
}


def _edge(a,b):
    return (a,b) if a<b else (b,a)


def _boundary(faces,removed):
    incidence=defaultdict(list)
    for i,face in enumerate(faces):
        if i in removed:
            continue
        for a,b in zip(face,face[1:]+face[:1]):
            incidence[_edge(a,b)].append((a,b))
    if any(len(items)>2 for items in incidence.values()):
        raise ValueError('Source mesh is nonmanifold; cannot repair contact safely')
    boundary=[items[0] for items in incidence.values() if len(items)==1]
    next_vertex={}
    for a,b in boundary:
        if a in next_vertex:
            raise ValueError('Contact boundary branches or has inconsistent winding')
        next_vertex[a]=b
    if not boundary:
        raise ValueError('Contact patch has no boundary')
    start=boundary[0][0]
    cycle=[start]
    seen={start}
    at=next_vertex[start]
    while at!=start:
        if at in seen or at not in next_vertex:
            raise ValueError('Contact patch boundary is not one oriented loop')
        cycle.append(at)
        seen.add(at)
        at=next_vertex[at]
    if len(cycle)!=len(boundary):
        raise ValueError('Contact patch has multiple loops')
    return cycle


def _arcs(cycle,connector_edges):
    cuts=[i for i,a in enumerate(cycle)
          if _edge(a,cycle[(i+1)%len(cycle)]) in {_edge(*e) for e in connector_edges}]
    if len(cuts)!=2:
        raise ValueError('Contact connector edges do not match the source FBX')
    n=len(cycle)
    def path(start,end):
        out=[cycle[start%n]]
        at=start%n
        while at!=end%n:
            at=(at+1)%n
            out.append(cycle[at])
            if len(out)>n:
                raise ValueError('Invalid contact loop')
        return out
    first=path(cuts[0]+1,cuts[1])
    second=path(cuts[1]+1,cuts[0])
    if sorted((len(first),len(second)))!=[20,24]:
        raise ValueError('Contact arm/leg boundary sizes differ from audited FBX')
    return (first,second) if len(first)==20 else (second,first)


def _verify_closed(faces):
    edges=defaultdict(list)
    for face in faces:
        if len(face)<3 or len(set(face))!=len(face):
            raise ValueError('Repair generated a degenerate face')
        for a,b in zip(face,face[1:]+face[:1]):
            edges[_edge(a,b)].append((a,b))
    if any(len(uses)!=2 for uses in edges.values()):
        raise ValueError('Repair would leave open or nonmanifold mesh edges')
    if any(uses[0]==uses[1] for uses in edges.values()):
        raise ValueError('Repair would reverse surface winding')


def plan_contact_repair(points,faces):
    """Return full replacement geometry + skin ownership constraints.

    Returns a plan only for the exact topology of the already-audited character.
    No change to the input lists; does not require Blender or external modules.
    """
    if len(points)!=5376 or len(faces)!=5910:
        raise ValueError('Contact Repair Pilot supports only the audited 5376-vertex female athletic FBX')
    faces=[tuple(int(v) for v in face) for face in faces]
    if any(tuple(faces[i])!=pattern for i,pattern in WITNESSES.items()):
        raise ValueError('Contact Repair Pilot: face topology does not match audited source')
    removed={face_id for group in CONTACTS.values() for face_id in group['faces']}
    vertices=[tuple(float(v) for v in p) for p in points]
    added_vertices=[]
    added_faces=[]
    overrides={}
    sides={}
    for side,group in CONTACTS.items():
        loop=_boundary(faces,set(group['faces']))
        arm,leg=_arcs(loop,group['connector_edges'])
        connectors={_edge(*edge) for edge in group['connector_edges']}
        # The two arcs must be joined *only* by the two audited top connectors.
        if {_edge(arm[-1],leg[0]),_edge(leg[-1],arm[0])} != connectors:
            if {_edge(leg[-1],arm[0]),_edge(arm[-1],leg[0])}!=connectors:
                raise ValueError('Contact boundary orientation changed')
        arm_center=len(vertices)+len(added_vertices)
        added_vertices.append(tuple(sum(vertices[i][k] for i in arm)/len(arm) for k in range(3)))
        leg_center=len(vertices)+len(added_vertices)
        added_vertices.append(tuple(sum(vertices[i][k] for i in leg)/len(leg) for k in range(3)))
        for chain,center in ((arm,arm_center),(leg,leg_center)):
            # Opposite directed edge to the preserved source surface.
            for i,a in enumerate(chain):
                b=chain[(i+1)%len(chain)]
                added_faces.append((b,a,center))
        # Small upper seam replaces the long, 21-face arm-to-leg bridge.
        # This is still one watertight mesh; local validation is mandatory.
        added_faces.append((arm[-1],arm[0],leg[-1],leg[0]))
        arm_bones=('shoulder.'+side,'upper_arm.'+side,'forearm.'+side,'hand.'+side)
        leg_bones=('pelvis','thigh.'+side,'shin.'+side,'foot.'+side)
        for i in arm:
            overrides[i]={'zone':'contact-arm.'+side,'allowed':arm_bones}
        for i in leg:
            overrides[i]={'zone':'contact-leg.'+side,'allowed':leg_bones}
        overrides[arm_center]={'zone':'contact-arm.'+side,'weights':[('forearm.'+side,1.)]}
        overrides[leg_center]={'zone':'contact-leg.'+side,'weights':[('thigh.'+side,1.)]}
        sides[side]={'facesRemoved':len(group['faces']),'armBoundary':len(arm),
                     'legBoundary':len(leg),'armCenter':arm_center,'legCenter':leg_center}
    new_faces=[face for i,face in enumerate(faces) if i not in removed]+added_faces
    _verify_closed(new_faces)
    if len(added_vertices)!=4 or len(new_faces)!=5958:
        raise ValueError('Unexpected topology after contact repair')
    return {'profile':PROFILE_NAME,'remove_faces':sorted(removed),
            'added_vertices':added_vertices,'added_faces':added_faces,
            'ownership':overrides,
            'report':{'profile':PROFILE_NAME,'status':'repaired','facesRemoved':len(removed),
                      'facesAdded':len(added_faces),'verticesAdded':len(added_vertices),
                      'originalFaces':len(faces),'repairedFaces':len(new_faces),
                      'originalVertices':len(vertices),
                      'repairedVertices':len(vertices)+len(added_vertices),
                      'sides':sides,'watertightTopologyCheck':True}}


def apply_blender_repair(mesh,plan):
    """Edit a private copy via BMesh, preserving all untouched faces and UVs.

    No blender import outside this function. Original mesh data is not assigned
    until topology, vertex-order and manifold validation pass.
    """
    import bmesh
    original=mesh.data
    copy=original.copy()
    bm=bmesh.new()
    try:
        bm.from_mesh(copy)
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
        bm.verts.index_update()
        originals=list(bm.verts)
        orig_faces=list(bm.faces)
        if len(originals)!=plan['report']['originalVertices']:
            raise ValueError('Unexpected Blender vertex count before repair')
        uv_layer=bm.loops.layers.uv.active
        uv_by_vertex={}
        if uv_layer:
            for i,vert in enumerate(originals):
                for loop in vert.link_loops:
                    uv_by_vertex[i]=tuple(loop[uv_layer].uv)
                    break
        to_remove=[orig_faces[i] for i in plan['remove_faces']]
        bmesh.ops.delete(bm,geom=to_remove,context='FACES')
        if not all(v.is_valid for v in originals):
            raise ValueError('A contact boundary vertex became invalid; aborting')
        centers=[]
        for xyz in plan['added_vertices']:
            centers.append(bm.verts.new(xyz))
        all_vertices=originals+centers
        center_uv={}
        if uv_layer:
            for center_index,side in [(info['armCenter'],side) for side,info in plan['report']['sides'].items()]:
                nearby=[i for i,item in plan['ownership'].items()
                        if item['zone']=='contact-arm.'+side and i<len(originals)]
                uvs=[uv_by_vertex[i] for i in nearby if i in uv_by_vertex]
                center_uv[center_index]=tuple(sum(uv[k] for uv in uvs)/len(uvs) for k in (0,1)) if uvs else (0.,0.)
            for center_index,side in [(info['legCenter'],side) for side,info in plan['report']['sides'].items()]:
                nearby=[i for i,item in plan['ownership'].items()
                        if item['zone']=='contact-leg.'+side and i<len(originals)]
                uvs=[uv_by_vertex[i] for i in nearby if i in uv_by_vertex]
                center_uv[center_index]=tuple(sum(uv[k] for uv in uvs)/len(uvs) for k in (0,1)) if uvs else (0.,0.)
        for face in plan['added_faces']:
            new=bm.faces.new([all_vertices[i] for i in face])
            new.smooth=True
            new.material_index=0
            if uv_layer:
                for loop,index in zip(new.loops,face):
                    loop[uv_layer].uv=center_uv.get(index,uv_by_vertex.get(index,(0.,0.)))
        bm.normal_update()
        if len(bm.faces)!=plan['report']['repairedFaces'] or \
                len(bm.verts)!=plan['report']['repairedVertices'] or \
                not all(edge.is_manifold for edge in bm.edges):
            raise ValueError('Repaired Blender mesh failed watertight manifold checks')
        bm.to_mesh(copy)
        copy.update()
        if len(copy.vertices)!=len(originals)+len(centers):
            raise ValueError('Blender changed repaired vertex indexing')
        # Preserve source vertex IDs: SSR overrides rely on verified indices.
        for i,source in enumerate(originals):
            p=copy.vertices[i].co
            if sum((p[k]-source.co[k])**2 for k in range(3))>1e-12:
                raise ValueError('Blender reordered contact vertices; aborting')
        mesh.data=copy
        return plan['report']
    except Exception:
        # The original mesh remains untouched even if BMesh fails.
        if mesh.data == original:
            import bpy
            bpy.data.meshes.remove(copy)
        raise
    finally:
        bm.free()
