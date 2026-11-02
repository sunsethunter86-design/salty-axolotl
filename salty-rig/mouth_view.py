"""Front close-up of her face (60 units across) for reading the lip line off by eye."""
import bpy, math
bpy.ops.wm.open_mainfile(filepath="D:/MuseTest/salty-rig/salty_gills.blend")
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"
sc.render.resolution_x = sc.render.resolution_y = 900
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 60; cam.data.clip_end = 2000
cam.location = (-20, -400, 12); cam.rotation_euler = (math.radians(90), 0, 0)
sc.render.filepath = "D:/MuseTest/salty-rig/look/mouth.png"; bpy.ops.render.render(write_still=True)
