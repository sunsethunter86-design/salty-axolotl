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
# ---- the two sides must match (Shaun 29 Oct: "make sure the gills on the other side match"). Her head is
# slightly turned and tilted in Meshy's pose, and the gill positions were read off by eye per side.
# Centre line of her face = the plane halfway between her eyes; each gill pair is averaged across it.
from mathutils.bvhtree import BVHTree
bm.verts.ensure_lookup_table(); bm.verts.index_update()
_bvh0 = BVHTree.FromPolygons([mw @ v.co for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces])
def _front(x, z):
    hit = _bvh0.ray_cast(Vector((x, -400, z)), Vector((0, 1, 0)), 1000)[0]
    return hit
EYE_PX, EYE_NX = _front(1.3, 29.0), _front(-35.7, 21.7)    # eye centres read off look/g_mouth.png
SYM_N = (EYE_PX - EYE_NX).normalized(); SYM_M = (EYE_PX + EYE_NX) / 2
def mir(p): return p - SYM_N * (2 * (p - SYM_M).dot(SYM_N))
def mir_dir(d): return d - SYM_N * (2 * d.dot(SYM_N))
SYM = {}
for i in (1, 2, 3):
    Rb, Rt = map(Vector, GILLS[f"R{i}"]); Lb, Lt = map(Vector, GILLS[f"L{i}"])
    b_, t_ = (Rb + mir(Lb)) / 2, (Rt + mir(Lt)) / 2
    SYM[f"R{i}"] = (b_, t_); SYM[f"L{i}"] = (mir(b_), mir(t_))
    print(f"pair {i}: right base moved {(b_ - Rb).length:.1f}, left base moved {(mir(b_) - Lb).length:.1f}", flush=True)
print("face centre line: eyes", tuple(round(c, 1) for c in EYE_PX), tuple(round(c, 1) for c in EYE_NX), flush=True)
# ☠️ Widening the cut for the matched roots crept up to the brow above the -X eye: the brow shape was
# replaced by smooth rebuilt skin (a crease; the top of the eye looked detached) and that skin moved with
# the gill mounds (Shaun 29 Oct). Nothing here may touch the skin within EYE_GUARD of either eye.
EYE_GUARD = 15.0
def near_eye(p): return (p - EYE_PX).length < EYE_GUARD or (p - EYE_NX).length < EYE_GUARD
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
# room for the matched roots too: each mound (radius ~10) must sit on rebuilt skin so both sides get
# the same pink gradient
for name, (b, t) in SYM.items():
    for v in bm.verts:
        if ((mw @ v.co) - b).length < 13: kill.add(v)
spared = {v for v in kill if near_eye(mw @ v.co)}
kill -= spared
print("eye guard kept", len(spared), "points around the eyes", flush=True)
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
FRAMES = []
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
    FRAMES.append(dict(origin=origin, ua=ua, va=va, nrm=nrm))

# ---- where each gill meets the rebuilt skin, then a mound OF HER SKIN around each root
# ☠️ A tube pushed into the head read as a pipe ("severed"), and a separate flared collar still showed as a
# pale band: a different object without her skin texture (Shaun 29 Oct). The base is now her own skin,
# raised in a quarter-circle mound (flat where it meets the head, upright at the stalk) and painted
# gradually pinker toward the middle; the stalk rises out of its top in the same pink.
from mathutils.bvhtree import BVHTree
bm.verts.ensure_lookup_table(); bm.verts.index_update()
PATCH_BVH = BVHTree.FromPolygons([mw @ v.co for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces])
R0, MOUND_F = 5.2, 4.5
ROOTS = {}
for i in (1, 2, 3):
    b, t = SYM[f"R{i}"]; axis = (t - b).normalized()
    hit = PATCH_BVH.ray_cast(t, -axis, 200.0)[0]
    surf = hit if hit is not None else b
    ROOTS[f"R{i}"] = dict(surface=list(surf), tip=list(t), axis=list(axis))
    axL = mir_dir(axis); tL = mir(t)
    hitL = PATCH_BVH.ray_cast(tL, -axL, 200.0)[0]
    surfL = hitL if hitL is not None else mir(surf)
    shift = surfL - mir(surf)                   # her head is not perfectly symmetric: seat it on her skin
    ROOTS[f"L{i}"] = dict(surface=list(surfL), tip=list(tL + shift), axis=list(axL), shift=list(shift))
    print(f"pair {i}: left root seated {shift.length:.2f} units from the exact mirror", flush=True)
def root_frame(p):
    """(rho, a, name) for the gill whose mound this point is most inside."""
    best = None
    for name, r in ROOTS.items():
        d = p - Vector(r["surface"]); ax = Vector(r["axis"]); a = d.dot(ax); rho = (d - ax * a).length
        if best is None or rho < best[0]: best = (rho, a, name)
    return best
def mound_h(rho):
    rc = max(rho, R0 + 0.25)
    if rc >= R0 + MOUND_F: return 0.0
    return MOUND_F - math.sqrt(max(0.0, MOUND_F ** 2 - (R0 + MOUND_F - rc) ** 2))
# finer triangles on the rebuilt skin where the mounds go (it was solved at ~2 units; mounds need ~0.7)
near = []
for f in patch_faces():
    rho, a, _ = root_frame(mw @ f.calc_center_median())
    if rho < R0 + MOUND_F + 3 and -9 < a < 9: near.append(f)
nf = set(patch_faces())
edges = list({e for f in near for e in f.edges if all(lf in nf for lf in e.link_faces)})
bmesh.ops.subdivide_edges(bm, edges=edges, cuts=2, smooth=1.0, use_grid_fill=True)
bmesh.ops.triangulate(bm, faces=patch_faces(), quad_method="BEAUTY", ngon_method="BEAUTY")
raised = 0
for v in bm.verts:
    p = mw @ v.co
    best_h, best_ax = 0.0, None
    for name, r in ROOTS.items():
        d = p - Vector(r["surface"]); ax = Vector(r["axis"]); a = d.dot(ax); rho = (d - ax * a).length
        if -6 < a < 6:
            h = mound_h(rho)
            if h > best_h: best_h, best_ax = h, ax
    if best_ax is not None and not near_eye(p):
        v.co = mw.inverted() @ (p + best_ax * best_h); raised += 1
for r in ROOTS.values(): r["fillet"] = mound_h(R0 + 0.25); r["r0"] = R0; r["flare"] = MOUND_F
print("gill mounds raised", raised, "skin points; mound top", round(mound_h(R0 + 0.25), 2), flush=True)
bm.normal_update()

# ---- paint the rebuilt skin (now including the mounds)
ROOT_PINK = np.array([0.90, 0.42, 0.52]) ** (1 / 2.2)   # the stalk root pink, in texture (sRGB) terms
groups = groups_of(patch_faces())
for gi, g in enumerate(groups):
    gverts = {v for f in g for v in f.verts}
    rim = {v for v in gverts if any(lf in before for lf in v.link_faces)}
    inner_l = list(gverts - rim)
    cen = np.mean([np.array(mw @ v.co) for v in rim], 0)
    fr = min(FRAMES, key=lambda F: np.linalg.norm(F["origin"] - cen))
    origin, ua, va, nrm = fr["origin"], fr["ua"], fr["va"], fr["nrm"]
    def local(P): d = P - origin; return d @ ua, d @ va, d @ nrm
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
    for v in inner_l:   # pinker toward each gill root, like the reference
        rho, a, _ = root_frame(mw @ v.co)
        if a < -4 or a > 9: continue
        k = min(1.0, max(0.0, (R0 + MOUND_F * 0.95 - rho) / (MOUND_F * 0.95 - 0.6))); k = k * k * (3 - 2 * k)
        col[v] = col[v] * (1 - k) + ROOT_PINK * k
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
for name in ("R1", "R2", "R3"):
    b, t = SYM[name]
    axis = (t - b).normalized(); L = (t - b).length
    out = (b - HEAD_C).normalized()
    surf_pt = Vector(ROOTS[name]["surface"])
    print(name, "meets the skin", round((surf_pt - b).length, 1), "from the old base", flush=True)
    side = axis.cross(Vector((0, 1, 0))).normalized()  # fan plane faces forward, as in the reference
    lift = side.cross(axis).normalized()
    bend = (out - axis * out.dot(axis)).normalized() if (out - axis * out.dot(axis)).length > 1e-3 else lift
    start = surf_pt + axis * (ROOTS[name]["fillet"] - 1.0)   # sunk 1 unit into the top of its mound
    SL = (t - start).length
    def stalk_at(s):  # s in 0..1 from the mound top to the tip, gentle outward curve
        return start + (t - start) * s + bend * (math.sin(math.pi * s) * L * 0.06)
    def stalk_r(s):   # Gemini Salty: a thick smooth stalk; a touch wider than the mound top so it covers it
        return (R0 + 0.35) * (1 - 0.72 * s) ** 1.1
    f_out = 0.0
    SIDES = 20
    rings, ring_cols = [], []
    for i in range(15):
        sv = i / 14
        p = stalk_at(sv); dvec = (stalk_at(min(1, sv + 0.01)) - stalk_at(max(0, sv - 0.01))).normalized()
        uu = (side - dvec * side.dot(dvec)).normalized(); ww = dvec.cross(uu)
        rings.append([p + (uu * math.cos(2 * math.pi * j / SIDES) + ww * math.sin(2 * math.pi * j / SIDES)) * stalk_r(sv) for j in range(SIDES)])
        ring_cols.append([ROOT_STALK + (TIP_STALK - ROOT_STALK) * sv] * SIDES)
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
    if sum(f.normal.dot(f.calc_center_median() - stalk_at(0.0)) for f in bm.faces) < 0:   # faces must point outward
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    fillet_n = {}
    nfil = 0
    for sgn in (-1, 1):
        count = 150  # 85 looked wispy and sparse next to the reference
        for k in range(count):
            s0 = 0.1
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
    go = bpy.data.objects.new(f"gill_{name}", gm)
    bpy.context.scene.collection.objects.link(go)
    print(name, "filaments", nfil, "tris", sum(len(p.vertices) - 2 for p in gm.polygons), flush=True)
    # its partner on the other side: the exact mirror, seated on her skin
    nameL = "L" + name[1]
    from mathutils import Matrix
    n_ = SYM_N
    Mref = Matrix(((1 - 2 * n_.x * n_.x, -2 * n_.x * n_.y, -2 * n_.x * n_.z),
                   (-2 * n_.y * n_.x, 1 - 2 * n_.y * n_.y, -2 * n_.y * n_.z),
                   (-2 * n_.z * n_.x, -2 * n_.z * n_.y, 1 - 2 * n_.z * n_.z))).to_4x4()
    Mref.translation = SYM_N * (2 * SYM_M.dot(SYM_N))
    gmL = gm.copy(); gmL.name = f"gill_{nameL}"
    gmL.transform(Matrix.Translation(Vector(ROOTS[nameL]["shift"])) @ Mref)
    gmL.flip_normals()                          # a mirror turns faces inside out
    goL = bpy.data.objects.new(f"gill_{nameL}", gmL)
    bpy.context.scene.collection.objects.link(goL)
    print(nameL, "= mirror of", name, flush=True)

import json
json.dump({**ROOTS, "_eyes": [list(EYE_PX), list(EYE_NX)], "_eye_guard": EYE_GUARD}, open(f"{RIG}/gill_roots.json", "w"), indent=1)
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
