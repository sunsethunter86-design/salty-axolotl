"""Salty rig, step 4: her moves, then export one GLB with the skeleton, the moves and the mouth shape.

Moves (looping, 30 fps), all rotations given about world axes at each bone's joint:
- idle  (4 s): breathing bob, slow head drift, lazy tail sway, soft gill flutter;
- swim  (2 s): a wave down the body into the tail, legs tucked back, gills swept back;
- happy (2 s): body wiggle, head bobble, fast tail wag, gills flared and fluttering.
Talking is not a move: the page drives the "mouth_open" shape from her voice.
Writes salty_animated.glb (+ look/anim_*.png check frames).
"""
import bpy, math
from mathutils import Quaternion, Vector

RIG = "D:/MuseTest/salty-rig"
bpy.ops.wm.open_mainfile(filepath=f"{RIG}/salty_rig.blend")
arm = bpy.data.objects["salty_rig"]
pb = arm.pose.bones
FPS = 30
bpy.context.scene.render.fps = FPS
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
TAIL = ["tail1", "tail2", "tail3", "tail4", "tail5"]
GILLS = ["gill_R1", "gill_R2", "gill_R3", "gill_L1", "gill_L2", "gill_L3"]

def local(bone, rots):
    """Rotations about world axes (list of (axis, degrees)) -> the bone's own rest-relative quaternion."""
    B = arm.data.bones[bone].matrix_local.to_quaternion()
    q = Quaternion()
    for axis, deg in rots:
        q = Quaternion(axis, math.radians(deg)) @ q
    return B.inverted() @ q @ B

def gill_out(name):
    """Unit axis to flare a gill away from the head (rotate about this, positive = outward/up)."""
    b = arm.data.bones[name]
    d = (b.tail_local - b.head_local).normalized()
    return d.cross(Y).normalized() * (1 if "R" in name else -1)

def make(name, frames, pose_at):
    act = bpy.data.actions.new(name); act.use_fake_user = True
    arm.animation_data_create(); arm.animation_data.action = act
    for f in range(frames + 1):
        t = f / frames  # 0..1 around the loop
        poses = pose_at(t)
        for b in pb:
            b.rotation_mode = "QUATERNION"
            b.rotation_quaternion = local(b.name, poses.get(b.name, []))
            b.location = poses.get(b.name + ".loc", (0, 0, 0))
            b.keyframe_insert("rotation_quaternion", frame=f + 1)
            b.keyframe_insert("location", frame=f + 1)
    for fc in act.fcurves:
        for k in fc.keyframe_points: k.interpolation = "LINEAR"
    print("action", name, frames, "frames", flush=True)
    return act

S = lambda t, cycles=1, phase=0: math.sin(2 * math.pi * (t * cycles + phase))

def idle(t):
    p = {"hips.loc": (0, 0, 0.0), "chest": [(X, 1.5 * S(t, 1))], "neck": [(X, -1.0 * S(t, 1))],
         "head": [(Z, 4 * S(t, 1, 0.1)), (X, 2 * S(t, 2))]}
    p["hips.loc"] = (0, 0, 0)
    for i, n in enumerate(TAIL):
        p[n] = [(Z, 3.0 * S(t, 1, -0.12 * i))]
    for i, g in enumerate(GILLS):
        p[g] = [(gill_out(g), 6 * S(t, 2, i * 0.17))]
    return p

def swim(t):
    p = {"hips": [(Z, 4 * S(t, 1, 0.25))], "chest": [(Z, -5 * S(t, 1, 0.15))], "neck": [(Z, -3 * S(t, 1, 0.1))],
         "head": [(Z, -3 * S(t, 1, 0.05)), (X, -4)]}
    for i, n in enumerate(TAIL):
        p[n] = [(Z, (15 + 5 * i) * S(t, 1, -0.16 * (i + 1)))]
    for side in ("L", "R"):
        # tucked back along the body. ☠️ About +X, positive swings a downward leg toward +Y (her back);
        # -70 sent them forward under her chin (29 Oct).
        p[f"arm_{side}"] = [(X, 70)]; p[f"hand_{side}"] = [(X, 30)]
        p[f"thigh_{side}"] = [(X, 60)]; p[f"foot_{side}"] = [(X, 30)]
    for i, g in enumerate(GILLS):
        p[g] = [(X, -18), (gill_out(g), 5 * S(t, 2, i * 0.1))]              # swept back, rippling
    return p

def happy(t):
    p = {"hips": [(Z, 8 * S(t, 2))], "chest": [(Z, -6 * S(t, 2, 0.1))],
         "head": [(Y, 9 * S(t, 2, 0.2)), (X, 4 * S(t, 4))]}
    for i, n in enumerate(TAIL):
        p[n] = [(Z, (8 + 3 * i) * S(t, 4, -0.12 * (i + 1)))]
    for i, g in enumerate(GILLS):
        p[g] = [(gill_out(g), 14 + 10 * S(t, 4, i * 0.15))]                 # flared, fluttering fast
    p["arm_R"] = [(X, -35 + 15 * S(t, 2))]; p["arm_L"] = [(X, -10 - 10 * S(t, 2))]  # little waves forward
    return p

# ---- one-shot moods, from the Gemini prompts/clips (salty-video/GEMINI_PROMPTS.md). Each starts and ends
# at her resting pose (ease in/out), so it blends cleanly in and out of idle; the page times her face to it.
# Directions (world, at each joint): +X = nod down / lean forward / swing a hanging limb back;
# -X = look up / lean back / swing a hanging limb forward-up; +Z = turn the snout toward +X;
# +Y = tilt the top of the head toward +X; a hanging limb swings toward +X with -Y. Her left side is +X.
# ☠️ Once an arm points forward, turning it about Y does almost nothing (it spins along itself): swing a
# raised arm inward/outward about Z instead (+Z moves it toward +X). First pass left the "think" hand out
# to the side instead of at her chin (29 Oct).
def ss(a, b, t):
    u = min(1.0, max(0.0, (t - a) / (b - a))); return u * u * (3 - 2 * u)
def env(t, a=0.0, b=0.15, c=0.82, d=1.0): return ss(a, b, t) * (1 - ss(c, d, t))
def with_idle(t, p, keep=0.4):
    """a little of idle's breathing and gill ripple under every mood, so she never freezes"""
    base = idle(t * 1.0)
    for k, v in base.items():
        if k.endswith(".loc"): continue
        p.setdefault(k, [])
        p[k] = p[k] + [(ax, d * keep) for ax, d in v]
    return p

def wave(t):        # notices you, big friendly smile, waves one hand (her left, +X), lowers it
    e = env(t, 0, 0.18, 0.8, 1); w = env(t, 0.2, 0.28, 0.72, 0.8)
    # ☠️ out-to-the-side-and-up put her hand behind her big head, waving away from you (Shaun 29 Oct:
    # "why does her hand go behind her head"). Reach forward and up in front of her, beside her face,
    # and wave the hand side to side facing the viewer.
    p = {"arm_R": [(X, -108 * e), (Z, 30 * e)], "hand_R": [(Z, 30 * S(t, 7) * w), (X, -22 * e)],
         "head": [(Y, 8 * e), (X, -4 * e)], "chest": [(Y, -4 * e)]}
    for i, g in enumerate(GILLS): p[g] = [(gill_out(g), 10 * e + 4 * S(t, 6, i * 0.15) * e)]
    return with_idle(t, p)

def think(t):       # looks up and to one side, hand up toward her chin tapping, then back
    e = env(t, 0, 0.15, 0.72, 0.92); tap = env(t, 0.25, 0.3, 0.6, 0.66)
    p = {"head": [(X, -14 * e), (Z, -16 * e)], "neck": [(X, -4 * e)],
         "arm_L": [(X, -105 * e), (Z, 28 * e)], "hand_L": [(X, -35 * e + 9 * S(t, 6) * tap)]}
    for g in GILLS: p[g] = [(gill_out(g), -4 * e)]
    return with_idle(t, p)

def sympathy(t):    # leans in, tilts her head, one slow understanding nod; gills droop a little
    e = env(t, 0, 0.18, 0.82, 1); nod = math.sin(math.pi * min(1, max(0, (t - 0.38) / 0.36)))
    p = {"chest": [(X, 8 * e)], "neck": [(X, 4 * e)], "head": [(Y, 10 * e), (X, 8 * nod * e)]}
    for g in GILLS: p[g] = [(gill_out(g), -10 * e)]
    for side in ("L", "R"): p[f"arm_{side}"] = [(X, -10 * e)]
    return with_idle(t, p)

def outrage(t):     # gasp: leans back, a hand flies to her chest, gills flare; then a sassy settle
    a = env(t, 0, 0.08, 0.5, 0.68); sassy = env(t, 0.55, 0.68, 0.86, 1)
    p = {"chest": [(X, -12 * a)], "neck": [(X, -5 * a)], "head": [(X, -6 * a), (Y, -10 * sassy), (Z, 8 * sassy)],
         "arm_R": [(X, -85 * a), (Z, -30 * a)], "hand_R": [(X, -30 * a)]}
    for g in GILLS: p[g] = [(gill_out(g), 22 * a + 6 * sassy)]
    for i, n in enumerate(TAIL): p[n] = [(Z, 6 * a * S(t, 3, -0.1 * i))]
    return with_idle(t, p)

def celebrate(t):   # both arms up, whole-body wiggle, gills bouncing
    e = env(t, 0, 0.12, 0.85, 1)
    # ☠️ straight up (150) hid her short arms behind her big head; up-and-out in a V, a little forward
    # both arms forward and up in front of her (as for the wave), hands shaking with excitement
    p = {"arm_R": [(X, -110 * e), (Z, 36 * e)], "arm_L": [(X, -110 * e), (Z, -36 * e)],
         "hand_R": [(Z, 22 * S(t, 6) * e), (X, -20 * e)], "hand_L": [(Z, -22 * S(t, 6, 0.5) * e), (X, -20 * e)],
         "hips": [(Z, 10 * S(t, 3) * e)], "chest": [(Z, -8 * S(t, 3, 0.1) * e)], "head": [(Y, 8 * S(t, 3, 0.2) * e), (X, -5 * e)]}
    for i, n in enumerate(TAIL): p[n] = [(Z, (8 + 3 * i) * S(t, 6, -0.12 * (i + 1)) * e)]
    for i, g in enumerate(GILLS): p[g] = [(gill_out(g), 12 * e + 10 * S(t, 6, i * 0.15) * e)]
    return with_idle(t, p, keep=0.2)

def sleepy(t):      # big slow yawn, droops with her chin on her hands, blinks herself awake
    y = env(t, 0.02, 0.18, 0.32, 0.45); d = env(t, 0.42, 0.55, 0.8, 0.95)
    p = {"head": [(X, -12 * y + 14 * d)], "neck": [(X, -4 * y + 5 * d)], "chest": [(X, -3 * y + 6 * d)]}
    for side, sg in (("L", 1), ("R", -1)):
        p[f"arm_{side}"] = [(X, -92 * d), (Z, sg * 22 * d)]; p[f"hand_{side}"] = [(X, -40 * d)]
    for g in GILLS: p[g] = [(gill_out(g), 8 * y - 12 * d)]
    return with_idle(t, p, keep=0.5)

def wink(t):        # a cheeky head tilt while one eye winks (the eye is the page's)
    e = env(t, 0, 0.2, 0.7, 1)
    p = {"head": [(Y, -9 * e), (Z, 5 * e)]}
    for g in GILLS: p[g] = [(gill_out(g), 6 * e)]
    return with_idle(t, p)

acts = [make("idle", 4 * FPS, idle), make("swim", 2 * FPS, swim), make("happy", 2 * FPS, happy)]
MOODS = {"wave": (3.0, wave), "think": (4.0, think), "sympathy": (3.5, sympathy), "outrage": (3.5, outrage),
         "celebrate": (3.0, celebrate), "sleepy": (5.0, sleepy), "wink": (1.6, wink)}
for name, (secs, fn) in MOODS.items():
    acts.append(make(name, int(secs * FPS), fn))
# check frames: the peak of each mood, front three-quarter
sc_ = bpy.context.scene
PEAKS = {"wave": 0.5, "think": 0.45, "sympathy": 0.56, "outrage": 0.3, "celebrate": 0.45, "sleepy": 0.65, "wink": 0.45}
MOOD_CHECKS = [(a, int(PEAKS[a.name] * (a.frame_range[1] - 1)) + 1) for a in acts if a.name in PEAKS]

# check frames
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"
sc.render.resolution_x = sc.render.resolution_y = 600
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 240; cam.data.clip_end = 2000
for act, frame in ((acts[1], 8), (acts[1], 23), (acts[2], 9)):
    arm.animation_data.action = act; sc.frame_set(frame)
    for name, loc, rot in (("three", (260, -260, 180), (62, 0, 45)), ("top", (-20, 0, 400), (0, 0, 0))):
        cam.location = loc; cam.rotation_euler = [math.radians(a) for a in rot]
        sc.render.filepath = f"{RIG}/look/anim_{act.name}_{frame}_{name}.png"; bpy.ops.render.render(write_still=True)
for act, frame in MOOD_CHECKS:
    arm.animation_data.action = act; sc.frame_set(frame)
    cam.location = (120, -330, 60); cam.rotation_euler = [math.radians(a) for a in (82, 0, 20)]
    sc.render.filepath = f"{RIG}/look/mood_{act.name}.png"; bpy.ops.render.render(write_still=True)

# export: every action becomes its own animation in the GLB
arm.animation_data.action = None
for b in pb:
    b.rotation_quaternion = Quaternion(); b.location = (0, 0, 0)
sc.frame_set(1)
bpy.ops.export_scene.gltf(filepath=f"{RIG}/salty_animated.glb", export_format="GLB",
                          export_animation_mode="ACTIONS", export_force_sampling=True, export_frame_step=1,
                          export_morph=True, export_morph_normal=True, export_skins=True,
                          export_image_format="JPEG", export_jpeg_quality=90, export_yup=True,
                          export_apply=False)
import os
print("EXPORT_OK", os.path.getsize(f"{RIG}/salty_animated.glb"), flush=True)
