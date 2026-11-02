"""Close-ups of the gill roots: with and without the new gills, both sides."""
import bpy, math, sys
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath="D:/MuseTest/salty-rig/salty_gills.blend")
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"
sc.display.shading.show_object_outline = False
sc.render.resolution_x = sc.render.resolution_y = 700
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 70; cam.data.clip_end = 2000
gills = [o for o in bpy.data.objects if o.name.startswith("gill_")]
def shot(n, centre, d, hide):
    for g in gills: g.hide_render = hide
    c = Vector(centre); loc = c + Vector(d).normalized() * 300
    cam.location = loc; cam.rotation_euler = (c - loc).to_track_quat("-Z", "Z").to_euler()
    sc.render.filepath = f"D:/MuseTest/salty-rig/look/root_{n}.png"; bpy.ops.render.render(write_still=True)
for side, c, d in (("R", (18, -55, 30), (1, -0.6, 0.15)), ("L", (-52, -55, 25), (-1, -0.6, 0.15)), ("Rback", (18, -45, 30), (1, 0.5, 0.2))):
    shot(side + "_gills", c, d, False); shot(side + "_bare", c, d, True)
