"""WhiskeyPose envelope-to-weights engine. Pure Python; runs inside Blender and tests.

One editable capsule per deformation bone. Every vertex gets up to four normalized
influences. Volumes are bound to bone names, never to individual mesh vertices.
"""
from __future__ import annotations
from math import isfinite, sqrt
from smart_regions import head_neck_ownership

SCHEMA = 'whiskeypose-skin-envelopes'
VERSION = 1
MODES = ('smooth', 'rigid')


def validate_envelopes(payload, bones):
    names = {bone['name'] for bone in bones}
    if not isinstance(payload, dict) or payload.get('format') != SCHEMA or payload.get('version') != VERSION:
        raise ValueError('Invalid skin envelope format or version')
    if payload.get('regionMode','smart') not in ('smart','head-only'):
        raise ValueError('Invalid Smart Regions mode')
    entries = payload.get('envelopes')
    if not isinstance(entries, dict) or set(entries) != names:
        raise ValueError('Skin envelopes must contain exactly one entry for every deform bone')
    valid = {}
    for name, row in entries.items():
        if not isinstance(row, dict):
            raise ValueError(f'Invalid envelope: {name}')
        radius = row.get('radius')
        mode = row.get('mode')
        strength = row.get('strength', 1.0)
        if type(radius) not in (float, int) or not isfinite(radius) or not .002 <= radius <= .4:
            raise ValueError(f'Invalid radius for envelope {name}')
        if mode not in MODES:
            raise ValueError(f'Invalid mode for envelope {name}')
        if type(strength) not in (float, int) or not isfinite(strength) or not 0 <= strength <= 3:
            raise ValueError(f'Invalid strength for envelope {name}')
        valid[name] = {'radius': float(radius), 'mode': mode, 'strength': float(strength)}
    return valid


def distance_segment_squared(point, head, tail):
    v = tuple(tail[i] - head[i] for i in range(3))
    l2 = sum(x * x for x in v)
    if l2 < 1e-12:
        return sum((point[i] - head[i]) ** 2 for i in range(3))
    t = max(0, min(1, sum((point[i] - head[i]) * v[i] for i in range(3)) / l2))
    return sum((point[i] - head[i] - t * v[i]) ** 2 for i in range(3))


def envelope_weights(point, bones, envelopes, height, limit=4, ownership=None):
    """Return ([(bone_name, weight)...], used_nearest_fallback).

    Score decreases from the axis to the radius. Rigid envelopes get 100%
    ownership for the nearest rigid volume containing the point. If none
    contain the vertex, it goes to the nearest bone (explicitly reported).
    """
    if height <= 0 or limit <= 0:
        raise ValueError('Invalid skin height or influence limit')
    ownership = ownership if ownership is not None else head_neck_ownership(point,bones,height)
    if ownership and 'weights' in ownership:
        return ownership['weights'], False
    blocked = set(ownership.get('blocked', ())) if ownership else set()
    allowed = set(ownership['allowed']) if ownership and 'allowed' in ownership else None
    scores = []
    nearest = (float('inf'), None)
    nearest_enabled = (float('inf'), None)
    rigid = []
    for bone in bones:
        name = bone['name']
        if name in blocked or (allowed is not None and name not in allowed):
            continue
        d2 = distance_segment_squared(point, bone['head'], bone['tail'])
        if d2 < nearest[0]:
            nearest = (d2, name)
        strength = envelopes[name].get('strength', 1.0)
        if strength > 0 and d2 < nearest_enabled[0]:
            nearest_enabled = (d2, name)
        if strength <= 0:
            continue
        radius = height * envelopes[name]['radius']
        if d2 >= radius * radius:
            continue
        normalized = sqrt(d2) / radius
        if envelopes[name]['mode'] == 'rigid':
            rigid.append((normalized, name))
        else:
            scores.append((((1 - normalized * normalized)**2) * strength, name))
    if rigid:
        return [(min(rigid)[1], 1.0)], False
    if not scores:
        return [((nearest_enabled[1] or nearest[1]), 1.0)], True
    scores.sort(key=lambda item: (-item[0], item[1]))
    scores = scores[:limit]
    total = sum(score for score, _ in scores)
    return [(name, score / total) for score, name in scores], False
