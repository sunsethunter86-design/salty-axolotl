// salty-life.mjs: her swims, her dinner and her quirks, run on a simulated clock with a stand-in rig (3 Nov).
// node scripts/salty_life_test.mjs
// The real tank uses her GLB; here two bones (neck, head) and the tank's camera are enough to steer her,
// aim her face and feed her. Seeded randomness, so a failure replays the same way.
import assert from "node:assert/strict";
import { test } from "node:test";

// Just enough canvas for her bubble texture: nothing is drawn in Node.
const ctx2d = new Proxy({}, { get: (_, k) => (k === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { THREE } = await import("../public/salty/vendor/three-gltf.mjs");
const { createSaltyLife } = await import("../public/salty-life.mjs");

function seeded(seed) {   // mulberry32
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// The tank's own framing (salty-tank-3d.mjs resize) and her measured pivot, length and mouth.
function makeLife() {
  const scene = new THREE.Scene(), group = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(30, 1.698, 0.1, 5000);
  camera.position.set(0, 93.4, 377.8); camera.lookAt(0, 82.6, 0); camera.updateProjectionMatrix();
  const home = new THREE.Vector3(0, 53.9, 0);
  group.position.copy(home); scene.add(group);
  const neck = new THREE.Bone(), head = new THREE.Bone();
  neck.position.set(0, 40, 40); head.position.set(0, 18, 12); neck.add(head); group.add(neck);
  group.updateMatrixWorld(true);
  const seen = { clip: "idle", wide: [] };
  const life = createSaltyLife({
    THREE, scene, camera, group, home, halfLength: 104.5, bones: { neck, head, tail: [], gills: [] },
    mouthLocal: new THREE.Vector3(0, -12, 46),
    playLoop: (n) => { seen.clip = n; }, playMood: () => 0, moodPlaying: () => false, clip: () => seen.clip,
    clipSpeed() {}, onWide: (on) => seen.wide.push(on), view: () => ({ x: 0.52, y: 1 }), compile() {},
  });
  return { life, seen };
}
const DT = 1 / 30;
const run = (life, secs, s = {}, each = () => {}) => {
  for (let t = 0; t < secs; t += DT) { life.update(DT, { talking: false, mood: null, busy: false, rest: "neutral", ...s }); each(life.state()); }
};

test("every swim stays inside her tank and comes home", () => {
  const real = Math.random;
  try {
    for (let seed = 1; seed <= 40; seed++) {
      Math.random = seeded(seed);
      const { life, seen } = makeLife();
      run(life, 1);
      assert.equal(life.swim(), true, `seed ${seed}: she can start a swim from rest`);
      let secs = 0, maxZ = -Infinity, maxX = 0;
      while (life.state().mode === "tour" && secs < 70) {
        run(life, 0.5, {}, (st) => { maxZ = Math.max(maxZ, st.at[2]); maxX = Math.max(maxX, Math.abs(st.at[0])); });
        secs += 0.5;
      }
      assert.equal(life.state().mode, "rest", `seed ${seed}: still out after ${secs} s`);
      assert.ok(maxZ <= 90 && maxX <= 240, `seed ${seed}: left the tank (z ${maxZ}, |x| ${maxX})`);
      assert.deepEqual([seen.wide.at(0), seen.wide.at(-1)], [true, false], `seed ${seed}: the view pulls back and pushes in again`);
    }
  } finally { Math.random = real; }
});

test("RED: facing the glass with her next point right behind her, she turns round and comes home", () => {
  // The 3 Nov phone failure, forced: mid-swim, at the glass, facing you, the route behind her. Both ways
  // round "passed the front", the pick flipped every frame and she swam out of the tank for good.
  const real = Math.random;
  try {
    for (let seed = 1; seed <= 20; seed++) {
      Math.random = seeded(seed);
      const { life } = makeLife();
      run(life, 1);
      life.swim();
      run(life, 0.2);
      life.place([0, 90, 60], 0);
      let maxZ = -Infinity, secs = 0;
      while (life.state().mode === "tour" && secs < 50) { run(life, 0.5, {}, (st) => { maxZ = Math.max(maxZ, st.at[2]); }); secs += 0.5; }
      assert.ok(maxZ <= 90, `seed ${seed}: swam out to z ${maxZ}`);
      assert.equal(life.state().mode, "rest", `seed ${seed}: never came home`);
    }
  } finally { Math.random = real; }
});

test("talking to her brings her home from a swim within a few seconds", () => {
  const real = Math.random;
  try {
    Math.random = seeded(3);
    const { life, seen } = makeLife();
    run(life, 1);
    life.swim();
    run(life, 6);
    assert.equal(life.state().mode, "tour");
    let secs = 0;
    while (life.state().mode !== "rest" && secs < 15) { run(life, 0.25, { busy: true }); secs += 0.25; }
    assert.equal(life.state().mode, "rest", "home");
    assert.ok(secs <= 6, `took ${secs} s`);
    assert.equal(seen.wide.at(-1), false, "the view pushes back in");
  } finally { Math.random = real; }
});

test("she eats every worm, and dinner ends even if he's talking the whole time", () => {
  const real = Math.random;
  try {
    Math.random = seeded(11);
    const fed = makeLife();
    run(fed.life, 1);
    fed.life.feed(6);
    run(fed.life, 20);
    assert.equal(fed.life.state().worms, 0, "all six eaten");
    assert.equal(fed.life.state().mode, "rest");
    // Held the whole time: the worms sink, lie on the sand and burrow away; she must not stay "eating".
    const held = makeLife();
    run(held.life, 1);
    held.life.feed(6);
    run(held.life, 30, { busy: true });
    assert.equal(held.life.state().worms, 0);
    assert.equal(held.life.state().mode, "rest", "stuck in dinner with nothing left");
  } finally { Math.random = real; }
});

test("between swims she gets up to things, and a quirk never runs into a swim", () => {
  const real = Math.random;
  try {
    Math.random = seeded(5);
    const { life } = makeLife();
    const quirks = new Set();
    let overlap = 0;
    run(life, 240, {}, (st) => { if (st.quirk) quirks.add(st.quirk); if (st.quirk && st.mode === "tour") overlap++; });
    assert.ok(quirks.size >= 8, `only ${[...quirks].join(", ")}`);
    assert.equal(overlap, 0);
  } finally { Math.random = real; }
});
