import bpy, json
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath="D:/MuseTest/salty-rig/salty_face.blend")
body = bpy.data.objects["body"]; me = body.data; mw = body.matrix_world
E = json.load(open("D:/MuseTest/salty-rig/eyes.json"))
sets = {}
for vg in body.vertex_groups:
    if vg.name.startswith("LASH"):
        sets[vg.name] = {v.index for v in me.vertices if any(x.group == vg.index for x in v.groups)}
for n, s_ in sets.items():
    cen = sum((mw @ me.vertices[i].co for i in s_), Vector()) / len(s_)
    d = {k: round((cen - Vector(e["centre"])).length, 1) for k, e in E.items()}
    print(n, len(s_), "points; centroid", tuple(round(x, 1) for x in cen), "distance to eyeball centres", d)
a, b = list(sets.values())
print("shared points:", len(a & b))
