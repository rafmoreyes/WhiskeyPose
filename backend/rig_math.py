"""Pure geometry heuristics for WhiskeyPose's first humanoid auto-rig.

This is an intentionally limited T/A-pose prototype, NOT learned anatomy.
Coordinates are Blender world-space after FBX import (Z up).
"""

from __future__ import annotations

from math import isfinite


def make_humanoid_template(bounds):
    """Return (bones, sizes) where bone positions are global XYZ tuples.

    Bone dict: name, head, tail, parent. No dependency on Blender so it can be
    tested without GPU, bpy, or a model download.
    """
    min_x, min_y, min_z, max_x, max_y, max_z = map(float, bounds)
    width = max_x - min_x
    depth = max_y - min_y
    height = max_z - min_z
    if not all(isfinite(v) for v in bounds):
        raise ValueError("Mesh bounds contain non-finite coordinates")
    if height <= 0 or width <= 0 or height < width * 0.53 or height < depth * 1.25:
        raise ValueError("Expected an upright T/A-pose humanoid (Z up after FBX import)")

    cx = (min_x + max_x) * 0.5
    cy = (min_y + max_y) * 0.5
    # This pilot targets symmetric humanoids. Cross-sectional fitting follows later.
    def pt(x, z, y=0.0):
        return (cx + x * width, cy + y * depth, min_z + z * height)

    result = []
    def add(name, head, tail, parent=None):
        result.append({"name": name, "head": head, "tail": tail, "parent": parent})

    add("pelvis", pt(0, 0.53), pt(0, 0.60))
    add("spine", pt(0, 0.60), pt(0, 0.70), "pelvis")
    add("chest", pt(0, 0.70), pt(0, 0.795), "spine")
    add("neck", pt(0, 0.795), pt(0, 0.855), "chest")
    add("head", pt(0, 0.855), pt(0, 0.975), "neck")

    for suffix, sign in (("L", 1), ("R", -1)):
        add(f"shoulder.{suffix}", pt(sign*0.075, .775), pt(sign*0.205, .768), "chest")
        add(f"upper_arm.{suffix}", pt(sign*0.205, .768), pt(sign*0.337, .76), f"shoulder.{suffix}")
        add(f"forearm.{suffix}", pt(sign*0.337, .76), pt(sign*0.435, .75), f"upper_arm.{suffix}")
        add(f"hand.{suffix}", pt(sign*0.435, .75), pt(sign*0.485, .75), f"forearm.{suffix}")
        add(f"thigh.{suffix}", pt(sign*0.091, .525), pt(sign*0.095, .295), "pelvis")
        add(f"shin.{suffix}", pt(sign*0.095, .295), pt(sign*0.095, .095), f"thigh.{suffix}")
        add(f"foot.{suffix}", pt(sign*0.095, .095), pt(sign*0.095, .040, -.35), f"shin.{suffix}")
    return result, {"height": height, "width": width, "depth": depth}


def squared_distance_segment(vertex, head, tail):
    vector = [tail[i] - head[i] for i in range(3)]
    length2 = sum(v * v for v in vector)
    if length2 < 1e-12:
        return sum((vertex[i] - head[i]) ** 2 for i in range(3))
    u = max(0.0, min(1.0, sum((vertex[i] - head[i]) * vector[i] for i in range(3)) / length2))
    return sum((vertex[i] - head[i] - u * vector[i]) ** 2 for i in range(3))


def proximity_weights(vertex, bones, height, limit=4):
    """Stable fallback when Blender's bone-heat binding fails.

    Every vertex receives normalized positive weights, at most limit bones.
    This is a spatial approximation and can deform clothing imperfectly.
    """
    spread = max(height * 0.065, 1e-6)
    distances = []
    for bone in bones:
        d2 = squared_distance_segment(vertex, bone["head"], bone["tail"])
        distances.append((d2, bone["name"]))
    distances.sort(key=lambda item: item[0])
    closest = distances[:limit]
    weights = [(name, (spread / (d2 ** 0.5 + spread)) ** 5) for d2, name in closest]
    total = sum(w for _, w in weights)
    if total <= 1e-12:
        return [(closest[0][1], 1.0)]
    normalized = [(name, value / total) for name, value in weights]
    return [(name, w) for name, w in normalized if w >= 1e-5]
