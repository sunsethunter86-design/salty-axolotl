"""What do the lash strands look like vs the skin around the top of each eye? (faces outside the eyeball,
in the band above the opening)"""
import bpy, json, math
import numpy as np
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath="D:/MuseTest/salty-rig/salty_skin.blend")
body = bpy.data.objects["body"]; me = body.data; mw = body.matrix_world
EYES = json.load(open("D:/MuseTest/salty-rig/eyes.json"))
img = [n.image for n in me.materials[0].node_tree.nodes if n.type == "TEX_IMAGE" and any(l.to_socket.name == "Base Color" for l in n.outputs["Color"].links)][0]
IW, IH = img.size; PIX = np.empty(IW * IH * 4, np.float32); img.pixels.foreach_get(PIX); PIX = PIX.reshape(IH, IW, 4)[..., :3]
uv = me.uv_layers.active.data
for key, E in EYES.items():
    c = Vector(E["centre"]); r = E["radius"]; f = Vector(E["f"]); u = Vector(E["u"])
    rows = []
    for p in me.polygons:
        if p.material_index != 0: continue
        cen = mw @ p.center; d = cen - c; dist = d.length
        if not (r + 0.3 < dist < r + 9): continue
        dn = d.normalized(); th = math.degrees(math.atan2(dn.dot(u), dn.dot(f)))
        if th < 10: continue
        lum = float(np.mean([PIX[min(IH - 1, int(uv[li].uv[1] * IH)), min(IW - 1, int(uv[li].uv[0] * IW))] for li in p.loop_indices], 0) @ [0.299, 0.587, 0.114])
        nd = abs((mw.to_3x3() @ p.normal).normalized().dot(dn))
        rows.append((dist - r, lum, nd, p.area))
    A = np.array(rows)
    print(key, "faces in band:", len(A))
    for lo, hi in ((0.3, 1), (1, 2), (2, 3), (3, 5), (5, 9)):
        m = (A[:, 0] >= lo) & (A[:, 0] < hi)
        if m.sum() == 0: continue
        print(f"  out {lo}-{hi}: n={m.sum():4d}  lum p10/p50/p90 = {np.percentile(A[m,1],10):.2f}/{np.percentile(A[m,1],50):.2f}/{np.percentile(A[m,1],90):.2f}   normal-vs-radial p50 = {np.percentile(A[m,2],50):.2f}  area p50 {np.percentile(A[m,3],50):.3f}")
    dark = A[:, 1] < 0.3
    print(f"  lum<0.3: {dark.sum()}  | lum 0.3-0.5: {((A[:,1]>=0.3)&(A[:,1]<0.5)).sum()}  | tangential (n.r<0.5) & out>1: {((A[:,2]<0.5)&(A[:,0]>1)).sum()}")
