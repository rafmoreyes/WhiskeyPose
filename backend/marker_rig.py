"""Landmark-driven humanoid template. No bpy dependency.

Browser markers are normalized against Three.js (X right, Y up, Z toward camera)
mesh bounds. Blender's FBX importer uses Z up; convert fractions to Blender
(X right, Y depth *reversed*, Z up) using Blender's own imported bounds.
Only intended for upright frontal humanoids; verify FBX axis/rig quality.
"""
from __future__ import annotations
from math import isfinite, sqrt

MARKERS = ('chin','chest','groin','elbow.L','elbow.R','wrist.L','wrist.R','knee.L','knee.R','heel.L','heel.R','toe.L','toe.R')

def validate_payload(payload):
    if not isinstance(payload,dict) or payload.get('format')!='whiskeypose-rig-markers' or payload.get('version')!=1 or payload.get('space')!='normalized-three-bounds-y-up':
        raise ValueError('Unsupported marker payload')
    values=payload.get('markers')
    if not isinstance(values,dict) or set(values)!=set(MARKERS):
        raise ValueError('All 13 joint markers are required')
    validated={}
    for key in MARKERS:
        p=values[key]
        if not isinstance(p,list) or len(p)!=3 or not all(isinstance(v,(int,float)) and not isinstance(v,bool) and isfinite(v) and -.25<=v<=1.25 for v in p):
            raise ValueError('Invalid marker: '+key)
        validated[key]=tuple(float(v) for v in p)
    return validated

def _lerp(a,b,t):return tuple(a[i]+(b[i]-a[i])*t for i in range(3))
def _plus(a,b):return tuple(a[i]+b[i] for i in range(3))
def _minus(a,b):return tuple(a[i]-b[i] for i in range(3))
def _scale(v,f):return tuple(x*f for x in v)
def _length(a):return sqrt(sum(x*x for x in a))
def _unit(v):
    length=_length(v)
    return _scale(v,1/max(length,1e-10))

def make_marker_template(bounds,payload):
    """Return 19-bone template driven by user markers, not bounding-box limbs."""
    p=validate_payload(payload)
    minx,miny,minz,maxx,maxy,maxz=map(float,bounds)
    width,depth,height=maxx-minx,maxy-miny,maxz-minz
    if not all(isfinite(v) for v in bounds) or min(width,depth,height)<=1e-9:
        raise ValueError('Invalid Blender mesh bounds')
    def unpack(n):return (minx+n[0]*width,miny+(1-n[2])*depth,minz+n[1]*height)
    m={key:unpack(p[key]) for key in MARKERS}
    groin,chest,chin=m['groin'],m['chest'],m['chin']
    if not groin[2]<chest[2]<chin[2]:
        raise ValueError('Landmark order must be Groin below Chest below Chin')
    body=_minus(chest,groin)
    # The chest marker defines the actual torso target; no more fixed-Z chest.
    pelvis_end=_lerp(groin,chest,.18)
    spine_end=_lerp(groin,chest,.76)
    neck_end=_lerp(chest,chin,.60)
    head_top=(chin[0],chin[1],max(chin[2]+height*.045,minz+height*.965))
    bones=[]
    def add(name,a,b,parent=None):
        if _length(_minus(b,a))<=height*.001:
            raise ValueError('Joint positions overlap: '+name)
        bones.append({'name':name,'head':a,'tail':b,'parent':parent})
    add('pelvis',groin,pelvis_end)
    add('spine',pelvis_end,spine_end,'pelvis')
    add('chest',spine_end,chest,'spine')
    add('neck',chest,neck_end,'chest')
    add('head',neck_end,head_top,'neck')
    for side,sign in (('L',1),('R',-1)):
        elbow,wrist,knee,heel,toe=(m[f'{part}.{side}'] for part in ('elbow','wrist','knee','heel','toe'))
        # Shoulder is an inferred attachment near chest, with elbow determining
        # lateral reach. Far less T-pose-specific than legacy fixed points.
        shoulder_x=chest[0]+sign*min(width*.21,max(width*.075,abs(elbow[0]-chest[0])*.46))
        shoulder_z=chest[2]+max(0,(chin[2]-chest[2])*.07)
        shoulder_y=_lerp(chest,elbow,.24)[1]
        shoulder=(shoulder_x,shoulder_y,shoulder_z)
        add(f'shoulder.{side}',chest,shoulder,'chest')
        add(f'upper_arm.{side}',shoulder,elbow,f'shoulder.{side}')
        add(f'forearm.{side}',elbow,wrist,f'upper_arm.{side}')
        hand_end=_plus(wrist,_scale(_unit(_minus(wrist,elbow)),height*.045))
        add(f'hand.{side}',wrist,hand_end,f'forearm.{side}')
        hip=(groin[0]+sign*width*.085,groin[1],groin[2])
        add(f'thigh.{side}',hip,knee,'pelvis')
        # Heel anchors the posterior foot. Ankle is derived above/towards toe
        # for a nonzero shin and foot bone. Avoids treating heel as knee endpoint.
        ankle=_plus(_plus(heel,_scale(_unit(_minus(knee,heel)),height*.038)),_scale(_minus(toe,heel),.10))
        add(f'shin.{side}',knee,ankle,f'thigh.{side}')
        add(f'foot.{side}',ankle,toe,f'shin.{side}')
    return bones,{'height':height,'width':width,'depth':depth,'markers':m,'source':'confirmed-markers'}
