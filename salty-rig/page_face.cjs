// Adds the face to the 3D page template: face buttons, a talk test with ah/ee/oo shapes, eyelids that
// squint per expression and blink on their own (bones turning about each eyeball), then rebuilds the
// self-contained page and a strict no-download test copy.
// usage: node page_face.cjs <page dir>
const fs = require("fs"), path = require("path");
const P = process.argv[2];
const T = path.join(P, "salty-3d-anim.html");
let s = fs.readFileSync(T, "utf8");
const rep = (a, b) => { if (!s.includes(a)) throw new Error("missing: " + a.slice(0, 80)); s = s.replace(a, b); };

if (!s.includes('data-face="neutral"')) {
  rep(`        <button data-move="happy" aria-pressed="false">Happy</button>
      </div>`, `        <button data-move="happy" aria-pressed="false">Happy</button>
      </div>
      <div class="controls moves" role="group" aria-label="Face">
        <span class="label">Face</span>
        <button data-face="neutral" aria-pressed="true">Neutral</button>
        <button data-face="smile" aria-pressed="false">Smile</button>
        <button data-face="grin" aria-pressed="false">Grin</button>
        <button data-face="laugh" aria-pressed="false">Laugh</button>
        <button data-face="gasp" aria-pressed="false">Gasp</button>
        <button data-face="smirk" aria-pressed="false">Smirk</button>
        <button data-face="pout" aria-pressed="false">Pout</button>
        <button id="talk" aria-pressed="false">Talk</button>
      </div>`);
  rep(`        <dt>Moves</dt><dd>Idle, swim, happy</dd>`, `        <dt>Moves</dt><dd>Idle, swim, happy</dd>
        <dt>Face</dt><dd>Smile, grin, laugh, gasp, smirk, pout; talks; blinks on her own</dd>`);
  rep(`<script>window.SALTY_GLB = "__GLB__"; window.SALTY_ENV = "__ENV__";</script>`,
      `<script>window.SALTY_GLB = "__GLB__"; window.SALTY_ENV = "__ENV__"; window.SALTY_FACE = "__FACE__";</script>`);
  rep(`let mixer, moves = {}, current, mouths = [], talking = false, talkT = 0, mouthNow = 0;`, `let mixer, moves = {}, current, talking = false, talkT = 0;
// face: shape weights (morph targets on her body) and eyelids/lashes (bones turning about each eyeball)
const FACE_KEYS = ["jaw_open", "jaw_round", "smileL", "smileR", "wide", "round", "frown"];
const faceNow = Object.fromEntries(FACE_KEYS.map(k => [k, 0]));
let faceMeshes = [], eyes = [], lidExpr = 0, clockT = 0, nextBlink = 1.2, blinkStart = -9;
const EXPR = {   // from the Gemini clips: beaming = eyes nearly shut; sassy = narrowed; gasp = a little O
  neutral: { f: {}, lids: 0 },
  smile:   { f: { smileL: 1, smileR: 1 }, lids: 0.12 },
  grin:    { f: { jaw_open: 0.72, smileL: 1, smileR: 1 }, lids: 0.22 },
  laugh:   { f: { smileL: 1, smileR: 1 }, lids: 0.88, laugh: true },
  gasp:    { f: { jaw_round: 0.85, round: 1 }, lids: 0 },
  smirk:   { f: { smileL: 1, frown: 0.15 }, lids: 0.38 },
  pout:    { f: { round: 0.85, frown: 0.35 }, lids: 0.15 },
};
let expr = "neutral", exprT = 0;`);
  rep(`    const k = o.morphTargetDictionary && o.morphTargetDictionary.mouth_open;
    if (k !== undefined) mouths.push([o, k]);
  });`, `    if (o.morphTargetDictionary && FACE_KEYS.some(k => k in o.morphTargetDictionary)) faceMeshes.push(o);
  });
  // eyelid and lash bones turn about each eyeball's closing axis (measured in Blender: face.json)
  model.updateMatrixWorld(true);
  const F = JSON.parse(window.SALTY_FACE);
  const bone = n => { let b = null; model.traverse(o => { if (o.isBone && o.name === n) b = o; }); return b; };
  for (const [key, E] of Object.entries(F.eyes)) {
    const lid = bone("lid" + key), lash = bone("lash" + key);
    if (!lid || !lash) continue;
    const ax = new THREE.Vector3(...E.axis);
    const local = b => { const q = new THREE.Quaternion(); b.getWorldQuaternion(q); return ax.clone().applyQuaternion(q.invert()).normalize(); };
    eyes.push({ lid, lash, rl: lid.quaternion.clone(), rs: lash.quaternion.clone(), al: local(lid), as: local(lash),
                alpha: THREE.MathUtils.degToRad(E.alpha), lashAlpha: THREE.MathUtils.degToRad(E.lashAlpha) });
  }
  window.SALTY_DEBUG = { eyes, faceMeshes, setExpr: n => { expr = n; exprT = 0; } };`);
  rep(`const talk = document.getElementById("talk");
if (talk) talk.addEventListener("click", () => { talking = !talking; talk.setAttribute("aria-pressed", String(talking)); });`,
`const talk = document.getElementById("talk");
talk.addEventListener("click", () => { talking = !talking; talk.setAttribute("aria-pressed", String(talking)); });
for (const b of document.querySelectorAll("[data-face]")) b.addEventListener("click", () => {
  expr = b.dataset.face; exprT = 0;
  for (const o of document.querySelectorAll("[data-face]")) o.setAttribute("aria-pressed", String(o === b));
  if (expr === "laugh") play("happy");
});
// each spoken beat gets a mouth shape: ah (open), ee (wide) or oo (round)
const VOWELS = ["a", "e", "o", "a", "e", "a", "o"];
const vowelAt = t => VOWELS[Math.abs((Math.floor(t * 4.7) * 2654435761) % 7)];
const qTmp = new THREE.Quaternion();
let forcedLids = null;   // for checks: hold the lids at a set closeness
function updateFace(dt) {
  clockT += dt; exprT += dt; talkT += dt;
  const E = EXPR[expr], tgt = Object.fromEntries(FACE_KEYS.map(k => [k, E.f[k] || 0]));
  if (E.laugh) tgt.jaw_open = 0.5 + 0.32 * Math.abs(Math.sin(exprT * Math.PI * 3.2));
  if (talking) {
    const L = talkLevel(talkT), v = vowelAt(talkT);
    if (v === "a") tgt.jaw_open = Math.max(tgt.jaw_open, L * 0.6);
    else if (v === "e") { tgt.jaw_open = Math.max(tgt.jaw_open, L * 0.32); tgt.wide = Math.max(tgt.wide, L * 0.9); }
    else { tgt.jaw_round = Math.max(tgt.jaw_round, L * 0.5); tgt.round = Math.max(tgt.round, L * 0.8); }
  }
  for (const k of FACE_KEYS) faceNow[k] += (tgt[k] - faceNow[k]) * Math.min(1, dt * 14);
  for (const m of faceMeshes) for (const k of FACE_KEYS) {
    const i = m.morphTargetDictionary[k]; if (i !== undefined) m.morphTargetInfluences[i] = faceNow[k];
  }
  // lids: the expression's squint, plus a quick natural blink every 2-6 s
  lidExpr += (E.lids - lidExpr) * Math.min(1, dt * 8);
  if (clockT > nextBlink) { blinkStart = clockT; nextBlink = clockT + 2.2 + Math.random() * 4; }
  const bt = clockT - blinkStart;
  const blink = bt < 0.09 ? bt / 0.09 : bt < 0.13 ? 1 : bt < 0.27 ? 1 - (bt - 0.13) / 0.14 : 0;
  const close = forcedLids !== null ? forcedLids : Math.max(lidExpr, blink);
  for (const e of eyes) {
    e.lid.quaternion.copy(e.rl).multiply(qTmp.setFromAxisAngle(e.al, close * e.alpha));
    // ☠️ turning the lashes in step with "close" moved them down before the lid had come out from under
    // the brow, then kept them ahead of its edge: strands floating over the eye (Shaun 29 Oct: "her eyes go
    // weird when she blinks"). The lashes wait at the rim until the lid edge reaches them, then ride on it.
    const lashTurn = Math.max(0, close * e.alpha - (e.alpha - e.lashAlpha));
    e.lash.quaternion.copy(e.rs).multiply(qTmp.setFromAxisAngle(e.as, lashTurn));
  }
}
window.SALTY_LIDS = v => { forcedLids = v; };`);
  rep(`  if (mixer) mixer.update(dt);
  talkT += dt;
  const target = talking ? talkLevel(talkT) : 0;
  mouthNow += (target - mouthNow) * Math.min(1, dt * 18);   // quick but not snappy
  for (const [o, k] of mouths) o.morphTargetInfluences[k] = mouthNow;`, `  if (mixer) mixer.update(dt);
  updateFace(dt);   // after the moves, so the face and eyelids win`);
  fs.writeFileSync(T, s);
}

// face data for the page: Blender (x, y, z) -> glTF/three (x, z, -y)
const F = JSON.parse(fs.readFileSync("D:/MuseTest/salty-rig/face.json", "utf8"));
const conv = a => [a[0], a[2], -a[1]];
const face = { eyes: {} };
for (const k of ["+X", "-X"]) face.eyes[k] = { axis: conv(F[k].close_axis), alpha: F[k].lid_alpha, lashAlpha: F[k].lash_alpha };
const b64 = f => fs.readFileSync(path.join(P, f)).toString("base64");
const out = s.replace(`"__GLB__"`, JSON.stringify(b64("salty_animated.glb")))
  .replace(`"__ENV__"`, JSON.stringify("data:image/png;base64," + b64("lit_env.png")))
  .replace(`"__FACE__"`, JSON.stringify(JSON.stringify(face)));
fs.writeFileSync(path.join(P, "salty-3d-embedded.html"), out);
fs.writeFileSync(path.join(P, "csp-test.html"), `<meta http-equiv="Content-Security-Policy" content="connect-src 'none'; img-src data: blob:; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com">\n` + out);
console.log("page bytes", out.length, JSON.stringify(face));
