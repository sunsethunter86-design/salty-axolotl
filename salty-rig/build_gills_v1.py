"""Salty rig, step 2 (Shaun 29 Oct: "make the little antenna things on her head look more real like the
google gemini pics/vids").

Meshy's gills are flat lumpy fans. The Gemini Salty has smooth tapered pink stalks with dense, fine,
glowing filaments fanning out on both sides. This cuts Meshy's gills off and grows new ones:
- stalk: a tapered tube from inside the head out to the tip, gently curved;
- filaments: thin tapered 3-sided tubes on both sides of the stalk, in the gill's fan plane, angled
  toward the tip, a little random in length, angle and lift; longest mid-stalk;
- colour by vertex: deeper pink at the roots, pale glowing pink at the tips.
Each gill is its own object named gill_L1..R3 so it can ride its own bone later.

Positions were read off exact-scale orthographic views (look/g_front|side|top.png): Blender units,
+Z up, she faces -Y, her left is -X.
Writes salty_gills.blend and renders look/gills_*.png.
"""
import bpy, bmesh, math, random, sys
import numpy as np
from mathutils import Vector

RIG = "D:/MuseTest/salty-rig"
HEAD_C = Vector((-17, -60, 22))
GILLS = {  # name: (base on the head surface, tip)
    "R1": ((5, -52, 44), (15, -42, 68)),
    "R2": ((10, -53, 37), (37, -48, 52)),
    "R3": ((12, -55, 25), (44, -52, 24)),
    "L1": ((-46, -52, 38), (-60, -45, 55)),
    "L2": ((-49, -55, 27), (-80, -52, 33)),
    "L3": ((-47, -57, 15), (-74, -55, 7)),
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=f"{RIG}/salty_meshy.glb")
body = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
body.name = "body"
bpy.context.view_layer.objects.active = body

# ---- 1. cut off Meshy's gills: vertices near each gill's line and outside the head surface
me = body.data
# ☠️ Editing the mesh drops Meshy's own surface directions; Blender's recomputed ones made her skin look
# flatter, with weaker bumps and sheen (Shaun 29 Oct: "it doesnt look as good as it did before").
# Keep the originals by position and put them back after the edits.
from mathutils.kdtree import KDTree
orig_n = {}
for poly in me.polygons:
    for li in poly.loop_indices:
        vi = me.loops[li].vertex_index
        orig_n.setdefault(vi, Vector()).__iadd__(Vector(me.corner_normals[li].vector))
ORIG = KDTree(len(me.vertices))
for v in me.vertices: ORIG.insert(v.co, v.index)
ORIG.balance()
orig_n = {i: n.normalized() for i, n in orig_n.items()}
bm = bmesh.new(); bm.from_mesh(me)
# ☠️ Meshy's mesh is split along its texture seams; read as islands, most of her body looked like
# "crumbs" and was deleted (29 Oct). Weld coincident points first (UVs stay per-corner in Blender).
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
mw = body.matrix_world
kill = set()
for name, (b, t) in GILLS.items():
    b, t = Vector(b), Vector(t)
    axis = t - b; L = axis.length; axis.normalize()
    r_head = (b - HEAD_C).length
    for v in bm.verts:
        p = mw @ v.co
        s = (p - b).dot(axis)
        if s < -9 or s > L + 6:
            continue
        radial = (p - (b + axis * s)).length
        # ☠️ r_head - 1 bit into the side of her head (29 Oct): only take what sticks out past the surface
        # +1.5 left stubs showing at the roots; +0.5 still clears the head (29 Oct)
        if radial < 12 and (p - HEAD_C).length > r_head + 0.5:
            kill.add(v)
print("removing", len(kill), "old gill vertices", flush=True)
bmesh.ops.delete(bm, geom=list(kill), context="VERTS")
# drop tiny floating crumbs left behind
bm.verts.ensure_lookup_table()
seen = set(); islands = []
for v in bm.verts:
    if v in seen: continue
    stack = [v]; seen.add(v); isl = []
    while stack:
        a = stack.pop(); isl.append(a)
        for e in a.link_edges:
            o = e.other_vert(a)
            if o not in seen: seen.add(o); stack.append(o)
    islands.append(isl)
islands.sort(key=len, reverse=True)
crumbs = [v for isl in islands[1:] if len(isl) < 2000 for v in isl]
print("islands", [len(i) for i in islands[:5]], "crumbs removed", len(crumbs), flush=True)
bmesh.ops.delete(bm, geom=crumbs, context="VERTS")
# Meshy's gill fans grew straight out of her head wall, so the cut leaves holes: close every hole and
# give the patch corners the texture position their vertex already has, so it takes the nearby skin.
uvl = bm.loops.layers.uv.active
before = set(bm.faces)
bndry = [e for e in bm.edges if e.is_boundary]
bmesh.ops.holes_fill(bm, edges=bndry, sides=0)
new = [f for f in bm.faces if f not in before]
bmesh.ops.triangulate(bm, faces=new)
new = [f for f in bm.faces if f not in before]
# Patches: round them out to follow the head (poke twice, then put interior points on the rim's
# sphere), and give each one a single skin colour.
# ☠️ Per-corner rim UVs smeared stray colours (29 Oct); the median rim UV then landed in a black gap
# between texture islands. Pick the rim UV whose texel is closest to her typical skin colour.
img = [n.image for n in body.active_material.node_tree.nodes if n.type == "TEX_IMAGE"][0]
W, Hh = img.size
PIX = np.array(img.pixels[:], dtype=np.float32).reshape(Hh, W, 4)[..., :3]
def texel(uv):
    return PIX[min(Hh - 1, max(0, int(uv[1] * Hh))), min(W - 1, max(0, int(uv[0] * W)))]
def patch_groups(faces):
    left = set(faces); groups = []
    while left:
        f0 = left.pop(); g = [f0]; stack = [f0]
        while stack:
            f = stack.pop()
            for e in f.edges:
                for o in e.link_faces:
                    if o in left: left.remove(o); g.append(o); stack.append(o)
        groups.append(g)
    return groups
sample = [texel(f.loops[0][uvl].uv) for f in list(before)[::40]]
skin = np.median(np.array(sample), 0)
print("typical skin texel", skin.round(3), flush=True)
for g in patch_groups(new):
    rim_verts = {v for f in g for v in f.verts}
    rim_uvs = [l[uvl].uv.copy() for v in rim_verts for l in v.link_loops if l.face in before]
    if not rim_uvs: continue
    spot = min(rim_uvs, key=lambda uv: float(np.abs(texel(uv) - skin).sum()))
    rim_r = sum(((mw @ v.co) - HEAD_C).length for v in rim_verts) / len(rim_verts)
    faces = g
    for _ in range(2):
        res = bmesh.ops.poke(bm, faces=faces)
        faces = res["faces"]
    inner = {v for f in faces for v in f.verts} - rim_verts
    for v in inner:
        p = mw @ v.co; d = (p - HEAD_C)
        target = HEAD_C + d.normalized() * rim_r
        v.co = mw.inverted() @ (p.lerp(target, 0.85))
    bmesh.ops.smooth_vert(bm, verts=list(inner), factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for f in faces:
        f.smooth = True
        for lp in f.loops: lp[uvl].uv = spot
bm.to_mesh(me); bm.free()
kept, fresh = 0, 0
vn = []
for v in me.vertices:
    co, idx, dist = ORIG.find(v.co)
    if dist < 1e-3 and idx in orig_n: vn.append(orig_n[idx]); kept += 1
    else: vn.append(v.normal.copy()); fresh += 1
for poly in me.polygons: poly.use_smooth = True
me.normals_split_custom_set_from_vertices(vn)
print("surface directions kept", kept, "new", fresh, flush=True)

# ---- 2. gill material: vertex colour, soft sheen, faint pink glow (they look backlit in the reference)
mat = bpy.data.materials.new("gill")
mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes["Principled BSDF"]
col = nt.nodes.new("ShaderNodeVertexColor"); col.layer_name = "Col"
nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.45
bsdf.inputs["Emission Color"].default_value = (1.0, 0.45, 0.6, 1)
bsdf.inputs["Emission Strength"].default_value = 0.0
mat.use_backface_culling = False
mat.diffuse_color = (0.97, 0.62, 0.70, 1)  # Workbench check renders

# ☠️ First colours read washed-out white next to Meshy's gills under the page's exposure (29 Oct): stronger pink
ROOT_STALK, TIP_STALK = np.array([0.90, 0.42, 0.52]), np.array([0.93, 0.47, 0.57])
ROOT_FIL, TIP_FIL = np.array([0.90, 0.30, 0.46]), np.array([0.97, 0.58, 0.68])

def tube(bm, colours, pts, radii, sides, col_a, col_b):
    """Tapered tube through pts; closed at the far end."""
    rings = []
    n = len(pts)
    for i, (p, r) in enumerate(zip(pts, radii)):
        d = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        u = d.orthogonal().normalized(); w = d.cross(u)
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            ring.append(bm.verts.new(p + (u * math.cos(a) + w * math.sin(a)) * r))
            colours[ring[-1]] = col_a + (col_b - col_a) * (i / (n - 1))
        rings.append(ring)
    for i in range(n - 1):
        for k in range(sides):
            a, b = rings[i][k], rings[i][(k + 1) % sides]
            c, d = rings[i + 1][(k + 1) % sides], rings[i + 1][k]
            bm.faces.new((a, b, c, d))
    tip = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * radii[-1])
    colours[tip] = col_b
    for k in range(sides):
        bm.faces.new((rings[-1][k], rings[-1][(k + 1) % sides], tip))

rng = random.Random(7)
for name, (b, t) in GILLS.items():
    b, t = Vector(b), Vector(t)
    axis = (t - b).normalized(); L = (t - b).length
    out = (b - HEAD_C).normalized()
    start = b - axis * 6.5                      # root sunk into the head, no gap
    side = axis.cross(Vector((0, 1, 0))).normalized()  # fan plane faces forward, as in the reference
    lift = side.cross(axis).normalized()
    bend = (out - axis * out.dot(axis)).normalized() if (out - axis * out.dot(axis)).length > 1e-3 else lift
    def stalk_at(s):  # s in 0..1 along the stalk, gentle outward curve
        return start + (t - start) * s + bend * (math.sin(math.pi * s) * L * 0.06)
    bm = bmesh.new(); colours = {}
    S = 14
    pts = [stalk_at(i / S) for i in range(S + 1)]
    # Gemini Salty: a thick smooth stalk that stays visible, the fringe shorter than the stalk is long
    radii = [(5.0 + 1.8 * max(0.0, 1 - (i / S) / 0.3)) * (1 - 0.72 * (i / S)) ** 1.1 for i in range(S + 1)]  # flared root covers the old stub
    tube(bm, colours, pts, radii, 10, ROOT_STALK, TIP_STALK)
    nfil = 0
    for sgn in (-1, 1):
        count = 150  # 85 looked wispy and sparse next to the reference
        for k in range(count):
            s = 0.16 + 0.84 * (k + rng.random() * 0.8) / count
            root = stalk_at(s)
            r_here = 5.0 * (1 - 0.72 * s) ** 1.1
            env = math.sin(math.pi * min(1.0, (s - 0.1) / 0.95)) ** 0.6
            flen = (2.8 + 3.6 * env) * (0.8 + 0.4 * rng.random())
            fwd = math.radians(30 + rng.uniform(-10, 10))   # swept toward the tip
            up = math.radians(rng.uniform(-55, 55))           # fluffed out of the fan plane: ±28 looked flat from three-quarter view (29 Oct)
            d = (side * sgn * math.cos(fwd) + axis * math.sin(fwd))
            d = (d * math.cos(up) + lift * math.sin(up)).normalized()
            p0 = root + d * (r_here * 0.8)
            curl = axis * 0.18 + lift * rng.uniform(-0.08, 0.08)
            fp = [p0 + (d + curl * (j / 3)) .normalized() * flen * (j / 3) for j in range(4)]
            tube(bm, colours, fp, [0.30, 0.22, 0.13, 0.05], 3, ROOT_FIL, TIP_FIL)
            nfil += 1
    gm = bpy.data.meshes.new(f"gill_{name}")
    bm.to_mesh(gm)
    ca = gm.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    vlist = list(colours.items())
    # bm verts were created in order; map by index
    bm.verts.ensure_lookup_table()
    for v in bm.verts:
        c = colours[v]; ca.data[v.index].color = (c[0], c[1], c[2], 1.0)
    bm.free()
    gm.materials.append(mat)
    for poly in gm.polygons: poly.use_smooth = True
    go = bpy.data.objects.new(f"gill_{name}", gm)
    bpy.context.scene.collection.objects.link(go)
    print(name, "filaments", nfil, "tris", sum(len(p.vertices) - 2 for p in gm.polygons), flush=True)

bpy.ops.wm.save_as_mainfile(filepath=f"{RIG}/salty_gills.blend")

# ---- 3. renders to check
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"
sc.render.resolution_x = sc.render.resolution_y = 900
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.clip_end = 2000
def shot(n, loc, rot, scale, center):
    cam.location = Vector(center) + Vector(loc); cam.rotation_euler = [math.radians(a) for a in rot]; cam.data.ortho_scale = scale
    sc.render.filepath = f"{RIG}/look/gills_{n}.png"; bpy.ops.render.render(write_still=True)
shot("front", (0, -400, 0), (90, 0, 0), 150, (-17, 0, 25))
shot("three", (300, -300, 120), (72, 0, 45), 140, (-17, -55, 25))
shot("top", (0, 0, 400), (0, 0, 0), 150, (-17, -55, 0))
print("GILLS_OK")
