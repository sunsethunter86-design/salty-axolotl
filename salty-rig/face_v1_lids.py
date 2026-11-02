"""Salty rig, step 2d: her face (Shaun 29 Oct: smiling, laughing, speaking; "our gemini vids show how the
mouth should look when doing things").

From the Gemini clips (salty-video/raw): big grin/laugh = a wide D-shaped opening, the lower lip drops
while the corners pull up and out, dark inside with a pink tongue at the front and a pale band along the
top; talking = small-to-medium, often rounded openings; gasp = small round O; thinking = closed pout;
sassy = one-sided smirk with narrowed eyes; sympathy/idle = soft closed smile; beaming = eyes closed.

Built on the finished skin (salty_skin.blend):
- eyelids: a thin lid of skin per eye, a piece of a sphere just outside the eyeball, turning about the
  eyeball's own centre (a bone, rig.py), so it slides over the eye instead of cutting through it. Open
  (rest) it is tucked under the brow skin; its size and open angle come from rays cast from the eyeball
  centre, so no part of it shows when open;
- lashes: the lash strands are freed from the skin (vertex groups LASH+X / LASH-X) and ride on their own
  bone with the lid's edge;
- mouth: a slit along her lip line (corners stay joined). Lip walls and an inner mouth (dark sack, tongue)
  are grown from the lips themselves, so they can never poke out; closed, the lips meet exactly and
  nothing shows (☠️ the first try, a separate dark blob, showed as a red slit even when closed);
- face shapes (shape keys the page/app mixes): jaw_open, smileL, smileR (her left = +X), wide, round,
  frown.
Writes salty_face.blend and face.json (eye pivots, lid angles) for rig.py and the page.
"""
import bpy, bmesh, json, math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

RIG = "D:/MuseTest/salty-rig"
LID_OFF = 0.15            # lid sits this far outside the eyeball
LINE = [(-32.3, 8.7), (-30, 8.9), (-23.3, 10.7), (-16.7, 12.3), (-10, 14), (-3.3, 15.7), (2.7, 18)]  # lip line (x, z), front view
CORNER_NX, CORNER_PX = -32.3, 2.7      # mouth corners: -X side is her right, +X side her left
FRONT_Y = -72
JAW_DEG = 22                            # full jaw drop: big grin in the clips opens ~1/4 of mouth width

bpy.ops.wm.open_mainfile(filepath=f"{RIG}/salty_skin.blend")
body = bpy.data.objects["body"]; me = body.data; mw = body.matrix_world; mwi = mw.inverted()
EYES = json.load(open(f"{RIG}/eyes.json"))

def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
def make_mat(name, rgb, rough=0.6):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*rgb, 1); return m

img = [n.image for n in me.materials[0].node_tree.nodes if n.type == "TEX_IMAGE" and any(l.to_socket.name == "Base Color" for l in n.outputs["Color"].links)][0]
IW, IH = img.size; PIX = np.empty(IW * IH * 4, np.float32); img.pixels.foreach_get(PIX); PIX = PIX.reshape(IH, IW, 4)[..., :3]
def texel_of_loop(l, uvl):
    u, v = l[uvl].uv; return PIX[min(IH - 1, max(0, int(v * IH))), min(IW - 1, max(0, int(u * IW)))]
face_info = {}

# =============================== 1. eyelids and lashes ===============================
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
uvl = bm.loops.layers.uv.active
lash_faces = {}
for key, E in EYES.items():
    c, r = Vector(E["centre"]), E["radius"]; f, u, s = Vector(E["f"]), Vector(E["u"]), Vector(E["s"])
    def d_of(th, y):  # th: angle about the eye's side axis (0 = straight ahead, + = up); y: sideways
        th, y = math.radians(th), math.radians(y)
        return (math.cos(y) * (f * math.cos(th) + u * math.sin(th)) + s * math.sin(y)).normalized()
    ball = {p.index for p in bm.faces if all(abs(((mw @ v.co) - c).length - r) < 0.35 for v in p.verts)}
    skin_polys = [[v.index for v in p.verts] for p in bm.faces if p.index not in ball and any(((mw @ v.co) - c).length < r + 16 for v in p.verts)]
    bvh = BVHTree.FromPolygons([mw @ v.co for v in bm.verts], skin_polys)
    def skin_gap(th, y):
        hit = bvh.ray_cast(c, d_of(th, y), r + 15)[0]
        return None if hit is None else (hit - c).length - r
    bare = set(); stack = [(0, 0)]
    while stack:   # the opening: bare-eyeball directions connected to straight ahead
        th, y = stack.pop()
        if (th, y) in bare or abs(th) > 70 or abs(y) > 70: continue
        if skin_gap(th, y) is not None: continue
        bare.add((th, y)); stack += [(th + 2, y), (th - 2, y), (th, y + 2), (th, y - 2)]
    th_top = max(t for t, _ in bare); th_bot = min(t for t, _ in bare)
    y_min = min(y for _, y in bare); y_max = max(y for _, y in bare)
    lid_y0, lid_y1 = y_min - 8, y_max + 8
    edge_closed = th_bot - 6                     # closed: the lid edge tucks under the lower lid skin
    lid_top = th_top + 14                        # ...and its top stays well under the brow skin
    def hidden(alpha):                           # every part of the open lid under skin?
        for th in range(int(edge_closed), int(lid_top) + 1, 2):
            for y in range(int(lid_y0), int(lid_y1) + 1, 2):
                g = skin_gap(th + alpha, y)
                if g is None:
                    if th + alpha < 85 and abs(y) < 60: return False   # bare eyeball: would show
                    continue                                          # deep inside the head
                if g < LID_OFF + 0.3: return False
        return True
    alpha = th_top + 2 - edge_closed
    while not hidden(alpha) and alpha < 150: alpha += 2
    print(f"{key} eye: opening {th_bot}..{th_top} deg up/down, {y_min}..{y_max} sideways; lid swings {alpha} deg", flush=True)
    NT, NY = 26, 20
    lb = bmesh.new(); rows = []
    for i in range(NT + 1):
        th = edge_closed + (lid_top - edge_closed) * i / NT + alpha
        rows.append([lb.verts.new(c + d_of(th, lid_y0 + (lid_y1 - lid_y0) * j / NY) * (r + LID_OFF)) for j in range(NY + 1)])
    for i in range(NT):
        for j in range(NY):
            lb.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
    lb.normal_update()
    if sum(fc.normal.dot(fc.calc_center_median() - c) for fc in lb.faces) < 0:
        bmesh.ops.reverse_faces(lb, faces=list(lb.faces))
    lm = bpy.data.meshes.new(f"lid{key}"); lb.to_mesh(lm); lb.free()
    for p in lm.polygons: p.use_smooth = True
    # ☠️ sampling just above the eye caught the shadowy crease: the closed lids came out grey (29 Oct).
    # Use a ring of real skin all round the eye (1.5-4 units out, bright texels only: no lashes, no crease)
    cols = [t for v in bm.verts if 1.5 < ((mw @ v.co) - c).length - r < 4.0
            for l in v.link_loops if l.face.material_index == 0
            for t in [texel_of_loop(l, uvl)] if float(t @ [0.299, 0.587, 0.114]) > 0.5]
    skin_c = np.median(cols, 0) if cols else np.array([0.82, 0.66, 0.66])
    lm.materials.append(make_mat(f"lid{key}", tuple(float(x) for x in skin_c ** 2.2), 0.55))
    lo = bpy.data.objects.new(f"lid{key}", lm); bpy.context.scene.collection.objects.link(lo)
    # lashes. ☠️ Taking only the darkest points caught bits of each strand; most stayed put when the lid
    # closed (29 Oct). Lash faces stand 0.8+ out from the eyeball, above the opening, and are dark or
    # side-facing (skin there is light and faces outward); whole connected strands that stick out
    # 2+ units are taken. The dark crease right at the rim (<0.8 out) is skin and stays.
    def face_out(fc): return min(((mw @ v.co) - c).length for v in fc.verts) - r
    def lash_like(fc):
        cen = (mw @ fc.calc_center_median()) - c; dn = cen.normalized()
        th = math.degrees(math.atan2(dn.dot(u), dn.dot(f))); yy = math.degrees(math.asin(max(-1, min(1, dn.dot(s)))))
        if th < th_top - 12 or not (lid_y0 - 8 < yy < lid_y1 + 8) or face_out(fc) < 0.8 or cen.length > r + 9: return False
        if fc.material_index != 0: return False
        lum = float(np.mean([texel_of_loop(l, uvl) for l in fc.loops], 0) @ [0.299, 0.587, 0.114])
        side_facing = abs((mw.to_3x3() @ fc.normal).normalized().dot(dn)) < 0.55
        return lum < 0.35 or (side_facing and lum < 0.6)
    cand = {fc for fc in bm.faces if lash_like(fc)}
    lf, seen = [], set()
    for f0 in cand:
        if f0 in seen: continue
        comp, stack = [], [f0]; seen.add(f0)
        while stack:
            fc = stack.pop(); comp.append(fc)
            for e in fc.edges:
                for o in e.link_faces:
                    if o in cand and o not in seen: seen.add(o); stack.append(o)
        if len(comp) >= 4 and max(face_out(fc) for fc in comp) > 2.0: lf += comp
    lash_faces[key] = lf
    # ☠️ derived -s closed the wrong way (the lids swung up under the brow); checked in the page: +s closes
    face_info[key] = dict(centre=list(c), close_axis=list(s), lid_alpha=alpha, lash_alpha=th_top - edge_closed, radius=r)
    print(f"   lash strands: {len(lash_faces[key])} faces", flush=True)
for key, lf in lash_faces.items():   # free the lashes from the skin
    ls = set(lf)
    bmesh.ops.split_edges(bm, edges=list({e for fc in lf for e in fc.edges if any(o not in ls for o in e.link_faces)}))
bm.verts.index_update()
lash_idx = {key: sorted({v.index for fc in lf for v in fc.verts}) for key, lf in lash_faces.items()}
bm.to_mesh(me); bm.free()
for key, idx in lash_idx.items():
    g = body.vertex_groups.new(name=f"LASH{key}"); g.add(idx, 1.0, "REPLACE")   # not a bone name: rig.py reads it

# =============================== 2. mouth ===============================
xs = np.array([p[0] for p in LINE]); zs = np.array([p[1] for p in LINE])
line_z = lambda x: float(np.interp(x, xs, zs))
slope = (zs[-2] - zs[0]) / (xs[-2] - xs[0])
p0 = Vector((-16.7, 0, 12.3)); n = Vector((-slope, 0, 1)).normalized()
F_FACE = (Vector(EYES["+X"]["f"]) + Vector(EYES["-X"]["f"])).normalized()
U_FACE = (Vector(EYES["+X"]["u"]) + Vector(EYES["-X"]["u"])).normalized()
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
uvl = bm.loops.layers.uv.active
region = [fc for fc in bm.faces
          if fc.material_index == 0 and all((mw @ v.co).y < FRONT_Y and CORNER_NX - 1 < (mw @ v.co).x < CORNER_PX + 1
                 and abs((mw @ v.co).z - line_z((mw @ v.co).x)) < 4 for v in fc.verts)]
geom = list({v for fc in region for v in fc.verts}) + list({e for fc in region for e in fc.edges}) + region
res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=mwi @ p0, plane_no=(mwi.to_3x3() @ n).normalized(), dist=1e-4)
def on_slit(e):
    # ☠️ without the lip-line test this also caught the freed lash strands (same left-right band) and grew
    # lip walls off them (29 Oct)
    m = (mw @ e.verts[0].co + mw @ e.verts[1].co) / 2
    return CORNER_NX + 1.2 < m.x < CORNER_PX - 1.2 and m.y < FRONT_Y and abs(m.z - line_z(m.x)) < 2.5
slit = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge) and on_slit(e)]
bmesh.ops.split_edges(bm, edges=slit)
rim_edges = [e for e in bm.edges if e.is_boundary and on_slit(e)]
rim_verts = {v for e in rim_edges for v in e.verts}
def is_lower(v):
    cs = [((mw @ fc.calc_center_median()) - p0).dot(n) for fc in v.link_faces]
    return bool(cs) and sum(cs) / len(cs) < 0
side = {v: is_lower(v) for v in rim_verts}
print("mouth slit:", len(slit), "edges;", sum(side.values()), "lower-lip points,", len(side) - sum(side.values()), "upper", flush=True)
UPPER_M = len(me.materials); me.materials.append(make_mat("mouth_upper", (0.86, 0.74, 0.74), 0.45))   # the pale band along the top
LOWER_M = len(me.materials); me.materials.append(make_mat("mouth_lower", (0.50, 0.16, 0.20), 0.5))
SACK_M = len(me.materials); me.materials.append(make_mat("mouth_inside", (0.14, 0.03, 0.05), 0.7))
TONGUE_M = len(me.materials); me.materials.append(make_mat("tongue", (0.80, 0.34, 0.42), 0.45))
ext = bmesh.ops.extrude_edge_only(bm, edges=rim_edges)
wall_v = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)]
for v in wall_v:
    src = [e.other_vert(v) for e in v.link_edges if e.other_vert(v) in rim_verts]
    side[v] = side[src[0]] if src else False
    v.co = mwi @ ((mw @ v.co) - F_FACE * 2.2)
wall_set = set(wall_v)
for g in ext["geom"]:
    if isinstance(g, bmesh.types.BMFace):
        g.material_index = LOWER_M if all(side.get(v, False) for v in g.verts) else UPPER_M
        for l in g.loops: l[uvl].uv = (0.0, 0.0)
wall_edges = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMEdge) and all(v in wall_set for v in g.verts)]
ext2 = bmesh.ops.extrude_edge_only(bm, edges=wall_edges)
sack_v = [g for g in ext2["geom"] if isinstance(g, bmesh.types.BMVert)]
cen = sum((mw @ v.co for v in wall_v), Vector()) / len(wall_v)
for v in sack_v:
    src = [e.other_vert(v) for e in v.link_edges if e.other_vert(v) in wall_set]
    side[v] = side[src[0]] if src else False
    p = mw @ v.co
    v.co = mwi @ (cen + (p - cen) * 0.75 - F_FACE * 5.0 + (U_FACE * -1.5 if side[v] else U_FACE * 1.0))
sack_set = set(sack_v)
for g in ext2["geom"]:
    if isinstance(g, bmesh.types.BMFace):
        g.material_index = SACK_M
        for l in g.loops: l[uvl].uv = (0.0, 0.0)
open_e = [e for e in bm.edges if e.is_boundary and all(v in sack_set for v in e.verts)]
bmesh.ops.holes_fill(bm, edges=open_e, sides=0)
cap = [fc for fc in bm.faces if all(v in sack_set for v in fc.verts) and fc.material_index not in (UPPER_M, LOWER_M, SACK_M, TONGUE_M)]
for fc in cap:
    fc.material_index = SACK_M
    for l in fc.loops: l[uvl].uv = (0.0, 0.0)
bmesh.ops.triangulate(bm, faces=cap)
# tongue on the floor of the mouth, toward the front (hidden when closed)
low = [mw @ v.co for v in sack_v if side[v]]
lpx = Vector((CORNER_PX, 0, line_z(CORNER_PX))); lnx = Vector((CORNER_NX, 0, line_z(CORNER_NX)))
ldir = (lpx - lnx).normalized(); lip_len = (lpx - lnx).length
t_c = sum(low, Vector()) / len(low) + U_FACE * 0.6 + F_FACE * 2.0
tg = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
for v in tg["verts"]:
    q = v.co.copy()
    v.co = mwi @ (t_c + ldir * q.x * lip_len * 0.2 + F_FACE * q.y * 3.0 + U_FACE * q.z * 1.1); side[v] = True
for fc in {fc for v in tg["verts"] for fc in v.link_faces}:
    fc.material_index = TONGUE_M; fc.smooth = True
    for l in fc.loops: l[uvl].uv = (0.0, 0.0)
bm.verts.index_update()
mouth_side = {v.index: s_ for v, s_ in side.items() if v.is_valid}
bm.to_mesh(me); bm.free()

# =============================== 3. face shapes ===============================
if not me.shape_keys: body.shape_key_add(name="Basis", from_mix=False)
P = np.array([mw @ v.co for v in me.vertices])
NRM = np.array([mw.to_3x3() @ v.normal for v in me.vertices])
bvh_all = BVHTree.FromPolygons([Vector(p) for p in P], [list(pl.vertices) for pl in me.polygons])
def front_hit(x):
    return np.array(bvh_all.ray_cast(Vector((x, -400, line_z(x))), Vector((0, 1, 0)), 1000)[0])
C_NX, C_PX = front_hit(CORNER_NX + 0.3), front_hit(CORNER_PX - 0.3)
MC = (C_NX + C_PX) / 2
f_, u_ = np.array(F_FACE), np.array(U_FACE); l_ = (C_PX - C_NX) / np.linalg.norm(C_PX - C_NX)
n_, p0_ = np.array(n), np.array(p0)
eyes_c = [np.array(EYES[k]["centre"]) for k in EYES]; eye_r = [EYES[k]["radius"] for k in EYES]
lash_all = set(lash_idx["+X"]) | set(lash_idx["-X"])
mov = np.array([0.0 if i in lash_all else min(smooth(rr + 1.0, rr + 4.0, np.linalg.norm(p - ec)) for ec, rr in zip(eyes_c, eye_r))
                for i, p in enumerate(P)])
def gauss(c, sig): return np.exp(-np.sum((P - c) ** 2, axis=1) / (2 * sig * sig))
def add_key(name, disp):
    disp = disp * mov[:, None]
    k = body.shape_key_add(name=name, from_mix=False)
    moved = np.linalg.norm(disp, axis=1) > 1e-4
    for i in np.nonzero(moved)[0]:
        k.data[i].co = mwi @ Vector(P[i] + disp[i])
    print(f"face shape {name}: {int((np.linalg.norm(disp, axis=1) > 0.02).sum())} points move, up to {np.linalg.norm(disp, axis=1).max():.2f}", flush=True)

# jaw_open: lower lip, chin and the lower half of the inside swing down about a hinge behind the mouth;
# the corners stay put, so the opening is the D shape of the clips
hinge = MC - f_ * 26 + u_ * 1.0
Rm = np.array(Matrix.Rotation(math.radians(JAW_DEG), 3, Vector(l_)))
# ☠️ A whole-jaw drop opened a straight slot; the clips' grin is a D: the lower lip drops most in the
# middle and curves up into the corners. Across the mouth the drop follows a smooth arch; further down
# the chin it evens out, so the chin stays solid while the lip edge curves.
WID = float((C_PX - C_NX) @ l_)
def arch(p):
    t = min(1.0, max(0.0, float((p - C_NX) @ l_) / WID))
    return math.sin(math.pi * t) ** 0.8
def narrow(p):
    # ☠️ a narrow bell made a V with a pointed bottom (29 Oct); the O wants a rounded U: a cosine bump
    # over the middle 56% of the mouth, flattened at the bottom
    d = abs(float((p - C_NX) @ l_) / WID - 0.5) / 0.28
    return math.cos(d * math.pi / 2) ** 0.6 if d < 1 else 0.0
def jaw_shape(lat, deg, lift=0.0):
    Rj = np.array(Matrix.Rotation(math.radians(deg), 3, Vector(l_)))
    disp = np.zeros_like(P)
    for i, p in enumerate(P):
        lower = mouth_side.get(i)
        if lower is None:
            below_by = -float((p - p0_) @ n_)
            if below_by <= 0 or p[1] > -60: continue
            # ☠️ evening out too fast under the corners (which hardly move) stretched the skin there into
            # dark streaks (29 Oct): ease out over ~10 units, and fade sideways over the cheek
            a = lat(p) ** (1.0 / (1.0 + below_by / 10.0))
            side_fade = smooth(C_NX @ l_ - 12, C_NX @ l_ + 4, p @ l_) * smooth(C_PX @ l_ + 12, C_PX @ l_ - 4, p @ l_)
            w = a * side_fade * smooth(-16, -3, p[2]) * smooth(hinge[1], hinge[1] - 14, p[1])
        elif lower:
            w = lat(p)
        else:
            if lift > 0:   # the upper lip lifts a little over the opening (rounds the O)
                disp[i] = u_ * lift * lat(p)
            continue
        if w > 0:
            q = hinge + Rj @ (p - hinge); disp[i] = (q - p) * w
    if lift > 0:           # skin just above the lip follows the lift, fading upward
        for i, p in enumerate(P):
            if i in mouth_side or p[1] > -60: continue
            above = float((p - p0_) @ n_)
            if above > 0: disp[i] = u_ * lift * narrow(p) * math.exp(-above / 3.0)
    return disp
add_key("jaw_open", jaw_shape(arch, JAW_DEG))
add_key("jaw_round", jaw_shape(narrow, JAW_DEG + 4, lift=1.8))   # opens mostly in the middle: with "round", the little O
# smiles, one per side (both = full smile; one = smirk): corner up, back and out; cheek rounds out
for name, cpt, sgn in (("smileR", C_NX, -1), ("smileL", C_PX, 1)):
    disp = gauss(cpt, 5.5)[:, None] * (u_ * 3.2 - f_ * 1.2 + l_ * sgn * 0.9)   # 2.2 up barely read as a smile
    disp += gauss(cpt + u_ * 4.5 + l_ * sgn * 3.0 - f_ * 1.0, 5.5)[:, None] * NRM * 0.9
    add_key(name, disp)
# wide: corners out, a touch up
disp = np.zeros_like(P)
for cpt, sgn in ((C_NX, -1), (C_PX, 1)):
    disp += gauss(cpt, 5.0)[:, None] * (l_ * sgn * 1.8 + u_ * 0.4 - f_ * 0.3)
add_key("wide", disp)
# round: corners in, lips pushed forward (pout; with jaw_open, the little O)
disp = np.zeros_like(P)
for cpt, sgn in ((C_NX, -1), (C_PX, 1)):
    disp += gauss(cpt, 5.5)[:, None] * (-l_ * sgn * 3.6)
depth = (P - MC) @ f_                    # 0 at the lips, negative going back into the head
lips = np.exp(-(((P - MC) @ l_) / 12.0) ** 2) * np.exp(-(((P - MC) @ u_) / 4.0) ** 2) * np.exp(np.minimum(depth, 0) / 4.0)
disp += lips[:, None] * f_ * 1.3
add_key("round", disp)
# frown: corners down and a little in
disp = np.zeros_like(P)
for cpt, sgn in ((C_NX, -1), (C_PX, 1)):
    disp += gauss(cpt, 5.0)[:, None] * (-u_ * 1.6 - l_ * sgn * 0.5)
add_key("frown", disp)

face_info["mouth"] = dict(hinge=list(hinge), corners=[list(C_NX), list(C_PX)])
json.dump(face_info, open(f"{RIG}/face.json", "w"), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=f"{RIG}/salty_face.blend")
print("FACE_OK", flush=True)
