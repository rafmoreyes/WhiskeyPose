"""Anatomy-aware head and neck ownership. No bpy or external dependencies.

Returns a deliberate region mask before envelope distance weighting. This is
intentionally conservative: version 0.3.2 does NOT recognize every hair island
or accessory. Identical classification is implemented in src/smart_regions.js.
"""
from __future__ import annotations
from math import sqrt


def smoothstep(t):
    t=max(0.,min(1.,t))
    return t*t*(3.-2.*t)


def head_neck_ownership(point,bones,height,up=2):
    by={b['name']:b for b in bones}
    if not all(n in by for n in ('head','neck','chest','shoulder.L','shoulder.R')):
        return None
    pivot=by['head']['head']; neck=by['neck']['head']; chest=by['chest']['head']
    y=point[up]; py=pivot[up]; cy=chest[up]
    shoulder_span=sqrt(sum((a-b)**2 for i,(a,b) in enumerate(zip(by['shoulder.L']['tail'],by['shoulder.R']['tail'])) if i!=up))
    center_dist=sqrt(sum((point[i]-pivot[i])**2 for i in range(3) if i!=up))
    head_radius=max(.12*height,.48*shoulder_span)
    neck_radius=max(.065*height,min(.12*height,.32*shoulder_span))
    top=.020*height; band=.035*height
    # A standard A/T pose has no arm/shoulder geometry above the skull base.
    if y>=py+top:
        return {'zone':'head','weights':[('head',1.)]}
    if py-band<y<py+top and center_dist<=head_radius:
        t=smoothstep((y-(py-band))/(top+band))
        return {'zone':'head-neck','weights':[(name,value) for name,value in [('head',t),('neck',1-t)] if value>1e-8]}
    neck_start=cy+.025*height
    if neck_start<y<=py-band and center_dist<=neck_radius:
        span=max(py-band-neck_start,1e-9)
        neck_weight=smoothstep((y-neck_start)/span)
        return {'zone':'neck-chest','weights':[(name,value) for name,value in [('neck',neck_weight),('chest',1-neck_weight)] if value>1e-8]}
    # Shoulders, pectorals, arms and the remaining body are NEVER affected by
    # Head/Neck capsules, regardless of how large the artist makes their radii.
    return {'zone':'body','blocked':('head','neck')}


def is_detached_head_piece(points,bones,height,up=2):
    """Conservative independent mesh hair/head-piece detection (not full topology analysis)."""
    if not points or len(points)<3:
        return False
    by={b['name']:b for b in bones}
    if not all(n in by for n in ('head','chest')):
        return False
    pivot=by['head']['head'];chest=by['chest']['head'];high=pivot[up]+.020*height
    count_high=sum(p[up]>high for p in points)
    if count_high/len(points)<.60 or min(p[up] for p in points)<chest[up]-.075*height:
        return False
    center=[sum(p[i] for p in points)/len(points) for i in range(3)]
    dist=sqrt(sum((center[i]-pivot[i])**2 for i in range(3) if i!=up))
    return dist<=.24*height


def head_owned_components(points,faces,bones,height,up=2):
    """Detect detached head/hair islands even when the FBX combines them in one mesh.

    Face edges establish topology; coincident position welding reconnects UV seams.
    The result is a per-vertex boolean ownership mask. No skin weights are painted.
    """
    n=len(points)
    if n<3:
        return [False]*n
    parent=list(range(n))
    def find(i):
        while parent[i]!=i:
            parent[i]=parent[parent[i]]
            i=parent[i]
        return i
    def union(a,b):
        a,b=find(a),find(b)
        if a!=b:parent[b]=a
    # Welding at 1e-5 of character height joins split normals/UV seams.
    tol=max(height*1e-5,1e-9)
    coords={}
    for i,p in enumerate(points):
        key=tuple(round(v/tol) for v in p)
        if key in coords:union(i,coords[key])
        else:coords[key]=i
    for face in faces:
        if not face:continue
        root=int(face[0])
        if not 0<=root<n:continue
        for j in face[1:]:
            j=int(j)
            if 0<=j<n:union(root,j)
    comps={}
    for i in range(n):comps.setdefault(find(i),[]).append(i)
    owned=[False]*n
    for indices in comps.values():
        if len(indices)<3:continue
        step=max(1,len(indices)//1500)
        sample=[points[i] for i in indices[::step]]
        if is_detached_head_piece(sample,bones,height,up):
            for i in indices:owned[i]=True
    return owned
