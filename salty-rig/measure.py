"""Salty rig, step 1: find her head, six gills, spine line and feet on the Meshy mesh (Blender units,
+Z up, she faces -Y). Prints numbers and writes measure.json for the build script."""
import bpy, json, numpy as np
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="D:/MuseTest/salty-rig/salty_meshy.glb")
ob = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
me = ob.data
V = np.array([ob.matrix_world @ v.co for v in me.vertices])
print("bounds", V.min(0).round(1), V.max(0).round(1))
# head: front part of the body above the feet
y0, y1 = V[:, 1].min(), V[:, 1].max()
headzone = V[:, 1] < y0 + (y1 - y0) * 0.33
H = V[headzone]
centre = np.median(H, 0)
for _ in range(6):  # robust sphere: keep the inner 70% while recentering
    d = np.linalg.norm(H - centre, axis=1)
    core = H[d < np.percentile(d, 70)]
    centre = core.mean(0)
d = np.linalg.norm(V - centre, axis=1)
r = np.percentile(np.linalg.norm(H - centre, axis=1), 55)
print("head centre", centre.round(2), "radius~", round(r, 2))
# gills: head-zone verts well outside the head sphere, upper/side half
cand = headzone & (d > r * 1.18) & (V[:, 2] > centre[2] - r * 0.6)
idx = np.where(cand)[0]
# connected components among candidates
import bmesh
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
cset = set(idx.tolist()); label = {}
comps = []
for s in idx:
    if s in label: continue
    stack = [s]; label[s] = len(comps); comp = []
    while stack:
        v = stack.pop(); comp.append(v)
        for e in bm.verts[v].link_edges:
            o = e.other_vert(bm.verts[v]).index
            if o in cset and o not in label:
                label[o] = len(comps); stack.append(o)
    comps.append(comp)
comps = sorted(comps, key=len, reverse=True)
print("components", [len(c) for c in comps[:10]])
gills = []
for c in comps[:6]:
    P = V[c]
    dd = np.linalg.norm(P - centre, axis=1)
    tip = P[dd.argmax()]
    base = P[dd < np.percentile(dd, 8)].mean(0)
    Q = P - P.mean(0); _, s, vt = np.linalg.svd(Q, full_matrices=False)
    gills.append(dict(n=len(c), base=base.tolist(), tip=tip.tolist(), axes=vt.tolist(), spread=s.tolist(), verts=[int(i) for i in c]))
    print("gill n=%d base %s tip %s len %.1f" % (len(c), base.round(1), tip.round(1), np.linalg.norm(tip - base)))
# spine line: slice along Y, centroid of upper body (exclude legs by keeping z above a cut)
zfoot = V[:, 2].min()
spine = []
for yy in np.linspace(y0 + 2, y1 - 1, 24):
    m = (np.abs(V[:, 1] - yy) < (y1 - y0) / 48) & ~cand
    S = V[m]
    if len(S) < 20: continue
    zc = np.percentile(S[:, 2], 60); up = S[S[:, 2] > np.percentile(S[:, 2], 30)]
    spine.append([float(up[:, 0].mean()), float(yy), float((up[:, 2].max() + up[:, 2].min()) / 2)])
print("spine", np.array(spine).round(1).tolist())
# feet: lowest 3% of verts, clustered in XY
low = V[V[:, 2] < zfoot + (V[:, 2].max() - zfoot) * 0.06]
from itertools import product
cl = []
for p in low:
    for c in cl:
        if np.linalg.norm(c["sum"] / c["n"] - p[:2]) < 18:
            c["sum"] += p[:2]; c["n"] += 1; c["z"] = min(c["z"], p[2]); break
    else:
        cl.append(dict(sum=p[:2].copy(), n=1, z=p[2]))
feet = sorted([dict(xy=(c["sum"] / c["n"]).tolist(), n=c["n"], z=float(c["z"])) for c in cl], key=lambda c: -c["n"])[:6]
print("feet", [(np.round(f["xy"], 1).tolist(), f["n"]) for f in feet])
json.dump(dict(head_centre=centre.tolist(), head_r=float(r), gills=gills, spine=spine, feet=feet,
               zfoot=float(zfoot)), open("D:/MuseTest/salty-rig/measure.json", "w"))
print("MEASURE_OK")
