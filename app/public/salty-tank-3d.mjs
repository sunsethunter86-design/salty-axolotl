// Hackathon (Meta Llama): Salty in 3D, inside her tank. Self-contained: Three.js is vendored
// under salty/vendor/ (three@0.160.0, MIT, THREE_LICENSE.txt) and her model is salty/salty_phone.glb
// (salty-rig/salty_animated.glb at full 2048px textures. An earlier 1024px copy saved only
// ~0.6 MB and read as low-res and washed out in the tank, so it was retired on 29 Oct.)
// Nothing here loads from the internet. If WebGL or the model fails, this throws and
// salty-tank.mjs falls back to her video loops.
//
// Her face, moods and blink are the viewer's (D:\MuseTest\salty-rig\salty-3d-anim.html), proven
// there on 29 Oct. Her mouth is driven by her real voice level (salty-mind.mjs saltyVoiceLevel),
// not the viewer's test syllables. Her life between conversations (swims round the tank, eating her
// bloodworms, quirks) is salty-life.mjs (3 Nov), layered on the clips here.

import { THREE, GLTFLoader } from "./salty/vendor/three-gltf.mjs";
import { createSaltyLife } from "./salty-life.mjs?v=20261103-life";

const GLB_URL = "./salty/salty_phone.glb?v=20261102-teeth";
const ENV_URL = "./salty/studio_env.png";

// Eye pivots measured in Blender (salty-rig/face.json), converted Blender (x,y,z) -> three (x,z,-y).
const FACE_DATA = { eyes: {
  "+X": { axis: [0.953277587890625, 0.14336130023002625, -0.2659124433994293], alpha: 74, lashAlpha: 64 },
  "-X": { axis: [0.9035863876342773, 0.26401111483573914, 0.3373865783214569], alpha: 64, lashAlpha: 60 },
} };

const FACE_KEYS = ["jaw_open", "jaw_round", "smileL", "smileR", "wide", "round", "frown"];
const EXPR = {
  neutral: { f: {}, lids: 0 },
  smile:   { f: { smileL: 1, smileR: 1 }, lids: 0.12 },
  grin:    { f: { jaw_open: 0.72, smileL: 1, smileR: 1 }, lids: 0.22 },
  laugh:   { f: { smileL: 1, smileR: 1 }, lids: 0.88, laugh: true },
  gasp:    { f: { jaw_round: 0.85, round: 1 }, lids: 0 },
  smirk:   { f: { smileL: 1, frown: 0.15 }, lids: 0.38 },
  pout:    { f: { round: 0.85, frown: 0.35 }, lids: 0.15 },
  // Her care loop (salty-care.mjs, 2 Nov): heavy lids and a frown when he's ignored her; a small
  // open, wanting mouth when she's hungry. Used as her resting face (setRestExpression).
  sulk:    { f: { frown: 0.75, round: 0.2 }, lids: 0.5 },
  hungry:  { f: { jaw_open: 0.16, round: 0.45, frown: 0.12 }, lids: 0.08 },
};
// Mood face keyframes (from the viewer): [at, face, lids] eased between keys.
const MOODS_FACE = {
  wave:      [[0, "neutral", 0], [0.12, { jaw_open: 0.4, smileL: 1, smileR: 1 }, 0.15], [0.8, "smile", 0.12], [1, "neutral", 0]],
  think:     [[0, "neutral", 0], [0.12, { round: 0.8, frown: 0.3 }, 0.35], [0.62, { round: 0.6, frown: 0.2 }, 0.42],
              [0.75, { smileL: 0.8, smileR: 0.4 }, 0.12], [1, "neutral", 0]],
  sympathy:  [[0, "neutral", 0], [0.15, { smileL: 0.45, smileR: 0.45, frown: 0.15 }, 0.3], [0.85, { smileL: 0.45, smileR: 0.45 }, 0.25], [1, "neutral", 0]],
  outrage:   [[0, "neutral", 0], [0.06, { jaw_round: 0.95, round: 1 }, 0], [0.5, { jaw_round: 0.8, round: 0.9 }, 0],
              [0.62, { smileL: 1, frown: 0.1 }, 0.45], [0.9, { smileL: 0.9 }, 0.35], [1, "neutral", 0]],
  celebrate: [[0, "neutral", 0], [0.08, { jaw_open: 0.85, smileL: 1, smileR: 1 }, 0], [0.86, { jaw_open: 0.6, smileL: 1, smileR: 1 }, 0.1],
              [1, "smile", 0.1]],
  sleepy:    [[0, "neutral", 0], [0.06, { jaw_round: 0.4, round: 0.3 }, 0.35], [0.2, { jaw_round: 1, round: 0.4 }, 0.8],
              [0.36, { jaw_round: 0.9, round: 0.4 }, 0.85], [0.46, "neutral", 0.72], [0.8, "neutral", 0.78],
              [0.85, "neutral", 0.1], [0.88, "neutral", 1], [0.91, "neutral", 0.1], [0.94, "neutral", 0.9], [0.97, { smileL: 0.5, smileR: 0.5 }, 0.1],
              [1, "smile", 0]],
  wink:      [[0, "neutral", 0], [0.2, { smileL: 1, smileR: 0.4 }, { "+X": 1, "-X": 0.15 }], [0.62, { smileL: 1, smileR: 0.4 }, { "+X": 1, "-X": 0.15 }],
              [0.82, "smile", 0.05], [1, "neutral", 0]],
};
const LOOP_MOVES = ["idle", "swim", "happy"];
// Mouth shapes for her syllables (salty-mind.mjs saltySpeechVisemes), in morph weights.
// Like the Gemini reference clips: openings are small and brief, lips close fully
// between words, and nothing flaps at a fixed rate.
const MOUTH_KEYS = ["jaw_open", "jaw_round", "wide", "round"];
const VISEME_SHAPES = {
  a: { jaw_open: 0.9, jaw_round: 0, wide: 0.08, round: 0 },
  e: { jaw_open: 0.38, jaw_round: 0, wide: 0.75, round: 0 },
  i: { jaw_open: 0.22, jaw_round: 0, wide: 1, round: 0 },
  o: { jaw_open: 0.25, jaw_round: 0.8, wide: 0, round: 0.85 },
  u: { jaw_open: 0.08, jaw_round: 0.5, wide: 0, round: 1 },
  f: { jaw_open: 0.16, jaw_round: 0, wide: 0.4, round: 0 },
  closed: { jaw_open: 0, jaw_round: 0, wide: 0, round: 0 },
  pause: { jaw_open: 0, jaw_round: 0, wide: 0, round: 0 },
};
const FALLBACK_VISEMES = ["a", "e", "a", "o", "e", "i", "a", "o"];

/**
 * Loads 3D Salty into `container` (which she fills). Options:
 * - getLevel(): her voice level, 0..1 (0 = quiet). Read every frame while she talks.
 * - getViseme(): her next syllable shape from her actual words, asked once per syllable.
 * - onTap(): she was tapped (the tank turns this into a wave/wink).
 * - onWide(on, quick): she's swimming laps, show the whole tank (on), or she's coming home (off).
 * - getView(): how much of the tank the screen shows, as { x, y } half-extents (1 = all of it).
 * Returns { setTalking, setBusy, feed, playLoop, playMood, setExpression, setPaused, dispose, ... }.
 * Throws if WebGL or the model cannot load: the caller falls back to video.
 */
export async function createSalty3D(container, { getLevel = () => 0, getViseme = () => null, onTap = () => {},
  onWide = () => {}, getView = () => ({ x: 1, y: 1 }) } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "st-3d";
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 5000);
  const group = new THREE.Group();
  scene.add(group);

  // Lighting is the approved viewer's: the studio environment alone, at the same exposure.
  // ☠️ Extra hemisphere + key lights here double-lit her on top of that environment and
  // washed her textures out to near-white (Shaun, 29 Oct). Only if the environment image
  // itself fails does a single soft light stand in, so she never renders black.
  try {
    const tex = await new THREE.TextureLoader().loadAsync(ENV_URL);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    tex.dispose(); pmrem.dispose();
  } catch { scene.add(new THREE.HemisphereLight(0xdff3ff, 0x8a5a6a, 0.9)); }
  // Studio shaping for Salty alone (Shaun's reference, 30 Oct): the flat
  // environment alone reads dull on her main skin material (GLB roughness
  // unset = 1). A gentle warm key from front-top-right and a pink rim from
  // back-left give her the soft 3D pop of a studio render. Kept low: the
  // ☠️ note above is about extra lights at full strength washing her white.
  // Only her model is in this scene, so the aquarium behind is untouched.
  const keyLight = new THREE.DirectionalLight(0xfff0e2, 0.55);
  keyLight.position.set(2.5, 3.5, 4);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xff9ebb, 0.7);
  rimLight.position.set(-3, 1.5, -2.5);
  scene.add(rimLight);

  let gltf;
  // ☠️ THE APP'S CSP BLOCKS HER TEXTURES (boot gate, 29 Oct). GLTFLoader fetches
  // embedded textures as blob: URLs when createImageBitmap exists, and the app's
  // connect-src allows no blob: — she loaded bare on the phone while the loose
  // test page (no CSP) looked perfect. Hidden during the load, the loader falls
  // back to <img> elements, which the policy does not restrict (the approved
  // viewer's fix for the same wall).
  const realBitmap = window.createImageBitmap;
  window.createImageBitmap = undefined;
  try {
    gltf = await new GLTFLoader().loadAsync(GLB_URL);
  } catch (e) {
    renderer.dispose();
    renderer.domElement.remove();
    throw e;
  } finally {
    window.createImageBitmap = realBitmap;
  }
  const model = gltf.scene;
  // A skinned mesh measured before its skeleton settles gives a tiny box (viewer, 29 Oct):
  // measure the raw shapes in their rest positions instead.
  model.updateMatrixWorld(true);
  const box = new THREE.Box3();
  model.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  model.position.sub(centre);
  model.position.y += size.y / 2;
  // Her pivot (3 Nov): she now turns, climbs and banks as she swims, so the group's origin sits at
  // her middle instead of under her feet. Her rest pose on the sand is unchanged.
  const PIVOT_Y = size.y * 0.47;
  model.position.y -= PIVOT_Y;
  group.add(model);
  // ☠️ Feet on the sand, not on the reef rock (Shaun, 29 Oct). Her rest-pose floor (y=0)
  // framed her toes ~78% down the tank, standing on the coral. The sand surface in the
  // reef photo sits ~90% down, so the whole model drops by that gap; the sand-front
  // overlay (opaque from ~92%) still leaves her toes visible just above it.
  group.position.y = -size.y * 0.17 + PIVOT_Y;
  const HOME = group.position.clone();

  const faceMeshes = [];
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    // Pixar-soft skin (Shaun, 30 Oct): upgrade her textured skin materials to
    // physical materials — a clearcoat sheen and a pink sheen layer fake the
    // soft subsurface glow of a studio render, copying every map/morph-safe
    // property from the GLB material. Cheap at her new 30 fps idle rate.
    if (o.material) {
      const swapped = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => {
        if (!m || !m.map || m.isMeshPhysicalMaterial) return m;
        // ☠️ phys.copy(m) crashes here (30 Oct, found from the phone's fallback
        // to video): MeshPhysicalMaterial.copy reads vectors (clearcoatNormalScale)
        // that a MeshStandardMaterial does not have. Copy the shared fields by hand.
        const phys = new THREE.MeshPhysicalMaterial();
        phys.name = m.name;
        phys.color.copy(m.color);
        for (const t of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap"]) phys[t] = m[t] || null;
        if (m.normalScale) phys.normalScale.copy(m.normalScale);
        phys.roughness = m.roughness; phys.metalness = m.metalness;
        phys.emissive.copy(m.emissive); phys.emissiveIntensity = m.emissiveIntensity;
        phys.transparent = m.transparent; phys.opacity = m.opacity; phys.side = m.side;
        phys.alphaTest = m.alphaTest; phys.depthWrite = m.depthWrite;
        phys.clearcoat = 0.28;
        phys.clearcoatRoughness = 0.65;
        phys.sheen = 0.45;
        phys.sheenRoughness = 0.6;
        phys.sheenColor = new THREE.Color(0xffb7c9);
        phys.specularIntensity = 0.55;
        return phys;
      });
      o.material = Array.isArray(o.material) ? swapped : swapped[0];
    }
    // Full-res maps, sampled sharply: without anisotropy her skin speckles blur at the
    // tank's glancing angles and read as low-res even from the 2048px textures.
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap]) {
        if (t) { t.anisotropy = maxAniso; t.needsUpdate = true; }
      }
      // Slightly pinker, slightly richer Salty only (Shaun): her textured skin/body
      // materials get a saturation lift and a warm-pink shift, applied to the map's
      // sampled colour. Not the tank, background or lighting, and not her mouth/eyes.
      if (m.map && !m.userData.saltyTint) {
        // Soft studio sheen like the reference render: a little more environment
        // response and a capped roughness on her skin, at no extra render cost.
        if ("envMapIntensity" in m) m.envMapIntensity = 0.9;
        if ("roughness" in m) m.roughness = Math.min(m.roughness, 0.62);
        m.userData.saltyTint = true;
        const prev = m.onBeforeCompile;
        m.onBeforeCompile = (shader, rendererArg) => {
          if (prev) prev(shader, rendererArg);
          shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>",
            `#include <map_fragment>
             { float saltyLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
               diffuseColor.rgb = mix(vec3(saltyLuma), diffuseColor.rgb, 1.12);
               diffuseColor.rgb *= vec3(1.03, 0.96, 0.99); }`);
        };
        m.customProgramCacheKey = () => "salty-tint-1";
        m.needsUpdate = true;
      }
      // Teeth and tongue like Shaun's reference (30 Oct): her mouth parts are
      // separate untextured materials. Teeth go clean white with a slight sheen,
      // tongue a richer moist pink, lower mouth a brighter rose — so when her
      // jaw opens (boosted below) the teeth and tongue actually read.
      if (!m.map && !m.userData.mouthDone) {
        if (m.name === "mouth_upper") { m.userData.mouthDone = true; m.color.set(0xffffff); if ("roughness" in m) m.roughness = 0.32; m.needsUpdate = true; }
        else if (m.name === "tongue") { m.userData.mouthDone = true; m.color.set(0xe85a7d); if ("roughness" in m) m.roughness = 0.42; m.needsUpdate = true; }
        else if (m.name === "mouth_lower") { m.userData.mouthDone = true; m.color.set(0xb04055); if ("roughness" in m) m.roughness = 0.5; m.needsUpdate = true; }
      }
    }
    if (o.morphTargetDictionary && FACE_KEYS.some((k) => k in o.morphTargetDictionary)) faceMeshes.push(o);
  });
  model.updateMatrixWorld(true);
  const bone = (n) => { let b = null; model.traverse((o) => { if (o.isBone && o.name === n) b = o; }); return b; };
  const eyes = [];
  for (const [k, E] of Object.entries(FACE_DATA.eyes)) {
    const lid = bone("lid" + k), lash = bone("lash" + k);
    if (!lid || !lash) continue;
    const ax = new THREE.Vector3(...E.axis);
    const local = (b) => { const q = new THREE.Quaternion(); b.getWorldQuaternion(q); return ax.clone().applyQuaternion(q.invert()).normalize(); };
    eyes.push({ key: k, lid, lash, rl: lid.quaternion.clone(), rs: lash.quaternion.clone(), al: local(lid), as: local(lash),
      alpha: THREE.MathUtils.degToRad(E.alpha), lashAlpha: THREE.MathUtils.degToRad(E.lashAlpha) });
  }
  // For her life layer (salty-life.mjs): the bones it turns, and where her mouth is on her head, measured
  // from her tongue and upper lip at rest, so she can aim her face at a worm and swallow it.
  const B = { neck: bone("neck"), head: bone("head"),
    tail: ["tail1", "tail2", "tail3", "tail4", "tail5"].map((n) => bone(n)).filter(Boolean),
    gills: ["gill_R1", "gill_R2", "gill_R3", "gill_L1", "gill_L2", "gill_L3"].map((n) => bone(n)).filter(Boolean) };
  group.updateMatrixWorld(true);
  let mouthLocal = null;
  {
    let tongue = null, lips = null;
    model.traverse((o) => { if (o.isMesh && o.material?.name === "tongue") tongue = o; if (o.isMesh && o.material?.name === "mouth_upper") lips = o; });
    if (tongue && B.head) {
      const at = tongue.geometry.boundingBox.clone().applyMatrix4(tongue.matrixWorld).getCenter(new THREE.Vector3());
      if (lips) at.z = lips.geometry.boundingBox.clone().applyMatrix4(lips.matrixWorld).max.z - 2;
      mouthLocal = B.head.worldToLocal(at);
    }
  }

  const mixer = new THREE.AnimationMixer(model);
  const moves = {};
  for (const clip of gltf.animations) moves[clip.name] = mixer.clipAction(clip);
  let current = null;
  function playLoop(name) {
    const next = moves[name];
    if (!next || next === current) return;
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = false;
    next.reset().setEffectiveWeight(1).play();
    if (current) current.crossFadeTo(next, 0.45, false);
    current = next;
  }
  /** Plays a one-off move; returns its length in seconds (0 if she has no such move). */
  function playMood(name) {
    const act = moves[name];
    if (!act) return 0;
    act.reset();
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
    act.setEffectiveWeight(1).play();
    if (current && current !== act) current.crossFadeTo(act, 0.3, false);
    current = act;
    moodName = name;
    moodT = 0;
    moodDur = act.getClip().duration;
    return moodDur;
  }
  let moodName = null, moodT = 0, moodDur = 0;
  // Swim (Shaun, 30 Oct): her swim clip shipped in the model but the app never
  // called it — she idled forever. Since 3 Nov salty-life.mjs plays it for real
  // swims round the tank, along with her eating and her quirks.
  let busy = false;
  const life = createSaltyLife({
    THREE, scene, camera, group, home: HOME, halfLength: size.z / 2, bones: B, mouthLocal,
    playLoop, playMood, moodPlaying: () => moodName !== null, clip: () => current?.getClip().name || "",
    clipSpeed: (x) => { if (moves.swim) moves.swim.timeScale = x; }, onWide, view: getView,
    compile: () => renderer.compile(scene, camera),
  });
  const lifeMouth = Object.fromEntries(MOUTH_KEYS.map((k) => [k, 0]));
  let lifeLids = 0;

  let expr = "neutral", exprT = 0, talking = false, talkT = 0;
  // Her resting face: what "rest" means to setExpression (neutral, or sulk/hungry from her care loop).
  let restExpr = "neutral";
  // Speech: envelope of her real voice, the syllable she is on, and the mouth's
  // current shape (kept separate from the expression so it can shut fast).
  let envLevel = 0, prevEnv = 0, syl = null, sylT = 0, sylDur = 0.18, lastSylAt = -9, quietFor = 0, fallbackAt = 0, mouthT = 0;
  const mouthNow = Object.fromEntries(MOUTH_KEYS.map((k) => [k, 0]));
  const faceNow = Object.fromEntries(FACE_KEYS.map((k) => [k, 0]));
  let lidExpr = 0, clockT = 0, nextBlink = 1.2, blinkStart = -9;
  const qTmp = new THREE.Quaternion();

  const asFace = (f) => (typeof f === "string" ? EXPR[f].f : f);
  const asLids = (l) => (typeof l === "number" ? { "+X": l, "-X": l } : l);
  function moodFace() {
    const keys = MOODS_FACE[moodName];
    const u = Math.min(1, moodT / Math.max(moodDur, 0.01));
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1][0] <= u) i++;
    const [t0, f0, l0] = keys[i], [t1, f1, l1] = keys[i + 1];
    let k = (u - t0) / Math.max(1e-6, t1 - t0);
    k = Math.min(1, Math.max(0, k));
    k = k * k * (3 - 2 * k);
    const a = asFace(f0), b = asFace(f1), face = {};
    for (const n of FACE_KEYS) face[n] = (a[n] || 0) * (1 - k) + (b[n] || 0) * k;
    const la = asLids(l0), lb = asLids(l1);
    return { face, lids: { "+X": la["+X"] * (1 - k) + lb["+X"] * k, "-X": la["-X"] * (1 - k) + lb["-X"] * k } };
  }

  // One syllable at a time, started by her voice getting louder (a syllable
  // onset) or by the last one ending while she is still loud. Her words decide
  // the shape (getViseme); loudness decides how far it opens; quiet closes it.
  // When she stops, the target is zero and the mouth is shut within ~150 ms.
  function updateMouth(dt) {
    mouthT += dt;
    const raw = talking ? Math.min(1, Math.max(0, getLevel() || 0)) : 0;
    envLevel += (raw - envLevel) * Math.min(1, dt * (raw > envLevel ? 26 : 15));
    if (!talking) {
      syl = null;
    } else {
      sylT += dt;
      if (envLevel < 0.09) { quietFor += dt; if (quietFor > 0.07) syl = null; }
      else quietFor = 0;
      const onset = envLevel > 0.15 && envLevel - prevEnv > 0.045 && mouthT - lastSylAt > 0.11;
      if (envLevel > 0.12 && (onset || !syl || sylT > sylDur)) {
        let v = null;
        try { v = getViseme(); } catch { /* no plan: fallback below */ }
        if (!v || !VISEME_SHAPES[v]) v = FALLBACK_VISEMES[fallbackAt++ % FALLBACK_VISEMES.length];
        // Carry a little overshoot at low frame rates so syllables do not pile
        // up behind her voice; an onset always restarts cleanly.
        syl = v; sylT = onset ? 0 : Math.min(Math.max(0, sylT - sylDur), 0.08); lastSylAt = mouthT;
        sylDur = v === "closed" ? 0.07 : v === "pause" ? 0.16 : 0.16 + (Math.floor(talkT * 7) % 3) * 0.03;
      }
    }
    prevEnv = envLevel;
    const shape = talking && syl ? VISEME_SHAPES[syl] : null;
    let amp = 0;
    if (shape) {
      const inK = Math.min(1, sylT / 0.04);
      const outK = sylT > sylDur - 0.055 ? Math.max(0, (sylDur - sylT) / 0.055) : 1;
      amp = Math.min(inK, outK) * (0.45 + 0.55 * Math.min(1, envLevel * 1.35));
    }
    for (const k of MOUTH_KEYS) {
      // Jaw opens wider than the old small-opening tuning (Shaun, 30 Oct) so her
      // teeth, mouth interior and tongue show when she speaks, like his reference.
      const target = shape ? Math.min(1, (shape[k] || 0) * amp * (k === "jaw_open" ? 1.4 : 1)) : 0;
      mouthNow[k] += (target - mouthNow[k]) * Math.min(1, dt * (target > mouthNow[k] ? 30 : 24));
    }
  }

  function updateFace(dt, dtReal = dt) {
    clockT += dt; exprT += dt; talkT += dtReal;
    let E = EXPR[expr] || EXPR.neutral;
    const tgt = Object.fromEntries(FACE_KEYS.map((k) => [k, E.f[k] || 0]));
    let moodLids = null;
    if (moodName && MOODS_FACE[moodName]) {
      moodT += dt;
      const mf = moodFace();
      for (const k of FACE_KEYS) tgt[k] = mf.face[k];
      moodLids = mf.lids;
      E = EXPR.neutral;
      if (moodT >= moodDur) { moodName = null; playLoop("idle"); }
    } else if (moodName) {
      moodT += dt;
      if (moodT >= moodDur) { moodName = null; playLoop("idle"); }
    }
    if (E.laugh) tgt.jaw_open = 0.5 + 0.32 * Math.abs(Math.sin(exprT * Math.PI * 3.2));
    // Her life layer's face (salty-life.mjs): a smile as she eats, a frown when she huffs, a pout...
    const L = life.out;
    if (L.keysW > 0) for (const k in L.keys) tgt[k] += (L.keys[k] - tgt[k]) * L.keysW;
    // Speech runs on real time, not the mixer's clamped step: at low frame rates
    // her mouth must still keep up with her voice instead of slowing down.
    updateMouth(dtReal);
    for (const k of FACE_KEYS) faceNow[k] += (tgt[k] - faceNow[k]) * Math.min(1, dt * 14);
    // ...and its mouth (a snap at a worm, a yawn, a bubble), fast enough for a snap.
    for (const k of MOUTH_KEYS) lifeMouth[k] += ((L.mouth[k] || 0) - lifeMouth[k]) * Math.min(1, dtReal * 40);
    for (const m of faceMeshes) for (const k of FACE_KEYS) {
      const i = m.morphTargetDictionary[k];
      // Speech wins over the expression on the mouth morphs, at its own faster rate.
      if (i !== undefined) m.morphTargetInfluences[i] = MOUTH_KEYS.includes(k) ? Math.max(faceNow[k], mouthNow[k], lifeMouth[k]) : faceNow[k];
    }
    lidExpr += ((E.lids || 0) - lidExpr) * Math.min(1, dt * 8);
    lifeLids += (L.lids - lifeLids) * Math.min(1, dtReal * 12);
    if (L.blink && clockT - blinkStart > 0.4) nextBlink = clockT;
    if (clockT >= nextBlink) { blinkStart = clockT; nextBlink = clockT + 2.2 + Math.random() * 4; }
    const bt = clockT - blinkStart;
    const blink = bt < 0.09 ? bt / 0.09 : bt < 0.13 ? 1 : bt < 0.27 ? 1 - (bt - 0.13) / 0.14 : 0;
    for (const e of eyes) {
      const base = moodLids ? moodLids[e.key] : lidExpr;
      const close = Math.max(base, blink, lifeLids);
      e.lid.quaternion.copy(e.rl).multiply(qTmp.setFromAxisAngle(e.al, close * e.alpha));
      // Lashes wait at the rim until the lid edge reaches them, then ride on it (viewer fix, 29 Oct).
      const lashTurn = Math.max(0, close * e.alpha - (e.alpha - e.lashAlpha));
      e.lash.quaternion.copy(e.rs).multiply(qTmp.setFromAxisAngle(e.as, lashTurn));
    }
  }

  function resize() {
    const w = container.clientWidth || 2, h = container.clientHeight || 2;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Frame her like the video clips did: full body, feet low, a little headroom.
    const radius = size.length() / 2;
    const d = radius * 2.45;
    camera.position.set(0, size.y * 0.52, d);
    camera.lookAt(0, size.y * 0.46, 0);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  playLoop("idle");

  let raf = 0, paused = false, disposed = false, lastRenderMs = 0;
  const clock = new THREE.Clock();
  function frame(nowMs = performance.now()) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    if (paused) return;
    // Heat (Shaun, 30 Oct): she rendered every display frame (120 Hz panel) even
    // sitting silent, which kept the GPU hot enough to cook on. Idle now renders
    // at 30 fps — her swim/blink still read smooth — and only speech, a mood
    // move or a quick move of her own (snapping up a worm) earns 60 fps, when it
    // needs it. getDelta below still measures the whole skipped span, so
    // animation timing does not change.
    const interval = (talking || moodName || life.fast) ? 1000 / 60 : 1000 / 30;
    if (nowMs - lastRenderMs < interval) return;
    lastRenderMs = nowMs;
    const dtRaw = clock.getDelta();
    const dt = Math.min(dtRaw, 0.05);
    mixer.update(dt);
    // Her life (salty-life.mjs): where she is in the tank, what her head, tail and gills do on top
    // of the clip, and what it asks of her face. Talking, a turn or a mood move holds her home.
    life.update(dt, { talking, mood: moodName, busy, rest: restExpr });
    updateFace(dt, Math.min(dtRaw, 0.25));
    renderer.render(scene, camera);
  }
  frame();

  // Taps (Shaun, 30 Oct): listen on the whole stage, not just her canvas. Her
  // body reads wider than the canvas box (the tank crops her), so taps on her
  // tail, feet and lower body used to land on the stage and do nothing. The
  // stage holds only her display (overlays are pointer-events:none, and the
  // mic/txt buttons live outside it), so any press here is a press on Salty.
  let tapTimer = 0;
  (container.parentElement || container).addEventListener("pointerdown", () => {
    life.poke();
    onTap();
    // Visible proof she felt it: the mood move alone read as "does nothing"
    // in a still (Shaun, 30 Oct), so she also grins for a moment, then settles.
    expr = "grin"; exprT = 0;
    if (tapTimer) clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { expr = restExpr; }, 1600);
  });

  return {
    canvas: renderer.domElement,
    setTalking(on) { talking = Boolean(on); if (!talking) talkT = 0; },
    /** He's with her (listening, a turn, typing): no swims or quirks, she comes home and faces him. */
    setBusy(on) { busy = Boolean(on); },
    /** Real bloodworms sink in front of her and she eats them one by one (salty-life.mjs). */
    feed(n = 6) { return life.feed(n); },
    // Test hooks (phone checks, video retakes): a swim or a quirk on demand, and what she's up to.
    swimNow: () => life.swim(),
    quirkNow: (name) => life.quirk(name),
    calm: (secs) => life.calm(secs),
    quirkNames: () => life.quirks(),
    lifeState: () => life.state(),
    playLoop,
    playMood,
    /** True while a one-off move (think, wave, outrage…) is still playing; it returns to idle itself. */
    moodPlaying() { return moodName !== null; },
    setExpression(name) { if (name === "rest") name = restExpr; if (EXPR[name]) { expr = name; exprT = 0; } },
    /** Her face whenever nothing else is asked of it ("rest"); applied now if she is resting. */
    setRestExpression(name) {
      if (!EXPR[name] || name === restExpr) return;
      const resting = expr === restExpr;
      restExpr = name;
      if (resting) { expr = name; exprT = 0; }
    },
    setPaused(on) { paused = Boolean(on); if (!paused) clock.getDelta(); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      life.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { for (const v of Object.values(m)) if (v && v.isTexture) v.dispose(); m.dispose(); }); }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
