"""Face survey: eyeball spheres (from eye-coloured surface points), lashes, lip line. Prints numbers."""
import bpy, json
import numpy as np
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath="D:/MuseTest/salty-rig/salty_skin.blend")
body = bpy.data.objects["body"]; me = body.data; mw = body.matrix_world
R = json.load(open("D:/MuseTest/salty-rig/gill_roots.json"))
eyes = [Vector(e) for e in R["_eyes"]]
img = [n.image for n in me.materials[0].node_tree.nodes if n.type == "TEX_IMAGE" and any(l.to_socket.name == "Base Color" for l in n.outputs["Color"].links)][0]
W, H = img.size; px = np.empty(W * H * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(H, W, 4)[..., :3]
uv = me.uv_layers.active.data
vcol = np.zeros((len(me.vertices), 3)); cnt = np.zeros(len(me.vertices))
for poly in me.polygons:
    if poly.material_index != 0: continue
    for li, vi in zip(poly.loop_indices, poly.vertices):
        u, v = uv[li].uv
        vcol[vi] += px[min(H - 1, int(v * H)), min(W - 1, int(u * W))]; cnt[vi] += 1
vcol /= np.maximum(cnt, 1)[:, None]
V = np.array([mw @ v.co for v in me.vertices])
lum = vcol @ [0.299, 0.587, 0.114]
for e, name in zip(eyes, ("+X eye", "-X eye")):
    d = np.linalg.norm(V - np.array(e), axis=1)
    near = d < 13
    white = near & (lum > 0.72) & (vcol.max(1) - vcol.min(1) < 0.12)
    iris = near & (vcol[:, 2] > vcol[:, 0] + 0.03) & (lum < 0.6)
    dark = near & (lum < 0.18)
    ball = white | iris
    P = V[ball]
    # sphere fit: |p|^2 = 2 c.p + (r^2 - |c|^2)
    A = np.c_[2 * P, np.ones(len(P))]; b = (P ** 2).sum(1)
    sol, *_ = np.linalg.lstsq(A, b, rcond=None); c = sol[:3]; r = np.sqrt(sol[3] + c @ c)
    res = np.abs(np.linalg.norm(P - c, axis=1) - r)
    print(name, "front hit", tuple(round(x, 1) for x in e), "| white", int(white.sum()), "iris", int(iris.sum()), "dark", int(dark.sum()))
    print("   eyeball centre", c.round(2), "radius", round(r, 2), "fit error median", round(float(np.median(res)), 2), "p90", round(float(np.percentile(res, 90)), 2))
    D = V[dark]; dd = np.linalg.norm(D - c, axis=1)
    print("   dark points distance from eyeball centre: min", round(dd.min(), 1), "median", round(float(np.median(dd)), 1), "max", round(dd.max(), 1))
    print("   dark points height above eyeball centre (z): median", round(float(np.median(D[:, 2] - c[2])), 1))
