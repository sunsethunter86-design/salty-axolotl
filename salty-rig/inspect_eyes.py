"""Which bones move the skin around each eye? Prints weight mix in rings around both eyes, and islands."""
import bpy, json
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath="D:/MuseTest/salty-rig/salty_rig.blend")
body = bpy.data.objects["body"]; me = body.data; mw = body.matrix_world
names = {vg.index: vg.name for vg in body.vertex_groups}
eyes = {"eye at -X (her left)": Vector((-35.7, -77.8, 21.7)), "eye at +X (her right)": Vector((1.3, -78.9, 29.0))}
for label, c in eyes.items():
    for r0, r1 in ((0, 6), (6, 12), (12, 20)):
        acc = {}; n = 0
        for v in me.vertices:
            d = ((mw @ v.co) - c).length
            if r0 <= d < r1:
                n += 1
                for x in v.groups:
                    if x.weight > 0.01: acc[names[x.group]] = acc.get(names[x.group], 0) + x.weight
        tot = sum(acc.values()) or 1
        print(label, f"{r0}-{r1}", n, "pts:", {k: round(w / tot, 3) for k, w in sorted(acc.items(), key=lambda kv: -kv[1])[:5]})
# separate pieces near the eyes
import bmesh
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
seen = set(); isl = []
for v in bm.verts:
    if v in seen: continue
    st = [v]; seen.add(v); comp = []
    while st:
        a = st.pop(); comp.append(a.index)
        for e in a.link_edges:
            o = e.other_vert(a)
            if o not in seen: seen.add(o); st.append(o)
    isl.append(comp)
print("pieces:", sorted([len(i) for i in isl], reverse=True)[:12])
for i in isl:
    if len(i) > 40000: continue
    cen = sum((mw @ me.vertices[k].co for k in i), Vector()) / len(i)
    near = min((cen - c).length for c in eyes.values())
    if near < 25: print("  piece", len(i), "pts at", tuple(round(x, 1) for x in cen), "dist to nearest eye", round(near, 1))
