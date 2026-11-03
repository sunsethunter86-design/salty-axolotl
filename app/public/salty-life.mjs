// Hackathon (Meta Llama): Salty's life in her tank, layered on her rig by salty-tank-3d.mjs (3 Nov).
//
// Shaun, 3 Nov: "give Salty the ability to swim around inside the tank, maybe have the zoom go out slightly
// while Salty is swimming around so I can see all of the tank ... She needs more movements and quirks so she
// isn't always in the same poses all day. Does she actually move her head and eat the bloodworms?"
// She didn't. Her swim paddled on the spot while she drifted a little sideways, and the worms were emoji that
// faded out by her mouth while she played a canned move. Now, all procedural on top of her rig's clips:
// - Tours: now and then she pushes off the sand and swims laps of the whole tank. She turns through facing
//   you, banks into her turns, rises and dips, passes along the glass, then comes home and settles somewhere
//   a little new. The tank pulls back to show all of it while she's out (onWide).
// - Feeding: real 3D bloodworms wriggle down from the surface. She watches the nearest one, leans in and snaps
//   it up (mouth open, worm sucked in, a gulp or two), one after another, then a happy wiggle.
// - Quirks in between: she looks around, tilts her head, turns to look at something, blows a bubble and
//   watches it rise, swishes her tail, flicks her gills, hiccups, yawns, peeks at the glass, swims up to gulp
//   air at the surface (real axolotls do), scoots to a new spot, winks or waves. Night (22:00-06:00) is
//   drowsier; when she's sulking she turns her back on you, when she's hungry she looks up for food.
// Anything he does (talks, types, taps) wins at once: she drops it, comes home and faces him.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const coin = () => (Math.random() < 0.5 ? -1 : 1);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
/** Eases 0 -> 1 over a..b and back to 0 over c..d (seconds). */
const env = (t, a, b, c, d) => smooth((t - a) / Math.max(1e-3, b - a)) * (1 - smooth((t - c) / Math.max(1e-3, d - c)));
/** A quick bump peaking at c, w seconds either side. */
const bump = (t, c, w) => smooth(1 - Math.abs(t - c) / w);
/** Frame-rate independent ease of `cur` toward `want`. */
const damp = (cur, want, rate, dt) => cur + (want - cur) * (1 - Math.exp(-rate * dt));
const isNight = () => { const h = new Date().getHours(); return h >= 22 || h < 6; };
/** An angle brought into -π..π. */
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** Whether turning from heading y by d sweeps past facing the glass (heading 0, give or take whole turns). */
const facesFront = (y, d) => Math.floor(Math.max(y, y + d) / TAU) * TAU >= Math.min(y, y + d);

/**
 * rig: { THREE, scene, camera, group, home (her pivot at rest, world), halfLength, bones: { neck, head, tail[],
 * gills[] }, mouthLocal (her mouth in her head bone's space), playLoop(name), playMood(name) -> seconds,
 * moodPlaying(), clip() -> name, clipSpeed(x), onWide(on, quick), view() -> { x, y } (how much of the tank the
 * screen shows, as NDC half-extents) }.
 * Call update(dt, { talking, mood, busy, rest }) after the mixer each frame: it places her group and turns her
 * bones, and leaves her face (mouth, smile, lids, blinks) in `out` for the caller to merge.
 */
export function createSaltyLife(rig) {
  const { THREE, scene, camera, group } = rig;
  const { Vector3, Quaternion } = THREE;
  const { neck, head } = rig.bones;
  const tail = rig.bones.tail || [], gills = rig.bones.gills || [];
  const home = rig.home.clone();
  const halfLen = rig.halfLength;
  const mouthLocal = rig.mouthLocal;

  // ---------- where she is ----------
  const pos = home.clone();
  let yaw = 0, pitch = 0, roll = 0, yawRate = 0, speed = 0, swimPose = 0;
  // Where she settles: a little different after every swim, so her resting pose isn't the same all day.
  const spot = { x: 0, yaw: 0 };
  const restPos = (into) => into.set(home.x + spot.x, home.y, home.z);
  let mode = "rest";   // rest | tour | eat
  let route = null, quirk = null, strike = null, bites = 0;
  let clock = 0, sinceQuirk = 0, nextQuirk = rand(3, 5), tourIn = rand(14, 22);
  let lastQuirk = "", ownMood = false, held = false, wasHeld = false;

  // What this frame asks of her body and face. Behaviours add into it; pose() and the face read it.
  const out = {
    look: new Vector3(), lookW: 0, tilt: 0, nod: 0, turn: 0, dYaw: 0, dPos: new Vector3(), tail: 0, tailHz: 2, gills: 0,
    mouth: { jaw_open: 0, jaw_round: 0, wide: 0, round: 0 }, keys: { smileL: 0, smileR: 0, frown: 0 }, keysW: 0,
    lids: 0, blink: false, fast: false,
  };
  function reset() {
    out.lookW = 0; out.tilt = 0; out.nod = 0; out.turn = 0; out.dYaw = 0; out.dPos.set(0, 0, 0); out.tail = 0; out.gills = 0;
    for (const k in out.mouth) out.mouth[k] = 0;
    for (const k in out.keys) out.keys[k] = 0;
    out.keysW = 0; out.lids = 0; out.blink = false; out.fast = false;
  }

  const tmpA = new Vector3(), tmpB = new Vector3(), tmpC = new Vector3(), fwd = new Vector3(0, 0, 1);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  /** The point at screen position (x, y in -1..1, +y up) of her tank, on the plane at depth z. */
  function worldAt(x, y, z, into = new Vector3()) {
    camera.updateMatrixWorld();
    ndc.set(x, y);
    ray.setFromCamera(ndc, camera);
    const r = ray.ray, k = (z - r.origin.z) / r.direction.z;
    return into.copy(r.direction).multiplyScalar(k).add(r.origin);
  }
  const view = () => rig.view?.() || { x: 1, y: 1 };
  // How far from the middle she may settle and still be wholly on screen (portrait crops the tank's sides).
  const maxSpot = () => clamp(view().x * worldAt(1, 0, 0, tmpC).x - 72, 0, 45);

  // ---------- bubbles she blows ----------
  const bubbleTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const fill = g.createRadialGradient(23, 21, 2, 32, 32, 30);
    fill.addColorStop(0, "rgba(255,255,255,.9)"); fill.addColorStop(.5, "rgba(255,255,255,.1)"); fill.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = fill; g.beginPath(); g.arc(32, 32, 30, 0, TAU); g.fill();
    g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = 2.5; g.beginPath(); g.arc(32, 32, 28.5, 0, TAU); g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const bubbles = [];
  function blowBubble(size = 5, from = null) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, depthWrite: false, opacity: 0.95 }));
    s.position.copy(from || tmpC.copy(mouthW).addScaledVector(faceDir, 3));
    s.scale.setScalar(size);
    scene.add(s);
    const b = { s, pos: s.position, t: 0, v: rand(34, 48), x0: s.position.x, wob: rand(0, TAU), size };
    bubbles.push(b);
    return b;
  }
  function updateBubbles(dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i], p = b.pos;
      b.t += dt;
      p.y += b.v * dt;
      p.x = b.x0 + Math.sin(b.t * 5 + b.wob) * 1.6;
      b.s.scale.setScalar(b.size * (1 + b.t * 0.08));
      if (p.y > worldAt(0, 1, p.z, tmpC).y - 3 || b.t > 4.5) b.s.material.opacity -= dt * 5;
      if (b.s.material.opacity <= 0) { scene.remove(b.s); b.s.material.dispose(); bubbles.splice(i, 1); }
    }
  }

  // ---------- bloodworms ----------
  // Thin, red, segmented and never still: a tube bent by a travelling wave every frame, with bursts of thrashing.
  const WORM_LEN = 22, WORM_R = 1.15;
  const wormMat = new THREE.MeshStandardMaterial({ color: 0xa8142c, roughness: 0.36, metalness: 0, emissive: 0x420612 });
  const worms = [];
  const flat = new Quaternion();
  function spawnWorm(delay, v) {
    const geo = new THREE.TubeGeometry(new THREE.LineCurve3(new Vector3(0, -WORM_LEN / 2, 0), new Vector3(0, WORM_LEN / 2, 0)), 22, WORM_R, 6, false);
    const p = geo.attributes.position;
    const base = new Float32Array(p.count * 3), us = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), u = clamp((y + WORM_LEN / 2) / WORM_LEN, 0, 1);
      const r = (0.3 + 0.7 * Math.sqrt(Math.sin(Math.PI * u))) * (1 + 0.1 * Math.sin(u * TAU * 11));   // tapered, faint rings
      base[i * 3] = p.getX(i) * r; base[i * 3 + 1] = y; base[i * 3 + 2] = p.getZ(i) * r;
      us[i] = u;
    }
    const mesh = new THREE.Mesh(geo, wormMat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    // In front of her face, inside what the screen shows of the tank, from just above its top: the surface.
    const z = rand(118, 140), x = rand(-0.7, 0.7) * v.x;
    const w = { mesh, geo, base, us, pos: worldAt(x, 1.12, z), floor: worldAt(x, -0.8, z).y, vy: rand(24, 31),
      ph: rand(0, TAU), rate: rand(5, 8), wt: 0, axis: new Vector3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).normalize(),
      spin: rand(-1.4, 1.4), delay, t: 0, state: "wait", k: 1 };
    mesh.position.copy(w.pos);
    mesh.quaternion.setFromAxisAngle(w.axis, rand(0, TAU));
    scene.add(mesh);
    worms.push(w);
  }
  function wriggle(w, dt) {
    w.wt += dt * w.rate;
    const a = w.geo.attributes.position.array, { base, us } = w;
    const amp = 1.4 + 2.4 * Math.abs(Math.sin(w.wt * 0.5 + w.ph));
    for (let i = 0; i < us.length; i++) {
      const u = us[i], ph = u * 7 - w.wt + w.ph, ends = 0.35 + 1.3 * Math.abs(u - 0.5);
      a[i * 3] = base[i * 3] + Math.sin(ph) * amp * ends;
      a[i * 3 + 1] = base[i * 3 + 1];
      a[i * 3 + 2] = base[i * 3 + 2] + Math.cos(ph * 0.7 + 1.3) * amp * 0.45;
    }
    w.geo.attributes.position.needsUpdate = true;
    w.geo.computeVertexNormals();
  }
  function dropWorm(w) { scene.remove(w.mesh); w.geo.dispose(); w.state = "gone"; }
  function updateWorms(dt) {
    for (let i = worms.length - 1; i >= 0; i--) {
      const w = worms[i];
      w.t += dt;
      if (w.state === "wait") { if (w.t < w.delay) continue; w.state = "fall"; w.mesh.visible = true; }
      if (w.state === "fall") {
        w.pos.y -= w.vy * dt;
        w.pos.x += Math.sin(w.t * 1.7 + w.ph) * 4 * dt;
        w.mesh.rotateOnWorldAxis(w.axis, w.spin * dt);
        if (w.pos.y <= w.floor) { w.pos.y = w.floor; w.state = "sand"; w.sandT = 0; flat.setFromAxisAngle(tmpA.set(0, 0, 1), Math.PI / 2 + rand(-0.5, 0.5)); }
      } else if (w.state === "sand") {
        // Lies on the sand, still wriggling; if she never gets to it, it burrows away.
        w.sandT += dt;
        w.mesh.quaternion.slerp(flat, 1 - Math.exp(-3 * dt));
        if (w.sandT > 12) w.state = "burrow";
      } else if (w.state === "caught") {
        // Sucked into her mouth.
        w.ct += dt;
        const k = smooth(w.ct / 0.12);
        w.pos.lerpVectors(w.from, tmpA.copy(mouthW).addScaledVector(faceDir, -6), k);
        w.k = 1 - 0.8 * k;
        if (w.ct > 0.13) dropWorm(w);
      } else if (w.state === "burrow") {
        w.k -= dt * 1.5;
        if (w.k <= 0) dropWorm(w);
      }
      if (w.state === "gone") { worms.splice(i, 1); continue; }
      w.mesh.position.copy(w.pos);
      w.mesh.scale.setScalar(Math.max(0.05, w.k));
      wriggle(w, dt);
    }
  }
  const hungryWorm = (w) => w.state === "wait" || w.state === "fall" || w.state === "sand";
  // ☠️ The first feed on the phone hitched one frame (50 ms): the worm and bubble shaders compiled on first
  // use. Compiled here at load instead, with one of each put in the scene just long enough.
  {
    const geo = new THREE.TubeGeometry(new THREE.LineCurve3(new Vector3(0, -1, 0), new Vector3(0, 1, 0)), 2, 1, 6, false);
    const w = new THREE.Mesh(geo, wormMat), b = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, depthWrite: false }));
    scene.add(w, b);
    try { rig.compile?.(); } catch { /* only a warm-up */ }
    scene.remove(w, b); geo.dispose(); b.material.dispose();
  }

  // ---------- feeding: she eats them, one by one ----------
  function feed(n = 6) {
    const v = view();
    for (let i = 0; i < n; i++) spawnWorm(0.15 + i * rand(0.4, 0.55), v);
    // Out swimming: she hurries home first, and eats once she's there (update() turns rest into dinner).
    if (mode === "tour") { goHome(true); return true; }
    endQuirk();
    if (!rig.moodPlaying()) rig.playLoop("idle");
    if (mode !== "eat") { mode = "eat"; strike = null; bites = 0; }
    return true;
  }
  function updateEat(dt) {
    yaw = damp(wrap(yaw), 0, 3, dt); pitch = damp(pitch, 0, 3, dt); roll = damp(roll, 0, 4, dt); yawRate = 0;
    swimPose = damp(swimPose, 0, 3, dt);
    restPos(tmpA);
    // He's talking to her: dinner waits (the worms keep sinking), she faces him.
    if (held) { strike = null; settle(dt, tmpA, 3); return; }
    if (strike) { runStrike(dt); return; }
    let best = null, bestD = Infinity;
    for (const w of worms) {
      if (w.state !== "fall" && w.state !== "sand") continue;
      if (w.pos.y > worldAt(0, 0.92, w.pos.z, tmpC).y) continue;   // still up at the surface
      const d = w.pos.distanceTo(mouthW);
      if (d < bestD) { bestD = d; best = w; }
    }
    if (!best) {
      const next = worms.find((w) => w.state === "fall" || w.state === "wait");
      if (!next) { finishMeal(); return; }
      // Looking up for what's coming down.
      out.look.copy(next.state === "fall" ? next.pos : worldAt(0, 1, 125, tmpC)); out.lookW = 0.85;
      settle(dt, tmpA, 2);
      return;
    }
    out.look.copy(best.pos); out.lookW = 1; out.fast = true;
    // Once it has sunk to her level she leans in, whole body, so her mouth meets it.
    if (best.pos.y < mouthW.y + 30) {
      tmpB.copy(pos).add(tmpC.subVectors(best.pos, mouthW)).sub(tmpA).clampLength(0, 75).add(tmpA);
      tmpB.y = Math.max(tmpB.y, tmpA.y - 55);
      settle(dt, tmpB, 5);
    } else settle(dt, tmpA, 2);
    best.chase = (best.chase || 0) + dt;
    // Axolotls feed by suction: close is close enough, and after a while she just goes for it.
    if (bestD < 14 || (bestD < 26 && best.chase > 2.5)) strike = { w: best, t: 0 };
  }
  function runStrike(dt) {
    const s = strike, t = (s.t += dt);
    out.fast = true;
    out.look.copy(s.w.state === "caught" || s.w.state === "gone" ? tmpC.copy(mouthW).addScaledVector(faceDir, 30) : s.w.pos);
    out.lookW = 1 - 0.5 * smooth((t - 0.25) / 0.5);
    const open = smooth(t / 0.06) * (1 - smooth((t - 0.13) / 0.12));
    const gulp = bump(t, 0.42, 0.08) + bump(t, 0.62, 0.08);
    out.mouth.jaw_open = Math.max(open, 0.24 * gulp);
    out.mouth.round = 0.3 * open;
    out.mouth.jaw_round = 0.2 * open;
    if (t > 0.04 && s.w.state !== "caught" && s.w.state !== "gone") { s.w.state = "caught"; s.w.ct = 0; s.w.from = s.w.pos.clone(); }
    out.dPos.addScaledVector(faceDir, 7 * bump(t, 0.08, 0.08));   // a little snap forward
    out.nod += 0.08 * gulp;                                       // and a gulp or two
    const yum = env(t, 0.25, 0.4, 0.75, 0.95);
    out.keys.smileL = out.keys.smileR = 0.75; out.keysW = yum; out.lids = 0.32 * yum; out.gills = 0.15 * yum;
    settle(dt, restPos(tmpA), 0.6);
    if (t > 0.95) { strike = null; bites++; }
  }
  function finishMeal() {
    for (const w of [...worms]) dropWorm(w);
    worms.length = 0;
    mode = "rest";
    tourIn = Math.max(tourIn, rand(25, 40));
    if (bites) startQuirk("wiggle", true);   // a happy wiggle after dinner
    bites = 0;
  }

  // ---------- tours: laps of the tank, or up to the surface for air ----------
  function startTour(kind = "laps") {
    if (mode !== "rest") return false;
    endQuirk();
    mode = "tour"; speed = 12; yawRate = 0;
    rig.playLoop("swim");
    const side = coin();
    if (kind === "surface") {
      // Up for a gulp of air a little to one side, then she lets herself sink back down (updateTour "rise").
      route = { kind, stage: "rise", st: 0, surf: worldAt(side * rand(0, 0.12), 0.8, 110), quick: false, landing: false, idle: false };
      return true;
    }
    const pts = [worldAt(side * 0.3, rand(-0.1, 0.15), rand(-30, 0))];   // push off to one side
    let sx = side;
    for (let i = 0, laps = Math.random() < 0.55 ? 2 : 3; i < laps; i++) {
      // Mid-tank: further back she reads as a speck in the wide shot.
      const z = rand(-170, -70);
      // Far enough in that her whole length still fits when she turns at the end.
      const halfW = worldAt(1, 0, z, tmpC).x;
      pts.push(worldAt(sx * clamp(rand(0.36, 0.5), 0, (halfW - halfLen * 0.95) / halfW), rand(-0.3, 0.45), z));
      sx = -sx;
    }
    // Sometimes a pass along the glass on the way home.
    if (Math.random() < 0.6) pts.push(worldAt(sx * rand(0.15, 0.35), rand(0.05, 0.4), rand(-30, 30)));
    route = { kind, pts, i: 0, legT: 0, stage: "swim", st: 0, quick: false, landing: false, idle: false, cruise: rand(80, 100) };
    rig.onWide?.(true, false);
    return true;
  }
  /** Swims along her heading, turning toward `target`; she slows into tight turns. */
  function steer(dt, target, cruise) {
    tmpA.subVectors(target, pos);
    // ☠️ SHE ORBITED THE CAMERA (3 Nov, first test). With her heading clamped short of tail-first, a point
    // right behind her flipped from one side to the other as she moved, so she turned back and forth
    // through facing you and circled out through the glass. The shortest turn, always; only when she has
    // to turn right round does she pick the way that faces you on the way past.
    let d = wrap(Math.atan2(tmpA.x, tmpA.z) - yaw);
    if (Math.abs(d) > 2.4) { const alt = d - Math.sign(d) * TAU; if (facesFront(yaw, alt) && !facesFront(yaw, d)) d = alt; }
    const wantPitch = clamp(Math.atan2(tmpA.y, Math.max(Math.hypot(tmpA.x, tmpA.z), 1)), -0.6, 0.7);
    yawRate = damp(yawRate, clamp(d * 2.4, -1.7, 1.7), 5, dt);
    yaw += yawRate * dt;
    pitch = damp(pitch, wantPitch, 2.2, dt);
    roll = damp(roll, clamp(-yawRate * 0.32, -0.42, 0.42), 3, dt);   // banks into her turns
    speed = damp(speed, cruise * (1 - 0.55 * Math.min(1, Math.abs(d) / Math.PI)), 1.2, dt);
    fwd.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    pos.addScaledVector(fwd, speed * dt);
    return tmpA.length();
  }
  function settle(dt, at, rate) {
    pos.x = damp(pos.x, at.x, rate, dt); pos.y = damp(pos.y, at.y, rate, dt); pos.z = damp(pos.z, at.z, rate, dt);
  }
  function newSpot() {
    const m = maxSpot();
    spot.x = rand(-m, m);
    spot.yaw = rand(-0.22, 0.22);
  }
  function goHome(quick) {
    const r = route;
    if (mode !== "tour" || !r) return;
    if (r.stage === "home" && (r.quick || !quick)) return;
    if (r.stage === "sink" && !quick) return;
    r.stage = "home"; r.quick = quick; r.landing = false;
    if (!quick) newSpot();
    rig.onWide?.(false, quick);
  }
  function endTour() {
    mode = "rest"; route = null; speed = 0; yawRate = 0;
    rig.clipSpeed?.(1);
    tourIn = isNight() ? rand(50, 80) : rand(35, 60);
    sinceQuirk = 0; nextQuirk = rand(1.5, 3);
  }
  function updateTour(dt) {
    const r = route;
    rig.clipSpeed?.(r.stage === "swim" || (r.stage === "home" && !r.landing) ? 0.7 + speed / 150 : 1);
    if (r.stage === "swim") {
      swimPose = damp(swimPose, 1, 2, dt);
      r.legT += dt;
      const d = steer(dt, r.pts[r.i], r.cruise);
      // A bubble now and then from her gills as she goes.
      if (Math.random() < dt * 0.3 && gills.length) blowBubble(rand(2.2, 3.6), tmpB.setFromMatrixPosition(gills[Math.floor(Math.random() * gills.length)].matrixWorld));
      if (d < 55 || (d < 110 && r.legT > 6) || r.legT > 10) {
        r.i++; r.legT = 0;
        if (r.i >= r.pts.length) goHome(false);
      }
    } else if (r.stage === "rise") {
      // Straight up for air, facing you, nose first. ☠️ Steering her heading at the point her mouth should
      // reach sent her circling out towards the glass: that point is nearer than her own length, and every
      // turn moved her mouth. Her middle simply follows where it must be for her mouth to break the surface.
      r.st += dt;
      swimPose = damp(swimPose, 0.6, 2, dt);
      yaw = damp(wrap(yaw), 0, 3, dt); pitch = damp(pitch, 0.4, 2.5, dt); roll = damp(roll, 0, 3, dt); yawRate = 0;
      tmpB.subVectors(r.surf, mouthW);
      pos.addScaledVector(tmpB, Math.min(1, (25 + 45 * smooth(r.st / 0.8)) * dt / Math.max(tmpB.length(), 1e-3)));
      if (tmpB.length() < 10 || r.st > 5) { r.stage = "gulp"; r.st = 0; }
    } else if (r.stage === "gulp") {
      // At the surface: a gulp of air, a few bubbles, then she lets go.
      r.st += dt;
      speed = damp(speed, 0, 4, dt);
      pos.addScaledVector(fwd, speed * dt);
      pitch = damp(pitch, 0.4, 3, dt); roll = damp(roll, 0, 3, dt); yaw = damp(wrap(yaw), 0, 1.5, dt); yawRate = 0;
      out.mouth.jaw_open = 0.65 * bump(r.st, 0.35, 0.18);
      out.mouth.round = 0.4 * bump(r.st, 0.35, 0.18);
      out.fast = true;
      if (!r.puffed && r.st > 0.5) { r.puffed = true; for (let i = 0; i < 3; i++) blowBubble(rand(2.6, 4.6), tmpB.copy(mouthW).add(tmpC.set(rand(-5, 5), rand(-3, 3), 0))); }
      if (r.st > 1.0) { r.stage = "sink"; r.st = 0; rig.playLoop("idle"); }
    } else if (r.stage === "sink") {
      // She drifts back down, legs out, swaying a little.
      r.st += dt;
      restPos(tmpB);
      pos.y = Math.max(tmpB.y, pos.y - (12 + 12 * smooth(r.st / 2)) * dt);
      pos.x = damp(pos.x, tmpB.x, 0.8, dt); pos.z = damp(pos.z, tmpB.z, 0.8, dt);
      out.dPos.x += Math.sin(r.st * 1.6) * 4 * Math.min(1, r.st);
      pitch = damp(pitch, 0, 1.2, dt); roll = damp(roll, Math.sin(r.st * 1.6) * 0.06, 2, dt); yaw = damp(wrap(yaw), spot.yaw, 1.2, dt);
      swimPose = damp(swimPose, 0, 1.5, dt);
      if (pos.y <= tmpB.y + 0.5) { r.stage = "home"; r.landing = true; r.idle = true; }
    } else {
      // Home: swim to just above and in front of her spot, so she arrives facing you, then land.
      restPos(tmpB);
      const d = pos.distanceTo(tmpB);
      if (!r.landing && d > 75) {
        if (!rig.moodPlaying()) rig.playLoop("swim");
        swimPose = damp(swimPose, 1, 2, dt);
        steer(dt, tmpC.copy(tmpB).add(tmpA.set(0, 30, 25)), r.quick ? 150 : 85);
      } else {
        r.landing = true;
        settle(dt, tmpB, r.quick ? 4 : 2.6);
        const yawTo = held ? 0 : spot.yaw;
        yaw = damp(wrap(yaw), yawTo, 3, dt); pitch = damp(pitch, 0, 3, dt); roll = damp(roll, 0, 3, dt); yawRate = 0;
        swimPose = damp(swimPose, 0, 2.5, dt);
        if (!r.idle && d < 45) { r.idle = true; if (!rig.moodPlaying()) rig.playLoop("idle"); }
        if (d < 2 && Math.abs(yaw - yawTo) < 0.05) endTour();
      }
    }
  }

  // ---------- at rest, and her quirks ----------
  function updateRest(dt, s) {
    settle(dt, restPos(tmpA), 2.5);
    yaw = damp(wrap(yaw), held ? 0 : spot.yaw, 2.5, dt); pitch = damp(pitch, 0, 3, dt); roll = damp(roll, 0, 3, dt); yawRate = 0;
    swimPose = damp(swimPose, 0, 3, dt);
    // He's with her: she looks at him (not during a move like think, whose head turn is the point of it).
    if (held && !s.mood) { out.look.copy(camera.position); out.lookW = 0.45; }
  }

  function lookSpot() {
    const r = Math.random();
    if (r < 0.24) return worldAt(rand(-0.95, -0.55), rand(-0.2, 0.5), rand(-260, -120));   // the reef
    if (r < 0.44) return worldAt(rand(0.55, 0.95), rand(-0.3, 0.3), rand(-260, -120));     // open water
    if (r < 0.58) return worldAt(0.18, 0.58, -320);                                         // the clownfish
    if (r < 0.74) return worldAt(rand(-0.4, 0.4), 0.95, rand(110, 160));                    // up at the surface
    if (r < 0.88) return worldAt(rand(-0.5, 0.5), -0.9, rand(120, 170));                    // the sand in front
    return camera.position.clone();                                                          // you
  }

  // Each quirk: dur(q) in seconds, optional init(q)/end(q), run(q, t, out, k) where k fades it out when he
  // interrupts. `mood` plays one of her rig's moves instead; `tour` is a short swim.
  const QUIRKS = {
    look: { dur: () => rand(2.4, 4), init(q) { q.at = lookSpot(); },
      run(q, t, o, k) { o.look.copy(q.at); o.lookW = 0.95 * k * env(t, 0, 0.5, q.dur - 0.6, q.dur); if (t < 0.05) o.blink = true; } },
    notice: { dur: () => 2.8,   // looks right at you, smiles, a slow blink
      run(q, t, o, k) { const e = k * env(t, 0, 0.4, 2.2, 2.8); o.look.copy(camera.position); o.lookW = 0.9 * e;
        o.keys.smileL = o.keys.smileR = 0.7; o.keysW = e; o.lids = 0.9 * bump(t, 1.3, 0.3) * k; o.gills = 0.12 * e; } },
    tilt: { dur: () => rand(2, 2.8),   // a curious head tilt, "hm?"
      run(q, t, o, k) { const e = k * env(t, 0, 0.45, q.dur - 0.5, q.dur); o.tilt = q.side * 0.32 * e; o.mouth.round = 0.3 * e;
        o.look.copy(camera.position); o.lookW = 0.5 * e; } },
    turn: { dur: () => rand(4, 6), init(q) { q.at = worldAt(q.side * 0.95, rand(-0.2, 0.4), rand(-60, 40)); },   // turns to look at something
      run(q, t, o, k) { const e = k * env(t, 0, 1.1, q.dur - 1.1, q.dur); o.dYaw = q.side * 0.45 * e; o.look.copy(q.at); o.lookW = 0.6 * e; if (t < 0.05) o.blink = true; } },
    bubble: { dur: () => 3.4,   // blows a bubble and watches it float up
      run(q, t, o, k) { o.mouth.round = 0.95 * k * env(t, 0.15, 0.45, 0.75, 0.95); o.mouth.jaw_round = 0.25 * k * env(t, 0.15, 0.45, 0.75, 0.95);
        if (!q.b1 && t > 0.7) q.b1 = blowBubble(rand(9, 11));
        if (q.two && !q.b2 && t > 0.95) q.b2 = blowBubble(rand(5, 6.5));
        if (q.b1) { o.look.copy(q.b1.pos); o.lookW = 0.7 * k * env(t, 0.9, 1.3, 2.7, 3.4); } } },
    tail: { dur: () => 1.8, run(q, t, o, k) { o.tail = 0.17 * k * env(t, 0, 0.3, 1.3, 1.8); o.tailHz = 2.4; } },
    gills: { dur: () => 1.5,   // a quick shiver of her gills, then they perk up
      run(q, t, o, k) { o.gills = k * (0.3 * Math.sin(t * 30) * env(t, 0, 0.08, 0.7, 0.95) + 0.25 * bump(t, 1.15, 0.3)); } },
    hiccup: { dur: () => 2.4, fast: true,
      run(q, t, o, k) { const h = bump(t, 0.25, 0.09) + (q.two ? bump(t, 1.35, 0.09) : 0);
        o.dPos.y += 6 * h * k; o.lids = Math.max(o.lids, 0.9 * h * k); o.mouth.jaw_open = 0.2 * h * k; o.nod -= 0.07 * h * k;
        if (!q.b && t > 0.27) q.b = blowBubble(2.8); } },
    yawn: { dur: () => 3.4,
      run(q, t, o, k) { const e = k * env(t, 0.2, 1.2, 1.9, 2.7); o.mouth.jaw_open = e; o.mouth.jaw_round = 0.4 * e;
        o.lids = 0.65 * e; o.nod = -0.22 * e; o.tilt = q.side * 0.08 * e; o.gills = -0.12 * e; if (t > 2.8 && !q.bl) { q.bl = true; o.blink = true; } } },
    peek: { dur: () => 4.6, fast: true,   // comes right up to the glass to look at you, a little boop, then back
      run(q, t, o, k) { const e = k * env(t, 0, 1.3, 3.2, 4.6); o.dPos.z += (50 * e - 6 * bump(t, 1.45, 0.12)) * k; o.dPos.y += 6 * e;
        o.look.copy(camera.position); o.lookW = 0.9 * e; o.keys.smileL = o.keys.smileR = 0.8; o.keysW = e; o.gills = 0.12 * e; } },
    surface: { tour: "surface" },
    scoot: { dur: () => 2.6,   // a little swim to a new spot on the sand
      init(q) { const m = maxSpot(); let x = clamp(spot.x + q.side * rand(14, 26), -m, m);
        if (Math.abs(x - spot.x) < 8) x = clamp(spot.x - q.side * rand(14, 26), -m, m);
        q.dx = x - spot.x; spot.x = x; },
      run(q, t, o, k) { o.dYaw = Math.sign(q.dx) * 0.5 * k * env(t, 0, 0.5, 1.6, 2.4); o.dPos.y += 8 * k * env(t, 0.1, 0.6, 1.3, 1.9);
        if (!q.sw && t > 0.15) { q.sw = true; rig.playLoop("swim"); }
        if (q.sw && !q.id && t > 1.5) { q.id = true; rig.playLoop("idle"); } },
      end(q) { if (q.sw && !q.id && !rig.moodPlaying()) rig.playLoop("idle"); } },
    wiggle: { dur: () => 2.2,   // the happy loop, with a big smile
      run(q, t, o, k) { if (!q.on) { q.on = true; rig.playLoop("happy"); } const e = k * env(t, 0, 0.3, 1.8, 2.2);
        o.keys.smileL = o.keys.smileR = 1; o.keysW = e; o.lids = 0.3 * e; o.gills = 0.15 * e; },
      end() { if (!rig.moodPlaying()) rig.playLoop("idle"); } },
    full: { dur: () => 1.8,   // "no more": a shake of the head and a pout
      run(q, t, o, k) { const e = k * env(t, 0, 0.25, 1.3, 1.8); o.turn = 0.22 * Math.sin(t * 13) * e; o.mouth.round = 0.6 * e;
        o.keys.frown = 0.45; o.keysW = e; o.lids = 0.3 * e; } },
    wink: { mood: "wink" }, wave: { mood: "wave" }, ponder: { mood: "think" }, sleepy: { mood: "sleepy" },
    doze: { dur: () => rand(7, 10),   // nods off, then startles awake
      run(q, t, o, k) { const e = k * env(t, 0, 2.5, q.dur - 0.6, q.dur - 0.3); o.lids = 0.88 * e; o.nod = 0.14 * e; o.gills = -0.18 * e;
        if (t > q.dur - 0.3 && !q.b) { q.b = true; o.blink = true; } } },
    huff: { dur: () => rand(6, 8), init(q) { q.away = worldAt(q.side * 0.95, rand(0, 0.3), -150); },   // sulking: turns her back on you
      run(q, t, o, k) { const e = k * env(t, 0, 1, q.dur - 1, q.dur), glance = env(t, q.dur * 0.45, q.dur * 0.5, q.dur * 0.62, q.dur * 0.68);
        o.dYaw = q.side * 0.7 * e * (1 - 0.6 * glance); o.look.copy(glance > 0.05 ? camera.position : q.away); o.lookW = 0.8 * e;
        o.keys.frown = 0.7; o.keysW = e; o.lids = 0.35 * e; o.gills = -0.2 * e; } },
    beg: { dur: () => 3.2, init(q) { q.at = worldAt(rand(-0.2, 0.2), 0.95, 150); },   // hungry: looks up to where food comes from
      run(q, t, o, k) { const e = k * env(t, 0, 0.6, 2.5, 3.2); o.look.copy(q.at); o.lookW = 0.9 * e; o.dPos.y += 10 * e;
        o.mouth.jaw_open = 0.2 * (bump(t, 1.2, 0.12) + bump(t, 1.6, 0.12)) * k; } },
    smack: { dur: () => 1.6,   // hungry: smacks her lips at you
      run(q, t, o, k) { const m = bump(t, 0.4, 0.12) + bump(t, 0.75, 0.12) + bump(t, 1.1, 0.12);
        o.mouth.jaw_open = 0.3 * m * k; o.mouth.round = 0.3 * m * k; o.look.copy(camera.position); o.lookW = 0.5 * k * env(t, 0, 0.3, 1.2, 1.6); } },
  };

  function chooseQuirk(rest) {
    const w = { look: 20, notice: 9, tilt: 10, turn: 8, bubble: 9, tail: 7, gills: 7, hiccup: 4, yawn: 4, peek: 5, surface: 4,
      scoot: maxSpot() > 10 ? 6 : 0, wiggle: 4, wink: 3, wave: 2, ponder: 2, doze: 0, sleepy: 0, huff: 0, beg: 0, smack: 0 };
    if (isNight()) Object.assign(w, { yawn: 10, doze: 8, sleepy: 3, peek: 2, wave: 0, wiggle: 2, surface: 3, scoot: Math.min(w.scoot, 3), notice: 6 });
    if (rest === "sulk") Object.assign(w, { huff: 30, notice: 0, wave: 0, wink: 0, wiggle: 0, peek: 0 });
    else if (rest === "hungry") Object.assign(w, { beg: 16, smack: 10, surface: 10 });
    w[lastQuirk] = 0;
    let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return "look";
  }
  function startQuirk(name, force = false) {
    const def = QUIRKS[name];
    if (!def || (!force && mode !== "rest")) return false;
    endQuirk();
    lastQuirk = name;
    if (def.tour) return startTour(def.tour);
    if (def.mood) {
      if (rig.playMood(def.mood)) ownMood = true;
      sinceQuirk = 0; nextQuirk = rand(5, 9);
      return true;
    }
    quirk = { name, def, t: 0, k: 1, fading: false, side: coin(), two: Math.random() < 0.45 };
    quirk.dur = def.dur(quirk);
    def.init?.(quirk);
    return true;
  }
  function endQuirk() {
    if (!quirk) return;
    quirk.def.end?.(quirk);
    quirk = null;
    sinceQuirk = 0; nextQuirk = isNight() ? rand(5, 11) : rand(4, 9);
  }
  function runQuirk(dt) {
    const q = quirk;
    q.t += dt;
    if (q.fading) q.k = damp(q.k, 0, 9, dt);
    q.def.run(q, q.t, out, q.k);
    if (q.def.fast) out.fast = true;
    if (q.t >= q.dur || q.k < 0.02) endQuirk();
  }

  // ---------- her body: the group, then her bones on top of the clip ----------
  const qW = new Quaternion(), qT = new Quaternion(), qL = new Quaternion(), pq = new Quaternion();
  const axis = new Vector3(), pp = new Vector3(), ps = new Vector3(), want = new Vector3(), gp = new Vector3();
  const headP = new Vector3(), mouthW = new Vector3(), faceDir = new Vector3(0, 0, 1), lookAt = new Vector3();
  let lookW = 0, lookSet = false;
  /** Turns a bone by a world-space rotation about its own joint (after the mixer has posed it). */
  function rotateWorld(bone, q) {
    bone.parent.matrixWorld.decompose(pp, pq, ps);
    qW.copy(pq).invert().multiply(q).multiply(pq);
    bone.quaternion.premultiply(qW);
    bone.updateMatrixWorld(true);
  }
  function measureFace() {
    if (!head) return;
    headP.setFromMatrixPosition(head.matrixWorld);
    if (mouthLocal) mouthW.copy(mouthLocal).applyMatrix4(head.matrixWorld);
    else mouthW.copy(headP).add(tmpC.set(0, 0, 50).applyQuaternion(group.quaternion));
    faceDir.subVectors(mouthW, headP).normalize();
  }
  // ☠️ LOOKING UP AT FOOD SHE SHOWED ONLY HER THROAT (3 Nov). Her face is a big disc seen from a little
  // above: tipped up more than a quarter-turn it faces the ceiling. Up is held to ~24°, down and round
  // further; her body rises to meet a worm above her instead.
  const gInv = new Quaternion(), aimPt = new Vector3();
  function reachableLook() {
    measureFace();
    gInv.copy(group.quaternion).invert();
    want.subVectors(lookAt, headP);
    const dist = Math.max(want.length(), 30);
    want.applyQuaternion(gInv).normalize();          // in her own frame, where she faces +z
    tmpC.copy(faceDir).applyQuaternion(gInv);        // her face now, same frame
    const e0 = Math.asin(clamp(tmpC.y, -1, 1)), a0 = Math.atan2(tmpC.x, tmpC.z);
    const e = clamp(Math.asin(clamp(want.y, -1, 1)), e0 - 0.6, e0 + 0.42);
    const a = a0 + clamp(wrap(Math.atan2(want.x, want.z) - a0), -1.15, 1.15);
    want.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)).applyQuaternion(group.quaternion);
    return aimPt.copy(headP).addScaledVector(want, dist);
  }
  /** Aims her face at `at`: `share` of the way from this bone, never more than maxAng radians. */
  function aim(bone, at, share, maxAng) {
    measureFace();
    want.subVectors(at, headP).normalize();
    qT.setFromUnitVectors(faceDir, want);
    const ang = 2 * Math.acos(clamp(qT.w, -1, 1));
    if (ang < 1e-4) return;
    qL.identity().slerp(qT, Math.min(ang * share, maxAng) * lookW / ang);
    rotateWorld(bone, qL);
  }
  function pose(dt) {
    group.position.copy(pos).add(out.dPos);
    // Swimming she levels out (nose down a little); pitch is nose up.
    group.rotation.set(-pitch + 0.3 * swimPose, yaw + out.dYaw, roll, "YXZ");
    group.updateMatrixWorld(true);
    if (!head) return;
    const lw = out.lookW;
    lookW = damp(lookW, lw, lw > lookW ? 6 : 3.5, dt);
    if (lw > 0) {
      if (!lookSet) { lookAt.copy(out.look); lookSet = true; }
      lookAt.lerp(out.look, 1 - Math.exp(-(mode === "eat" ? 14 : 5) * dt));
    }
    if (lookW > 0.005) { const at = reachableLook(); if (neck) aim(neck, at, 0.4, 0.4); aim(head, at, 1, 0.65); }
    if (out.nod) rotateWorld(head, qL.setFromAxisAngle(axis.set(1, 0, 0).applyQuaternion(group.quaternion), out.nod));
    if (out.turn) rotateWorld(head, qL.setFromAxisAngle(axis.set(0, 1, 0).applyQuaternion(group.quaternion), out.turn));
    if (out.tilt) { measureFace(); rotateWorld(head, qL.setFromAxisAngle(faceDir, out.tilt)); }
    if (out.tail) {
      axis.set(0, 1, 0).applyQuaternion(group.quaternion);
      tail.forEach((b, i) => rotateWorld(b, qL.setFromAxisAngle(axis, out.tail * Math.sin(clock * TAU * out.tailHz - i * 0.75))));
    }
    if (out.gills) {
      // About the way her face points, mirrored side to side: + perks her gills up, - droops them. (Swung
      // forward and back instead, as first tried, they barely moved from where you look at her.)
      measureFace();
      axis.set(1, 0, 0).applyQuaternion(group.quaternion);
      for (const g of gills) {
        gp.setFromMatrixPosition(g.matrixWorld).sub(headP);
        rotateWorld(g, qL.setFromAxisAngle(faceDir, (Math.sign(gp.dot(axis)) || 1) * out.gills));
      }
    }
    measureFace();
  }

  function update(dt, s) {
    clock += dt;
    reset();
    if (!s.mood) ownMood = false;
    held = Boolean(s.busy || s.talking || (s.mood && !ownMood));
    if (held) {
      if (mode === "tour") goHome(true);
      if (quirk) quirk.fading = true;
      if (!wasHeld) tourIn = Math.max(tourIn, rand(25, 40));
      sinceQuirk = 0;
    } else if (mode === "rest" && !s.mood) {
      tourIn -= dt; sinceQuirk += dt;
      if (worms.some(hungryWorm)) { endQuirk(); mode = "eat"; }   // she finishes her dinner after he's done talking
      else if (!quirk && tourIn <= 0) startTour();
      else if (!quirk && sinceQuirk > nextQuirk) startQuirk(chooseQuirk(s.rest));
    }
    wasHeld = held;
    if (mode === "tour") updateTour(dt);
    else if (mode === "eat") updateEat(dt);
    else updateRest(dt, s);
    if (quirk) runQuirk(dt);
    pose(dt);
    updateWorms(dt);
    updateBubbles(dt);
  }

  return {
    update,
    feed,
    /** Her face this frame: mouth shapes, smile/frown (keysW), extra lid closing, and whether to blink now. */
    out,
    /** True while she moves fast enough to want 60 fps (snapping up worms, hiccups, peeks). */
    get fast() { return out.fast; },
    /** He tapped her: whatever she's up to, she comes home to him. */
    poke() { if (mode === "tour") goHome(true); if (quirk) quirk.fading = true; },
    // Test hooks (phone checks and video retakes over CDP).
    swim: () => startTour("laps"),
    quirk: (name) => startQuirk(name),
    /** No swims for this many seconds (a take that needs her in close-up). */
    calm: (secs) => { tourIn = Math.max(tourIn, secs); return true; },
    quirks: () => Object.keys(QUIRKS),
    state: () => ({ mode, quirk: quirk?.name || null, stage: route?.stage || null, worms: worms.length, tourIn: Math.round(tourIn), spot: { ...spot },
      at: pos.toArray().map(Math.round), home: home.toArray().map(Math.round), yaw: +yaw.toFixed(2), pitch: +pitch.toFixed(2), speed: Math.round(speed),
      mouth: mouthW.toArray().map(Math.round), strike: strike ? +strike.t.toFixed(2) : null,
      wormsAt: worms.map((w) => `${w.state}:${w.pos.toArray().map(Math.round).join(",")}`) }),
    dispose() {
      for (const w of [...worms]) dropWorm(w);
      worms.length = 0;
      for (const b of bubbles) { scene.remove(b.s); b.s.material.dispose(); }
      bubbles.length = 0;
      wormMat.dispose(); bubbleTex.dispose();
    },
  };
}
