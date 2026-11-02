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
        if (p - b).length < 11:          # the whole old root: fan bases, stubs, shards
            kill.add(v); continue
        s = (p - b).dot(axis)
        if s < -9 or s > L + 6:
            continue
        radial = (p - (b + axis * s)).length
        if radial < 12 and (p - HEAD_C).length > r_head - 1.0:
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
img = [n.image for n in body.active_material.node_tree.nodes
       if n.type == "TEX_IMAGE" and n.outputs["Color"].links and n.outputs["Color"].links[0].to_socket.name == "Base Color"][0]
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
            if all(lf in pf for lf in e.link_faces) and e.calc_length() > 1.2]
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
    inner_l = list(inner)
    for _ in range(60):
        newpos = {}
        for v in inner_l:
            nb = [e.other_vert(v) for e in v.link_edges]
            newpos[v] = sum(((mw @ o.co) for o in nb), Vector()) / len(nb)
        for v, p in newpos.items():
            uu, vv, _ = local(np.array(p))
            q = origin + ua * uu + va * vv + nrm * surf(uu, vv)
            v.co = mw.inverted() @ Vector(q)
    # colour: rim points take the skin colour already under them; the inside is blended smoothly
    col = {}
    for v in rim:
        cs = [texel(l[uvl].uv) for l in v.link_loops if l.face in before]
        col[v] = np.mean(cs, 0) if cs else np.array([0.67, 0.53, 0.49])
    for v in inner_l: col[v] = np.mean(list(col.values()), 0)
    for _ in range(400):
        for v in inner_l:
            col[v] = np.mean([col[e.other_vert(v)] for e in v.link_edges], 0)
    # texture tile for this hole: flatten it onto its own surface frame, paint it, point its UVs there
    P2 = {v: np.array(local(np.array(mw @ v.co))[:2]) for v in gverts}
    lo = np.min(list(P2.values()), 0); hi = np.max(list(P2.values()), 0)
    scale = (TILE - 16) / max(hi - lo)
    tx, ty = (gi % 4) * TILE, (gi // 4) * TILE
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
SKIN_RIM = np.mean([texel(l[uvl].uv) for f in list(before)[::40] for l in f.loops[:1]], 0)
bm.to_mesh(me); bm.free()
