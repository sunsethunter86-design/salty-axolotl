"""Around each eyeball: in which directions is the eyeball bare (the eye opening), and how far out is the
skin elsewhere? Rays from the eyeball centre against the skin only (eyeball surface excluded)."""
import bpy, json, math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
bpy.ops.wm.open_mainfile(filepath="D:/MuseTest/salty-rig/salty_skin.blend")
body = bpy.data.objects["body"]; me = body.data; mw = body.matrix_world
V = [mw @ v.co for v in me.vertices]
R = json.load(open("D:/MuseTest/salty-rig/gill_roots.json"))
EYES = {"+X": (Vector((-0.96, -69.82, 27.19)), 9.52, Vector(R["_eyes"][0])), "-X": (Vector((-31.74, -68.56, 19.9)), 10.12, Vector(R["_eyes"][1]))}
side_ax = (Vector(R["_eyes"][0]) - Vector(R["_eyes"][1])).normalized()
out = {}
for name, (c, r, front) in EYES.items():
    ball = [p.index for p in me.polygons if all(abs((V[i] - c).length - r) < 0.35 for i in p.vertices)]
    bs = set(ball)
    skin = [list(p.vertices) for p in me.polygons if p.index not in bs and any((V[i] - c).length < r + 12 for i in p.vertices)]
    bvh = BVHTree.FromPolygons(V, skin)
    f = (front - c).normalized(); s = (side_ax - f * side_ax.dot(f)).normalized(); u = s.cross(f)
    if u.z < 0: u = -u
    rows = []
    grid = {}
    for pitch in range(-80, 85, 10):
        row = ""
        for yaw in range(-80, 85, 10):
            pr, yr = math.radians(pitch), math.radians(yaw)
            d = (f * math.cos(pr) * math.cos(yr) + u * math.sin(pr) + s * math.cos(pr) * math.sin(yr)).normalized()
            hit = bvh.ray_cast(c, d, r + 15)
            D = (hit[0] - c).length if hit[0] is not None else None
            grid[(pitch, yaw)] = D
            row += "  .  " if D is None else f"{D - r:5.1f}"
        rows.append(f"{pitch:+4d} " + row)
    print(f"{name} eye: eyeball faces {len(ball)}; skin distance beyond the eyeball (units), '.' = bare eyeball; rows = up/down angle, cols = left-right -80..80")
    print("\n".join(rows[::-1]))
    out[name] = dict(centre=list(c), radius=r, f=list(f), u=list(u), s=list(s))
json.dump(out, open("D:/MuseTest/salty-rig/eyes.json", "w"), indent=1)
