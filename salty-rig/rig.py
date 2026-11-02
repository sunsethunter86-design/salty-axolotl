"""Salty rig, step 3: skeleton + skin weights, checked with a test pose.

Bone positions read off look/g_front|side|top.png (Blender units, +Z up, she faces -Y, her left is -X).
Body skin: Blender's automatic (heat) weights over the body bones only. Gills: joined into one mesh,
each gill 100% on its own bone (they are separate pieces, so no blending is needed).
Writes salty_rig.blend and look/pose_*.png.
"""
import bpy, bmesh, math, sys
from mathutils import Vector

RIG = "D:/MuseTest/salty-rig"
bpy.ops.wm.open_mainfile(filepath=f"{RIG}/salty_face.blend")  # gills + skin (skin.py) + face (face.py)
body = bpy.data.objects["body"]
# ☠️ The lash markers (vertex groups from face.py) must be read first and removed before any weighting:
# the fill-in step copied them across her head like bones (20,000+ "lash" points, 29 Oct)
LASH_IDX = {}
for vg in list(body.vertex_groups):
    if vg.name.startswith("LASH"):
        LASH_IDX[vg.name[4:]] = [v.index for v in body.data.vertices if any(x.group == vg.index and x.weight > 0.5 for x in v.groups)]
        body.vertex_groups.remove(vg)
print("lash points:", {k: len(v) for k, v in LASH_IDX.items()}, flush=True)

BONES = {  # name: (head, tail, parent)
    "hips":   ((-12, 15, -30), (-12, -5, -26), None),
    "chest":  ((-12, -5, -26), (-14, -25, -14), "hips"),
    "neck":   ((-14, -25, -14), (-16, -42, 6), "chest"),
    "head":   ((-16, -42, 6), (-17, -90, 22), "neck"),
    "tail1":  ((-12, 15, -30), (-18, 35, -33), "hips"),
    "tail2":  ((-18, 35, -33), (-28, 50, -36), "tail1"),
    "tail3":  ((-28, 50, -36), (-40, 65, -40), "tail2"),
    "tail4":  ((-40, 65, -40), (-55, 80, -44), "tail3"),
    "tail5":  ((-55, 80, -44), (-72, 94, -48), "tail4"),
    "arm_L":  ((-33, -28, -22), (-40, -36, -44), "chest"),
    "hand_L": ((-40, -36, -44), (-40, -45, -58), "arm_L"),
    "arm_R":  ((0, -28, -22), (12, -34, -44), "chest"),
    "hand_R": ((12, -34, -44), (22, -40, -58), "arm_R"),
    "thigh_L": ((-36, 18, -34), (-46, 14, -56), "hips"),
    "foot_L":  ((-46, 14, -56), (-45, 8, -72), "thigh_L"),
    "thigh_R": ((4, 22, -34), (16, 22, -56), "hips"),
    "foot_R":  ((16, 22, -56), (14, 18, -72), "thigh_R"),
}
GILLS = {  # same numbers as build_gills.py
    "R1": ((5, -52, 44), (15, -42, 68)), "R2": ((10, -53, 37), (37, -48, 52)), "R3": ((12, -55, 25), (44, -52, 24)),
    "L1": ((-46, -52, 38), (-60, -45, 55)), "L2": ((-49, -55, 27), (-80, -52, 33)), "L3": ((-47, -57, 15), (-74, -55, 7)),
}

arm_data = bpy.data.armatures.new("salty_rig")
arm = bpy.data.objects.new("salty_rig", arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones
for name, (h, t, p) in BONES.items():
    b = eb.new(name); b.head = Vector(h); b.tail = Vector(t)
for name, (h, t, p) in BONES.items():
    if p:
        eb[name].parent = eb[p]
        eb[name].use_connect = (Vector(BONES[p][1]) - Vector(h)).length < 1e-6 and name not in ("tail1",)
# ☠️ Pivoting at the old fan-base points (up to 6 units off the skin) made the gills slide over her skin
# when they moved, and the top-right one look severed (Shaun 29 Oct). Pivot where each meets the skin.
import json
ROOTS = json.load(open(f"{RIG}/gill_roots.json"))
for g in GILLS:
    bone = eb.new(f"gill_{g}"); bone.head = Vector(ROOTS[g]["surface"]); bone.tail = Vector(ROOTS[g]["tip"])
    bone.parent = eb["head"]
# eyelids and lashes: each turns about its eyeball centre; the bone points along the closing axis, so a
# positive turn about the bone's own Y closes (face.py measured the angles; the page drives them)
FACE = json.load(open(f"{RIG}/face.json"))
EYE_KEYS = ("+X", "-X")
for k in EYE_KEYS:
    c = Vector(FACE[k]["centre"]); ax = Vector(FACE[k]["close_axis"]).normalized()
    for part in ("lid", "lash"):
        b = eb.new(f"{part}{k}"); b.head = c; b.tail = c + ax * 4.0; b.parent = eb["head"]
EYE_BONES = [f"{p}{k}" for k in EYE_KEYS for p in ("lid", "lash")]
bpy.ops.object.mode_set(mode="OBJECT")

# body: automatic weights from the body bones only
for g in GILLS: arm_data.bones[f"gill_{g}"].use_deform = False
for b in EYE_BONES: arm_data.bones[b].use_deform = False
# ☠️ Weighting the real body directly: Blender reported "Bone Heat Weighting: failed to find solution"
# once the mouth inside, freed lashes and eyeballs were in it (and it had quietly struggled before). Use
# a proxy: a sealed, smooth shell of her body (voxel remesh) takes the automatic weights cleanly, then
# every real point copies the weights of the nearest spot on that shell, blended across its triangle.
proxy = bpy.data.objects.new("weight_proxy", body.data.copy()); bpy.context.scene.collection.objects.link(proxy)
proxy.matrix_world = body.matrix_world.copy()
if proxy.data.shape_keys:
    proxy.shape_key_clear()
for vg in list(proxy.vertex_groups): proxy.vertex_groups.remove(vg)
proxy.data.remesh_voxel_size = 1.4
bpy.ops.object.select_all(action="DESELECT"); proxy.select_set(True); bpy.context.view_layer.objects.active = proxy
bpy.ops.object.voxel_remesh()
pbm = bmesh.new(); pbm.from_mesh(proxy.data); bmesh.ops.triangulate(pbm, faces=pbm.faces); pbm.to_mesh(proxy.data); pbm.free()
print("weight proxy:", len(proxy.data.vertices), "points", flush=True)
bpy.ops.object.select_all(action="DESELECT")
proxy.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
pgn = {vg.index: vg.name for vg in proxy.vertex_groups}
PW = [{pgn[x.group]: x.weight for x in v.groups} for v in proxy.data.vertices]
print("proxy points with no weights:", sum(1 for w in PW if sum(w.values()) < 0.5), flush=True)
from mathutils.bvhtree import BVHTree as _BVH
from mathutils.geometry import barycentric_transform as _bary
pv = [proxy.matrix_world @ v.co for v in proxy.data.vertices]
ptris = [list(p.vertices) for p in proxy.data.polygons]
pbvh = _BVH.FromPolygons(pv, ptris)
for name in {n for w in PW for n in w}:
    if name not in body.vertex_groups: body.vertex_groups.new(name=name)
for v in body.data.vertices:
    p = body.matrix_world @ v.co
    loc, _, fi, _ = pbvh.find_nearest(p)
    a, b_, c_ = ptris[fi]
    bw = _bary(loc, pv[a], pv[b_], pv[c_], Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
    acc = {}
    for wi, vi in zip((bw.x, bw.y, bw.z), (a, b_, c_)):
        for n_, w_ in PW[vi].items(): acc[n_] = acc.get(n_, 0.0) + max(0.0, wi) * w_
    tot = sum(acc.values())
    for n_, w_ in acc.items():
        if w_ / max(tot, 1e-9) > 0.002: body.vertex_groups[n_].add([v.index], w_ / tot, "REPLACE")
bpy.data.objects.remove(proxy, do_unlink=True)
body.parent = arm
_am = body.modifiers.new("rig", "ARMATURE"); _am.object = arm
for g in GILLS: arm_data.bones[f"gill_{g}"].use_deform = True
for b in EYE_BONES: arm_data.bones[b].use_deform = True
# ☠️ Blender's automatic (heat) weights silently skipped ~9,000 points on the +X side of her head - most
# of her left eye, the skin above it and around the right gills (total attachment < 0.5). Those points
# lagged behind when her head moved: the eye tore and the brow "moved around" (Shaun 29 Oct, screen
# recording). Every point the weighting missed takes its missing share from its nearest fully attached
# neighbours, so nothing on her body is left loose.
from mathutils.kdtree import KDTree as _KD
_bv = body.data.vertices; _gn = {vg.index: vg.name for vg in body.vertex_groups}
_tot = [sum(x.weight for x in v.groups) for v in _bv]
_good = [v.index for v in _bv if _tot[v.index] > 0.99]
_kd = _KD(len(_good))
for i in _good: _kd.insert(body.matrix_world @ _bv[i].co, i)
_kd.balance()
_filled = 0
for v in _bv:
    miss = 1.0 - _tot[v.index]
    if miss < 0.01: continue
    share = {}
    hits = _kd.find_n(body.matrix_world @ v.co, 8)
    for _, j, d in hits:
        wd = 1.0 / max(d, 0.05)
        for x in _bv[j].groups: share[_gn[x.group]] = share.get(_gn[x.group], 0.0) + x.weight * wd
    tot_s = sum(share.values())
    cur = {_gn[x.group]: x.weight for x in v.groups}
    for n, w in share.items():
        body.vertex_groups[n].add([v.index], cur.get(n, 0.0) + miss * w / tot_s, "REPLACE")
    _filled += 1
print("attachment filled in for", _filled, "points the automatic weights missed", flush=True)
# ☠️ Blender's automatic weights tied the left side of her head (where the gills grow) to the NECK bone,
# so that skin stayed behind when her head turned while the gills went with it (29 Oct). Redo the
# head/neck split by position: past the neck crease is head, blending over about 12 units.
joint = Vector(BONES["head"][0]); dir_h = (Vector(BONES["head"][1]) - joint).normalized()
HEAD_C = Vector((-17, -60, 22))
vg_head, vg_neck = body.vertex_groups["head"], body.vertex_groups["neck"]
gi = {vg.index: vg.name for vg in body.vertex_groups}
fixed = 0
for v in body.data.vertices:
    p = body.matrix_world @ v.co
    if (p - HEAD_C).length > 48: continue
    w = {gi[x.group]: x.weight for x in v.groups}
    hn = w.get("head", 0.0) + w.get("neck", 0.0)
    if hn < 0.5 * sum(w.values()): continue          # arms/chest stay as they are
    s_ = (p - joint).dot(dir_h)
    t_ = min(1.0, max(0.0, (s_ + 8.0) / 12.0)); wh = t_ * t_ * (3 - 2 * t_)
    vg_head.add([v.index], hn * wh, "REPLACE"); vg_neck.add([v.index], hn * (1 - wh), "REPLACE")
    fixed += 1
print("head/neck split redone on", fixed, "points", flush=True)
groups = {vg.name for vg in body.vertex_groups}
counts = {vg.name: 0 for vg in body.vertex_groups}
names = {vg.index: vg.name for vg in body.vertex_groups}
for v in body.data.vertices:
    for x in v.groups:
        if x.weight > 0.05: counts[names[x.group]] += 1
empty = [n for n, c in counts.items() if c == 0]
print("verts per bone", counts, flush=True)
print("body groups", sorted(groups), "looks empty:", empty, flush=True)

# gills: the bottom of each stalk moves exactly like the skin it grows from (the skin's own bone weights,
# averaged under the root), handing over smoothly to the gill's bone over the first third of the stalk.
# So a gill bends at its base instead of sliding across her skin as one rigid piece.
from mathutils.kdtree import KDTree
bv = body.data.vertices; bmw = body.matrix_world
kd = KDTree(len(bv))
for v in bv: kd.insert(bmw @ v.co, v.index)
kd.balance()
names = {vg.index: vg.name for vg in body.vertex_groups}
def skin_weights_at(p, radius=3.0):
    acc = {}
    hits = kd.find_range(p, radius) or [kd.find(p)]
    for _, i, _ in hits:
        for x in bv[i].groups:
            n = body.vertex_groups[x.group].name   # (the mound step adds gill groups after "names" was built)
            if n.startswith("gill_"): continue      # the stalk base gets its own gill share separately
            acc[n] = acc.get(n, 0.0) + x.weight
    top = sorted(acc.items(), key=lambda kv: -kv[1])[:3]
    tot = sum(w for _, w in top)
    return {n: w / tot for n, w in top}
def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
# ☠️ With the mound fixed to the head, a swept-back stalk showed a lip where it left the mound top (29 Oct).
# The middle of each skin mound tilts partly with its gill (fading to nothing at the mound edge), and
# the stalk base tilts by the same amount, so the joint bends as one piece of flesh.
MOUND_TILT = 0.6
bw = {}
EYES = [Vector(e) for e in ROOTS["_eyes"]]; GUARD = ROOTS["_eye_guard"] + 1.0
for v in bv:
    p = bmw @ v.co
    if any((p - e).length < GUARD for e in EYES): continue   # eyes and brows never move with the gills
    for g in GILLS:
        r = ROOTS[g]; surf = Vector(r["surface"]); ax = (Vector(r["tip"]) - surf).normalized()
        d = p - surf; a = d.dot(ax); rho = (d - ax * a).length
        if -8 < a < 8 and rho < r["r0"] + r["flare"]:
            w = MOUND_TILT * smooth(r["r0"] + r["flare"], r["r0"] + 0.5, rho)
            if w > bw.get(v.index, (0, None))[0]: bw[v.index] = (w, g)
for vi, (w, g) in bw.items():
    v = bv[vi]
    for x in v.groups: x.weight *= (1 - w)
    vg = body.vertex_groups.get(f"gill_{g}") or body.vertex_groups.new(name=f"gill_{g}")
    vg.add([vi], w, "REPLACE")
print("mound skin tilting with its gill:", len(bw), "points", flush=True)
gill_objs = [bpy.data.objects[f"gill_{g}"] for g in GILLS]
for g, o in zip(GILLS, gill_objs):
    surf = Vector(ROOTS[g]["surface"]); tip = Vector(ROOTS[g]["tip"])
    axis = (tip - surf).normalized(); L = (tip - surf).length
    skin = skin_weights_at(surf)
    print(g, "root follows", {k: round(v, 2) for k, v in skin.items()}, flush=True)
    groups = {n: o.vertex_groups.new(name=n) for n in skin}
    own = o.vertex_groups.new(name=f"gill_{g}")
    for v in o.data.vertices:
        a = ((o.matrix_world @ v.co) - surf).dot(axis)
        # base already tilts as much as the middle of its mound (MOUND_TILT), then fully the gill's own above
        w = MOUND_TILT + (1 - MOUND_TILT) * smooth(ROOTS[g]["fillet"], ROOTS[g]["fillet"] + 0.3 * L, a)
        own.add([v.index], w, "REPLACE")
        for n, sw in skin.items():
            groups[n].add([v.index], (1 - w) * sw, "REPLACE")
bpy.ops.object.select_all(action="DESELECT")
for o in gill_objs: o.select_set(True)
bpy.context.view_layer.objects.active = gill_objs[0]
bpy.ops.object.join()
gills = bpy.context.view_layer.objects.active; gills.name = "gills"
mod = gills.modifiers.new("rig", "ARMATURE"); mod.object = arm
gills.parent = arm

# lashes ride only on their lash bone; lids only on their lid bone
for k in EYE_KEYS:
    idx = LASH_IDX[k]
    for vg in body.vertex_groups: vg.remove(idx)
    (body.vertex_groups.get(f"lash{k}") or body.vertex_groups.new(name=f"lash{k}")).add(idx, 1.0, "REPLACE")
    lid = bpy.data.objects[f"lid{k}"]
    lid.vertex_groups.new(name=f"lid{k}").add(list(range(len(lid.data.vertices))), 1.0, "REPLACE")
    lm = lid.modifiers.new("rig", "ARMATURE"); lm.object = arm; lid.parent = arm
    print(f"eye {k}: {len(idx)} lash points on lash{k}; lid on lid{k}", flush=True)
loose = sum(1 for v in body.data.vertices if abs(sum(x.weight for x in v.groups) - 1.0) > 0.02)
print("body points not fully attached after all steps:", loose, flush=True)
bpy.ops.wm.save_as_mainfile(filepath=f"{RIG}/salty_rig.blend")

# test pose: tail swung, head turned, gills flared, one arm up
pb = arm.pose.bones
for i, n in enumerate(["tail1", "tail2", "tail3", "tail4", "tail5"]):
    pb[n].rotation_mode = "XYZ"; pb[n].rotation_euler = (0, 0, math.radians(14))
pb["head"].rotation_mode = "XYZ"; pb["head"].rotation_euler = (0, 0, math.radians(-20))
pb["arm_R"].rotation_mode = "XYZ"; pb["arm_R"].rotation_euler = (math.radians(50), 0, 0)
for g in GILLS:
    pb[f"gill_{g}"].rotation_mode = "XYZ"; pb[f"gill_{g}"].rotation_euler = (math.radians(25), 0, 0)
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"
sc.render.resolution_x = sc.render.resolution_y = 800
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.clip_end = 2000
def shot(n, loc, rot, scale, center):
    cam.location = Vector(center) + Vector(loc); cam.rotation_euler = [math.radians(a) for a in rot]; cam.data.ortho_scale = scale
    sc.render.filepath = f"{RIG}/look/pose_{n}.png"; bpy.ops.render.render(write_still=True)
shot("three", (300, -300, 160), (65, 0, 45), 230, (-20, 0, -5))
shot("top", (0, 0, 400), (0, 0, 0), 230, (-20, 0, 0))
print("RIG_OK")
