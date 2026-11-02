"""Close-up of the +X eye with the lash strands and lids removed: what stays behind on the brow?"""
import bpy, bmesh, json, math
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath="D:/MuseTest/salty-rig/salty_face.blend")
body = bpy.data.objects["body"]; me = body.data
for o in list(bpy.data.objects):
    if o.name.startswith(("lid", "gill")): o.hide_render = True
g = body.vertex_groups["LASH+X"]
idx = {v.index for v in me.vertices if any(x.group == g.index for x in v.groups)}
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.verts[i] for i in idx], context="VERTS"); bm.to_mesh(me); bm.free()
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "FLAT"; sc.display.shading.color_type = "TEXTURE"
sc.render.resolution_x, sc.render.resolution_y = 900, 600
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 34; cam.data.clip_end = 2000
E = json.load(open("D:/MuseTest/salty-rig/eyes.json"))["+X"]; c = Vector(E["centre"]); f = Vector(E["f"]); u = Vector(E["u"])
look = c + u * 6
for name, d in (("front", f), ("above", (f + u * 0.8).normalized())):
    cam.location = look + d * 200; cam.rotation_euler = (-d).to_track_quat("-Z", "Z").to_euler()
    sc.render.filepath = f"D:/MuseTest/salty-rig/look/dash_{name}.png"; bpy.ops.render.render(write_still=True)
