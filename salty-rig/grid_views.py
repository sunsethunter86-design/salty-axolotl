"""Exact-scale orthographic views (front XZ, side YZ, top XY) for reading coordinates off by eye."""
import bpy, json, mathutils
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="D:/MuseTest/salty-rig/salty_meshy.glb")
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"
sc.render.resolution_x = sc.render.resolution_y = 1000
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 200; cam.data.clip_end = 1000
views = {"front": ((-15, -400, 0), (90, 0, 0)), "side": ((400, 0, 0), (90, 0, 90)), "top": ((-15, 0, 400), (0, 0, 0))}
import math
for n, (loc, rot) in views.items():
    cam.location = loc; cam.rotation_euler = [math.radians(a) for a in rot]
    sc.render.filepath = f"D:/MuseTest/salty-rig/look/grid_{n}.png"; bpy.ops.render.render(write_still=True)
json.dump({n: v[0] for n, v in views.items()}, open("D:/MuseTest/salty-rig/look/grid_views.json", "w"))
