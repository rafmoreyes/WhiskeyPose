"""Topology-aware automatic skin. No artist-defined envelope radii or weights.

Blender bone-heat is used as an optional seed. SSR constrains the permitted bones;
connected faces/UV seam welds guide smoothing. All vertices get normalized,
up-to-four-bone influences. A deterministic spatial fallback is always available.
"""
from __future__ import annotations
from smart_regions import mesh_region_ownerships


def _distance2(point, bone):
    a, b = bone['head'], bone['tail']
    delta = [b[k] - a[k] for k in range(3)]
    norm = sum(t*t for t in delta)
    t = max(0., min(1., sum((point[k]-a[k])*delta[k] for k in range(3))/norm)) if norm > 1e-12 else 0.
    return sum((point[k]-a[k]-t*delta[k])**2 for k in range(3))


def _normalize(values, limit=4):
    ranked = sorted(((name,float(w)) for name,w in values.items() if w > 1e-12),
                    key=lambda row:(-row[1],row[0]))[:limit]
    total = sum(w for _,w in ranked)
    return {name:w/total for name,w in ranked} if total>0 else {}


def _adjacency(points, faces, height):
    n=len(points)
    links=[set() for _ in points]
    def edge(a,b):
        if a!=b and 0<=a<n and 0<=b<n:
            links[a].add(b);links[b].add(a)
    for face in faces:
        loop=[int(i) for i in face if 0<=int(i)<n]
        if len(loop)>=3:
            for j in range(len(loop)):
                edge(loop[j],loop[(j+1)%len(loop)])
    weld=max(height*1e-6,1e-9)
    seen={}
    for i,p in enumerate(points):
        key=tuple(round(value/weld) for value in p)
        if key in seen:edge(i,seen[key])
        else:seen[key]=i
    return links


def solve_automatic_skin(points, faces, bones, height, seed_weights=None, passes=4, ownership_override=None):
    """Return (per-vertex dict weights, diagnostics). No envelope settings.

    Fixed anatomical ownership (head, neck transition, rigid islands) remains
    unchanged. Bone-heat weights are corrected to SSR-permitted bones. Empty or
    failed seeds use locally restricted distance scores. Connected edges smooth
    transitions without mixing across disconnected clothing/hair islands.
    """
    if height<=0 or not bones:raise ValueError('Positive height and bones required')
    n=len(points)
    if seed_weights is not None and len(seed_weights)!=n:
        raise ValueError('Bone-heat seed count differs from vertex count')
    plans=mesh_region_ownerships(points,faces,bones,height)
    if ownership_override:
        for vertex_id,plan in ownership_override.items():
            if not isinstance(vertex_id,int) or not 0<=vertex_id<n:
                raise ValueError('Contact repair has invalid vertex ownership index')
            if not isinstance(plan,dict) or not ('weights' in plan or 'allowed' in plan):
                raise ValueError('Invalid contact ownership override')
            plans[vertex_id]=plan
    by_name={b['name']:b for b in bones}
    weights=[];fixed=[];fallback=0;regions={}
    epsilon2=(height*.018)**2
    for i,p in enumerate(points):
        plan=plans[i] if i<len(plans) else None
        zone=plan.get('zone','unclassified') if plan else 'unclassified'
        regions[zone]=regions.get(zone,0)+1
        locked=bool(plan and 'weights' in plan)
        fixed.append(locked)
        if locked:
            weights.append(_normalize(dict(plan['weights'])))
            continue
        allowed=(plan.get('allowed',by_name.keys()) if plan else by_name.keys())
        blocked=set(plan.get('blocked',()) if plan else ())
        names=[name for name in allowed if name in by_name and name not in blocked]
        if not names:names=list(by_name)
        seed=(seed_weights[i] if seed_weights is not None else {}) or {}
        candidate=_normalize({name:seed.get(name,0) for name in names})
        if not candidate:
            fallback+=1
            ranked=sorted(((_distance2(p,by_name[name]),name) for name in names),
                          key=lambda row:(row[0],row[1]))[:4]
            candidate=_normalize({name:1./((d2+epsilon2)**1.5) for d2,name in ranked})
        weights.append(candidate)
    neighbors=_adjacency(points,faces,height)
    rounds=max(0,min(8,int(passes)))
    for _ in range(rounds):
        updated=list(weights)
        for i,links in enumerate(neighbors):
            if fixed[i] or not links:continue
            plan=plans[i] if i<len(plans) else None
            allowed=set(plan['allowed']) if plan and 'allowed' in plan else set(by_name)
            allowed.difference_update(plan.get('blocked',()) if plan else ())
            if not allowed:allowed=set(by_name)
            near=[j for j in links if sum((points[i][k]-points[j][k])**2 for k in range(3)) <= (height*.08)**2]
            if not near:continue
            blended={name:weight*.72 for name,weight in weights[i].items() if name in allowed}
            factor=.28/len(near)
            for j in near:
                for name,value in weights[j].items():
                    if name in allowed:blended[name]=blended.get(name,0.)+factor*value
            updated[i]=_normalize(blended) or weights[i]
        weights=updated
    return weights,{'vertices':n,'seedFallbackVertices':fallback,'regions':regions,'topologyPasses':rounds}
