"""Mouth-open close-ups for checking the teeth: blender -b -P teeth_look.py -- <blend> <out dir>."""
import bpy, math, sys
blend, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.open_mainfile(filepath=blend)
kb = bpy.data.objects["body"].data.shape_keys.key_blocks
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"
sc.render.resolution_x, sc.render.resolution_y = 800, 600
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 44; cam.data.clip_end = 2000
SETS = {"open": {"jaw_open": 1}, "grin": {"jaw_open": 0.8, "smileL": 1, "smileR": 1}, "talk": {"jaw_open": 0.5}}
for name, vals in SETS.items():
    for k in kb: k.value = 0.0
    for k, v in vals.items(): kb[k].value = v
    for vn, loc, rot in (("front", (-15, -400, 4), (90, 0, 0)), ("three", (-15 + 230, -60 - 300, 4 + 70), (78, 0, 37))):
        cam.location = loc; cam.rotation_euler = [math.radians(a) for a in rot]
        sc.render.filepath = f"{out}/{name}_{vn}.png"; bpy.ops.render.render(write_still=True)
