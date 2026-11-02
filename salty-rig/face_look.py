"""Workbench close-ups of the mouth with face shapes mixed in."""
import bpy, math, sys
bpy.ops.wm.open_mainfile(filepath="D:/MuseTest/salty-rig/salty_face.blend")
body = bpy.data.objects["body"]; kb = body.data.shape_keys.key_blocks
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"
sc.render.resolution_x, sc.render.resolution_y = 560, 420
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 62; cam.data.clip_end = 2000
SETS = {"rest": {}, "open": {"jaw_open": 1}, "grin": {"jaw_open": 0.8, "smileL": 1, "smileR": 1}, "smile": {"smileL": 1, "smileR": 1},
        "talk_ee": {"jaw_open": 0.35, "wide": 1}, "gasp_O": {"jaw_round": 0.8, "round": 1}, "pout": {"round": 1, "frown": 0.4}, "smirk": {"smileL": 1}}
for name, vals in SETS.items():
    for k in kb: k.value = 0.0
    for k, v in vals.items(): kb[k].value = v
    for vn, loc, rot in (("front", (-15, -400, 10), (90, 0, 0)), ("three", (-15 + 230, -60 - 300, 10 + 70), (78, 0, 37))):
        cam.location = loc; cam.rotation_euler = [math.radians(a) for a in rot]
        sc.render.filepath = f"D:/MuseTest/salty-rig/look/face_{name}_{vn}.png"; bpy.ops.render.render(write_still=True)
