"""Salty rig, step 2c: her skin (Shaun 29 Oct: "add a mild reptile skin pattern to her body and make her a
bit more pink").

Works on the textures, not the shape:
- a mild scale pattern, computed in 3D (cells about 2.4 units across) so scales are the same size
  everywhere and run straight across texture seams: each scale a touch different in tone, slightly
  darker at its edges, and shallow grooves between scales added to her surface-detail (normal) map;
- a gentle shift toward pink;
- where a gill mound sits on her original skin, the same pink fade the rebuilt skin already has.
Eyes and lashes are left alone (no pattern, no tint within EYE_CLEAR of each eye). Gills are vertex
coloured and untouched.
Reads salty_gills.blend + gill_roots.json, writes salty_skin.blend and look/skin_*.png.
"""
import bpy, json, math, time
import numpy as np
from mathutils import Vector

RIG = "D:/MuseTest/salty-rig"
# ☠️ First pass (2.4-unit cells, 7% edge darkening, 0.10 grooves) read as cracked crocodile hide, not
# "mild" (29 Oct). Smaller, fainter scales:
CELL, EYE_CLEAR = 1.6, 11.0
EDGE_DARK, TONE_VAR, GROOVE, DOME, EDGE_W = 0.025, 0.03, 0.035, 0.02, 0.09
TINT = np.array([1.035, 0.955, 0.985])                      # sRGB multipliers: a bit more pink
ROOT_PINK = np.array([0.90, 0.42, 0.52]) ** (1 / 2.2)       # gill root pink, as in build_gills.py
t0 = time.time()

bpy.ops.wm.open_mainfile(filepath=f"{RIG}/salty_gills.blend")
body = bpy.data.objects["body"]; me = body.data; mw = body.matrix_world
R = json.load(open(f"{RIG}/gill_roots.json"))
EYES = np.array(R["_eyes"]); ROOTS = {k: v for k, v in R.items() if not k.startswith("_")}

def tex_of(mat, socket_name, via_normal_map=False):
    for n in mat.node_tree.nodes:
        if n.type != "TEX_IMAGE": continue
        for l in n.outputs["Color"].links:
            if via_normal_map and l.to_node.type == "NORMAL_MAP": return n.image
            if not via_normal_map and l.to_socket.name == socket_name: return n.image
    return None
body_mat = me.materials[0]
patch_idx = [i for i, m in enumerate(me.materials) if m.name.startswith("skin_patch")][0]
patch_mat = me.materials[patch_idx]
IMG_BASE, IMG_NRM = tex_of(body_mat, "Base Color"), tex_of(body_mat, None, True)
IMG_PATCH = tex_of(patch_mat, "Base Color")
print("images", IMG_BASE.size[:], IMG_NRM.size[:] if IMG_NRM else None, IMG_PATCH.size[:], flush=True)

def pixels(img):
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32); img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)
def put(img, arr):
    img.pixels.foreach_set(arr.astype(np.float32).ravel()); img.update(); img.pack()

# ---- where on her body is every texel? (rasterise triangles in texture space, carrying 3D positions)
V = np.array([mw @ v.co for v in me.vertices]); UV = me.uv_layers.active.data
def position_map(size, want_patch):
    W, H = size
    pos = np.zeros((H, W, 3), np.float32); have = np.zeros((H, W), bool)
    for poly in me.polygons:
        if (poly.material_index == patch_idx) != want_patch: continue
        vi = list(poly.vertices); li = list(poly.loop_indices)
        for k in range(1, len(vi) - 1):  # fan in case of n-gons
            tri = (0, k, k + 1)
            P = V[[vi[j] for j in tri]]
            T = np.array([(UV[li[j]].uv[0] * W, UV[li[j]].uv[1] * H) for j in tri])
            x0, x1 = int(max(0, T[:, 0].min() - 1)), int(min(W - 1, T[:, 0].max() + 1))
            y0, y1 = int(max(0, T[:, 1].min() - 1)), int(min(H - 1, T[:, 1].max() + 1))
            if x1 < x0 or y1 < y0: continue
            (ax, ay), (bx, by), (cx, cy) = T
            den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(den) < 1e-12: continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            w0 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den
            w1 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den
            w2 = 1 - w0 - w1
            ins = (w0 >= -0.01) & (w1 >= -0.01) & (w2 >= -0.01)
            if not ins.any(): continue
            sub = pos[y0:y1 + 1, x0:x1 + 1]
            sub[ins] = w0[ins, None] * P[0] + w1[ins, None] * P[1] + w2[ins, None] * P[2]
            have[y0:y1 + 1, x0:x1 + 1] |= ins
    return pos, have

# ---- 3D scale cells (Voronoi): distance to nearest and second-nearest cell centre, and which cell
def _hash(c):
    h = (c[..., 0] * 73856093) ^ (c[..., 1] * 19349663) ^ (c[..., 2] * 83492791)
    h = (h * 2654435761) & 0xFFFFFFFF
    return h
def _rand(h, k): return (((h * (2246822519 + 7919 * k)) >> 7) & 0xFFFFFF) / float(0x1000000)
OFFS = np.array([(i, j, k) for i in (-1, 0, 1) for j in (-1, 0, 1) for k in (-1, 0, 1)], np.int64)
def cells(P):
    f1 = np.full(len(P), np.inf); f2 = np.full(len(P), np.inf); idv = np.zeros(len(P))
    g = np.floor(P / CELL).astype(np.int64)
    for off in OFFS:
        c = g + off; h = _hash(c)
        fp = (c + np.stack([_rand(h, 1), _rand(h, 2), _rand(h, 3)], -1)) * CELL
        d = np.linalg.norm(P - fp, axis=1)
        closer = d < f1
        f2 = np.where(closer, f1, np.minimum(f2, d)); idv = np.where(closer, _rand(h, 4), idv); f1 = np.minimum(f1, d)
    return f1, f2, idv

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def skin_fields(P):
    """per texel: eye-clear weight, edge darkness, tone variation, groove height, mound pink amount"""
    out = {k: np.zeros(len(P)) for k in ("w", "edge", "var", "h", "mound")}
    for s in range(0, len(P), 250000):
        p = P[s:s + 250000].astype(np.float64)
        de = np.min(np.linalg.norm(p[:, None, :] - EYES[None], axis=2), 1)
        w = smoothstep(EYE_CLEAR - 3, EYE_CLEAR, de)
        f1, f2, rid = cells(p)
        edge = np.exp(-((f2 - f1) / (EDGE_W * CELL)) ** 2)
        dome = 1 - np.minimum(1, (f1 / (0.75 * CELL)) ** 2)
        mound = np.zeros(len(p))
        for r in ROOTS.values():
            surf = np.array(r["surface"]); ax = np.array(r["axis"]); d = p - surf; a = d @ ax
            rho = np.linalg.norm(d - a[:, None] * ax, axis=1)
            k = np.clip((r["r0"] + r["flare"] * 0.95 - rho) / (r["flare"] * 0.95 - 0.6), 0, 1); k = k * k * (3 - 2 * k)
            k[(a < -4) | (a > 9)] = 0
            mound = np.maximum(mound, k)
        out["w"][s:s + 250000] = w; out["edge"][s:s + 250000] = edge; out["var"][s:s + 250000] = rid - 0.5
        out["h"][s:s + 250000] = (DOME * dome - GROOVE * edge) * w; out["mound"][s:s + 250000] = mound * w
    return out

def bump_normals(pos, have, h):
    """tangent-space bump normals from a height field laid out in texture space (x along u, y along v)"""
    H, W = h.shape
    def grad(axis):
        hp = np.roll(h, -1, axis); hm = np.roll(h, 1, axis)
        pp = np.roll(pos, -1, axis); pm = np.roll(pos, 1, axis)
        ok = have & np.roll(have, -1, axis) & np.roll(have, 1, axis)
        step = np.linalg.norm(pp - pm, axis=2)
        g = np.where(ok & (step > 1e-6), (hp - hm) / np.maximum(step, 1e-6), 0.0)
        return np.clip(g, -1.5, 1.5)
    gx, gy = grad(1), grad(0)
    n = np.dstack([-gx, -gy, np.ones_like(h)])
    return n / np.linalg.norm(n, axis=2, keepdims=True)

# ---- body texture
W, H = IMG_BASE.size
pos, have = position_map((W, H), False)
print("body texels on her skin", int(have.sum()), f"{time.time() - t0:.0f}s", flush=True)
F = skin_fields(pos[have])
base = pixels(IMG_BASE); c = base[..., :3][have].astype(np.float64)
w, mound = F["w"][:, None], F["mound"][:, None]
c = c * (1 - EDGE_DARK * F["edge"][:, None] * w) * (1 + TONE_VAR * F["var"][:, None] * w)     # scales
c = c * (1 + (TINT - 1) * w * (1 - mound))                                          # a bit more pink
c = c * (1 - mound) + ROOT_PINK * mound                                             # mound fade on original skin
base[..., :3][have] = np.clip(c, 0, 1)
put(IMG_BASE, base)
hmap = np.zeros((H, W)); hmap[have] = F["h"]
if IMG_NRM is not None:
    nb = bump_normals(pos, have, hmap)
    if IMG_NRM.size[:] != IMG_BASE.size[:]:
        print("normal map size differs; resampling bump", flush=True)
        ys = (np.arange(IMG_NRM.size[1]) * H / IMG_NRM.size[1]).astype(int); xs = (np.arange(IMG_NRM.size[0]) * W / IMG_NRM.size[0]).astype(int)
        nb = nb[ys][:, xs]
    nrm = pixels(IMG_NRM); n0 = nrm[..., :3] * 2 - 1
    n = np.dstack([n0[..., 0] + nb[..., 0], n0[..., 1] + nb[..., 1], n0[..., 2]])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    nrm[..., :3] = n * 0.5 + 0.5
    put(IMG_NRM, nrm)
print("body texture done", f"{time.time() - t0:.0f}s", flush=True)

# ---- rebuilt-skin texture (already has its mound pink: pattern + tint only, tint kept off the mounds)
W2, H2 = IMG_PATCH.size
pos2, have2 = position_map((W2, H2), True)
F2 = skin_fields(pos2[have2])
pp = pixels(IMG_PATCH); c = pp[..., :3][have2].astype(np.float64)
w2, m2 = F2["w"][:, None], F2["mound"][:, None]
c = c * (1 - EDGE_DARK * F2["edge"][:, None] * w2) * (1 + TONE_VAR * F2["var"][:, None] * w2)
c = c * (1 + (TINT - 1) * w2 * (1 - m2))
pp[..., :3][have2] = np.clip(c, 0, 1)
put(IMG_PATCH, pp)
h2 = np.zeros((H2, W2)); h2[have2] = F2["h"]
nb2 = bump_normals(pos2, have2, h2)
pn = bpy.data.images.new("skin_patch_normal", W2, H2); pn.colorspace_settings.name = "Non-Color"
put(pn, np.dstack([nb2 * 0.5 + 0.5, np.ones((H2, W2))]))
nt = patch_mat.node_tree; bsdf = nt.nodes["Principled BSDF"]
tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = pn
nm = nt.nodes.new("ShaderNodeNormalMap")
nt.links.new(tn.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
print("rebuilt-skin texture done", f"{time.time() - t0:.0f}s", flush=True)

bpy.ops.wm.save_as_mainfile(filepath=f"{RIG}/salty_skin.blend")
print("SKIN_OK", flush=True)
