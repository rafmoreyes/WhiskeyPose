"""Pure-python landmark -> 19-bone generator for Blender. No bpy dependency.

The browser preview in src/skeleton_solver.js follows this same math. Browser
coordinates use Y up. Blender FBX coordinates use Z up with reversed depth.
Preview parity is checked against mapped normalized coordinates in JS/Python.
"""
from __future__ import annotations
from math import isfinite, sqrt

MARKERS = (
    'chin','neck','chest','groin',
    'shoulder.L','shoulder.R','elbow.L','elbow.R','wrist.L','wrist.R',
    'knee.L','knee.R','heel.L','heel.R','toe.L','toe.R',
)

def validate_payload(payload):
    if not isinstance(payload,dict) or payload.get('format')!='whiskeypose-rig-markers' or payload.get('version')!=2 or payload.get('space')!='normalized-three-bounds-y-up':
        raise ValueError('Unsupported marker payload: expected Alpha 0.2.2 marker version 2')
    values=payload.get('markers')
    if not isinstance(values,dict) or set(values)!=set(MARKERS):
        raise ValueError('All 16 joint markers are required')
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
def _unit(v):return _scale(v,1/max(_length(v),1e-10))

def make_marker_template(bounds,payload):
    """Return actual Blender-world bone heads/tails driven by approved markers."""
    p=validate_payload(payload)
    minx,miny,minz,maxx,maxy,maxz=map(float,bounds)
    width,depth,height=maxx-minx,maxy-miny,maxz-minz
    if not all(isfinite(v) for v in bounds) or min(width,depth,height)<=1e-9:
        raise ValueError('Invalid Blender mesh bounds')
    def unpack(n):return (minx+n[0]*width,miny+(1-n[2])*depth,minz+n[1]*height)
    m={key:unpack(p[key]) for key in MARKERS}
    groin,chest,neck,chin=(m[k] for k in ('groin','chest','neck','chin'))
    if not groin[2]<chest[2]<neck[2]<chin[2]:
        raise ValueError('Joint order must be Groin below Chest below Neck below Chin')
    pelvis_end=_lerp(groin,chest,.18)
    # Chin is a reference marker, NOT the head rotation pivot.
    head_pivot=_lerp(neck,chin,.72)
    head_top=(chin[0],chin[1],max(chin[2]+height*.045,minz+height*.965))
    bones=[]
    def add(name,a,b,parent=None):
        if _length(_minus(b,a))<=height*.001:
            raise ValueError('Joint positions overlap: '+name)
        bones.append({'name':name,'head':a,'tail':b,'parent':parent})
    add('pelvis',groin,pelvis_end)
    add('spine',pelvis_end,chest,'pelvis')
    add('chest',chest,neck,'spine')
    add('neck',neck,head_pivot,'chest')
    add('head',head_pivot,head_top,'neck')
    for side,sign in (('L',1),('R',-1)):
        shoulder,elbow,wrist,knee,heel,toe=(m[f'{part}.{side}'] for part in ('shoulder','elbow','wrist','knee','heel','toe'))
        add(f'shoulder.{side}',neck,shoulder,'chest')
        add(f'upper_arm.{side}',shoulder,elbow,f'shoulder.{side}')
        add(f'forearm.{side}',elbow,wrist,f'upper_arm.{side}')
        hand_end=_plus(wrist,_scale(_unit(_minus(wrist,elbow)),height*.045))
        add(f'hand.{side}',wrist,hand_end,f'forearm.{side}')
        hip=(groin[0]+sign*width*.085,groin[1],groin[2])
        add(f'thigh.{side}',hip,knee,'pelvis')
        ankle=_plus(_plus(heel,_scale(_unit(_minus(knee,heel)),height*.038)),_scale(_minus(toe,heel),.10))
        add(f'shin.{side}',knee,ankle,f'thigh.{side}')
        add(f'foot.{side}',ankle,toe,f'shin.{side}')
    return bones,{'height':height,'width':width,'depth':depth,'markers':m,'source':'confirmed-markers'}
