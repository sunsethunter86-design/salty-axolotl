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
# ☠️ Take 1 cut only what stuck out past the head and left ragged star-shaped patches, shards and an old
# stub showing (Shaun 29 Oct: "all jaggedy and weird looking... do it properly"). Now: take a generous
# disk around each root plus the gill itself, clean the hole edge, then rebuild real skin over it.
for name, (b, t) in GILLS.items():
    b, t = Vector(b), Vector(t)
    axis = t - b; L = axis.length; axis.normalize()
    r_head = (b - HEAD_C).length
    for v in bm.verts:
        p = mw @ v.co
        if (p - b).length < 14:          # the whole old root: fan bases, stubs, shards (11 left spiky bits)
            kill.add(v); continue
        s = (p - b).dot(axis)
        if s < -9 or s > L + 6:
            continue
        radial = (p - (b + axis * s)).length
        if radial < 14 and (p - HEAD_C).length > r_head - 1.0:
            kill.add(v)
print("removing", len(kill), "old gill vertices", flush=True)
bmesh.ops.delete(bm, geom=list(kill), context="VERTS")

# drop floating crumbs (the welded body is one big island)
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
bmesh.ops.delete(bm, geom=crumbs, context="VERTS")

# move the cut edge onto clean skin: the old edge zig-zagged and carried a raised lip (a visible seam, 29 Oct)
for _ in range(3):
    edge_faces = {f for e in bm.edges if e.is_boundary for f in e.link_faces}
    bmesh.ops.delete(bm, geom=list(edge_faces), context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context="EDGES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
# clean the hole edges: shave slivers (faces with 2+ open sides) and pinch points until none are left
for it in range(12):
    bad = {f for f in bm.faces if sum(e.is_boundary for e in f.edges) >= 2}
    for v in bm.verts:
        if sum(e.is_boundary for e in v.link_edges) > 2:
            bad.update(v.link_faces)
    if not bad:
        break
    bmesh.ops.delete(bm, geom=list(bad), context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context="EDGES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
print("edge clean-up passes", it, flush=True)

uvl = bm.loops.layers.uv.active
texs = [n for n in body.active_material.node_tree.nodes if n.type == "TEX_IMAGE"]
base_tex = [n for n in texs if any(l.to_socket.name == "Base Color" for l in n.outputs["Color"].links)]
img = (base_tex or texs)[0].image
print("skin colour image", img.name, flush=True)
W, Hh = img.size
PIX = np.array(img.pixels[:], dtype=np.float32).reshape(Hh, W, 4)[..., :3]
def texel(uv):
    return PIX[min(Hh - 1, max(0, int(uv[1] * Hh))), min(W - 1, max(0, int(uv[0] * W)))]

# fill each hole, then refine it into small even triangles
before = set(bm.faces)
bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
def patch_faces():
    return [f for f in bm.faces if f not in before]
bmesh.ops.triangulate(bm, faces=patch_faces(), quad_method="BEAUTY", ngon_method="BEAUTY")
for it in range(8):
    pf = set(patch_faces())
    long = [e for e in {e for f in pf for e in f.edges}
            if all(lf in pf for lf in e.link_faces) and e.calc_length() > 2.0]  # ~3000 points per hole: small enough to solve exactly
    if not long:
        break
    bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=False)
    bmesh.ops.triangulate(bm, faces=patch_faces(), quad_method="BEAUTY", ngon_method="BEAUTY")
pf = set(patch_faces())
inner_edges = [e for e in {e for f in pf for e in f.edges} if all(lf in pf for lf in e.link_faces)]
bmesh.ops.beautify_fill(bm, faces=list(pf), edges=inner_edges)

def groups_of(faces):
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

# shape: continue the head's own curve across each hole. Fit a smooth quadratic surface to the skin
# around the hole, then relax the new points and lay them on it (rim points never move).
bm.normal_update()
TILE, ATLAS = 256, 1024
patch_img = np.zeros((ATLAS, ATLAS, 3), np.float32); painted = np.zeros((ATLAS, ATLAS), bool)
groups = groups_of(patch_faces())
rim_cols = []
TILE_INFO = []
BAND_W = {}  # moved skin points -> how much (for blending their shading)
print("holes", len(groups), "patch triangles", sum(len(g) for g in groups), flush=True)
for gi, g in enumerate(groups):
    gverts = {v for f in g for v in f.verts}
    rim = {v for v in gverts if any(lf in before for lf in v.link_faces)}
    inner = gverts - rim
    # ring of real skin around the hole (about 7 units deep)
    ring = set(rim); front = set(rim)
    for _ in range(8):
        nxt = set()
        for v in front:
            for e in v.link_edges:
                o = e.other_vert(v)
                if o not in ring and o not in gverts and any(lf in before for lf in o.link_faces):
                    nxt.add(o)
        ring |= nxt; front = nxt
    R = np.array([mw @ v.co for v in ring])
    origin = np.array([mw @ v.co for v in rim]).mean(0)
    nrm = np.array(sum((v.normal for v in ring), Vector())).astype(float); nrm /= np.linalg.norm(nrm)
    ua = np.cross(nrm, [0, 0, 1.0]);
    if np.linalg.norm(ua) < 0.1: ua = np.cross(nrm, [1.0, 0, 0])
    ua /= np.linalg.norm(ua); va = np.cross(nrm, ua)
    def local(P): d = P - origin; return d @ ua, d @ va, d @ nrm
    u, v_, h = local(R)
    A = np.stack([np.ones_like(u), u, v_, u * u, u * v_, v_ * v_], 1)
    coef, *_ = np.linalg.lstsq(A, h, rcond=None)
    surf = lambda uu, vv: coef[0] + coef[1] * uu + coef[2] * vv + coef[3] * uu * uu + coef[4] * uu * vv + coef[5] * vv * vv
    # ☠️ Easing nearby skin onto one fitted curve left a dent and a lump low on the head, where it turns
    # into the jaw and neck (29 Oct). Proper fill: start from the fitted curve, then solve for the
    # smoothest surface (biharmonic) that meets the surrounding skin in both height and slope. Real skin
    # never moves; only the new points do.
    inner_l = list(inner)
    for _ in range(25):  # starting shape: relaxed and laid on the fitted curve
        newpos = {}
        for v in inner_l:
            nb = [e.other_vert(v) for e in v.link_edges]
            newpos[v] = sum(((mw @ o.co) for o in nb), Vector()) / len(nb)
        for v, p in newpos.items():
            uu, vv, _ = local(np.array(p))
            v.co = mw.inverted() @ Vector(origin + ua * uu + va * vv + nrm * surf(uu, vv))
    ring1 = {e.other_vert(v) for v in rim for e in v.link_edges} - gverts
    nodes = inner_l + list(rim) + list(ring1)
    ix = {v: i for i, v in enumerate(nodes)}
    n_in, n_lap = len(inner_l), len(inner_l) + len(rim)
    deg = 12
    NB = np.full((n_lap, deg), -1)
    for v in inner_l + list(rim):
        nb = [ix[e.other_vert(v)] for e in v.link_edges if e.other_vert(v) in ix][:deg]
        NB[ix[v], :len(nb)] = nb
    # ☠️ Repeated smoothing (Jacobi) left a raised plateau, and conjugate gradients had not converged after
    # 3000 steps (the smoothest-surface system is very stiff, 29 Oct). Solve it exactly instead:
    # uniform graph Laplacian L over the new points, rim and the ring outside it; then
    # (L*L)[new,new] x = -(L*L)[new,fixed] x_fixed, solved directly (a few thousand unknowns).
    n_nodes = len(nodes)
    Lr = np.zeros((n_lap, n_nodes))
    for v in inner_l + list(rim):
        i = ix[v]; nb = [ix[e.other_vert(v)] for e in v.link_edges if e.other_vert(v) in ix]
        Lr[i, i] = len(nb); Lr[i, nb] = -1.0
    L2 = Lr[:n_in, :n_lap] @ Lr
    P = np.array([np.array(mw @ v.co) for v in nodes])
    x = np.linalg.solve(L2[:, :n_in], -L2[:, n_in:] @ P[n_in:])
    print("  smooth fill solved exactly:", n_in, "new points", flush=True)
    P[:n_in] = x
    for v in inner_l:
        v.co = mw.inverted() @ Vector(P[ix[v]])
    # colour: rim points take the skin colour already under them; the inside is blended smoothly
    col = {}
    for v in rim:
        cs = [texel(l[uvl].uv) for l in v.link_loops if l.face in before]
        col[v] = np.mean(cs, 0) if cs else np.array([0.67, 0.53, 0.49])
    rim_cols.extend(col.values())
    for v in inner_l: col[v] = np.mean(list(col.values()), 0)
    for _ in range(150):
        for v in inner_l:
            col[v] = np.mean([col[e.other_vert(v)] for e in v.link_edges], 0)
    # texture tile for this hole: flatten it onto its own surface frame, paint it, point its UVs there
    P2 = {v: np.array(local(np.array(mw @ v.co))[:2]) for v in gverts}
    lo = np.min(list(P2.values()), 0); hi = np.max(list(P2.values()), 0)
    scale = (TILE - 16) / max(hi - lo)
    tx, ty = (gi % 4) * TILE, (gi // 4) * TILE
    TILE_INFO.append((tx, ty, scale, sum(f.calc_area() for f in g)))
    pix = {v: (tx + 8 + (P2[v][0] - lo[0]) * scale, ty + 8 + (P2[v][1] - lo[1]) * scale) for v in gverts}
    for f in g:
        a, b2, c = [pix[v] for v in f.verts]; ca, cb, cc = [col[v] for v in f.verts]
        xs = [a[0], b2[0], c[0]]; ys = [a[1], b2[1], c[1]]
        x0, x1 = int(max(0, min(xs))), int(min(ATLAS - 1, max(xs) + 1)); y0, y1 = int(max(0, min(ys))), int(min(ATLAS - 1, max(ys) + 1))
        den = (b2[1] - c[1]) * (a[0] - c[0]) + (c[0] - b2[0]) * (a[1] - c[1])
        if abs(den) < 1e-9: continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((b2[1] - c[1]) * (gx - c[0]) + (c[0] - b2[0]) * (gy - c[1])) / den
        w1 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / den
        w2 = 1 - w0 - w1
        ins = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        sub = patch_img[y0:y1 + 1, x0:x1 + 1]; m = painted[y0:y1 + 1, x0:x1 + 1]
        sub[ins] = (w0[ins, None] * ca + w1[ins, None] * cb + w2[ins, None] * cc)
        m[ins] = True
        for lp in f.loops:
            px, py = pix[lp.vert]; lp[uvl].uv = (px / ATLAS, py / ATLAS)
        f.smooth = True
# freckles: her head is dotted all over; a smooth patch read as a bald spot. Scatter soft dots like hers
# (about 0.5-1.2 units across, roughly one per 14 square units, a little darker and redder than the skin).
frng = np.random.default_rng(11)
for (tx, ty, sc_, area) in TILE_INFO:
    tile_mask = painted[ty:ty + TILE, tx:tx + TILE]
    ys, xs = np.nonzero(tile_mask)
    if len(xs) == 0: continue
    for _ in range(int(area / 14)):
        i = frng.integers(len(xs)); cx, cy = xs[i] + tx, ys[i] + ty
        r = frng.uniform(0.25, 0.6) * sc_
        tint = np.array([0.86, 0.72, 0.72]) * frng.uniform(0.95, 1.03)
        y0, y1 = int(max(0, cy - r - 2)), int(min(ATLAS, cy + r + 3)); x0, x1 = int(max(0, cx - r - 2)), int(min(ATLAS, cx + r + 3))
        gy, gx = np.mgrid[y0:y1, x0:x1]
        a = np.clip(1 - np.hypot(gx - cx, gy - cy) / max(r, 0.5), 0, 1) ** 0.7 * frng.uniform(0.35, 0.7)
        a *= painted[y0:y1, x0:x1]
        sub = patch_img[y0:y1, x0:x1]
        sub[:] = sub * (1 - a[..., None]) + (sub * tint) * a[..., None]
# grow painted pixels outward a little so texture filtering never reaches black
for _ in range(6):
    grown = painted.copy(); acc = np.zeros_like(patch_img); cnt = np.zeros(painted.shape, np.float32)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        acc += np.roll(np.roll(patch_img * painted[..., None], dy, 0), dx, 1); cnt += np.roll(np.roll(painted, dy, 0), dx, 1)
    fill = (~painted) & (cnt > 0)
    patch_img[fill] = acc[fill] / cnt[fill, None]; painted |= fill
pimg = bpy.data.images.new("skin_patch", ATLAS, ATLAS)
pimg.pixels = np.dstack([patch_img, np.ones((ATLAS, ATLAS), np.float32)]).ravel().tolist()
pimg.pack()
pmat = bpy.data.materials.new("skin_patch"); pmat.use_nodes = True
pb_ = pmat.node_tree.nodes["Principled BSDF"]
tex = pmat.node_tree.nodes.new("ShaderNodeTexImage"); tex.image = pimg
pmat.node_tree.links.new(tex.outputs["Color"], pb_.inputs["Base Color"])
pb_.inputs["Roughness"].default_value = 0.55; pb_.inputs["Metallic"].default_value = 0.0
me.materials.append(pmat); PATCH_MAT = len(me.materials) - 1
for f in patch_faces(): f.material_index = PATCH_MAT
SKIN_RIM = np.mean(rim_cols, 0)  # sRGB; the gill roots start in this colour
print("skin around the roots", SKIN_RIM.round(3), flush=True)
bm.to_mesh(me); bm.free()
kept, fresh = 0, 0
vn = []
for v in me.vertices:
    co, idx, dist = ORIG.find(v.co)
    w = BAND_W.get(tuple(np.round(np.array(mw @ v.co), 3)))
    if w is not None and idx in orig_n:   # eased skin: blend its own shading into the new surface
        vn.append(orig_n[idx].lerp(v.normal, w * w * (3 - 2 * w)).normalized()); fresh += 1
    elif dist < 1e-3 and idx in orig_n: vn.append(orig_n[idx]); kept += 1
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
bsdf.inputs["Roughness"].default_value = 0.55  # matches her skin; 0.45 made the gill bases shinier than the head
bsdf.inputs["Emission Color"].default_value = (1.0, 0.45, 0.6, 1)
bsdf.inputs["Emission Strength"].default_value = 0.0
mat.use_backface_culling = False
mat.diffuse_color = (0.97, 0.62, 0.70, 1)  # Workbench check renders

# ☠️ First colours read washed-out white next to Meshy's gills under the page's exposure (29 Oct): stronger pink
ROOT_STALK, TIP_STALK = np.array([0.90, 0.42, 0.52]), np.array([0.93, 0.47, 0.57])
ROOT_FIL, TIP_FIL = np.array([0.90, 0.30, 0.46]), np.array([0.97, 0.58, 0.68])

def tube(bm, colours, pts, radii, sides, col_a, col_b, col_fn=None):
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
            colours[ring[-1]] = col_fn(i / (n - 1)) if col_fn else col_a + (col_b - col_a) * (i / (n - 1))
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

# where does each stalk actually meet the (rebuilt) skin? Cast from the tip back toward the head.
# ☠️ Anchoring to the old fan-base points left skin-coloured stubs sticking out where the new skin sits
# lower (29 Oct).
from mathutils.bvhtree import BVHTree
BODY_BVH = BVHTree.FromPolygons([body.matrix_world @ v.co for v in me.vertices], [p.vertices[:] for p in me.polygons])
UVD = me.uv_layers.active.data
def skin_texel_at(loc, fi):
    """sRGB colour of her skin at a surface point: barycentric UV on that triangle, then the body
    texture, or the rebuilt-skin texture for patch triangles."""
    poly = me.polygons[fi]
    vs = [body.matrix_world @ me.vertices[i].co for i in poly.vertices[:3]]
    uvs = [UVD[li].uv for li in list(poly.loop_indices)[:3]]
    from mathutils.geometry import barycentric_transform
    uv = barycentric_transform(loc, vs[0], vs[1], vs[2], Vector((uvs[0][0], uvs[0][1], 0)), Vector((uvs[1][0], uvs[1][1], 0)), Vector((uvs[2][0], uvs[2][1], 0)))
    if poly.material_index == PATCH_MAT:
        return patch_img[min(ATLAS - 1, max(0, int(uv.y * ATLAS))), min(ATLAS - 1, max(0, int(uv.x * ATLAS)))].astype(float)
    return texel((uv.x, uv.y)).astype(float)
rng = random.Random(7)
ROOTS = {}  # where each gill meets the skin; rig.py pivots the gill bones there
for name, (b, t) in GILLS.items():
    b, t = Vector(b), Vector(t)
    axis = (t - b).normalized(); L = (t - b).length
    out = (b - HEAD_C).normalized()
    hit, hit_n, _, _ = BODY_BVH.ray_cast(t, -axis, 200.0)
    surf_pt = hit if hit is not None else b
    ROOTS[name] = dict(surface=list(surf_pt), tip=list(t), fillet=4.5)
    print(name, "meets the skin", round((surf_pt - b).length, 1), "from the old base", flush=True)
    side = axis.cross(Vector((0, 1, 0))).normalized()  # fan plane faces forward, as in the reference
    lift = side.cross(axis).normalized()
    bend = (out - axis * out.dot(axis)).normalized() if (out - axis * out.dot(axis)).length > 1e-3 else lift
    start = surf_pt
    SL = (t - start).length
    def stalk_at(s):  # s in 0..1 from the skin to the tip, gentle outward curve
        return start + (t - start) * s + bend * (math.sin(math.pi * s) * L * 0.06)
    def stalk_r(s):   # Gemini Salty: a thick smooth stalk that stays visible
        return (5.0 + 1.8 * max(0.0, 1 - s / 0.3)) * (1 - 0.72 * s) ** 1.1
    # ☠️ A plain tube pushed into the head read as a pipe stuck in her, with a hard line and a colour band
    # where it met the skin: "severed" (Shaun 29 Oct). Proper join: a fillet. The base flares out and
    # curves down to lie along her head (its edge tucked just under the skin), coloured with the exact
    # skin under it, then turns pink going up the stalk.
    # ☠️ A steep skirt (height grew as u^2) read as a flat collar with a bright rim (29 Oct). Use a true
    # quarter-circle fillet: flat against her head at its outer edge, upright against the stalk at the top.
    FLARE, K, SIDES = 4.5, 8, 20
    H_TOP = FLARE
    s_top = H_TOP / SL
    f_out = s_top
    c_top = stalk_at(s_top); r0 = stalk_r(s_top)
    rings, ring_cols = [], []
    ring_nrm, ring_w = [], []
    for k in range(K):
        phi = (math.pi / 2) * k / K
        R = r0 + FLARE * (1 - math.sin(phi))           # quarter circle: (R, h) = (r0+F-F sin, F-F cos)
        h = FLARE * (1 - math.cos(phi))
        ring, cols, nrms = [], [], []
        for j in range(SIDES):
            th = 2 * math.pi * j / SIDES
            d = side * math.cos(th) + lift * math.sin(th)
            loc, nrm_s, fi, _ = BODY_BVH.find_nearest(surf_pt + d * R)
            ring.append(loc + nrm_s * (h - (0.15 if k == 0 else 0.0)))   # outer edge just under the skin
            sk = np.mean([skin_texel_at(*BODY_BVH.find_nearest(loc + q)[::2]) for q in
                          (Vector((0, 0, 0)), Vector((0.6, 0, 0)), Vector((-0.6, 0, 0)), Vector((0, 0.6, 0)), Vector((0, -0.6, 0)))], 0) ** 2.2
            w_up = 1 - math.cos(phi)
            cols.append(sk + (ROOT_STALK - sk) * (0.35 * w_up))
            nrms.append(nrm_s.copy())
        rings.append(ring); ring_cols.append(cols); ring_nrm.append(nrms); ring_w.append(math.sin(phi))
    S = 14
    skin_lin = np.mean([c for cs in ring_cols[:2] for c in cs], 0)
    for i in range(S + 1):
        sv = s_top + (1 - s_top) * i / S
        p = stalk_at(sv); dvec = (stalk_at(min(1, sv + 0.01)) - stalk_at(max(0, sv - 0.01))).normalized()
        uu = (side - dvec * side.dot(dvec)).normalized(); ww = dvec.cross(uu)
        ring = [p + (uu * math.cos(2 * math.pi * j / SIDES) + ww * math.sin(2 * math.pi * j / SIDES)) * stalk_r(sv) for j in range(SIDES)]
        q = min(1.0, (sv - s_top) / 0.12); q = q * q * (3 - 2 * q)
        base_c = skin_lin + (ROOT_STALK - skin_lin) * (0.35 + 0.65 * q)
        c = base_c + (TIP_STALK - ROOT_STALK) * max(0.0, (sv - s_top - 0.12) / max(1e-6, 1 - s_top - 0.12))
        rings.append(ring); ring_cols.append([c] * SIDES)
    bm = bmesh.new(); colours = {}
    bv_rings = []
    for ring, cols in zip(rings, ring_cols):
        vs = []
        for p, c in zip(ring, cols):
            v = bm.verts.new(p); colours[v] = np.array(c); vs.append(v)
        bv_rings.append(vs)
    for i in range(len(bv_rings) - 1):
        for j in range(SIDES):
            bm.faces.new((bv_rings[i][j], bv_rings[i][(j + 1) % SIDES], bv_rings[i + 1][(j + 1) % SIDES], bv_rings[i + 1][j]))
    tipv = bm.verts.new(t + (t - stalk_at(0.97)).normalized() * stalk_r(1.0)); colours[tipv] = TIP_STALK
    for j in range(SIDES):
        bm.faces.new((bv_rings[-1][j], bv_rings[-1][(j + 1) % SIDES], tipv))
    bm.normal_update()
    if sum(f.normal.dot(f.calc_center_median() - c_top) for f in bm.faces) < 0:   # faces must point outward
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    # shading at the fillet edge = her skin's own, easing to the fillet's own shape further up
    fillet_n = {}
    for k in range(K):
        for j, v in enumerate(bv_rings[k]):
            fillet_n[v.index] = (ring_nrm[k][j], ring_w[k])
    nfil = 0
    for sgn in (-1, 1):
        count = 150  # 85 looked wispy and sparse next to the reference
        for k in range(count):
            s0 = f_out + 0.1
            s = s0 + (1 - s0) * (k + rng.random() * 0.8) / count
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
    gm.update()
    vn = []
    for v in gm.vertices:
        if v.index in fillet_n:
            n_s, w = fillet_n[v.index]; vn.append(n_s.lerp(v.normal, w * w).normalized())
        else:
            vn.append(v.normal.copy())
    gm.normals_split_custom_set_from_vertices(vn)
    go = bpy.data.objects.new(f"gill_{name}", gm)
    bpy.context.scene.collection.objects.link(go)
    print(name, "filaments", nfil, "tris", sum(len(p.vertices) - 2 for p in gm.polygons), flush=True)

import json
json.dump(ROOTS, open(f"{RIG}/gill_roots.json", "w"), indent=1)
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
