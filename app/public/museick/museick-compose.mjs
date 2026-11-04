// MUSEick — the composer: a validated plan -> editable clips -> a timed list of note events.
//
// Deterministic: the same plan (seed included) always gives the same notes. Clips are what the
// room shows and lets him edit; compile() turns clips + plan into the events the audio engine
// plays, adding what a producer would add by hand (crashes, fills, the build's snare roll and
// riser, the drop's impact, the ending).
//
// Clip note shapes (steps are sixteenth notes):
//   drums  { s, d, p: lane, v }        lanes: 0 kick, 1 snare, 2 clap, 3 hat, 4 open hat
//   bass   { s, d, p: degree offset from the bar's chord root, v }
//   chords { s, d, v, p?: arp tone index }
//   lead   { s, d, p: scale degree from the tonic, v }   (64-step, four-bar phrase)

import { rng, seedOf, pick, chance, clamp, degreeToMidi, chordTones, voiceLead } from "./museick-theory.mjs";
import { TRACKS, SECTION_IDS, validatePlan } from "./museick-plan.mjs";

export const DRUM_LANES = ["Kick", "Snare", "Clap", "Hat", "Open hat"];
export const CLIP_LEN = { drums: 16, bass: 16, chords: 16, lead: 64 };

const N = (s, p, v, d = 1) => ({ s, d, p, v: Math.round(v * 100) / 100 });

// ---------- harmony ----------

const PROGRESSIONS = {
  minor: {
    dark: [[0, 5, 3, 4], [0, 5, 6, 4], [0, 3, 5, 4], [0, 6, 5, 4]],
    epic: [[0, 5, 2, 6], [0, 5, 3, 4], [0, 6, 5, 6], [0, 2, 6, 5]],
    dreamy: [[0, 3, 6, 2], [0, 6, 3, 4], [0, 2, 3, 6]],
    chill: [[0, 3, 0, 3], [0, 6, 3, 4], [0, 3, 6, 5]],
    bright: [[0, 5, 2, 6], [0, 6, 5, 6]],
  },
  major: {
    bright: [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 4, 3], [3, 4, 0, 5]],
    dreamy: [[0, 2, 5, 3], [3, 4, 2, 5], [0, 5, 3, 1]],
    chill: [[0, 5, 1, 4], [0, 3, 1, 4], [1, 4, 0, 5]],
    epic: [[0, 4, 5, 3], [5, 3, 0, 4]],
    dark: [[5, 3, 0, 4], [0, 5, 3, 4]],
  },
};

/** The four-chord loop for the plan (pinned, or chosen from the mood by the seed). */
export function progressionFor(plan) {
  if (plan.progression) return plan.progression;
  const family = plan.key.mode === "major" || plan.key.mode === "mixolydian" ? "major" : "minor";
  const set = PROGRESSIONS[family][plan.mood] || PROGRESSIONS[family].epic || PROGRESSIONS[family].bright;
  // The seed picks the loop; "new chords" (progVariant) steps round the mood's set from there.
  const i = Math.floor(rng(seedOf(plan.seed, "prog", plan.mood, plan.key.mode))() * set.length) % set.length;
  return set[(i + (plan.progVariant || 0)) % set.length];
}
const BUILD_PROGRESSION = [3, 3, 4, 4];

// ---------- drums ----------

function drumBase(style, I, r) {
  const n = [];
  const hats8 = (v1 = 0.7, v2 = 0.45) => { for (let s = 0; s < 16; s += 2) n.push(N(s, 3, s % 4 === 0 ? v1 : v2)); };
  const hats16 = () => { for (let s = 0; s < 16; s++) n.push(N(s, 3, [0.62, 0.3, 0.46, 0.3][s % 4])); };
  switch (style) {
    case "rock":
      n.push(N(0, 0, 1), N(8, 0, 0.95), N(4, 1, 1), N(12, 1, 1));
      if (I > 0.35) n.push(N(10, 0, 0.8));
      if (I > 0.6) n.push(N(chance(r, 0.5) ? 7 : 3, 0, 0.7));
      if (I > 0.85) n.push(N(14, 0, 0.75), N(15, 0, 0.7));
      if (I > 0.5) n.push(N(15, 1, 0.3));
      hats8();
      if (I > 0.7) { const i = n.findIndex((x) => x.p === 3 && x.s === 14); if (i >= 0) n[i] = N(14, 4, 0.6); }
      break;
    case "four":
      for (const s of [0, 4, 8, 12]) n.push(N(s, 0, 1));
      n.push(N(4, 2, 0.95), N(12, 2, 0.95));
      for (const s of [2, 6, 10, 14]) n.push(N(s, 4, 0.55));
      if (I > 0.5) for (const s of [1, 3, 5, 7, 9, 11, 13, 15]) n.push(N(s, 3, 0.32));
      if (I > 0.75) n.push(N(15, 1, 0.35), N(4, 1, 0.6), N(12, 1, 0.6));
      break;
    case "backbeat":
      n.push(N(0, 0, 1), N(8, 0, 0.95), N(4, 1, 1), N(12, 1, 1));
      if (I > 0.5) n.push(N(chance(r, 0.5) ? 6 : 10, 0, 0.75));
      if (I > 0.4) hats16(); else hats8();
      if (I > 0.75) n.push(N(4, 2, 0.7), N(12, 2, 0.7));
      break;
    case "boombap":
      n.push(N(0, 0, 1), N(7, 0, 0.7), N(10, 0, 0.9), N(4, 1, 1), N(12, 1, 1));
      if (I > 0.5) n.push(N(15, 0, 0.5));
      if (I > 0.4) n.push(N(9, 1, 0.25));
      hats8(0.55, 0.38);
      break;
    case "dnb":
      n.push(N(0, 0, 1), N(10, 0, 0.92), N(4, 1, 1), N(12, 1, 1));
      if (I > 0.4) n.push(N(7, 1, 0.3), N(15, 1, 0.3));
      if (I > 0.7) n.push(N(6, 0, 0.6));
      hats8(0.6, 0.42);
      if (I > 0.6) n.push(N(13, 3, 0.3));
      break;
    case "trap":
      n.push(N(0, 0, 1), N(11, 0, 0.85), N(8, 2, 1), N(8, 1, 0.7));
      if (I > 0.5) n.push(N(6, 0, 0.7));
      hats8(0.55, 0.42);
      if (I > 0.4) for (const s of [13, 15]) n.push(N(s, 3, 0.35));
      if (I > 0.7) for (const s of [5, 7]) n.push(N(s, 3, 0.3));
      break;
    case "sparse":
      n.push(N(0, 0, 0.8));
      if (I > 0.3) n.push(N(8, 2, 0.5));
      n.push(N(4, 3, 0.3), N(12, 3, 0.3), N(14, 4, 0.22));
      break;
    case "epic":
      n.push(N(0, 0, 1), N(8, 0, 1), N(4, 1, 1), N(12, 1, 1));
      if (I > 0.4) n.push(N(3, 0, 0.6), N(10, 0, 0.7));
      hats8(0.4, 0.28);
      break;
    default:
      n.push(N(0, 0, 1), N(4, 1, 1), N(8, 0, 1), N(12, 1, 1));
  }
  return n;
}

function drumClip(plan, sec, r) {
  const T = plan.tracks.drums;
  const style = T.style;
  const I = clamp(T.intensity + (sec.energy - plan.energy) * 0.06, 0, 1);
  let notes;
  if (sec.id === "intro") {
    notes = style === "four"
      ? [0, 4, 8, 12].map((s) => N(s, 0, 0.85)).concat([2, 6, 10, 14].map((s) => N(s, 3, 0.4)))
      : [N(0, 0, 0.8)].concat([0, 2, 4, 6, 8, 10, 12, 14].map((s) => N(s, 3, s % 4 ? 0.3 : 0.45)));
    if (style === "sparse") notes = [N(4, 3, 0.25), N(12, 3, 0.25)];
  } else if (sec.id === "build") {
    notes = [0, 4, 8, 12].map((s) => N(s, 0, 0.95)).concat([0, 2, 4, 6, 8, 10, 12, 14].map((s) => N(s, 3, 0.4)));
  } else if (sec.id === "outro") {
    notes = [N(0, 0, 0.9), N(8, 0, 0.8), N(12, 1, 0.6)].concat([0, 2, 4, 6, 8, 10, 12, 14].map((s) => N(s, 3, 0.35)));
  } else {
    const boost = sec.id === "drop" ? 0.2 + plan.chorusBoost * 0.1 : -0.05;
    notes = drumBase(style, clamp(I + boost, 0, 1), r);
    // A light kit ("less busy", "lighter drums") keeps the hats on the beat and drops the ghost notes.
    if (T.intensity < 0.5) notes = notes.filter((n) => !(n.p === 3 && n.s % 4) && !(n.p === 1 && n.v < 0.5));
  }
  // Variation: a few ghost hits that differ per variant ("vary" on the track).
  if (T.variant > 0 && sec.id !== "intro") {
    for (let i = 0; i < 2 + (T.variant % 3); i++) {
      const s = 1 + Math.floor(r() * 15);
      const lane = pick(r, [0, 1, 3, 3]);
      if (s % 4 && !notes.some((x) => x.s === s && x.p === lane)) notes.push(N(s, lane, lane === 1 ? 0.3 : 0.45));
    }
  }
  return dedupe(notes);
}

// ---------- bass ----------

const GROOVES = [
  [[0, 3, 0, 1], [3, 1, 0, 0.7], [6, 2, 7, 0.85], [8, 2, 0, 0.9], [10, 1, 4, 0.7], [11, 2, 0, 0.8], [14, 2, -1, 0.7]],
  [[0, 2, 0, 1], [2, 1, 0, 0.55], [3, 2, 7, 0.8], [6, 1, 0, 0.75], [7, 2, 4, 0.8], [10, 2, 0, 0.9], [12, 1, 2, 0.65], [13, 1, 4, 0.7], [14, 2, 7, 0.8]],
  [[0, 1, 0, 1], [1, 1, 0, 0.5], [3, 2, 4, 0.8], [6, 1, 0, 0.8], [7, 2, 7, 0.85], [10, 2, 0, 0.9], [13, 1, 4, 0.7], [14, 2, 0, 0.75]],
];

function bassClip(plan, sec, r) {
  const T = plan.tracks.bass;
  const I = clamp(T.intensity + (sec.id === "drop" ? 0.2 : 0), 0, 1);
  const out = [];
  if (sec.id === "intro") return out;
  if (sec.id === "outro") return [N(0, 0, 0.75, 16)];
  if (sec.id === "build") { for (let s = 0; s < 16; s += 2) out.push(N(s, 0, s % 4 ? 0.7 : 0.9, 2)); return out; }
  switch (T.style) {
    case "drive":
      for (let s = 0; s < 16; s += 2) out.push(N(s, s === 14 && I > 0.6 ? 7 : 0, s % 4 ? 0.75 : 0.95, 2));
      if (I > 0.8) out.push(N(15, 7, 0.6, 1));
      break;
    case "offbeat":
      for (const s of [2, 6, 10, 14]) out.push(N(s, s === 14 && I > 0.5 ? 7 : 0, 0.9, 2));
      break;
    case "rolling":
      for (let s = 0; s < 16; s++) if (s % 4) out.push(N(s, 0, s % 2 ? 0.7 : 0.85, 1));
      break;
    case "groove":
      for (const [s, d, p, v] of pick(r, GROOVES)) out.push(N(s, p, v, d));
      break;
    case "sub":
      out.push(N(0, 0, 0.9, 6), N(8, 0, 0.85, 6));
      if (I > 0.4) out.push(N(14, 4, 0.7, 2));
      break;
    case "pulse":
      if (I > 0.7) for (let s = 0; s < 16; s++) out.push(N(s, 0, s % 4 ? 0.65 : 0.9, 1));
      else for (let s = 0; s < 16; s += 2) out.push(N(s, 0, s % 4 ? 0.7 : 0.9, 2));
      break;
    case "walk":
      // Root, a chord tone, the fifth, then a step that leads into the next chord (compile resolves "ap").
      out.push(N(0, 0, 0.95, 4), N(4, pick(r, [2, 4]), 0.8, 4), N(8, pick(r, [4, 7]), 0.85, 4), { ...N(12, -1, 0.8, 4), ap: T.variant % 2 ? 1 : -1 });
      return out;
    case "eight08":
      out.push(N(0, 0, 1, 7), N(10, 0, 0.85, 4));
      if (I > 0.5) out.push(N(14, 7, 0.7, 2));
      break;
    default:
      out.push(N(0, 0, 0.9, 8), N(8, 0, 0.9, 8));
  }
  if (T.variant > 0 && T.style !== "groove") {
    const i = 1 + Math.floor(r() * (out.length - 1));
    if (out[i]) out[i] = { ...out[i], p: pick(r, [4, 7, 2]) };
  }
  return out;
}

// ---------- chords ----------

function chordClip(plan, sec, r) {
  const T = plan.tracks.chords;
  if (sec.id === "intro" || sec.id === "outro") return [N(0, null, 0.7, 16)];
  if (sec.id === "build") { const out = []; for (let s = 0; s < 16; s += 2) out.push(N(s, null, s % 4 ? 0.55 : 0.75, 2)); return out; }
  const out = [];
  switch (T.style) {
    case "pad": out.push(N(0, null, 0.8, 16)); break;
    case "stabs": for (const s of pick(r, [[2, 6, 10, 14], [3, 6, 10, 14], [0, 3, 6, 10, 12]])) out.push(N(s, null, s % 4 === 2 ? 0.85 : 0.75, 1)); break;
    case "pulse": for (let s = 0; s < 16; s += 2) out.push(N(s, null, s % 4 ? 0.6 : 0.8, 2)); break;
    case "power":
      if (sec.id === "drop" || T.intensity < 0.35) out.push(N(0, null, 1, 8), N(8, null, 0.95, 6), N(14, null, 0.9, 2));
      else for (const [s, d, v] of [[0, 2, 1], [2, 1, 0.6], [3, 2, 0.9], [6, 2, 0.9], [8, 2, 1], [10, 1, 0.6], [11, 2, 0.9], [14, 2, 0.9]]) out.push(N(s, null, v, d));
      break;
    case "keys": out.push(N(0, null, 0.8, 6), N(6, null, 0.6, 2), N(8, null, 0.75, 6), N(14, null, 0.55, 2)); break;
    case "arp": for (let s = 0; s < 16; s++) out.push(N(s, [0, 1, 2, 1][s % 4], s % 4 ? 0.6 : 0.8, 1)); break;
    default: out.push(N(0, null, 0.8, 16));
  }
  return out;
}

// ---------- lead ----------

const HOOKS = [
  [[0, 3], [3, 3], [6, 2], [8, 4], [12, 2], [14, 2]],
  [[0, 2], [2, 2], [4, 4], [10, 2], [12, 4]],
  [[0, 4], [4, 2], [6, 2], [8, 6], [14, 2]],
  [[2, 2], [4, 2], [6, 4], [10, 2], [12, 2], [14, 2]],
  [[0, 2], [3, 1], [4, 2], [6, 2], [8, 2], [11, 1], [12, 4]],
];
const SPARSE = [[[0, 6], [8, 6]], [[0, 8], [10, 4]], [[4, 4], [12, 4]]];
const ANTHEM = [[[0, 4], [4, 4], [8, 2], [10, 2], [12, 4]], [[0, 6], [6, 2], [8, 8]], [[0, 3], [3, 3], [6, 2], [8, 8]]];
const CADENCE = [[[0, 4], [4, 4], [8, 8]], [[0, 8], [8, 8]], [[0, 2], [2, 2], [4, 12]]];

function withDensity(rhythm, density, r) {
  if (density < 0.35) return rhythm.filter(([, d], i) => i === 0 || d >= 2 || chance(r, 0.3));
  if (density > 0.7) {
    const out = [];
    for (const [s, d] of rhythm) { if (d >= 4) { out.push([s, d / 2], [s + d / 2, d / 2]); } else out.push([s, d]); }
    return out;
  }
  return rhythm;
}

/** A chord tone of degree `c` near `prev`, inside [lo, hi]. */
function nearChordTone(c, prev, lo, hi, r) {
  let best = prev, cost = Infinity;
  for (let x = lo; x <= hi; x++) {
    const rel = (((x - c) % 7) + 7) % 7;
    if (rel !== 0 && rel !== 2 && rel !== 4) continue;
    const k = Math.abs(x - prev) + (x === prev ? 0.6 : 0) + r() * 0.5;
    if (k < cost) { cost = k; best = x; }
  }
  return best;
}

function phraseBar(rhythm, chord, startDeg, dir, lo, hi, seed, bar) {
  const r = rng(seed);
  const out = [];
  let prev = startDeg;
  rhythm.forEach(([s, d], i) => {
    let x;
    if (i === 0 || s % 8 === 0 || d >= 4) x = nearChordTone(chord, prev + dir, lo, hi, r);
    else {
      x = prev + dir * pick(r, [1, 1, 2]);
      if (x > hi || x < lo) { dir = -dir; x = prev + dir; }
    }
    x = clamp(x, lo, hi);
    out.push(N(bar * 16 + s, x, i === 0 ? 0.9 : s % 4 === 0 ? 0.82 : 0.7, d));
    prev = x;
  });
  return { notes: out, last: prev };
}

// The hook is ONE motif for the whole song: the Groove states it (bars 1 and 3, an answer in bar 2,
// a cadence in bar 4), the Drop sings it higher and fuller, the Outro remembers its opening. Shared
// seeds keep its rhythm and contour the same everywhere, which is what makes a song recognisable.
const CATCHY = [
  [[0, 2], [2, 1], [3, 3], [6, 2], [8, 2], [10, 1], [11, 3], [14, 2]],
  [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]],
  [[2, 2], [4, 1], [5, 3], [8, 2], [10, 2], [12, 4]],
];

/** The hook with longer, fewer notes: how a chorus sings the verse's motif. */
function anthemize(rhythm) {
  const keep = rhythm.filter(([s], i) => i === 0 || s % 4 === 0 || i % 2 === 0);
  return keep.map(([s], i) => [s, Math.max(2, (keep[i + 1]?.[0] ?? 16) - s)]);
}

function leadClip(plan, sec, prog, r) {
  const T = plan.tracks.lead;
  const seed = seedOf(plan.seed, "lead", T.variant, plan.key.mode);
  if (sec.id === "intro") return plan.genre === "ambient" ? leadClip(plan, { ...sec, id: "groove" }, prog, r).filter((_, i) => i % 3 === 0) : [];
  if (sec.id === "build") {
    const out = [];
    for (let b = 0; b < 4; b++) {
      const c = BUILD_PROGRESSION[b];
      const tones = [c, c + 2, c + 4, c + 7].map((d) => d + b * 1);
      const step = b === 3 ? 1 : 2;
      for (let s = 0, i = 0; s < 16; s += step, i++) out.push(N(b * 16 + s, tones[i % 4] + (b === 3 ? Math.floor(i / 4) * 2 : 0), 0.55 + b * 0.1, step));
    }
    return out;
  }
  if (sec.id === "outro") return leadClip(plan, { ...sec, id: "groove" }, prog, r).filter((n, i) => n.s < 32 && i % 2 === 0).map((n) => ({ ...n, v: 0.6, d: Math.max(n.d, 4) }));
  const drop = sec.id === "drop";
  const catchy = T.hook >= 1;
  const anthem = drop && (T.style === "anthem" || plan.chorusBoost > 0);
  const hr = rng(seedOf(seed, "hook"));
  const baseM = pick(hr, catchy ? CATCHY : T.style === "sparse" && !drop ? SPARSE : HOOKS);
  const A = pick(hr, catchy ? CATCHY : HOOKS);
  const C = pick(hr, CADENCE);
  const dr = rng(seedOf(seed, "density", sec.id));
  const M = withDensity(anthem ? anthemize(baseM) : baseM, T.density + (drop ? 0.1 : -0.1), dr);
  const [lo, hi] = drop ? [3, 11] : [0, 8];
  const start = drop ? 7 : 4;
  const s0 = seedOf(seed, "hook-a"), s1 = seedOf(seed, "hook-b"), s3 = seedOf(seed, "hook-c");
  const out = [];
  const a = phraseBar(M, prog[0], start, 1, lo, hi, s0, 0);
  out.push(...a.notes);
  // Bar 2 answers the hook (or, for a catchy hook in the drop, says it again).
  const b = drop && catchy ? phraseBar(M, prog[1], start, 1, lo, hi, s0, 1) : phraseBar(withDensity(A, T.density, dr), prog[1], a.last, -1, lo, hi, s1, 1);
  out.push(...b.notes);
  // Bar 3 brings the hook back: re-harmonised over its own chord, or note for note when it's catchy.
  const c = catchy ? { notes: a.notes.map((n) => ({ ...n, s: n.s + 32 })), last: a.last } : phraseBar(M, prog[2], start, 1, lo, hi, s0, 2);
  out.push(...c.notes);
  const d = phraseBar(C, prog[3], c.last, -1, lo, hi, s3, 3);
  out.push(...d.notes);
  return out;
}

// ---------- the whole song ----------

function dedupe(notes) {
  const seen = new Set();
  return notes.filter((n) => { const k = `${n.s}:${n.p}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((x, y) => x.s - y.s || (x.p ?? 0) - (y.p ?? 0));
}

function clipsFor(plan, track) {
  const prog = progressionFor(plan);
  const out = {};
  for (const sec of plan.sections) {
    const r = rng(seedOf(plan.seed, track, sec.id, plan.tracks[track].variant));
    const notes = track === "drums" ? drumClip(plan, sec, r)
      : track === "bass" ? bassClip(plan, sec, r)
      : track === "chords" ? chordClip(plan, sec, r)
      : leadClip(plan, sec, prog, r);
    out[sec.id] = { len: CLIP_LEN[track], notes };
  }
  return out;
}

/** A plan -> a song: the validated plan plus four tracks of clips, one per section. */
export function compose(planIn) {
  const { plan } = validatePlan(planIn);
  const clips = {};
  for (const t of TRACKS) clips[t] = clipsFor(plan, t);
  return { plan, clips, edited: {} };
}

/** Composes `tracks` again for a changed plan; other tracks (and his edits on them) are kept. */
export function recompose(song, planIn, tracks) {
  const { plan } = validatePlan(planIn);
  const clips = { ...song.clips };
  const edited = { ...song.edited };
  for (const t of tracks) { clips[t] = clipsFor(plan, t); delete edited[t]; }
  return { plan, clips, edited };
}

// ---------- compiling to timed events ----------

/**
 * song -> { events, totalSteps, stepSec, sections[{id, start, bars}], seconds }.
 * Events are sorted by step. The audio engine schedules them; nothing here touches audio.
 */
export function compile(song) {
  const { plan, clips } = song;
  const prog = progressionFor(plan);
  const arr = plan.arr || {};
  const stepSec = 60 / plan.bpm / 4;
  const events = [];
  const sections = [];
  const key = plan.key;
  const leadOct = 4 + plan.tracks.lead.octave;
  const fold = (m, lo = 48, hi = 91) => { while (m > hi) m -= 12; while (m < lo) m += 12; return m; };
  const vr = rng(seedOf(plan.seed, "variation", plan.tracks.drums.variant));
  let step = 0, prevVoicing = null, counterPrev = 2;
  const lastIdx = plan.sections.length - 1;
  plan.sections.forEach((sec, si) => {
    const start = step;
    sections.push({ id: sec.id, name: sec.name, start, bars: sec.bars, energy: sec.energy });
    const chordsOf = sec.id === "build" ? BUILD_PROGRESSION : prog;
    const nextSec = plan.sections[si + 1];
    const nextFirstChord = !nextSec ? 0 : nextSec.id === "build" ? BUILD_PROGRESSION[0] : prog[0];
    // Breakdown: the build opens on pads and the hook alone for its first half, then builds.
    const breakBars = sec.id === "build" && arr.breakdown ? Math.max(1, Math.floor(sec.bars / 2)) : 0;
    const rollBars = sec.bars - breakBars;
    // Tension: the last beat before the drop is silent.
    const gapFrom = sec.id === "build" && arr.tension ? (sec.bars - 1) * 16 + 12 : Infinity;
    const sweep = (from, to, dur, at = start) => events.push({ step: at, tr: "fx", kind: "sweep", from, to, dur });
    if (sec.id === "intro") sweep(650, 2600, sec.bars * 16);
    else if (sec.id === "build") {
      if (breakBars) sweep(2400, 2400, 1);
      sweep(900, 16000, rollBars * 16 - (arr.tension ? 4 : 0), start + breakBars * 16);
    } else if (sec.id === "outro" && plan.ending === "fade") sweep(16000, 1400, sec.bars * 16);
    else sweep(16000, 16000, 1);
    if (sec.id === "build") events.push({ step: start + breakBars * 16, tr: "fx", kind: "riser", dur: rollBars * 16 - (arr.tension ? 4 : 0) });
    if (sec.id === "drop") events.push({ step: start, tr: "fx", kind: "impact", v: 0.8 + plan.chorusBoost * 0.07 });
    if (sec.id === "outro" && plan.ending === "fade") events.push({ step: start, tr: "fx", kind: "fade", dur: sec.bars * 16 });
    if (arr.texture && (sec.id === "intro" || sec.id === "outro")) events.push({ step: start, tr: "fx", kind: "air", dur: sec.bars * 16 });
    if (arr.texture && breakBars) events.push({ step: start, tr: "fx", kind: "air", dur: breakBars * 16 });
    for (let bar = 0; bar < sec.bars; bar++) {
      const barStart = step + bar * 16;
      const chord = chordsOf[bar % 4];
      const nextChord = bar === sec.bars - 1 ? nextFirstChord : chordsOf[(bar + 1) % 4];
      const inBreak = bar < breakBars;
      const lastBarOfSong = si === lastIdx && bar === sec.bars - 1;
      const playing = sec.id === "groove" || sec.id === "drop";
      const fillBar = playing && sec.bars >= 4 && bar === sec.bars - 1
        || playing && arr.fills && bar % 4 === 3
        || (si === lastIdx && plan.ending === "dramatic" && bar === sec.bars - 2);
      // A sixteen-bar idea told twice: the second time round the groove grows (counter, harmony).
      const secondPass = sec.id === "drop" || (sec.id === "groove" && (sec.bars < 8 || bar >= 4));
      const cut = (s, d) => Math.min(d, 16 - s, Math.max(1, gapFrom - (bar * 16 + s)));
      const inGap = (s) => bar * 16 + s >= gapFrom;
      if (lastBarOfSong && plan.ending === "dramatic") {
        // One huge final hit that rings out: kick, crash, impact, the tonic chord, bass and lead together.
        const tonic = voiceLead(chordTones(key, 0, { octave: 3 }), prevVoicing, 52, 76);
        events.push({ step: barStart, tr: "fx", kind: "impact", v: 1 },
          { step: barStart, tr: "drums", kind: "kick", v: 1 }, { step: barStart, tr: "drums", kind: "crash", v: 1 },
          { step: barStart, tr: "chords", midis: tonic.concat(tonic[0] + 12), dur: 16, v: 0.95 },
          { step: barStart, tr: "bass", midi: degreeToMidi(key, 0, 2), dur: 16, v: 1 },
          { step: barStart, tr: "lead", midi: degreeToMidi(key, 7, leadOct), dur: 16, v: 0.9 });
        continue;
      }
      // Drums
      const dc = clips.drums[sec.id];
      if (dc && !inBreak) {
        const hits = new Set();
        for (const n of dc.notes) {
          const local = (bar * 16) % dc.len;
          if (n.s < local || n.s >= local + 16) continue;
          const s = n.s - local;
          if ((fillBar && s >= 12) || inGap(s)) continue;
          const kind = ["kick", "snare", "clap", "hat", "open"][n.p];
          hits.add(`${kind}${s}`);
          events.push({ step: barStart + s, tr: "drums", kind, v: n.v });
        }
        // Two-bar phrasing: every second bar of a groove or drop answers with an extra kick, and
        // every fourth opens the hat, so the beat breathes instead of looping one bar.
        if (playing && !fillBar && dc.notes.length) {
          if (bar % 2 === 1) { const s = [14, 10, 7][Math.floor(vr() * 3)]; if (!hits.has(`kick${s}`)) events.push({ step: barStart + s, tr: "drums", kind: "kick", v: 0.62 }); }
          if (bar % 4 === 3 && !hits.has("open14")) events.push({ step: barStart + 14, tr: "drums", kind: "open", v: 0.45 });
        }
        if (bar === 0 && (sec.id === "groove" || sec.id === "drop" || sec.id === "outro") && dc.notes.length) events.push({ step: barStart, tr: "drums", kind: "crash", v: sec.id === "drop" ? 1 : 0.7 });
        if (playing && arr.fills && bar % 4 === 0 && bar > 0) events.push({ step: barStart, tr: "drums", kind: "crash", v: 0.55 });
        if (fillBar) {
          const heavy = plan.tracks.drums.intensity > 0.6;
          const shape = (Math.floor(bar / 4) + si) % 3;
          for (let s = 12; s < 16; s++) {
            if (shape === 1) events.push({ step: barStart + s, tr: "drums", kind: "tom", v: 0.6 + (s - 12) * 0.1, pitch: 210 - (s - 12) * 32 });
            else if (shape === 2) events.push({ step: barStart + s, tr: "drums", kind: s === 12 || s === 15 ? "kick" : "snare", v: 0.6 + (s - 12) * 0.1 });
            else events.push({ step: barStart + s, tr: "drums", kind: s % 2 || !heavy ? "snare" : "tom", v: 0.55 + (s - 12) * 0.12, pitch: 160 - (s - 12) * 25 });
          }
        }
        if (sec.id === "build") {
          // The snare roll tightens bar by bar: quarters, eighths, then sixteenths.
          const rb = bar - breakBars;
          const every = rb >= rollBars - 1 ? 1 : rb >= rollBars - 2 ? 2 : 4;
          for (let s = 0; s < 16; s += every) if (!inGap(s)) events.push({ step: barStart + s, tr: "drums", kind: "snare", v: 0.35 + 0.55 * ((rb * 16 + s) / (rollBars * 16)) });
        }
      }
      // Bass
      const bc = clips.bass[sec.id];
      if (bc && !inBreak) for (const n of bc.notes) {
        if (n.s >= 16 || inGap(n.s)) continue;
        // "ap": a passing note that steps into the next chord's root from below (-1) or above (+1).
        const deg = n.ap ? nextChord + n.ap : chord + n.p;
        events.push({ step: barStart + n.s, tr: "bass", midi: degreeToMidi(key, deg, 2), dur: cut(n.s, n.d), v: n.v });
      }
      // Chords
      const cc = clips.chords[sec.id];
      if (cc && cc.notes.length) {
        const sound = plan.tracks.chords.sound;
        let voicing;
        if (sound === "power" && !inBreak) {
          // Root, the scale's own fifth above it (a plain +7 would leave the key on a diminished degree), octave.
          let root = degreeToMidi(key, chord, 3);
          let fifth = degreeToMidi(key, chord + 4, 3);
          if (root > 52) { root -= 12; fifth -= 12; }
          voicing = [root, fifth, root + 12];
        } else {
          voicing = voiceLead(chordTones(key, chord, { seventh: plan.sevenths, octave: 3, harmonicV: plan.harmonicV }), prevVoicing, 52, 76);
          prevVoicing = voicing;
        }
        const wide = sec.id === "drop" && plan.chorusBoost > 0 ? voicing.concat(voicing[0] + 12) : voicing;
        if (inBreak) events.push({ step: barStart, tr: "chords", midis: voicing, dur: 16, v: 0.7 });
        else for (const n of cc.notes) {
          if (n.s >= 16 || inGap(n.s)) continue;
          const midis = n.p == null ? wide : [wide[n.p % wide.length]];
          events.push({ step: barStart + n.s, tr: "chords", midis, dur: cut(n.s, n.d), v: n.v });
        }
      }
      // Lead: a four-bar phrase that loops over the section (in a breakdown, the Groove's hook, softly)
      const lc = inBreak ? clips.lead.groove : clips.lead[sec.id];
      if (lc) {
        const local = (bar * 16) % lc.len;
        const anthem = sec.id === "drop" && (plan.tracks.lead.style === "anthem" || plan.chorusBoost > 0);
        const oct = leadOct + (anthem ? 1 : 0);
        const barNotes = lc.notes.filter((n) => n.s >= local && n.s < local + 16 && !inGap(n.s - local));
        const answer = playing && sec.bars >= 8 && bar % 8 === 7;
        barNotes.forEach((n, i) => {
          const last = i === barNotes.length - 1;
          // The second time round, the phrase's last note comes home to the tonic: question, then answer.
          const p = answer && last ? Math.round(n.p / 7) * 7 : n.p;
          const midi = fold(degreeToMidi(key, p, oct));
          const e = { step: barStart + n.s - local, tr: "lead", midi, dur: answer && last ? 16 - (n.s - local) : cut(n.s - local, Math.min(n.d, local + 16 - n.s)),
            v: inBreak ? n.v * 0.6 : n.v, double: anthem ? midi - 12 : null };
          if (arr.harmony && secondPass && !inBreak) {
            let h = fold(degreeToMidi(key, p + 2, oct));
            while (h <= midi) h += 12;
            while (h - midi > 9) h -= 12;
            if (h > midi) e.harm = h;
          }
          events.push(e);
        });
      }
      // Countermelody: two long notes a bar, under the hook, stepping through the chord tones.
      if (arr.counter && playing && secondPass && !inBreak) {
        for (const [s, rel] of [[0, 2], [8, 4]]) {
          let best = counterPrev, cost = Infinity;
          for (let x = -3; x <= 5; x++) {
            if ((((x - chord - rel) % 7) + 7) % 7 !== 0) continue;
            const c = Math.abs(x - counterPrev) + (x === counterPrev ? 0.8 : 0);
            if (c < cost) { cost = c; best = x; }
          }
          counterPrev = best;
          events.push({ step: barStart + s, tr: "lead", counter: true, midi: fold(degreeToMidi(key, best, 4), 55, 79), dur: 7, v: 0.5 });
        }
      }
    }
    step += sec.bars * 16;
  });
  events.sort((a, b) => a.step - b.step);
  return { events, totalSteps: step, stepSec, sections, seconds: step * stepSec, swing: plan.swing, pump: plan.pump };
}

/**
 * Checks a song before it plays: every clip note in range, every event playable, a sensible
 * length, and every unmuted track actually sounding somewhere. Returns a list of problems.
 */
export function validateSong(song) {
  const errs = [];
  const { plan, errors } = validatePlan(song?.plan);
  if (errors.length) errs.push(...errors.map((e) => `plan ${e}`));
  for (const t of TRACKS) {
    for (const id of SECTION_IDS) {
      const c = song?.clips?.[t]?.[id];
      if (!c || !Array.isArray(c.notes) || c.len !== CLIP_LEN[t]) { errs.push(`${t}.${id}: missing clip`); continue; }
      for (const n of c.notes) {
        if (!Number.isInteger(n.s) || n.s < 0 || n.s >= c.len) errs.push(`${t}.${id}: step ${n.s} outside clip`);
        if (!(n.d > 0)) errs.push(`${t}.${id}: bad duration`);
        if (!(n.v > 0 && n.v <= 1)) errs.push(`${t}.${id}: bad velocity`);
        if (t === "drums" && !(n.p >= 0 && n.p <= 4)) errs.push(`drums.${id}: bad lane ${n.p}`);
        if ((t === "lead" || t === "bass") && !(Number.isFinite(n.p) && n.p >= -7 && n.p <= 21)) errs.push(`${t}.${id}: pitch ${n.p} out of range`);
      }
    }
  }
  if (errs.length) return errs;
  const c = compile({ ...song, plan });
  if (c.seconds < 20 || c.seconds > 90) errs.push(`length ${c.seconds.toFixed(1)} s outside 20-90 s`);
  for (const e of c.events) {
    if (e.step < 0 || e.step >= c.totalSteps) errs.push(`event at step ${e.step} outside song`);
    const ms = e.midis || (e.midi != null ? [e.midi] : []);
    if (ms.some((m) => !(m >= 24 && m <= 108))) errs.push(`${e.tr}: note ${ms} out of range`);
  }
  for (const t of TRACKS) if (!c.events.some((e) => e.tr === t)) errs.push(`${t}: silent for the whole song`);
  return errs;
}
