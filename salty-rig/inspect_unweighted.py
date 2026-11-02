"""Body points with little or no bone attachment, and where they are."""
import bpy
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath="D:/MuseTest/salty-rig/salty_rig.blend")
body = bpy.data.objects["body"]; me = body.data; mw = body.matrix_world
eyes = {"+X eye (her left)": Vector((1.3, -78.9, 29.0)), "-X eye (her right)": Vector((-35.7, -77.8, 21.7))}
low = [v for v in me.vertices if sum(x.weight for x in v.groups) < 0.5]
print("body points with total attachment < 0.5:", len(low), "of", len(me.vertices))
for label, c in eyes.items():
    near = [v for v in low if ((mw @ v.co) - c).length < 15]
    print(" ", label, "unattached within 15:", len(near))
import collections
cl = collections.Counter(tuple(round(x / 10) * 10 for x in (mw @ v.co)) for v in low)
print("  where (10-unit boxes):", cl.most_common(8))
