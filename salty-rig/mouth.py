"""Salty rig, step 2b: a mouth that can open.

Her lips were only a crease in one surface. This cuts a slit along the lip line (corners stay joined),
puts a dark mouth with a tongue just inside her head, and adds a shape key "mouth_open" that swings
the lower jaw down about a hinge behind the lips (the page drives it from her voice level).
Lip line read off look/g_mouth.png (front close-up, 1 grid square = 2 units).
Reads salty_gills.blend, writes salty_mouth.blend and look/mouth_open.png.
"""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix

RIG = "D:/MuseTest/salty-rig"
LINE = [(-32.3, 8.7), (-30, 8.9), (-23.3, 10.7), (-16.7, 12.3), (-10, 14), (-3.3, 15.7), (2.7, 18)]  # (x, z)
CORNER_L, CORNER_R = -32.3, 2.7
FRONT_Y = -72  # only the snout is cut/moved

bpy.ops.wm.open_mainfile(filepath=f"{RIG}/salty_gills.blend")
body = bpy.data.objects["body"]
mw = body.matrix_world; mwi = mw.inverted()
me = body.data
xs = np.array([p[0] for p in LINE]); zs = np.array([p[1] for p in LINE])
line_z = lambda x: float(np.interp(x, xs, zs))
slope = (zs[-2] - zs[0]) / (xs[-2] - xs[0])
p0 = Vector((-16.7, 0, 12.3)); n = Vector((-slope, 0, 1)).normalized()   # plane through the lip line, along depth

bm = bmesh.new(); bm.from_mesh(me)
region = [f for f in bm.faces
          if all((mw @ v.co).y < FRONT_Y and CORNER_L - 1 < (mw @ v.co).x < CORNER_R + 1
                 and abs((mw @ v.co).z - line_z((mw @ v.co).x)) < 4 for v in f.verts)]
geom = list({v for f in region for v in f.verts}) + list({e for f in region for e in f.edges}) + region
res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=mwi @ p0, plane_no=(mwi.to_3x3() @ n).normalized(), dist=1e-4)
cut = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
# keep the corners joined: only split the stretch between them, and only on the front surface
def on_slit(e):
    a, b = mw @ e.verts[0].co, mw @ e.verts[1].co
    m = (a + b) / 2
    return CORNER_L + 1.2 < m.x < CORNER_R - 1.2 and m.y < FRONT_Y
slit = [e for e in cut if on_slit(e)]
print("cut edges", len(cut), "slit edges", len(slit), flush=True)
bmesh.ops.split_edges(bm, edges=slit)
bm.to_mesh(me); bm.free()

# ---- inner mouth: dark cavity + tongue, inside the head behind the lips
def blob(name, centre, radii, colour, segs=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=segs // 2, location=centre)
    o = bpy.context.active_object; o.name = name; o.scale = radii
    bpy.ops.object.transform_apply(scale=True)
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*colour, 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.6
    m.diffuse_color = (*colour, 1)
    o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = True
    return o
# where is the lip surface? deepest-forward skin point on the line, middle of the mouth
V = np.array([mw @ v.co for v in me.vertices])
near = V[(np.abs(V[:, 0] + 15) < 2) & (np.abs(V[:, 2] - line_z(-15)) < 1.5)]
lip_y = float(near[:, 1].min())
print("lip surface y", round(lip_y, 1), flush=True)
cav = blob("mouth_inside", (-15, lip_y + 8, line_z(-15) - 1.5), (15, 6, 5), (0.22, 0.05, 0.07))
tongue = blob("tongue", (-15, lip_y + 6, line_z(-15) - 4.2), (9, 4.5, 2.2), (0.85, 0.42, 0.48))
# ☠️ Her face curves back at the sides, so a plain ellipsoid poked out through her cheeks (29 Oct).
# Push every inner-mouth point to sit at least 1.5 units behind the skin in front of it.
from mathutils.kdtree import KDTree
skin_front = V[V[:, 1] < -60]
tree = KDTree(len(skin_front))
for i, q in enumerate(skin_front): tree.insert((q[0], q[2], 0), i)
tree.balance()
def tuck(o, gap):
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        idx = [i for (_, i, _) in tree.find_range((p.x, p.z, 0), 1.6)]
        if not idx: continue
        surf = skin_front[idx][:, 1].min()
        if p.y < surf + gap:
            p.y = surf + gap; v.co = o.matrix_world.inverted() @ p
tuck(cav, 1.5); tuck(tongue, 2.5)

# ---- shape key: lower jaw swings down about a hinge behind the lips
basis = body.shape_key_add(name="Basis", from_mix=False)
key = body.shape_key_add(name="mouth_open", from_mix=False)
hinge = Vector((-15, lip_y + 26, line_z(-15) + 1))
axis = Vector((1, 0, slope)).normalized()
ang = math.radians(16)
R = Matrix.Rotation(ang, 3, axis)
def smooth(a, b, x):
    t = min(1, max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
# which side of the slit is each vertex on? use its faces' centres (split verts belong to one side)
side = {}
for poly in me.polygons:
    c = mw @ poly.center
    s = (c - p0).dot(n)
    for vi in poly.vertices: side.setdefault(vi, []).append(s)
moved = 0
for v in me.vertices:
    p = mw @ v.co
    below = np.mean(side.get(v.index, [1])) < 0
    if not below or p.y > hinge.y: continue
    w = smooth(CORNER_L - 0.5, CORNER_L + 6, p.x) * smooth(CORNER_R + 0.5, CORNER_R - 6, p.x)  # corners stay shut
    w *= smooth(-14, -3, p.z)            # the neck stays put
    w *= smooth(hinge.y, hinge.y - 12, p.y)  # front of the head moves, back of the jaw follows less
    if w <= 0: continue
    q = hinge + R @ (p - hinge)
    key.data[v.index].co = mwi @ p.lerp(q, w); moved += 1
# the tongue and the cavity floor drop a little with the jaw (shape keys on them too)
for o, k in ((tongue, 0.8), (cav, 0.35)):
    o.shape_key_add(name="Basis"); sk = o.shape_key_add(name="mouth_open")
    for i, v in enumerate(o.data.vertices):
        p = o.matrix_world @ v.co
        if p.z < line_z(p.x) or o is tongue:
            q = hinge + R @ (p - hinge)
            sk.data[i].co = o.matrix_world.inverted() @ p.lerp(q, k)
print("jaw vertices", moved, flush=True)
bpy.ops.wm.save_as_mainfile(filepath=f"{RIG}/salty_mouth.blend")

# ---- check render, mouth open
for o in (body, tongue, cav): o.data.shape_keys.key_blocks["mouth_open"].value = 1.0
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "MATERIAL"
sc.display.shading.color_type = "TEXTURE"
sc.render.resolution_x = sc.render.resolution_y = 700
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 70; cam.data.clip_end = 2000
for name, loc, rot in (("front", (-15, -400, 10), (90, 0, 0)), ("three", (-15 + 220, -60 - 300, 10 + 80), (75, 0, 36))):
    cam.location = loc; cam.rotation_euler = [math.radians(a) for a in rot]
    sc.render.filepath = f"{RIG}/look/mouth_open_{name}.png"; bpy.ops.render.render(write_still=True)
print("MOUTH_OK")
