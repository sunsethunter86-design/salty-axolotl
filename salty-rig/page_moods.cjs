// Adds her moods to the 3D page template (after page_face.cjs): one-shot moves with her face timed to
// them (from the Gemini prompts/clips), a one-eye wink, and "swim around" (a figure-eight round the
// stage, turning to face where she goes, banking into turns). Then rebuilds the page via page_face.cjs.
// usage: node page_moods.cjs <page dir>
const fs = require("fs"), path = require("path"), cp = require("child_process");
const P = process.argv[2];
const T = path.join(P, "salty-3d-anim.html");
let s = fs.readFileSync(T, "utf8");
const rep = (a, b) => { if (!s.includes(a)) throw new Error("missing: " + a.slice(0, 80)); s = s.replace(a, b); };

if (!s.includes('data-mood="wave"')) {
  rep(`        <button data-move="happy" aria-pressed="false">Happy</button>
      </div>`, `        <button data-move="happy" aria-pressed="false">Happy</button>
        <button id="roam" aria-pressed="false">Swim around</button>
      </div>
      <div class="controls moves" role="group" aria-label="Moods">
        <span class="label">Moods</span>
        <button data-mood="wave">Wave</button>
        <button data-mood="think">Think</button>
        <button data-mood="sympathy">Sympathy</button>
        <button data-mood="outrage">Outrage</button>
        <button data-mood="celebrate">Celebrate</button>
        <button data-mood="sleepy">Sleepy</button>
        <button data-mood="wink">Wink</button>
      </div>`);
  rep(`        <dt>Face</dt>`, `        <dt>Moods</dt><dd>Wave, think, sympathy, outrage, celebrate, sleepy, wink; swims around</dd>
        <dt>Face</dt>`);
  // eyes remember which side they are (for the wink)
  rep(`    eyes.push({ lid, lash, rl:`, `    eyes.push({ key, lid, lash, rl:`);
  // moods: face keyframes over each one-shot move (t = 0..1 of the move). A key is
  // [t, face, lids] where face is an EXPR name or shape weights, lids a number or {"+X": a, "-X": b}.
  rep(`let expr = "neutral", exprT = 0;`, `let expr = "neutral", exprT = 0;
const MOODS = {
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
let mood = null;   // {name, t, dur}`);
  rep(`for (const b of document.querySelectorAll("[data-face]")) b.addEventListener("click", () => {`,
`function startMood(name) {
  const act = moves[name]; if (!act) return;
  stopRoam();
  act.reset(); act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.setEffectiveWeight(1).play();
  if (current && current !== act) current.crossFadeTo(act, 0.3, false);
  current = act;
  mood = { name, t: 0, dur: act.getClip().duration };
  for (const b of document.querySelectorAll("[data-move]")) b.setAttribute("aria-pressed", "false");
}
for (const b of document.querySelectorAll("[data-mood]")) b.addEventListener("click", () => startMood(b.dataset.mood));
const asFace = f => typeof f === "string" ? EXPR[f].f : f;
const asLids = l => typeof l === "number" ? { "+X": l, "-X": l } : l;
function moodFace(m) {            // the face at this moment of a mood: eased between its keyframes
  const keys = MOODS[m.name], u = Math.min(1, m.t / m.dur);
  let i = 0; while (i < keys.length - 2 && keys[i + 1][0] <= u) i++;
  const [t0, f0, l0] = keys[i], [t1, f1, l1] = keys[i + 1];
  let k = (u - t0) / Math.max(1e-6, t1 - t0); k = Math.min(1, Math.max(0, k)); k = k * k * (3 - 2 * k);
  const a = asFace(f0), b = asFace(f1), face = {};
  for (const n of FACE_KEYS) face[n] = (a[n] || 0) * (1 - k) + (b[n] || 0) * k;
  const la = asLids(l0), lb = asLids(l1);
  return { face, lids: { "+X": la["+X"] * (1 - k) + lb["+X"] * k, "-X": la["-X"] * (1 - k) + lb["-X"] * k } };
}
// ---- swim around: a figure-eight round the stage, facing where she goes, banking into turns
let roam = null;
const roamBtn = document.getElementById("roam");
function stopRoam() {
  if (!roam) return;
  roam.leaving = true; roamBtn.setAttribute("aria-pressed", "false");
}
roamBtn.addEventListener("click", () => {
  if (roam && !roam.leaving) { stopRoam(); play("idle"); return; }
  mood = null; spinning = false; spin.setAttribute("aria-pressed", "false");
  roam = { t: 0, leaving: false, heading: turntable.rotation.y };
  roamBtn.setAttribute("aria-pressed", "true");
  play("swim");
  const d = radius * 3.8, pitch = THREE.MathUtils.degToRad(18);
  camera.position.set(controls.target.x, controls.target.y + d * Math.sin(pitch), controls.target.z + d * Math.cos(pitch)); controls.update();
});
function updateRoam(dt) {
  if (!roam) return;
  const W = radius * 1.15, D = radius * 0.75, H = radius * 0.22;
  if (!roam.leaving) {
    roam.t += dt * 0.32;
    const t = roam.t, x = W * Math.sin(t), z = D * Math.sin(2 * t);
    const dx = W * Math.cos(t), dz = 2 * D * Math.cos(2 * t);
    const want = Math.atan2(dx, dz);
    let dh = want - roam.heading; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    roam.heading += dh * Math.min(1, dt * 4);
    turntable.position.set(x, H + Math.sin(t * 3.1) * radius * 0.04, z);
    turntable.rotation.set(Math.sin(t * 2.2) * 0.05, roam.heading, THREE.MathUtils.clamp(-dh * 2.2, -0.35, 0.35));
  } else {   // ease home to the middle of the stage, face front, settle on the floor
    const k = Math.min(1, dt * 2.5);
    turntable.position.lerp(new THREE.Vector3(0, 0, 0), k);
    let dh = -roam.heading; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    roam.heading += dh * k;
    turntable.rotation.set(turntable.rotation.x * (1 - k), roam.heading, turntable.rotation.z * (1 - k));
    if (turntable.position.length() < radius * 0.01 && Math.abs(dh) < 0.01) {
      turntable.position.set(0, 0, 0); turntable.rotation.set(0, 0, 0); roam = null;
    }
  }
}
for (const b of document.querySelectorAll("[data-face]")) b.addEventListener("click", () => {`);
  // move buttons stop the roam too
  rep(`for (const b of document.querySelectorAll("[data-move]")) b.addEventListener("click", () => play(b.dataset.move));`,
      `for (const b of document.querySelectorAll("[data-move]")) b.addEventListener("click", () => { mood = null; stopRoam(); play(b.dataset.move); });`);
  // face: a running mood drives the face and each eye's lids
  rep(`  const E = EXPR[expr], tgt = Object.fromEntries(FACE_KEYS.map(k => [k, E.f[k] || 0]));`,
`  let E = EXPR[expr], tgt = Object.fromEntries(FACE_KEYS.map(k => [k, E.f[k] || 0])), moodLids = null;
  if (mood) {
    mood.t += dt;
    const mf = moodFace(mood);
    for (const k of FACE_KEYS) tgt[k] = mf.face[k];
    moodLids = mf.lids; E = EXPR.neutral;
    if (mood.t >= mood.dur) { mood = null; play("idle"); }
  }`);
  rep(`  const close = forcedLids !== null ? forcedLids : Math.max(lidExpr, blink);
  for (const e of eyes) {`, `  for (const e of eyes) {
    const base = moodLids ? moodLids[e.key] : lidExpr;
    const close = forcedLids !== null ? forcedLids : Math.max(base, blink);`);
  rep(`  if (mixer) mixer.update(dt);
  updateFace(dt);`, `  if (mixer) mixer.update(dt);
  updateRoam(dt);
  updateFace(dt);`);
  // play() must not leave a finished one-shot clamped underneath
  rep(`function play(name) {
  const next = moves[name]; if (!next || next === current) return;
  next.reset().setEffectiveWeight(1).play();`, `function play(name) {
  const next = moves[name]; if (!next || next === current) return;
  next.setLoop(THREE.LoopRepeat, Infinity); next.clampWhenFinished = false;
  next.reset().setEffectiveWeight(1).play();`);
  fs.writeFileSync(T, s);
}
cp.execFileSync("node", [path.join(__dirname, "page_face.cjs"), P], { stdio: "inherit" });
