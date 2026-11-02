"""Salty rig, step 0: import the Meshy model and render head close-ups (Workbench, no window)."""
import bpy, sys, mathutils
out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="D:/MuseTest/salty-rig/salty_meshy.glb")
ob = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
bb = [ob.matrix_world @ mathutils.Vector(c) for c in ob.bound_box]
mn = mathutils.Vector([min(v[i] for v in bb) for i in range(3)]); mx = mathutils.Vector([max(v[i] for v in bb) for i in range(3)])
print("OBJ", ob.name, "verts", len(ob.data.vertices), "min", tuple(round(x, 3) for x in mn), "max", tuple(round(x, 3) for x in mx))
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"
sc.render.resolution_x = sc.render.resolution_y = 700
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"
c = (mn + mx) / 2; size = mx - mn
def shot(name, loc, look, scale):
    cam.location = loc; d = (look - loc); cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler(); cam.data.ortho_scale = scale
    sc.render.filepath = f"{out}/{name}.png"; bpy.ops.render.render(write_still=True)
# blender import makes glTF +Y up -> Blender +Z up; glTF +Z forward -> Blender -Y
head = mathutils.Vector((c.x, mn.y + size.y * 0.25, mn.z + size.z * 0.7))
shot("front", mathutils.Vector((c.x, mn.y - 10, head.z)), mathutils.Vector((c.x, 0, head.z)), max(size.x, size.z) * 1.05)
shot("top", mathutils.Vector((c.x, c.y, mx.z + 10)), mathutils.Vector((c.x, c.y, 0)), max(size.x, size.y) * 1.05)
shot("side", mathutils.Vector((mx.x + 10, c.y, c.z)), mathutils.Vector((0, c.y, c.z)), max(size.y, size.z) * 1.05)
