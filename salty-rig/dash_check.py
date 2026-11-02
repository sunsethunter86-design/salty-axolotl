"""What is left dark above each eye once the lash strands are taken out? (faces, by distance out)"""
import bpy, json, math
import numpy as np
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath="D:/MuseTest/salty-rig/salty_face.blend")
body = bpy.data.objects["body"]; me = body.data; mw = body.matrix_world
E = json.load(open("D:/MuseTest/salty-rig/eyes.json"))
img = [n.image for n in me.materials[0].node_tree.nodes if n.type == "TEX_IMAGE" and any(l.to_socket.name == "Base Color" for l in n.outputs["Color"].links)][0]
IW, IH = img.size; PIX = np.empty(IW * IH * 4, np.float32); img.pixels.foreach_get(PIX); PIX = PIX.reshape(IH, IW, 4)[..., :3]
uv = me.uv_layers.active.data
lash = {}
for vg in body.vertex_groups:
    if vg.name.startswith("LASH"):
        lash[vg.name[4:]] = {v.index for v in me.vertices if any(x.group == vg.index for x in v.groups)}
for key, e in E.items():
    c = Vector(e["centre"]); r = e["radius"]; f = Vector(e["f"]); u = Vector(e["u"])
    rows = []
    for p in me.polygons:
        if p.material_index != 0: continue
        if all(i in lash[key] for i in p.vertices): continue
        cen = mw @ p.center; d = cen - c; out = d.length - r
        if not (0.3 < out < 9): continue
        dn = d.normalized(); th = math.degrees(math.atan2(dn.dot(u), dn.dot(f)))
        if th < 15: continue
        lum = float(np.mean([PIX[min(IH-1,int(uv[li].uv[1]*IH)), min(IW-1,int(uv[li].uv[0]*IW))] for li in p.loop_indices], 0) @ [0.299,0.587,0.114])
        if lum < 0.45:
            nd = abs((mw.to_3x3() @ p.normal).normalized().dot(dn))
            nl = sum(1 for i in p.vertices if i in lash[key])
            rows.append((round(out, 1), round(th), round(lum, 2), round(nd, 2), nl))
    A = np.array(rows) if rows else np.zeros((0, 5))
    print(key, "dark non-lash faces above eye:", len(A))
    for lo, hi in ((0.3, 0.8), (0.8, 1.5), (1.5, 3), (3, 9)):
        m = (A[:, 0] >= lo) & (A[:, 0] < hi) if len(A) else []
        if len(A) and m.sum(): print(f"   out {lo}-{hi}: {m.sum()} faces, normal.radial p50 {np.median(A[m,3]):.2f}, touching lash verts {int((A[m,4]>0).sum())}, th range {int(A[m,1].min())}..{int(A[m,1].max())}")
