"""Validate SIB edits independently of Blender. No external dependencies."""
from __future__ import annotations
from math import isfinite

MAX_PAINT_POINTS=65000
MAX_MESHES=128

def validate_paint_edits(payload):
    if not isinstance(payload,dict) or payload.get('format')!='whiskeypose-sib-v1' or payload.get('version')!=1:
        raise ValueError('Unsupported SIB edit format')
    meshes=payload.get('meshes')
    if not isinstance(meshes,list) or not meshes or len(meshes)>MAX_MESHES:
        raise ValueError('SIB requires 1-128 edited meshes')
    result=[];total=0
    for part in meshes:
        if not isinstance(part,dict) or not isinstance(part.get('name'),str) or not part['name'] or len(part['name'])>256:
            raise ValueError('Invalid SIB mesh name')
        samples=part.get('samples')
        if not isinstance(samples,list) or not samples:
            raise ValueError('SIB mesh contains no painted samples')
        total+=len(samples)
        if total>MAX_PAINT_POINTS:raise ValueError('Too many SIB edits; please paint and export smaller regions')
        parsed=[]
        for sample in samples:
            if not isinstance(sample,dict):raise ValueError('Invalid SIB sample')
            p=sample.get('p');w=sample.get('w')
            if not isinstance(p,list) or len(p)!=3 or not all(type(v) in (int,float) and isfinite(v) and -.01<=v<=1.01 for v in p):
                raise ValueError('SIB coordinates must be normalized three-axis rest positions')
            if not isinstance(w,list) or not 1<=len(w)<=4:
                raise ValueError('SIB vertex must have 1-4 weights')
            seen=set();balance=0.;row=[]
            for item in w:
                if not isinstance(item,list) or len(item)!=2:
                    raise ValueError('Invalid SIB bone weight')
                name,value=item
                if not isinstance(name,str) or not 1<=len(name)<=128 or name in seen:
                    raise ValueError('Invalid or repeated SIB bone')
                if type(value) not in (int,float) or not isfinite(value) or not 0<value<=1.00001:
                    raise ValueError('SIB weight out of range')
                seen.add(name);balance+=float(value)
                row.append((name,float(value)))
            if abs(balance-1.)>1e-3:
                raise ValueError('SIB weights must sum to 1')
            parsed.append({'p':tuple(float(v) for v in p),'w':row})
        result.append({'name':part['name'],'samples':parsed})
    return result,total

def normalized_blender_point(point,bounds):
    """Browser: x,y-up,z-depth. Blender: x,y-depth,z-up.
    FBX roundtrip convention mirrors Blender Y relative to Three's Z."""
    minx,miny,minz,maxx,maxy,maxz=bounds
    dx=max(maxx-minx,1e-8);dy=max(maxy-miny,1e-8);dz=max(maxz-minz,1e-8)
    return ((point[0]-minx)/dx,(point[2]-minz)/dz,1-(point[1]-miny)/dy)

def match_mesh(name,objects):
    """Do not silently write a brush stroke to the wrong clothing object."""
    candidates=[obj for obj in objects if obj.name==name]
    if len(candidates)==1:return candidates[0]
    candidates=[obj for obj in objects if obj.name.lower()==name.lower()]
    if len(candidates)==1:return candidates[0]
    key=lambda v:''.join(c for c in v.lower() if c.isalnum())
    candidates=[obj for obj in objects if key(obj.name)==key(name)]
    if len(candidates)==1:return candidates[0]
    if len(objects)==1:return objects[0]
    raise ValueError('Cannot safely identify painted mesh '+name+'. Use one mesh or match Blender mesh names.')
