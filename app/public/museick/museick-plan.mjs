// MUSEick — the song plan: its schema, its validator, and the rules that read his words.
//
// A plan is small (genre, mood, key, tempo, sections, four tracks). The composer
// (museick-compose.mjs) turns it into notes. Nothing here guesses: every change comes
// from a rule that matched his words, or from Salty's reply, and says which (`source`).
//
//   source "you"   — a rule matched his words (or he pressed a control)
//   source "salty" — a rule matched words in Salty's own reply (her model wrote them)
//   source "engine"— a default the studio filled in when nobody asked for anything

import { clamp, keyName, seedOf, rng, pick } from "./museick-theory.mjs";

export const PLAN_VERSION = 1;
export const TRACKS = ["drums", "bass", "chords", "lead"];
export const SECTION_IDS = ["intro", "groove", "build", "drop", "outro"];
export const SECTION_NAMES = { intro: "Intro", groove: "Groove", build: "Build", drop: "Drop", outro: "Outro" };

/** The sounds each track can wear. The room's instrument button cycles through these. */
export const SOUNDS = Object.freeze({
  drums: { punchy: "Punchy kit", heavy: "Heavy kit", house: "Club kit", "808": "808 kit", lofi: "Dusty kit" },
  bass: { dirty: "Dirty bass", sub: "Sub bass", pluck: "Pluck bass", "808": "808 bass" },
  chords: { pad: "Warm pad", stab: "Synth stabs", power: "Power chords", keys: "Electric keys" },
  lead: { supersaw: "Supersaw lead", square: "Square lead", bell: "Glass bell", pluck: "Pluck lead" },
});

export const GENRES = Object.freeze({
  "electro-rock": { label: "electro-rock", bpm: [126, 134], modes: ["minor", "phrygian"], tonics: [4, 9, 2],
    drums: ["rock", "punchy"], bass: ["drive", "dirty"], chords: ["power", "power"], lead: ["hook", "supersaw"], swing: 0, pump: false },
  house: { label: "house", bpm: [120, 125], modes: ["minor", "dorian"], tonics: [9, 5, 0],
    drums: ["four", "house"], bass: ["offbeat", "pluck"], chords: ["stabs", "stab"], lead: ["hook", "pluck"], swing: 0.06, pump: true },
  techno: { label: "techno", bpm: [128, 134], modes: ["minor", "phrygian"], tonics: [9, 7, 2],
    drums: ["four", "heavy"], bass: ["rolling", "dirty"], chords: ["stabs", "stab"], lead: ["sparse", "square"], swing: 0, pump: true },
  synthwave: { label: "synthwave", bpm: [100, 112], modes: ["minor", "dorian"], tonics: [9, 4, 2],
    drums: ["backbeat", "punchy"], bass: ["pulse", "pluck"], chords: ["pad", "pad"], lead: ["hook", "supersaw"], swing: 0, pump: true },
  lofi: { label: "lo-fi", bpm: [76, 88], modes: ["dorian", "major"], tonics: [2, 5, 7],
    drums: ["boombap", "lofi"], bass: ["sub", "sub"], chords: ["keys", "keys"], lead: ["sparse", "bell"], swing: 0.16, pump: false, sevenths: true },
  ambient: { label: "ambient", bpm: [72, 84], modes: ["major", "dorian"], tonics: [2, 4, 7],
    drums: ["sparse", "lofi"], bass: ["sub", "sub"], chords: ["pad", "pad"], lead: ["sparse", "bell"], swing: 0, pump: false, sevenths: true },
  dnb: { label: "drum & bass", bpm: [172, 176], modes: ["minor", "dorian"], tonics: [5, 2, 7],
    drums: ["dnb", "punchy"], bass: ["sub", "dirty"], chords: ["pad", "pad"], lead: ["hook", "supersaw"], swing: 0, pump: false },
  trap: { label: "trap", bpm: [138, 146], modes: ["minor", "phrygian"], tonics: [1, 4, 6],
    drums: ["trap", "808"], bass: ["eight08", "808"], chords: ["pad", "pad"], lead: ["sparse", "bell"], swing: 0, pump: false },
  pop: { label: "synth-pop", bpm: [108, 120], modes: ["major", "mixolydian"], tonics: [0, 7, 2],
    drums: ["backbeat", "punchy"], bass: ["drive", "pluck"], chords: ["stabs", "stab"], lead: ["hook", "square"], swing: 0, pump: true },
  cinematic: { label: "cinematic", bpm: [88, 100], modes: ["minor"], tonics: [2, 7, 0],
    drums: ["epic", "heavy"], bass: ["sub", "sub"], chords: ["pad", "pad"], lead: ["hook", "supersaw"], swing: 0, pump: false },
});

export const MOODS = ["dark", "bright", "dreamy", "epic", "chill"];

// Words he might use for each genre and mood. Order matters: the first genre that matches wins,
// so "electronic rock" is electro-rock, not plain electronic.
const GENRE_WORDS = [
  ["electro-rock", /\b(electro[- ]?rock|electronic rock|industrial|rock|metal|guitar|grunge|punk)\b/],
  ["dnb", /\b(d(rum)? ?(&|and|n) ?b(ass)?|dnb|jungle|liquid)\b/],
  ["trap", /\b(trap|hip[- ]?hop|rap|drill|808s?)\b/],
  ["lofi", /\b(lo[- ]?fi|chill ?hop|jazzy|study)\b/],
  ["synthwave", /\b(synth ?wave|retro ?wave|80s|eighties|outrun|retro)\b/],
  ["techno", /\b(techno|rave|warehouse)\b/],
  ["house", /\b(house|disco|dance|club)\b/],
  ["ambient", /\b(ambient|drone|meditat\w*|sleepy|calm)\b/],
  ["cinematic", /\b(cinematic|orchestral|film|movie|soundtrack|trailer)\b/],
  ["pop", /\b(pop|catchy|radio)\b/],
  ["synthwave", /\b(electronic|electro|synth)\b/],
];
const MOOD_WORDS = [
  ["dark", /\b(dark\w*|sinister|menacing|evil|ominous|scary|creepy|moody|gloomy|grim|brooding|deep sea|abyss)\b/],
  ["epic", /\b(epic|massive|huge|enormous|anthem\w*|heroic|triumphant|powerful|big)\b/],
  ["dreamy", /\b(dream\w*|ethereal|floaty|spacey|spacy|magical|hazy|underwater)\b/],
  ["chill", /\b(chill\w*|relax\w*|mellow|laid[- ]back|lazy|smooth|soft|gentle)\b/],
  ["bright", /\b(bright\w*|happy|happier|uplifting|sunny|cheerful|joyful|fun|playful|summer)\b/],
];
const MOOD_MODE = { dark: "minor", bright: "major", dreamy: "dorian", epic: "minor", chill: "dorian" };

const NOTE_WORD = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** Default section layout for a tempo: about 40-60 seconds of music either way. `tension` doubles the build. */
export function sectionsFor(bpm, energy, tension = false) {
  const bars = bpm >= 118 ? [4, 8, 4, 8, 4] : bpm >= 92 ? [2, 8, 4, 8, 2] : [2, 4, 4, 8, 2];
  if (tension) bars[2] += 4;
  const e = clamp(energy, 1, 10);
  const lift = [e - 4, e - 2, e - 1, e, e - 4];
  return SECTION_IDS.map((id, i) => ({ id, name: SECTION_NAMES[id], bars: bars[i], energy: clamp(lift[i], 1, 10) }));
}

/** A complete default plan; every field present. */
export function defaultPlan(seed = 1) {
  return buildPlan({ genre: "synthwave", mood: "dreamy", seed });
}

function buildPlan({ genre, mood, seed, bpm, key, energy }) {
  const g = GENRES[genre] || GENRES.synthwave;
  const r = rng(seedOf(seed, genre, mood));
  const mode = mood && MOOD_MODE[mood] && (g.modes.includes(MOOD_MODE[mood]) || mood === "dark" || mood === "bright")
    ? MOOD_MODE[mood] : g.modes[0];
  const t = bpm ?? Math.round(g.bpm[0] + r() * (g.bpm[1] - g.bpm[0]));
  const en = energy ?? (mood === "epic" ? 8 : mood === "chill" || mood === "dreamy" ? 5 : 7);
  const k = key ?? { tonic: pick(r, g.tonics), mode };
  return {
    v: PLAN_VERSION,
    title: "",
    genre: GENRES[genre] ? genre : "synthwave",
    mood: MOODS.includes(mood) ? mood : "dreamy",
    bpm: clamp(t, 70, 180),
    key: k,
    energy: en,
    swing: g.swing,
    seed: seed >>> 0,
    harmonicV: mood === "dark" || mood === "epic",
    sevenths: Boolean(g.sevenths) || mood === "dreamy" || mood === "chill",
    pump: g.pump,
    progression: null, // filled by the composer from the mood unless pinned
    sections: sectionsFor(t, en),
    ending: "fade",
    chorusBoost: 0,
    // Arrangement moves (museick-compose.mjs compile): each one is a real change to the notes.
    arr: { breakdown: false, tension: false, fills: genre === "electro-rock" || genre === "dnb", texture: genre === "ambient", counter: false, harmony: false },
    progVariant: 0,
    fx: { reverb: mood === "dreamy" || genre === "ambient" ? 0.55 : 0.32, delay: 0.28 },
    tracks: {
      drums: track(g.drums, genre === "ambient" ? 0.25 : 0.55),
      bass: track(g.bass, 0.5),
      chords: track(g.chords, 0.5),
      lead: { ...track(g.lead, 0.5), octave: 0, density: 0.5, hook: 0 },
    },
  };
}
const track = ([style, sound], intensity) => ({ style, sound, intensity, vol: 0.8, mute: false, solo: false, variant: 0 });

// ---------- validation ----------

const DRUM_STYLES = ["rock", "four", "backbeat", "boombap", "dnb", "trap", "sparse", "epic"];
const BASS_STYLES = ["drive", "offbeat", "rolling", "groove", "sub", "pulse", "eight08", "walk"];
const CHORD_STYLES = ["pad", "stabs", "pulse", "power", "keys", "arp"];
const LEAD_STYLES = ["hook", "sparse", "anthem"];
const STYLES = { drums: DRUM_STYLES, bass: BASS_STYLES, chords: CHORD_STYLES, lead: LEAD_STYLES };
export const ARR_KEYS = ["breakdown", "tension", "fills", "texture", "counter", "harmony"];

/**
 * Checks a plan and repairs what it can. Returns { ok, errors, plan }: `errors` lists every field
 * that was out of range or unknown (and was reset), so a bad plan never reaches the composer.
 */
export function validatePlan(input) {
  const errors = [];
  const base = defaultPlan(input?.seed ?? 1);
  const p = { ...base, ...(input && typeof input === "object" ? input : {}) };
  const num = (v, lo, hi, dflt, name) => {
    if (typeof v !== "number" || !Number.isFinite(v)) { errors.push(`${name}: not a number`); return dflt; }
    if (v < lo || v > hi) errors.push(`${name}: ${v} outside ${lo}-${hi}`);
    return clamp(v, lo, hi);
  };
  if (p.v !== PLAN_VERSION) errors.push(`v: expected ${PLAN_VERSION}`);
  p.v = PLAN_VERSION;
  if (!GENRES[p.genre]) { errors.push(`genre: unknown "${p.genre}"`); p.genre = base.genre; }
  if (!MOODS.includes(p.mood)) { errors.push(`mood: unknown "${p.mood}"`); p.mood = base.mood; }
  p.bpm = Math.round(num(p.bpm, 70, 180, base.bpm, "bpm"));
  p.energy = Math.round(num(p.energy, 1, 10, base.energy, "energy"));
  p.swing = num(p.swing, 0, 0.3, 0, "swing");
  p.chorusBoost = Math.round(num(p.chorusBoost, 0, 3, 0, "chorusBoost"));
  p.seed = (Number(p.seed) >>> 0) || 1;
  p.title = typeof p.title === "string" ? p.title.slice(0, 48) : "";
  p.harmonicV = Boolean(p.harmonicV); p.sevenths = Boolean(p.sevenths); p.pump = Boolean(p.pump);
  // Songs saved before these fields existed open with every arrangement move off.
  const arr = p.arr && typeof p.arr === "object" ? p.arr : {};
  p.arr = Object.fromEntries(ARR_KEYS.map((k) => [k, Boolean(arr[k])]));
  p.progVariant = Math.round(num(p.progVariant ?? 0, 0, 99, 0, "progVariant"));
  if (!["fade", "dramatic"].includes(p.ending)) { errors.push(`ending: unknown "${p.ending}"`); p.ending = "fade"; }
  const k = p.key || {};
  if (!Number.isInteger(k.tonic) || k.tonic < 0 || k.tonic > 11 || !["major", "minor", "dorian", "phrygian", "mixolydian"].includes(k.mode)) {
    errors.push("key: invalid"); p.key = base.key;
  } else p.key = { tonic: k.tonic, mode: k.mode };
  if (p.progression != null) {
    if (!Array.isArray(p.progression) || p.progression.length !== 4 || !p.progression.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      errors.push("progression: must be 4 scale degrees 0-6"); p.progression = null;
    } else p.progression = p.progression.slice();
  }
  const secs = Array.isArray(p.sections) ? p.sections : [];
  if (secs.length !== SECTION_IDS.length || secs.some((s, i) => s?.id !== SECTION_IDS[i])) {
    errors.push("sections: must be intro, groove, build, drop, outro"); p.sections = sectionsFor(p.bpm, p.energy, p.arr.tension);
  } else {
    p.sections = secs.map((s) => ({ id: s.id, name: SECTION_NAMES[s.id],
      bars: Math.round(num(s.bars, 1, 16, 4, `sections.${s.id}.bars`)), energy: Math.round(num(s.energy, 1, 10, 5, `sections.${s.id}.energy`)) }));
  }
  const fx = p.fx || {};
  p.fx = { reverb: num(fx.reverb ?? 0.3, 0, 1, 0.3, "fx.reverb"), delay: num(fx.delay ?? 0.25, 0, 1, 0.25, "fx.delay") };
  const tracks = {};
  for (const name of TRACKS) {
    const t = { ...base.tracks[name], ...(p.tracks?.[name] || {}) };
    if (!STYLES[name].includes(t.style)) { errors.push(`${name}.style: unknown "${t.style}"`); t.style = base.tracks[name].style; }
    if (!SOUNDS[name][t.sound]) { errors.push(`${name}.sound: unknown "${t.sound}"`); t.sound = base.tracks[name].sound; }
    t.intensity = num(t.intensity, 0, 1, 0.5, `${name}.intensity`);
    t.vol = num(t.vol, 0, 1, 0.8, `${name}.vol`);
    t.mute = Boolean(t.mute); t.solo = Boolean(t.solo);
    t.variant = Math.round(num(t.variant, 0, 9999, 0, `${name}.variant`));
    if (name === "lead") { t.octave = Math.round(num(t.octave ?? 0, -1, 1, 0, "lead.octave")); t.density = num(t.density ?? 0.5, 0, 1, 0.5, "lead.density"); t.hook = Math.round(num(t.hook ?? 0, 0, 1, 0, "lead.hook")); }
    tracks[name] = t;
  }
  p.tracks = tracks;
  return { ok: errors.length === 0, errors, plan: p };
}

/** Seconds the arrangement lasts (without the reverb tail). */
export function planSeconds(plan) {
  const bars = plan.sections.reduce((n, s) => n + s.bars, 0);
  return bars * 4 * (60 / plan.bpm);
}

// ---------- reading his words: a new song ----------

/** True when his words ask for a new song rather than a change to this one. */
export function isNewBrief(text, hasSong) {
  return readIntent(text, { hasSong }).intent === "new";
}

const norm = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
function genreOf(t) { for (const [g, re] of GENRE_WORDS) if (re.test(t)) return g; return null; }
function moodOf(t) { for (const [m, re] of MOOD_WORDS) if (re.test(t)) return m; return null; }
const quote = (t, re) => { const m = t.match(re); return m ? m[0] : ""; };

function keyFrom(t) {
  const m = t.match(/\b(?:in|key of|key to)\s+([a-g])\s*(#|sharp|b|flat)?\s*(major|minor|maj|min|m)?\b/);
  if (!m) return null;
  // ☠️ "Slow it down in a bit" set the key to A: "in a" is only a key when nothing follows the note.
  if (!m[2] && !m[3] && /^\s*[a-z0-9]/.test(t.slice(m.index + m[0].length))) return null;
  let tonic = NOTE_WORD[m[1]];
  if (m[2] === "#" || m[2] === "sharp") tonic += 1;
  if (m[2] === "b" || m[2] === "flat") tonic -= 1;
  const mode = /^(minor|min|m)$/.test(m[3] || "") ? "minor" : m[3] ? "major" : null;
  return { tonic: (tonic + 12) % 12, mode };
}

/**
 * His brief -> a new plan plus the decisions it made, each with its reason.
 * `seed` makes it reproducible (the room passes a fresh one per brief).
 */
export function planFromBrief(text, seed = 1) {
  const t = norm(text);
  const decisions = [];
  const genre = genreOf(t);
  const mood = moodOf(t);
  const plan = buildPlan({ genre: genre || (mood === "chill" ? "lofi" : mood === "dark" ? "techno" : "synthwave"), mood: mood || "epic", seed });
  decisions.push({ field: "genre", value: GENRES[plan.genre].label, source: genre ? "you" : "engine",
    why: genre ? `you said “${quote(t, GENRE_WORDS.find(([g]) => g === genre)[1])}”` : "no style named; studio default" });
  decisions.push({ field: "mood", value: plan.mood, source: mood ? "you" : "engine",
    why: mood ? `you said “${quote(t, MOOD_WORDS.find(([m]) => m === mood)[1])}”` : "no mood named; studio default" });
  const k = keyFrom(t);
  if (k) {
    plan.key = { tonic: k.tonic, mode: k.mode || plan.key.mode };
    decisions.push({ field: "key", value: keyName(plan.key), source: "you", why: "you named the key" });
  } else decisions.push({ field: "key", value: keyName(plan.key), source: "engine", why: `suits ${plan.mood} ${GENRES[plan.genre].label}` });
  const bpm = t.match(/\b(\d{2,3})\s*(bpm|beats)\b/);
  if (bpm) { plan.bpm = clamp(Number(bpm[1]), 70, 180); decisions.push({ field: "bpm", value: plan.bpm, source: "you", why: "you named the tempo" }); }
  else if (/\b(fast|faster|quick|uptempo|high[- ]energy|frantic)\b/.test(t)) { plan.bpm = clamp(plan.bpm + 10, 70, 180); decisions.push({ field: "bpm", value: plan.bpm, source: "you", why: "you asked for fast" }); }
  else if (/\b(slow|slower|downtempo|lazy)\b/.test(t)) { plan.bpm = clamp(plan.bpm - 10, 70, 180); decisions.push({ field: "bpm", value: plan.bpm, source: "you", why: "you asked for slow" }); }
  else decisions.push({ field: "bpm", value: plan.bpm, source: "engine", why: `typical ${GENRES[plan.genre].label} tempo` });
  plan.sections = sectionsFor(plan.bpm, plan.energy);
  // The rest of his brief reads like revisions of the fresh plan ("massive drums", "dirty bass", ...).
  // Mood, key and tempo were read above; the brief's other words are track descriptions.
  const ops = parseRevision(t, { inBrief: true }).filter((o) => !BRIEF_SKIP.has(o.op));
  const applied = applyOps(plan, ops, "you");
  return { plan: validatePlan(applied.plan).plan, decisions: decisions.concat(applied.changes) };
}

// ---------- reading his words: a change to this song ----------

const BRIEF_SKIP = new Set(["key", "bpm", "darker", "brighter", "dreamier", "energyUp", "energyDown", "endingFade"]);

// Each op: a test on the words. Order is the order they apply. Tests see one sentence at a time.
const OPS = [
  { op: "genre", test: (t, o) => !o.inBrief && /\b(make it|turn it into|more like|switch (it )?to|change it to)\b/.test(t) && !/\bmake it (pop|rock|dance)$/.test(t) && genreOf(t) }, // "make it pop" isn't a genre
  { op: "key", test: (t) => keyFrom(t) },
  { op: "bpm", test: (t) => { const m = t.match(/\b(\d{2,3})\s*bpm\b/) || t.match(/\b(?:tempo|bpm|speed|pace)\b[^.,]{0,12}?\b(\d{2,3})\b/); return m ? Number(m[1]) : null; } },
  { op: "slower", test: (t, o) => !o.inBrief && /\b(slow(er)?( it| this| that| things| everything| (the|this|that)( whole)? \w+)?( right)? down|slower|less fast|too fast)\b/.test(t) },
  { op: "faster", test: (t, o) => !o.inBrief && /\b(speed( it| this| that| things| everything| (the|this|that)( whole)? \w+)? up|faster|quicker|quicken|too slow|pick up the (pace|tempo)|push the tempo)\b/.test(t) },
  { op: "drumsUp", test: (t) => /\b(heav(y|ier)|hard(er)?|punch(y|ier)|big(ger)?|massive|huge|enormous|loud(er)?|strong(er)?|fat(ter)?|beef(y|ier)|thunder\w*|pounding|smash\w*)\b[^.,]{0,18}\b(drums?|beats?|kick|snare|percussion)\b|\b(drums?|beats?|kick|snare|percussion)\b[^.,]{0,18}\b(heavier|harder|punchier|bigger|louder|stronger|hit harder|more power\w*)\b/.test(t) },
  { op: "drumsDown", test: (t) => /\b(light(er)?|soft(er)?|gentle(r)?|quiet(er)?|less)\b[^.,]{0,12}\b(drums?|beats?|percussion)\b|\b(drums?|percussion|kick|snare)\b[^.,]{0,12}\b(lighter|softer|quieter|calmer)\b/.test(t) },
  { op: "drumsVary", test: (t) => /\b(change|new|different|switch up|vary|mix up)\b[^.,]{0,14}\b(drum groove|drum pattern|beat|rhythm|drums)\b|\b(more|some) (rhythmic )?variation\b|\bsyncopated (drums?|beat|groove)\b/.test(t) },
  { op: "bassDirty", test: (t) => /\b(dirt(y|ier)|grit(ty|tier)|distort\w*|filth(y|ier)|nast(y|ier)|growl\w*|aggressive|crunch(y|ier)?)\b[^.,]{0,14}\bbass\b|\bbass(line)?\b[^.,]{0,20}\b(dirt(y|ier)|grit(ty|tier)|filth(y|ier)|nast(y|ier)|distorted)\b/.test(t) },
  { op: "bassClean", test: (t) => /\b(clean(er)?|smooth(er)?|round(er)?|deep(er)?|sub)\b[^.,]{0,10}\bbass\b|\bbass(line)?\b[^.,]{0,20}\b(cleaner|smoother|rounder|deeper)\b/.test(t) },
  { op: "bassMove", test: (t) => /\bwalking bass|\bbass(line)?\b[^.,]{0,16}\b(movement|move|moving|moves|walk\w*|travel\w*)\b|\b(movement|motion)\b[^.,]{0,16}\bbass/.test(t) },
  { op: "bassGroove", test: (t) => /\b(groov\w*|funk\w*|bounc\w*|swing\w*)\b/.test(t) },
  { op: "darker", test: (t) => (/\b(dark(er|en)?|moodier|sadder|sinister|scarier|menacing|evil|ominous|minor)\b/.test(t) && !/\b(not (so |too )?|less )dark/.test(t)) || /\bless bright\b/.test(t) },
  { op: "brighter", test: (t) => (/\b(bright(er|en)?|happier|uplifting|major|sunnier|cheerful|lighter mood|bright twist)\b/.test(t) && !/\bless bright/.test(t)) || /\bless dark\b/.test(t) },
  { op: "dreamier", test: (t) => /\b(dream(y|ier)|ethereal|float(y|ier)|spac(ey|ier)|washy)\b/.test(t) },
  { op: "texture", test: (t) => /\b(atmospher\w*|texture|ambience|deep[- ]sea air|ocean air|wash of)\b/.test(t) },
  { op: "hookUp", test: (t) => /\b(strong(er)?|big(ger)?|catch(y|ier)|memorable|hookier|repeating|sticky|stickier)\b[^.,]{0,10}\bhook\b|\b(strong(er)?|catch(y|ier)|memorable|hookier|repeating|sticky|stickier)\b[^.,]{0,10}\b(melody|tune|lead|riff)\b|\b(hook|melody|tune)\b[^.,]{0,16}\b(catchier|stronger|more memorable|stick|more punch|punchier)\b/.test(t) },
  { op: "chorusUp", test: (t) => /\b(chorus|drop|climax|peak)\b/.test(t) && /\b(big(ger)?|more|power\w*|energy|huge|massive|enormous|epic|loud(er)?|strong(er)?|hit harder|lift|anthem\w*|soar\w*|explod\w*)\b/.test(t) && !/\b(before|into|leading)( up to)? the drop\b/.test(t) },
  { op: "tensionUp", test: (t) => /\b(tension|suspense|anticipation)\b|\b(longer|bigger) build\b|\bbuild\b[^.,]{0,12}\b(longer|bigger|more)\b|\b(silence|a gap|a pause) before the drop\b/.test(t) },
  { op: "breakdown", test: (t) => /\bbreak ?down\b|\bstrip (it|everything|things) (back|down) before\b|\b(just|spare|only|a few|a few spare) pads\b|\bbuild down a peg\b|\b(push|add|try|want|give it) the break\b|\bnothing but\b[^.,]{0,24}\bpads\b|\bjust the (hook and the )?pads\b/.test(t) },
  { op: "counter", test: (t) => /\bcounter[- ]?melod\w*|\bsecond melody\b|\banswering (line|melody)\b|\bcall and response\b/.test(t) },
  { op: "harmony", test: (t) => /\bharmon(y|ies|ise|ize)\b(?! change)|\bin thirds\b|\b(a )?third above\b|\b(layer|double)\b[^.,]{0,12}\b(lead|melody|hook)\b/.test(t) && !/\b(new|different|change the)\s+harmony\b/.test(t) },
  { op: "chordsNew", test: (t) => /\b(new|different|other|fresh|another)\s+(chords?|progression|chord turn)\b|\b(change|swap|replace|redo) the (chords?|progression|harmony)\b|\bchords?\b[^.,]{0,15}\b(different|fresh|more interesting)\b|\bdifferent chord turn\b/.test(t) },
  { op: "fillsMore", test: (t) => /\b(more|add|extra|bigger|some)\b[^.,]{0,12}\b(drum )?(fills?|transitions?)\b|\bfills?\b[^.,]{0,14}\b(every|more)\b/.test(t) },
  { op: "energyUp", test: (t) => /\b(more energy|more intense|hype|more drive|more power)\b/.test(t) && !/\b(chorus|drop|hook)\b/.test(t) },
  { op: "energyDown", test: (t) => /\b(less energy|calmer|chill(er)? it|tone it down|more relaxed|less intense)\b/.test(t) },
  { op: "endingDramatic", test: (t) => /\b(ending|end|outro|finish|finale)\b[^.]{0,22}\b(dramatic|epic|big(ger)?|huge|massive|powerful|cinematic|harder|stronger)\b|\bdramatic\b[^.]{0,16}\b(ending|end|finish|outro|final hit)\b/.test(t) },
  { op: "endingFade", test: (t) => /\bfade[sd]?( it)?( out| away)\b|\bfade at the end\b|\b(outro|ending|end)\b[^.,]{0,16}\bfade|\bfade\b[^.,]{0,16}\b(outro|ending)\b/.test(t) },
  { op: "leadNew", test: (t) => /\b(new|different|another|change the|swap the|replace the|redo the|rewrite the|other)\s+(melody|lead|tune|riff|hook)\b/.test(t) },
  { op: "leadDarker", test: (t) => /\b(melody|lead|hook|tune)\b/.test(t) && /\b(dark(er)?|sad(der)?|moodier|sinister|lower)\b/.test(t) },
  { op: "lessBusy", test: (t) => /\b(less busy|too busy|not (so|as) busy|don'?t make it (so|too) busy|declutter|strip it back|thin (it|things|out)( out)?|less going on|breathing room|more room to breathe|fewer notes|sparser|simpler|simplify)\b/.test(t) },
  { op: "busier", test: (t) => /\b(busier|more going on|fill it out|more notes|more complex|fancier)\b/.test(t) },
  { op: "reverbUp", test: (t) => /\b(more|bigger|add|some|extra)\s+(reverb|space|echo|room)\b|\b(wetter|cavernous|spacious|roomier|airier)\b/.test(t) },
  { op: "reverbDown", test: (t) => /\b(less|drier|no)\s+(reverb|echo)\b|\bdrier\b/.test(t) },
  { op: "surprise", test: (t, o) => !o.inBrief && /\b(surprise me|something unexpected|unexpected|a twist|switch it up|shake it up|mix it up)\b/.test(t) },
  { op: "mute", test: (t) => { const m = t.match(/\b(mute|remove|kill|drop out|lose|cut|take out|get rid of)\s+(the\s+)?(drums?|bass|chords?|pads?|lead|melody)\b/) || t.match(/\b(take|pull|drop|cut|kick)\s+(the\s+)?(drums?|bass|chords?|pads?|lead|melody)\s+out\b/); return m ? trackWord(m[3]) : null; } },
  { op: "unmute", test: (t) => { const m = t.match(/\b(unmute|bring back|add back|restore)\s+(the\s+)?(drums?|bass|chords?|pads?|lead|melody)\b/) || t.match(/\b(bring)\s+(the\s+)?(drums?|bass|chords?|pads?|lead|melody)\s+back\b/); return m ? trackWord(m[3]) : null; } },
  { op: "solo", test: (t) => { const m = t.match(/\b(solo|just|only)\s+(the\s+)?(drums?|bass|chords?|pads?|lead|melody)\b/); return m ? trackWord(m[3]) : null; } },
];
function trackWord(w) {
  if (/^drum/.test(w)) return "drums";
  if (/^bass/.test(w)) return "bass";
  if (/^(chord|pad)/.test(w)) return "chords";
  return "lead";
}

// ---------- what is he doing? ----------
//
// ☠️ "My car won't start again" REPLACED HIS SONG, "I'm too busy" thinned it, and "It's too dark" made
// it darker (audit, 4 Nov). A word list can't tell talking to her from asking for music, so each clause
// is read for what it is doing before its keywords count:
//
//   new        asks for a song that doesn't exist yet
//   modify     asks for a change, and the thing to change is the music
//   feedback   criticises the music: the fix is made, offered or asked about, by how safe it is
//   question   asks something: nothing changes, she answers
//   chat       anything else: nothing changes
//   ambiguous  could be the music or his life: nothing changes, she may ask
//   clarify    plainly about the music but doesn't say what: nothing changes, she asks
//   undo, reverse, repeat, transport   the last change, or the speakers: the song's notes don't change on his say-so alone
//
// The test is what the words are ABOUT: the noun in the subject or object slot. A trigger word never
// counts by itself ("make the room darker" has one; the room isn't music). Words outside these slots
// can be anything, so "make it darker, like a funeral" needs no entry for funerals. An unknown noun
// in the slot means it isn't about the music, and a wrong guess leaves his song alone.

const WHOLE = /^(songs?|tracks?|tunes?|music|mix)$/;
const PART = /^(drums?|kit|kick|snare|hats?|hi-?hats?|percussion|beat|bass|bassline|sub|chorus|verse|drop|build|breakdown|intro|outro|ending|end|melody|melodies|hook|lead|riff|chords?|progression|pads?|synths?|harmony|harmonies|counter-?melody|reverb|echo|delay|tempo|bpm|pace|groove|rhythm|fills?|sections?|layers?|part|half|sound|vibe|mood|notes?|key)$/;
const ATTR = /^(energy|tension|space|room|atmosphere|texture|ambience|movement|variation|power|drive|punch|weight|grit|air|oomph|grunt|depth|life|soul)$/;
const PERSONAL_ATTR = /^(energy|space|room|air|power|weight)$/; // a person needs these too: "I need more space"
const DEICTIC = /^(it|this|that|these|those|everything|things)$/;
const DET = /^(a|an|the|this|that|these|those|some|any|another|my|our|more|less|fewer|extra|much|way|even|bit|little|lot|lots|heaps|touch|tad|few|no|whole|all)$/;
const QUALITY = /^(more|less|fewer|heavier|darker|bigger|stronger|catchier|busier|longer|shorter|slower|faster|quicker|higher|lower|brighter|dreamier|groovier|grittier|dirtier|filthier|nastier|harder|softer|lighter|punchier|louder|quieter|simpler|sparser|wider|deeper|cleaner|calmer|moodier|happier|sunnier|wetter|drier|new|different|dramatic|busy|dreamy|fast|slow|quiet|loud|dark|bright|intense)$/;
const ADVERB = /^(else|now|again|still|overall|throughout|then|please|up|down|back|out|off|in|over|bit|little|lot|lots|heaps|touch|tad|more|less|way|much|even|already|instead|a|just|really|very|quite|pretty|slightly|somewhat|kinda|far)$/;
const INTENS = /^(a|bit|little|lot|lots|touch|tad|way|much|even|heaps|far|slightly|somewhat|just|still|really|very|quite|pretty|kinda|bloody|so|all|wee|nearly|only|kind|sort|of)$/;
const COPULA = /^(is|are|was|were|am|been|be|feels?|feeling|sounds?|sounding|seems?|seeming|looks?|looking|getting|gets|got|gotten|become)$/;
const PREP = /^(in|on|at|for|from|with|by|to|into|over|under|before|after|during|through|across|around|near|of|off|about)$/;
const FREE = /^(like|as|so|because|cos|coz|cause|since|while|until|when)$/; // what follows is colour, not the object
const VERBS = /^(make|turn|change|get|give|gimme|add|put|bring|drop|cut|mute|unmute|solo|remove|kill|lose|raise|lower|push|pull|boost|double|build|use|keep|fade|strip|simplify|thin|declutter|shake|mix|throw|vary|swap|layer|harmoni[sz]e|lift|crank|pump|tone|calm|take|slow|speed|try|end|finish|surprise|go|set|switch|chuck|whack|bung|shove|stick|bump|dial|fatten|beef|dirty|liven|pick|move|shift|sharpen|soften|tighten|widen|deepen|darken|brighten|ease|reduce|increase|fix|tweak|adjust|alter|modify|rework|redo|remix|polish|refine|have|hear|start|chill|knock|wind|rough|quicken)$/;
const CREATE = /^(make|create|write|compose|produce|generate|do|give|gimme|build|play|start|cook|whip|knock|lay|bang|throw|put|drop|sing)$/;
const SONG = /^(songs?|tracks?|tunes?|beats?|bangers?|anthems?|pieces?|soundtracks?|scores?|jams?|instrumentals?|music|bops?|lullab(?:y|ies)|ballads?|jingles?|ditt(?:y|ies)|waltz(?:es)?|hymns?)$/;
const PRAISE = /^(sick|ripper|deadset|absolute|awesome|great|good|nice|cool|killer|mad|mint|unreal|cracking|banging|beautiful|lovely|gorgeous|brilliant|perfect|amazing|love|loving|fire|wow)$/;
const NEGATED = /\b(don't|dont|do not|doesn't|didn't|isn't|aren't|wasn't|weren't|won't|wouldn't|shouldn't|can't|cannot|couldn't|never|no need|not|stop|leave)\b/;
const QUESTION_START = /^(what(?:'s|s)?|when|where|who|whose|why|how|which|is|are|am|was|were|do (?:you(?! mind)|we|i|they|he|she|ya)|does|did|have|has|had|should|shall|may|might|must|isn't|aren't|wasn't|weren't|don't|doesn't|didn't|won't|wouldn't|shouldn't|can't(?! stand| hear| really hear)|couldn't)\b/;
const PROPOSAL = /^(what if|what about|how about|how 'bout|why don't (we|you)|why not|should be|has to be|must be)\b/;
const SARCASM = /^(oh|ooh) (great|yeah|sure|brilliant|good|wonderful|lovely|nice|perfect|wow)\b|^yeah right\b|^yeah,? because\b|^because (that|what|it)\b|^as if\b|^good one\b|^nice one\b|\bthat'?ll (fix|help|do|solve)\b|\bwill solve everything\b|\bwhy don'?t you\s*[.!?]*$|\bwhy not\s*[.!?]*$|\bwhatever you (reckon|say|want)\b|\bwhat (this|it) needs is\b|\bwhat a (genius|great|brilliant|stupid) idea\b|\bjust what (i|we|you) (needed|wanted|want|need)\b/;
const STRONG_GENRE = /\b(electro[- ]?rock|electronic rock|industrial|grunge|punk|metal|d(rum)? ?(&|and|n) ?b(ass)?|dnb|trap|hip[- ]?hop|rap|drill|lo[- ]?fi|chill ?hop|jazzy|synth ?wave|retro ?wave|outrun|techno|rave|disco|ambient|cinematic|orchestral|electronic|electro|synth[- ]?pop)\b/g;
const WEAK_GENRE = /\b(house|rock|pop|dance|club)\b/g;

// A criticism is fixed outright only when the fix is small and there's only one. Re-keying the song is
// a taste call, so "too dark" offers. Where no single fix exists she asks, with these as her suggestions.
const TOO_FIX = { busy: "lessBusy", cluttered: "lessBusy", messy: "lessBusy", crowded: "lessBusy", complicated: "lessBusy", fast: "slower", quick: "slower", rushed: "slower", slow: "faster", sluggish: "faster" };
const TOO_OFFER = { dark: "brighter", gloomy: "brighter", grim: "brighter", moody: "brighter", sad: "brighter", depressing: "brighter", bright: "darker", happy: "darker", cheerful: "darker", sunny: "darker", sparse: "busier", empty: "busier", thin: "busier", bare: "busier", simple: "busier" };
const TOO_OPEN = { loud: ["drumsDown", "reverbDown"], quiet: ["drumsUp", "energyUp"], soft: ["drumsUp", "energyUp"], heavy: ["drumsDown"], light: ["drumsUp"], repetitive: ["drumsVary", "leadNew"], samey: ["drumsVary", "leadNew"], same: ["drumsVary", "leadNew"], boring: ["surprise", "hookUp"], bland: ["surprise", "hookUp"], dull: ["surprise", "hookUp"], cheesy: ["leadNew", "darker"], flat: ["energyUp", "chorusUp"], weak: ["energyUp", "chorusUp"], noisy: ["lessBusy"], chaotic: ["lessBusy"], shrill: ["reverbUp"], tinny: ["reverbUp"], boomy: ["bassClean"], muffled: ["brighter"], worse: ["undo"], long: [], short: [], low: [], high: [], generic: ["surprise", "leadNew"], predictable: ["surprise", "leadNew"], stale: ["surprise", "leadNew"], dated: ["surprise", "leadNew"], cheap: [], lame: ["surprise", "hookUp"], harsh: ["reverbUp"], muddy: ["lessBusy"], weird: [], much: ["lessBusy"] };
/** The way back from a change: for opposites said together, and for "no, the other way". */
export const OPPOSITE = { darker: "brighter", brighter: "darker", leadDarker: "brighter", faster: "slower", slower: "faster", drumsUp: "drumsDown", drumsDown: "drumsUp", reverbUp: "reverbDown", reverbDown: "reverbUp", energyUp: "energyDown", energyDown: "energyUp", lessBusy: "busier", busier: "lessBusy", bassDirty: "bassClean", bassClean: "bassDirty", mute: "unmute", unmute: "mute" };
const MOOD_OPS = new Set(["darker", "brighter", "leadDarker", "dreamier"]);
const INVERSE = { weak: "heavier", loud: "softer", quiet: "louder", soft: "louder", heavy: "lighter", light: "heavier", hard: "softer", dirty: "cleaner", clean: "dirtier", busy: "less busy", dark: "brighter", bright: "darker", fast: "slower", slow: "faster", happy: "darker", sad: "brighter" };
const PUSH = { dark: "darker", bright: "brighter", fast: "faster", slow: "slower", busy: "busier", heavy: "heavier", hard: "harder", big: "bigger", loud: "louder", strong: "stronger", catchy: "catchier", dirty: "dirtier", punchy: "punchier", deep: "deeper", quiet: "softer", soft: "softer", long: "longer", tense: "more tension", dramatic: "more dramatic" };
const MILD = /^(dark|bright|busy|fast|slow|heavy|loud|quiet|soft)$/;
const NEG_EVAL = /^(boring|repetitive|samey|same|bland|dull|flat|weak|thin|lifeless|rubbish|shit|shite|crap|trash|garbage|average|ordinary|annoying|forgettable|cheesy|lame|terrible|awful|bad|horrible|muddy|harsh|tinny|wrong|weird|strange|off|cheap|naff|tacky|dated|stale|generic|predictable|empty|worse)$/;

const wordsOf = (t) => t.replace(/[^a-z0-9'&+#-]+/g, " ").trim().split(" ").filter(Boolean);
const isMusic = (w) => WHOLE.test(w) || PART.test(w);
const baseVerb = (v) => {
  if (v === "made") return "make";
  if (VERBS.test(v)) return v;
  for (const s of [v.replace(/ing$/, ""), v.replace(/ing$/, "e"), v.replace(/(.)\1ing$/, "$1"), v.replace(/ed$/, ""), v.replace(/d$/, ""), v.replace(/(.)\1ed$/, "$1")]) if (VERBS.test(s)) return s;
  return null;
};

/** What a noun phrase is about: deictic, music, attr, something, none (no noun at all) or foreign. */
function aboutNP(np) {
  let i = 0, j = np.length;
  while (i < j && DET.test(np[i]) && !(DEICTIC.test(np[i]) && i === j - 1)) i++;
  while (j > i && (QUALITY.test(np[j - 1]) || ADVERB.test(np[j - 1]))) j--;
  const core = np.slice(i, j);
  if (!core.length) return np.some((w) => DEICTIC.test(w)) ? "deictic" : "none";
  if (DEICTIC.test(core[0])) return "deictic";
  if (core[0] === "something" || core[0] === "anything") return "something";
  if (core.join(" ") === "thing" || core.join(" ") === "lot" || core.join(" ") === "one") return "deictic";
  if (/\bchord turn$/.test(core.join(" "))) return "music";
  if (np.length > 2 && np[np.length - 1] === "bit" && /^(the|this|that)$/.test(np[0])) return "music"; // "the middle bit"
  if (isMusic(core[core.length - 1]) || isMusic(core[0]) || (ATTR.test(core[0]) && !/^(room|space|air)$/.test(core[0]) && /^(the|this|that)$/.test(np[i - 1] || ""))) return "music"; // "the energy down a notch"
  if (ATTR.test(core[core.length - 1])) return /^(room|space|air)$/.test(core[core.length - 1]) && /^(the|this|that|my|our)$/.test(np[i - 1] || "") ? "foreign" : "attr"; // "the room" is a place; "more room" is space in the mix
  return "foreign";
}
const boundaryIn = (w) => { const i = w.findIndex((x, k) => PREP.test(x) || FREE.test(x) || x === "than" || x === "and" || x === "or" || (/^(going|leading|heading|coming)$/.test(x) && PREP.test(w[k + 1] || ""))); return i < 0 ? w.length : i; };

/** Is what trails the object still about the music? "before the drop" is; "on the motorway" isn't. */
function tailIsMusic(tail) {
  for (let i = 0; i < tail.length;) {
    const w = tail[i];
    if (FREE.test(w)) return true;
    if (w === "to" && /^(be|sound|feel|hit|go|get|have|come|land)$/.test(tail[i + 1] || "")) return true; // "the hook to be more memorable"
    if (w === "than") return /^(that|this|before|now|it)$/.test(tail[i + 1] || "");
    if (w === "by" && !/^\d+$/.test(tail[i + 1] || "")) return false; // "by now", "by Friday"
    if (PREP.test(w) || w === "and" || w === "or") {
      let k = i + 1;
      while (k < tail.length && !PREP.test(tail[k]) && !FREE.test(tail[k]) && tail[k] !== "and" && tail[k] !== "or" && tail[k] !== "than") k++;
      const np = tail.slice(i + 1, k), about = aboutNP(np);
      const place = about === "none" && np.some((x) => /^(the|my|our|that|this)$/.test(x)); // "in the back"
      const fine = !np.length || (about !== "foreign" && !place) || /^(me|us|there|\d+)$/.test(np[0]) || np.some((x) => /^\d+$/.test(x)) || (/^(to|into)$/.test(w) && genreOf(np.join(" ")) !== null);
      if (!fine) return false;
      i = k;
    } else i++;
  }
  return true;
}

/** Everything before the comment, as a subject: what is being talked about? */
function subjectOf(before) {
  let w = before.slice();
  const past = w.some((x) => x === "was" || x === "were");
  while (w.length && (INTENS.test(w[w.length - 1]) || COPULA.test(w[w.length - 1]) || /^(has|have)$/.test(w[w.length - 1]))) w.pop();
  if (w.some((x) => NEGATED.test(x))) return { cls: "negated" };
  if (w.some((x) => /^(his|her|their|your|said|says|reckons|told|thinks|thought)$/.test(x))) return { cls: "foreign" }; // "my mate said his song"
  if (!w.length) return { cls: "bare", past };
  w = w.map((x, i) => (i === w.length - 1 ? x.replace(/'(s|re)$/, "") : x));
  while (w.length && INTENS.test(w[w.length - 1])) w.pop();
  if (w.length === 2 && /^(this|that)$/.test(w[0]) && w[1] === "one") return { cls: "deictic", past };
  if (w.length === 1 && DEICTIC.test(w[0])) return { cls: "deictic", past, it: w[0] === "it" };
  if (w.join(" ") === "the whole thing" || w.join(" ") === "the lot") return { cls: "whole", head: "track", past };
  const last = w[w.length - 1];
  const det = w.length > 1 ? w[0] : "";
  if (w.every((x) => !PREP.test(x)) && w.slice(0, -1).every((x) => !/'s$/.test(x)) && (/^(the|this|that|these|those)?$/.test(det) || (/^(my|our)$/.test(det) && WHOLE.test(last))) && (WHOLE.test(last) || PART.test(last))) return { cls: WHOLE.test(last) ? "whole" : "part", head: last, past, the: det === "the" };
  if (w.length === 1 && isMusic(last)) return { cls: WHOLE.test(last) ? "whole" : "part", head: last, past };
  return { cls: "foreign" };
}
const talkingAboutMusic = (s) => s.cls === "deictic" || s.cls === "part" || s.cls === "whole";

// What may follow a criticism and leave it a criticism. Anything else ("in here", "to see") is his life.
function criticismTail(after) {
  let w = after.slice(), soft = false;
  const t = w.join(" ");
  if (/^for (me|us|my liking|my taste)\b/.test(t)) { soft = true; w = w.slice(/^for me|^for us/.test(t) ? 2 : 3); }
  if (/^(now|still|though|overall|anyway|again|that|to me|at the moment|right now|isn't it|innit|aye|eh|hey|yeah|mate|really|yet)?( (now|still|though|anyway|isn't it|innit|eh|hey|mate|yet))*$/.test(w.join(" "))) return { ok: true, soft };
  if (PREP.test(w[0] || "") && w[0] !== "to" && tailIsMusic(w) && aboutNP(w.slice(1)) !== "none") return { ok: true, soft };
  return { ok: false };
}

function remedy(adj, subj, soft) {
  const about = `too ${adj}`;
  const specific = subj.cls === "part" && !TOO_FIX[adj] && INVERSE[adj] ? opsIn(`${INVERSE[adj]} ${subj.head}`, {}) : [];
  const fix = specific.length ? specific.map((o) => o.op) : subj.cls === "part" && !TOO_FIX[adj] ? [] : [TOO_FIX[adj] || TOO_OFFER[adj]].filter(Boolean);
  if (fix.length) {
    const taste = soft || fix.every((f) => MOOD_OPS.has(f)) || (!TOO_FIX[adj] && subj.cls !== "part");
    return taste ? { kind: "feedback", offer: fix, about } : { kind: "feedback", ops: opsNamed(fix), about };
  }
  return { kind: "feedback", offer: TOO_OPEN[adj] || [], about, open: true };
}
const opsNamed = (names) => names.map((op) => ({ op, arg: true }));

function readFeedback(w, t) {
  // "Too much reverb", "too many notes", "too much going on".
  const much = t.match(/^(?:(?:it's|that's|this is|there's) )?(?:way |far |just |a bit |bit )*too (much|many)(?: (.+))?$/);
  if (much) {
    const what = much[2] || "";
    if (!what) return { kind: "feedback", offer: TOO_OPEN.much, about: "too much", open: true };
    if (/^(reverb|echo)\b/.test(what)) return { kind: "feedback", ops: opsNamed(["reverbDown"]), about: `too much ${what}` };
    if (/^(notes|going on|stuff going on|happening)\b/.test(what)) return { kind: "feedback", ops: opsNamed(["lessBusy"]), about: `too much ${what}` };
    const words = wordsOf(what);
    return isMusic(words[0]) || ATTR.test(words[0]) ? { kind: "feedback", offer: [], about: `too much ${what}`, open: true } : { kind: "chat" };
  }
  const too = w.indexOf("too");
  if (too >= 0 && w[too + 1]) {
    const adj = w[too + 1], subj = subjectOf(w.slice(0, too));
    if (subj.cls === "negated") return { kind: "chat" };
    if (!talkingAboutMusic(subj) && subj.cls !== "bare") return null;
    if ((subj.it || subj.the) && subj.past) return { kind: "chat" }; // "it was too dark", "the ending was too sad": some other thing
    const known = TOO_FIX[adj] || TOO_OFFER[adj] || TOO_OPEN[adj];
    if (!known && !(subj.cls === "part" || subj.cls === "whole")) return null;
    const tail = criticismTail(w.slice(too + 2));
    if (!tail.ok) return null;
    return remedy(adj, subj, tail.soft);
  }
  // "Not fast enough", "the drums aren't heavy enough", "not enough tension".
  const noun = t.match(/^(?:(?:it's|there's|this has|it has) )?not enough (.+)$/);
  if (noun) {
    const what = wordsOf(noun[1]), ops = opsIn(`more ${noun[1]}`, {});
    if (!isMusic(what[what.length - 1]) && !ATTR.test(what[what.length - 1])) return { kind: "chat" };
    return ops.length ? { kind: "feedback", ops, about: `not enough ${noun[1]}` } : { kind: "feedback", offer: [], about: `not enough ${noun[1]}`, open: true };
  }
  const enough = w.indexOf("enough");
  if (enough > 0 && /\b(not|isn't|aren't|ain't|wasn't|weren't)\b|n't\b/.test(w.slice(0, enough).join(" "))) {
    const adj = w[enough - 1], before = w.slice(0, enough - 1).filter((x) => !/^(not|isn't|aren't|ain't|wasn't|weren't)$/.test(x)).map((x) => x.replace(/n't$/, ""));
    const subj = subjectOf(before);
    if (!talkingAboutMusic(subj) && subj.cls !== "bare") return null;
    const about = `not ${adj} enough`, comp = PUSH[adj];
    if (!comp || !criticismTail(w.slice(enough + 1)).ok) return comp ? null : { kind: "feedback", offer: [], about, open: true };
    const ops = opsIn(subj.cls === "part" ? `${comp} ${subj.head}` : comp, {});
    if (!ops.length) return { kind: "feedback", offer: [], about, open: true };
    return ops.every((o) => MOOD_OPS.has(o.op)) ? { kind: "feedback", offer: ops.map((o) => o.op), about } : { kind: "feedback", ops, about };
  }
  // "I don't like the drums", "I hate this track", "not a fan of the melody".
  if (/^not (?:a|really a) fan$/.test(t)) return { kind: "feedback", offer: [], about: "he's not a fan", open: true };
  const howItGoes = t.match(/^(?:i )?(?:don't|do not|didn't) (?:really )?(?:like|love) (?:how|the way|what) (.+)$/);
  if (howItGoes) return /\b(it|this|that|drums?|bass|chorus|melody|hook|lead|chords?|beat|song|track)\b/.test(howItGoes[1]) ? { kind: "feedback", offer: [], about: t, open: true } : { kind: "chat" };
  const dislike = t.match(/^(?:i )?(?:don't|do not|didn't|can't stand|really don't) (?:really )?(?:like|love|dig|rate) (.+)$|^(?:i )?hate (.+)$|^(?:i'm )?not (?:a|really a) fan of (.+)$|^(?:i'm )?over (.+)$|^(?:i'm )?not (?:really |quite |exactly |so |too )?(?:feeling|loving|digging|into|sold on) (.+)$|^(?:i )?can't stand (.+)$|^(?:i'm )?(?:not sure about|unsure about|not convinced by|not happy with) (.+)$/);
  if (dislike) {
    const obj = wordsOf(dislike.slice(1).find(Boolean)), about = aboutNP(obj.slice(0, boundaryIn(obj)));
    if ((about === "music" || about === "deictic") && tailIsMusic(obj.slice(boundaryIn(obj)))) return { kind: "feedback", offer: [], about: `he doesn't like ${obj.join(" ")}`, open: true };
    return { kind: "chat" };
  }
  // "The chorus doesn't hit", "the drop doesn't land".
  const nohit = t.match(/^(.+?) (?:doesn't|don't|isn't|aren't|won't|not) (?:really )?(hit|hitting|slap|slapping|work|working|land|landing|pop|popping|kick|kicking|stick|sticking)\b(.*)$/);
  if (nohit) {
    const subj = subjectOf(wordsOf(nohit[1]));
    if (subj.cls === "part" || subj.cls === "whole") return { kind: "feedback", offer: TOO_OPEN.weak, about: `${nohit[1]} doesn't ${nohit[2]}`, open: true };
    if (subj.cls === "deictic") return { kind: "ambiguous", offer: [], about: t }; // "it's not working" may be the telly
  }
  // "Something's off", "something's not quite right with the second half".
  const wrong = t.match(/^something(?:'s| is) (?:(?:not|isn't) (?:quite |really )?right|off|missing|wrong|weird|funny)(?: (?:with|in|about) (.+))?$/);
  if (wrong) return !wrong[1] || /^(music|deictic)$/.test(aboutNP(wordsOf(wrong[1]))) ? { kind: "feedback", offer: [], about: "something's off", open: true } : { kind: "chat" };
  // "That was better before", "I liked it better before": the fix on offer is going back.
  if (/^(?:that|it|this)(?: one)?(?: was|'s| is| sounded)? better (?:before|earlier|last time|the first time)$|^i (?:liked|preferred|loved) (?:it|that|the old one|the last one|the old version|the last version)(?: better| more)?(?: before)?$|^(?:the )?(?:old|last|first|previous) (?:one|version) was better$/.test(t)) return { kind: "feedback", offer: ["undo"], about: "he liked it better before", open: true };
  // "I can barely hear the melody".
  const unheard = t.match(/^(?:i )?(?:can't|cannot|can barely|can hardly|could barely|could hardly) (?:really )?hear (.+)$/);
  if (unheard) {
    const obj = wordsOf(unheard[1]), cut = boundaryIn(obj);
    if (aboutNP(obj.slice(0, cut)) === "music" && tailIsMusic(obj.slice(cut))) return { kind: "feedback", offer: opsIn(`louder ${obj[obj.length - 1]}`, {}).map((o) => o.op), about: t, open: true };
  }
  // "This sucks", "the drums suck", "the song isn't very good".
  const sucks = t.match(/^(.+?) (?:sucks?|blows|stinks)$/) || t.match(/^(.+?)(?: isn't| aren't| is not| are not|'s not|'re not) (?:very |that |really |so |all that )?(?:good|great|catchy|strong|interesting|exciting)$/);
  if (sucks) {
    const subj = subjectOf(wordsOf(sucks[1]));
    if (subj.cls === "part" || subj.cls === "whole") return { kind: "feedback", offer: ["surprise", "hookUp"], about: t, open: true };
    if (subj.cls === "deictic") return { kind: "ambiguous", offer: [], about: t };
  }
  // "It's got no energy", "there's no punch".
  const noneOf = t.match(/^(?:it's got|it has|it got|this has|this's got|that's got|there's|there is) no (\w+)$/);
  if (noneOf) return ATTR.test(noneOf[1]) || isMusic(noneOf[1]) ? { kind: "feedback", offer: TOO_OPEN.weak, about: `no ${noneOf[1]}`, open: true } : { kind: "chat" };
  if (NEGATED.test(t)) return null;
  if (/^(?:it|this|that)(?: just)? keeps (?:repeating|looping)$/.test(t) || /^(?:it's|that's|this is) (?:all )?the same(?: thing)?(?: over and over| again)?$/.test(t)) return { kind: "feedback", offer: TOO_OPEN.same, about: "it keeps repeating", open: true };
  // "The verse drags", "it's dragging".
  const drags = t.match(/^(.+?) (?:drags|plods|sags|drones on|goes on too long)$/) || t.match(/^(.+?)(?:'s| is) dragging$/);
  if (drags && talkingAboutMusic(subjectOf(wordsOf(drags[1])))) return { kind: "feedback", offer: ["faster", "energyUp"], about: t, open: true };
  // "It's missing something", "it lacks punch", "something's off with the drums".
  const miss = t.match(/^(.+?)(?: is|'s)? (?:missing|lacks?|lacking)\b(.*)$/) || t.match(/^(.+?) needs (something|(?:some |more )?work|fixing|help)$/);
  if (miss) {
    const subj = subjectOf(wordsOf(miss[1]));
    if (talkingAboutMusic(subj)) return { kind: "feedback", offer: [], about: `${miss[1]} is missing something`, open: true };
  }
  // "That melody's doing my head in".
  const annoy = t.match(/^(.+?)(?:'s| is| are) (?:doing my head in|driving me (?:nuts|mad|crazy)|annoying me|shitting me)$/);
  if (annoy) { const subj = subjectOf(wordsOf(annoy[1])); if (talkingAboutMusic(subj)) return { kind: "feedback", offer: [], about: t, open: true }; }
  if (/\bsounds? the same\b/.test(t) && talkingAboutMusic(subjectOf(wordsOf(t.replace(/\b(all )?sounds? the same\b.*/, ""))))) return { kind: "feedback", offer: TOO_OPEN.same, about: "it all sounds the same", open: true };
  // "It's boring", "bit samey", "the drums are weak": a bad word about the music, without "too".
  const ev = w.findIndex((x) => NEG_EVAL.test(x));
  if (ev >= 0) {
    const before = w.slice(0, ev), subj = subjectOf(before), hedged = before.length > 0;
    if (subj.it && subj.past) return { kind: "chat" };
    const okBare = subj.cls === "bare" && (hedged || /^(boring|repetitive|samey|bland|dull)$/.test(w[ev]));
    if ((talkingAboutMusic(subj) || okBare) && criticismTail(w.slice(ev + 1)).ok) return { kind: "feedback", offer: TOO_OPEN[w[ev]] || ["surprise", "hookUp"], about: t, open: true };
  }
  // "It's a bit dark", "bit busy eh": said of it, but not asked for: a description or a complaint?
  const mild = w.findIndex((x) => MILD.test(x));
  if (mild >= 0) {
    const before = w.slice(0, mild), subj = subjectOf(before);
    if (!before.includes("getting") && (subj.cls === "deictic" || (subj.cls === "bare" && before.length > 0)) && before.length > 0 && criticismTail(w.slice(mild + 1)).ok) {
      const adj = w[mild], offer = [TOO_FIX[adj] || TOO_OFFER[adj] || (TOO_OPEN[adj] || [])[0]].filter(Boolean);
      return { kind: "ambiguous", offer, about: `a bit ${adj}` };
    }
  }
  if (/^(?:it's |it is |this is )?getting (?:\w+er)$/.test(t)) return { kind: "ambiguous", offer: [], about: t };
  // "It sounds like a toy piano": said of it, but is it a complaint? She can ask.
  if (/^(?:it|this|that)(?:'s| is)? (?:still |just |kinda |kind of |all )?sound(?:s|ing) like\b/.test(t)) return { kind: "ambiguous", offer: [], about: t };
  // "The chorus is a letdown", "the intro takes forever": a statement about one part of his song, and not praise.
  const part = t.match(/^(?:the|this|that) (?:\w+ )?(?:drums?|kick|snare|bass|bassline|chorus|verse|intro|outro|ending|melody|hook|lead|riff|chords?|pads?|synths?|harmony|reverb|tempo|groove)(?:'s)? (\S+)/);
  if (part) {
    const said = /'s \S+$/.test(part[0]), next = t.slice(part.index + part[0].length).trim().split(" ")[0] || "";
    const verbal = said ? !PREP.test(part[1]) : /^(is|are|sounds?|feels?|seems?)$/.test(part[1]) || (/[a-z]s$/.test(part[1]) && !/^(needs|wants|has|does|was|slaps|rocks|bangs|kills|smashes|hits|works|rules|pops|grooves|thumps|moves|kicks|shines|sings)$/.test(part[1]));
    if (verbal && w[w.length - 1] !== "now" && (said || !PREP.test(next)) && !w.some((x) => PRAISE.test(x))) return { kind: "ambiguous", offer: [], about: t };
  }
  return null;
}

/** The object of a verb that makes things: is it a song? firm, soft (only when the studio is empty), or null. */
function songObject(wIn, withVerb = true) {
  let a = wIn.slice();
  const skip = () => { while (a.length && /^(up|down|out|together|me|us)$/.test(a[0])) a.shift(); };
  skip();
  const cut = a.findIndex((x) => /^(about|for|with|that|which|like|in|of|from|on|at|to|by)$/.test(x));
  let np = cut < 0 ? a.slice() : a.slice(0, cut);
  const rest = cut < 0 ? [] : a.slice(cut);
  const ends = np.findIndex((x, k) => k < np.length - 1 && SONG.test(x) && /^(something|nice|maybe|mate)$/.test(np[k + 1]));
  if (ends >= 0) np = np.slice(0, ends + 1);
  if (!np.length || np.some((x) => /^(the|this|that|these|those|my|your|our|his|her|their|it|him|them|you|i|we|he|she|they)$/.test(x))) return null;
  if (rest.length && !/^(about|for|with|like|in|of)$/.test(rest[0]) && !(rest[0] === "at" && /^\d/.test(rest[1] || "")) && !(rest[0] === "to" && rest[1] && !DET.test(rest[1]))) return null; // "a song on the radio", "rap on the door". "A beat to study to" is fine
  while (np.length > 1 && /^(together|again|please|now|then|mate)$/.test(np[np.length - 1])) np.pop();
  const head = np[np.length - 1];
  if (SONG.test(head)) {
    if (rest[0] === "of" && !/\b(music|song)\b/.test(rest.join(" "))) return null; // a piece of toast
    return { firm: true, plainNoun: np.length === 1 };
  }
  if (np[0] === "something") {
    if (np.some((x) => /(er|ier)$/.test(x) && QUALITY.test(x))) return null; // "something darker" is a change
    const said = np.slice(1).join(" ");
    if (rest.length && (!said || /\b(else|different|better|good|nice|cool|new)\b/.test(said))) return null; // "something for lunch", "something else with the kids"
    if (/\b(new|fresh)\b/.test(said)) return { soft: true };
    if (/\b(else|different|better|good|nice|cool)\b/.test(said)) return { ask: true }; // it wants something, but which?
    if (!withVerb && (!said || (moodOf(said) === null && genreOf(said) === null && !/\b(sad|slow|fast|heavy|quiet|loud)\b/.test(said)))) return null;
    return { soft: true, bare: np.length === 1 };
  }
  if (np[0] === "a" || np[0] === "an") return null;
  if (rest[0] === "about") return null; // "rave about it"
  return genreOnly(np.join(" "), withVerb) ? { soft: true } : null;
}
/** Nothing but genre and mood words: "dark techno", "house music", "lo-fi". Not "my house", not "rock fishing". */
function genreOnly(t, withVerb = false) {
  let rest = t.replace(/\b(some|please|a|bit|stuff|style|thanks|mate)\b/g, " ");
  const hadMusic = /\bmusic\b/.test(rest);
  rest = rest.replace(/\bmusic\b/g, " ");
  const hadMood = wordsOf(rest).some((x) => moodOf(x) !== null);
  rest = wordsOf(rest).filter((x) => moodOf(x) === null).join(" ");
  const strong = rest.replace(STRONG_GENRE, " ").trim() === "" && rest.trim() !== "";
  if (strong) return true;
  const weak = rest.replace(STRONG_GENRE, " ").replace(WEAK_GENRE, " ").trim() === "" && rest.trim() !== "";
  return weak && (hadMusic || hadMood || withVerb);
}

function readNewSong(w, tIn, q, polite) {
  const t = tIn.replace(/^((?:(?:can|could|would|will) (?:you|ya|u|we) (?:please |just )?|(?:let's|lets|let us) (?:just )?)?)(?:come up with|hook (?:me|us) up with|sort (?:me|us) out with)\b/, "$1make");
  // "Start over" is plain. "Start again" could just mean from the top, so with a song loaded she asks.
  const restart = t.match(/^(?:(?:let's|lets|let us|can we|could we|we should|let's just|just) )?(?:start|begin) (over|again|afresh|from scratch)(?: (?:with|then)\b(.*))?$/);
  if (restart && !restart[2]) return { kind: restart[1] === "again" ? "soft" : "new" };
  if (restart && (genreOf(restart[2]) !== null || moodOf(restart[2]) !== null || /\b(song|track|tune|beat|banger|music|melody|drums|bass)\b/.test(restart[2]))) return { kind: "new" };
  if (/^(?:(?:let's|lets) )?start (?:a )?(?:new|fresh)(?: one)?$|^time for a new one$/.test(t)) return { kind: "new" };
  if (!q && /^(?:a |another )?(?:brand )?(?:new|another|different|fresh) (?:song|track|tune|beat|piece|banger)(?: now| already)?(?: (?:with|about|for|please|something|mate)\b.*)?$/.test(t)) return { kind: "new" };
  let m;
  // "Make me a track", "can you write a song", "let's do a cinematic piece"
  if ((m = t.match(/^(?:(?:can|could|would|will) (?:you|ya|u|we) (?:please |just )?|(?:let's|lets|let us) (?:just )?|i(?:'d| would) like (?:you )?to |i want (?:you )?to |i wanna |i need you to |we should |we could |you should |you could |maybe |how about we |why don't (?:we|you) )?(\w+) (.+)$/)) && CREATE.test(m[1])) {
    const asked = /^(can|could|would|will) /.test(t), bits = wordsOf(m[2]), o = m[1] === "drop" && !/^(me|us)$/.test(bits[0]) ? null : songObject(bits);
    if (o?.ask) return { kind: "clarify", about: t, wantsSong: /^(make|create|write|compose|produce|generate)$/.test(m[1]) };
    if (/^(?:me |us )?(?:a )?(?:brand )?(?:new|another|different|fresh) one\b/.test(m[2])) return { kind: /^(make|write|create|compose|produce|generate)$/.test(m[1]) ? "new" : "soft" }; // "make a new one"
    if (/^(?:me |us )?an? .*\bone$/.test(m[2]) && genreOf(m[2]) !== null) return { kind: "new" }; // "let's do a heavy metal one"
    if (/^make tracks$/.test(`${m[1]} ${m[2]}`)) return { kind: "chat" }; // time to go
    if (o) {
      if (m[1] === "do" && o.soft) return null;
      if (asked && o.plainNoun && bits[0] !== "me" && bits[0] !== "us") return { kind: "clarify", about: "whether he wants a song made" };
      if (m[1] === "play" && o.firm && !/\b(me|us|a|an|some|new)\b/.test(m[2])) return { kind: "soft" };
      return o.firm && m[1] !== "sing" ? { kind: "new" } : { kind: "soft" };
    }
  }
  // "I want a new song", "I'd love a chill lo-fi track", "how about a new song", "time for a new track"
  if ((m = t.match(/^(?:i want|i wanna|i(?:'d| would) (?:like|love)|i need|we need|we want|how about|what about|time for|(?:can|could) (?:i|we) (?:get|have)) (.+)$/))) {
    const o = songObject(wordsOf(m[1]));
    if (o?.ask) return { kind: "clarify", about: t };
    if (o?.firm) return { kind: "new" };
    if (o?.soft && !o.bare) return { kind: "soft" };
  }
  // A bare description: "a sad song", "chill lo-fi beat for studying", "dark techno", "something chill".
  if (q || w.some((x) => COPULA.test(x)) || /'(s|re|m|ve|ll|d)$/.test(w[0]) || w.slice(1).some((x) => /^(a|an|some)$/.test(x))) return null; // "heard a track" has a verb in it
  const o = songObject(w, false);
  if (o?.ask) return { kind: "clarify", about: t };
  if (o?.firm && !o.plainNoun) {
    const cut = w.findIndex((x) => /^(about|for|with|that|which|like|in|of|from|on|at|to|by)$/.test(x)), np = cut < 0 ? w : w.slice(0, cut);
    if (np.some((x) => PRAISE.test(x))) return polite ? { kind: "soft" } : { kind: "chat" }; // "a good song please", not "good song"
    if (np.some((x) => QUALITY.test(x) && /(er|ier)$/.test(x)) || np.some((x) => /^(more|less|new|different)$/.test(x))) return null;
    if (w[0] === "a" || w[0] === "an") return { kind: "soft" };
    const said = np.slice(0, -1).join(" ");
    return moodOf(said) !== null || genreOf(said) !== null || /\b(sad|slow|fast|heavy|quiet|loud)\b/.test(said) ? { kind: "soft" } : null;
  }
  if (o?.soft && !o.bare) return { kind: "soft" };
  return null;
}

// Verbs that don't themselves change anything: with no change named, they're just talk.
const WEAK_VERB = /^(keep|get|have|hear|try|go|take|use|start|end|finish|stick|move|shift|pick|set|chill)$/;
// "Crank the drums", "pull the reverb back", "give the chorus some grunt": a direction and a part of the song.
const UP_VERB = /^(crank|boost|beef|pump|bump|lift|raise|liven|increase)$/;
const DOWN_VERB = /^(ease|lower|reduce|soften|drop|cut)$/; // pull, dial and knock only with "back" or "down"
// With only "it" for an object: "crank it up" can only be the music. "Lift it up" is a box, and "take it down a bit" might be either, so she asks.
const MUSIC_ONLY_VERB = /^(crank|pump|liven|bump|ease|beef|boost|fatten|dial)$/;
const LEVEL_VERB = /^(bring|knock|kick|ramp|notch|push|pull|dial)$/;
const MEASURE = /\b(a bit|bit|a little|a touch|a tad|a notch|a peg|a smidge|a shade|a hair|a fraction|slightly|somewhat)\b/;
const SOMEHOW_ELSE = /\b(another way|other way|another approach|different(ly)?)\b/;
function directionOps(verb, t) {
  if (WEAK_VERB.test(verb) && verb !== "take") return [];
  const force = /\b(more|some|extra) (punch|grunt|oomph|power|weight)\b/.test(t);
  const up = UP_VERB.test(verb) || force || /\bup\b/.test(t), down = DOWN_VERB.test(verb) || /\b(down|off|out|away)\b/.test(t) || (/\bback\b/.test(t) && !/^(put|bring|get|have|add)$/.test(verb));
  if (up === down) return [];
  if (/\b(tempo|pace)\b/.test(t)) return [up ? "faster" : "slower"];
  if (/\b(drums?|kick|snare|beat|percussion)\b/.test(t)) return [up ? "drumsUp" : "drumsDown"];
  if (/\b(reverb|echo|delay)\b/.test(t)) return [up ? "reverbUp" : "reverbDown"];
  if (/\b(chorus|drop)\b/.test(t)) return up ? ["chorusUp"] : [];
  if (/\benergy\b/.test(t) || (/\b(it|this|things|everything)\b/.test(t) && (force || (MUSIC_ONLY_VERB.test(verb) && /\b(it|this|things|everything) (up|down|back)(?: (?:a |some )?(?:bit|little|touch|tad|notch|lot|more|now|again))*$/.test(t))))) return [up ? "energyUp" : "energyDown"];
  return [];
}

const found0 = (t) => { const ops = opsIn(t, {}); return ops.length ? { kind: "modify", ops } : { kind: "clarify", about: t }; }; // "give the chorus more lift"

/** The verb phrase of a request: is what it wants changed the music? */
function readVerbPhrase(body, t, frame = "") {
  let w = wordsOf(body);
  if (!w.length) return { kind: "ambiguous", offer: [], about: t };
  const verb = baseVerb(w[0]);
  if (!verb) return null;
  w = w.slice(1);
  const ops = () => opsIn(t, {});
  const particle = () => { while (w.length && /^(up|down|back|out|off|in|over)$/.test(w[0]) && !(w[0] === "in" && w[1])) w.shift(); };
  particle();
  if ((verb === "slow" || verb === "speed") && w[0] === "her") return { kind: "ambiguous", offer: [verb === "slow" ? "slower" : "faster"], about: t }; // "slow her down": the song, or someone?
  if (/^(him|her|them|mum|dad)$/.test(w[0] || "")) return { kind: "chat" };
  const toMe = /^(me|us)$/.test(w[0] || "");
  if (toMe) { w.shift(); particle(); }
  if (verb === "go" && w[0] === "easy") return { kind: "chat" };
  const cut = boundaryIn(w), np = w.slice(0, cut), tail = w.slice(cut);
  if (!tailIsMusic(tail) && !keyFrom(t)) return { kind: "chat" };
  let about;
  if ((verb === "give" || verb === "gimme") && !toMe && np.length) {
    // "Give it a stronger hook", "give the bass more movement": the thing given decides, not who gets it.
    const toThing = DEICTIC.test(np[0]) ? 1 : /^(the|this|that)$/.test(np[0]) ? 2 : 0;
    const direct = np.slice(toThing);
    about = direct.length ? aboutNP(direct) : "none";
    if (about === "foreign" || about === "none") {
      if (toThing === 2 && isMusic(np[1]) && about === "foreign") return found0(t);
      return { kind: "chat" };
    }
    if (toThing === 2 && !isMusic(np[1])) return { kind: "chat" };
  } else about = aboutNP(np);
  if (about === "foreign") return { kind: "chat" };
  const found = ops();
  if (about === "none") {
    if (frame === "you") return { kind: "chat" }; // "you should go slower" is about her
    if (frame === "we" && found.length) return { kind: "ambiguous", offer: found.map((o) => o.op), about: t };
    if (verb === "slow" || verb === "speed") {
      if (/^(you|i|we-self)$/.test(frame)) return { kind: "chat" };
      return { kind: "ambiguous", offer: [verb === "slow" ? "slower" : "faster"], about: t };
    }
    if (found.length) return { kind: "modify", ops: found, bare: true };
    if (WEAK_VERB.test(verb) || (!np.length && !/^(make|add|change)$/.test(verb)) || (np.length && np.every((x) => ADVERB.test(x) && !DET.test(x)))) return { kind: "chat" }; // "try again", "pull over"
    return { kind: "ambiguous", offer: [], about: t };
  }
  if (about === "attr" && frame === "i" && PERSONAL_ATTR.test(np[np.length - 1]) && !tail.some(isMusic)) return { kind: "chat" };
  if (found.length) return { kind: "modify", ops: found };
  const moved = toMe ? [] : directionOps(verb, t);
  if (moved.length) return { kind: "modify", ops: opsNamed(moved) };
  if (about === "deictic") {
    const way = /\bup\b/.test(t) ? "energyUp" : /\b(down|back)\b/.test(t) ? "energyDown" : "";
    const level = verb === "turn" || (verb === "take" ? MEASURE.test(t) || /\bdown\b/.test(t) : verb === "wind" ? /\bback\b/.test(t) : LEVEL_VERB.test(verb));
    if (way && !tail.length && level) return { kind: "ambiguous", offer: [way], about: t }; // "turn it down", "take it down a bit"
    // "Make it better" wants something done to it. "Make it happen", "turn it over" and "bring it on" don't.
    const wants = /^(change|fix|tweak|adjust|alter|modify|rework|redo|remix|polish|refine)$/.test(verb) || SOMEHOW_ELSE.test(t) || (/^(make|get)$/.test(verb) && (np.some((x) => QUALITY.test(x)) || /\b(better|nicer|cooler|nice|good|great|cool|fun|interesting|exciting|fresh|tight|sound|sounding|feel|pop|bang|slap|hit|shine|sing|groove)\b/.test(t)));
    return wants ? { kind: "clarify", about: t } : { kind: "chat" };
  }
  if (WEAK_VERB.test(verb) && about !== "something") return { kind: "chat" }; // "keep the drums down", "can you hear the bass"
  return { kind: "clarify", about: t };
}

/** "I want the drums louder", "more tension", "a bigger chorus": what he wants, with no verb. */
function readWanted(body, t, frame = "") {
  const w = wordsOf(body);
  if (w[0] === "to") return readVerbPhrase(w.slice(1).join(" "), t, frame);
  if (baseVerb(w[0] || "") && w[1] !== undefined && w[0] !== "drop" && w[0] !== "build" && w[0] !== "mix" && w[0] !== "end" && w[0] !== "slow" && !DET.test(w[1] || "") === false) return readVerbPhrase(body, t, frame);
  const cut = boundaryIn(w), np = w.slice(0, cut), tail = w.slice(cut);
  if (!tailIsMusic(tail)) return { kind: "chat" };
  const about = aboutNP(np);
  if (about === "foreign") return { kind: "chat" };
  if (about === "deictic" && np.length === 1) return { kind: "chat" }; // "what about it", "I want it"
  const found = opsIn(t, {});
  if (about === "attr" && frame === "i" && PERSONAL_ATTR.test(np[np.length - 1]) && !tail.some(isMusic)) return { kind: "chat" };
  if (found.length) return { kind: "modify", ops: found, bare: about === "none" };
  return about === "none" ? { kind: "ambiguous", offer: [], about: t } : { kind: "clarify", about: t };
}

// "Maybe faster": he's thinking aloud. It stays an offer until he says so.
const hedged = (read) => (read.kind === "modify" && (read.bare || read.fragment) ? { kind: "ambiguous", offer: read.ops.map((o) => o.op), about: "maybe" } : read);

function readRequest(w, t) {
  let m;
  const verbFirst = (body) => {
    const [a, b = ""] = wordsOf(body);
    return Boolean(baseVerb(a || "")) && (!QUALITY.test(a) || /^(it|this|that|things|the|down|up)$/.test(b));
  };
  const vpOrWant = (body, frame) => (verbFirst(body) ? readVerbPhrase(body, t, frame) : readWanted(body, t, frame));
  if (/^(?:can|could|would|will) (?:you|ya|u|we)$/.test(t)) return { kind: "ambiguous", offer: [], about: t };
  if ((m = t.match(/^(?:would|do) you mind (.+)$/))) { const b = wordsOf(m[1]), plain = [baseVerb(b[0]) || b[0], ...b.slice(1)].join(" "); return readVerbPhrase(plain, plain); }
  if ((m = t.match(/^(?:can|could|would|will) (you|ya|u|we) (?:please |maybe |just )*(.+)$/))) {
    if (/^be\b/.test(m[2])) return { kind: "chat" }; // about her: "could you be quicker"
    if (/^do something\b/.test(m[2])) return readRequest(wordsOf(m[2]), m[2]);
    return baseVerb(wordsOf(m[2])[0]) ? readVerbPhrase(m[2], t) : { kind: "chat" };
  }
  if ((m = t.match(/^(?:can|could|may) (i|we) (?:get|have) (.+)$/))) return readWanted(m[2], t, m[1]);
  if ((m = t.match(/^(i|we)(?:(?:'d| would) (?:like|love|prefer|rather)| prefer| want| wanna| need|'m after|'re after) (.+)$/))) return vpOrWant(m[2], m[1] === "i" ? "i" : "we");
  if ((m = t.match(/^(?:let's|lets|let us) (.+)$/))) return vpOrWant(m[1], "lets");
  if ((m = t.match(/^(?:how about|what about|how 'bout) (?:we |you )?(.+)$/))) return vpOrWant(m[1]);
  if ((m = t.match(/^what if (?:we |you )?(.+)$/))) {
    const body = wordsOf(m[1]);
    if (baseVerb(body[0]) && !isMusic(body[0])) { const plain = [baseVerb(body[0]), ...body.slice(1)].join(" "); return readVerbPhrase(plain, plain); }
    const c = body.findIndex((x) => COPULA.test(x) || (/(ed|s)$/.test(x) && !isMusic(x)));
    const subj = subjectOf(c < 0 ? body : body.slice(0, c));
    if (!talkingAboutMusic(subj)) return { kind: "chat" };
    const found = opsIn(t, {});
    if (found.length) return { kind: "modify", ops: found };
    return subj.cls === "deictic" ? { kind: "chat" } : { kind: "clarify", about: t };
  }
  if ((m = t.match(/^(?:maybe|perhaps) (?:we could |you could |we should |you should )?(.+)$/))) {
    if (verbFirst(m[1])) return readVerbPhrase(m[1], t);
    return hedged(readClauseWords(wordsOf(m[1]), m[1], false));
  }
  if ((m = t.match(/^(?:why don't (?:we|you)|why not) (.+)$/))) return readVerbPhrase(m[1], t);
  // A correction: "sorry, I meant darker".
  if ((m = t.match(/^(?:i )?(?:meant|said|asked for) (.+)$/))) return readClauseWords(wordsOf(m[1]), m[1], false);
  if ((m = t.match(/^(?:i )?wanted ((?:it|this|that) .+)$/))) return readVerbPhrase(`make ${m[1]}`, `make ${m[1]}`);
  // His opinion: read what he thinks. "I reckon it should be darker", "reckon it'll rain".
  if ((m = t.match(/^(?:i )?(?:reckon|think|feel like|guess|suppose|believe)(?: that)? (.+)$/))) return readClauseWords(wordsOf(m[1]), m[1], false);
  if ((m = t.match(/^(you|we) (?:should|could|might|can|ought to|need to|have to|gotta|got to) (.+)$/))) {
    if (/^be\b/.test(m[2])) return { kind: "chat" };
    return baseVerb(wordsOf(m[2])[0]) ? readVerbPhrase(m[2], t, m[1]) : { kind: "chat" };
  }
  // "The chorus should be bigger", "it needs more tension", "needs more reverb".
  const modal = w.slice(0, 7).findIndex((x, i) => /^(should|could|needs?|wants?|must|might|ought|gotta)$/.test(x) || (/^(has|have)$/.test(x) && w[i + 1] === "to"));
  if (modal >= 0) {
    const subj = subjectOf(w.slice(0, modal));
    if (subj.cls === "foreign" || subj.cls === "negated") return { kind: "chat" };
    let body = w.slice(modal + 1);
    while (body.length && /^(to|be|use|do|with|have|get|got)$/.test(body[0])) body = body.slice(1);
    const cut = boundaryIn(body), np = body.slice(0, cut), tail = body.slice(cut);
    if (!tailIsMusic(tail)) return { kind: "chat" };
    if (subj.cls !== "part" && subj.cls !== "whole" && aboutNP(np) === "foreign") return { kind: "chat" };
    const found = opsIn(t, {});
    if (found.length) return { kind: "modify", ops: found };
    const moved = directionOps("", t);
    if (moved.length) return { kind: "modify", ops: opsNamed(moved) };
    return subj.cls === "part" || subj.cls === "whole" || SOMEHOW_ELSE.test(t) || /\b(better|chang\w*)\b/.test(t) || (subj.cls === "deictic" && (np.some((x) => QUALITY.test(x)) || /^(attr|music)$/.test(aboutNP(np)))) ? { kind: "clarify", about: t } : { kind: "chat" }; // "that should do it", "could be"
  }
  // "Do something with the drums": it wants a change, and doesn't say what.
  if ((m = t.match(/^do something(?: (?:with|about|to) (.+))?$/))) return !m[1] || aboutNP(wordsOf(m[1])) !== "foreign" ? { kind: "clarify", about: t } : { kind: "chat" };
  if (VERBS.test(w[0])) return readVerbPhrase(t, t);
  return null;
}

/** No verb at all: "heavier drums", "less busy", "more tension before the drop". There's no grammar to lean on, so every word has to fit. */
function readFragment(w, t, q) {
  if (w.some((x) => COPULA.test(x) || /^(has|had|have|did|does|do)$/.test(x)) || /'(s|re|m|ve|ll|d)$/.test(w[0])) return null;
  if (w.some((x) => PRAISE.test(x)) || /^(i|you|he|she|we|they|my|your|his|her|our|their)$/.test(w[0]) || w.some((x) => /^(your|his|their)$/.test(x))) return null;
  if (w.includes("or")) return { kind: "question" }; // "darker or brighter" is a choice he's weighing
  if (/^(in|key of) [a-g]\b/.test(t) && keyFrom(t)) return { kind: "modify", ops: opsIn(t, {}), bare: true };
  let a = w.map((x) => x);
  while (a.length && INTENS.test(a[0])) a.shift();
  const cut = boundaryIn(a), core = a.slice(0, cut), tail = a.slice(cut);
  if (!tailIsMusic(tail)) return null;
  let hasQ = false, hasNoun = false, unknown = 0;
  for (let i = 0; i < core.length; i++) {
    const x = core[i];
    if (/^(the|this|that)$/.test(x) && !isMusic(core[i + 1] || "") && !ATTR.test(core[i + 1] || "")) return null; // "the other way"
    if (QUALITY.test(x)) hasQ = true;
    else if (isMusic(x) || ATTR.test(x)) hasNoun = true;
    else if (/^(going|on|\d+|something)$/.test(x)) hasQ = hasQ || x === "going" || x === "something";
    else if (DET.test(x) || INTENS.test(x) || ADVERB.test(x) || x === "and" || x === "or") continue;
    else {
      // An adjective he's using on a part of the song: "walking bass". Not "love the bass" (a verb) or "day today" (no music after it).
      const next = core[i + 1];
      if (!next || DET.test(next) || !(isMusic(core[core.length - 1]) || ATTR.test(core[core.length - 1]))) return null;
      if (++unknown > 2) return null;
    }
  }
  if (!hasQ && !hasNoun) return null;
  const found = opsIn(t, {});
  const moved = found.length ? [] : directionOps("", t);
  if (moved.length) return { kind: "modify", ops: opsNamed(moved), fragment: true };
  if (found.length) {
    if (/^(dark|bright)$/.test(core.join(" "))) return { kind: "ambiguous", offer: [], about: t };
    if (found.some((o) => o.op === "bassGroove") && !hasNoun) return { kind: "ambiguous", offer: [], about: t };
    return { kind: "modify", ops: found, bare: !hasNoun, fragment: true };
  }
  if (q) return { kind: "question" };
  // "Top tune", "old song": a remark about a song. "Chunky bass" asks for something.
  if (!hasQ && core.filter((x) => isMusic(x) || ATTR.test(x)).every((x) => WHOLE.test(x))) return { kind: "chat" };
  return { kind: "clarify", about: t };
}

// ---------- the last change, and the speakers ----------
//
// These are whole clauses, each naming the last thing done or the song and nothing else, so "play nice",
// "play it safe", "go back to work", "stop the car" and "don't stop" are none of them.

const TRACK_WORD = "(?:it|this|that|(?:the|this|that|my) (?:song|track|tune|music|mix|beat)|me the (?:song|track|tune|music|mix)|us the (?:song|track|tune|music|mix))";
const WHEN = "(?: (?:again|now|then|back|for me|for us|a sec|a second|a minute|a moment|for a sec|for a second|for a bit|for a minute|one more time|once more|through|from the (?:top|start|beginning)))*";
const ASK_FRAME = /^(?:(?:can|could|would|will) (?:you|ya|u) (?:please |just |maybe )*|(?:please|just|go on) |let's |lets |let us )/;
const BACK_TO = "(?:how it was|the way it was|what it was|like it was|as it was|before|the old (?:one|version|song|track|mix)|the last (?:one|version)|the (?:previous|earlier|original|first) (?:one|version))";
const CONTROLS = [
  ["undo", new RegExp(`^(?:undo|revert|reverse)(?: that| it| this| the (?:last )?(?:thing|change))?$|^scratch that$|^take that back$|^(?:change|put|turn|switch|set) (?:it|that|this|them|things|everything) back(?: (?:to )?${BACK_TO})?$|^(?:go|get|take it|take me|take us|switch|change|revert|back) (?:back )?to ${BACK_TO}$|^(?:not that(?: one)? )?go back$|^(?:take|pull) (?:that|the)(?: last)? change (?:out|back)$|^(?:lose|drop|remove|cancel) (?:that|the)(?: last)? change$`)],
  ["reverse", /^(?:(?:go|try|do it|do that|turn it|take it) )?(?:the )?other (?:way(?: round| around)?|direction)(?: then| instead)?$|^(?:(?:go|do) )?(?:the )?opposite(?: way)?$|^(?:(?:that's|thats|it's|its|you went|you've gone) )?(?:the )?wrong way(?: round| around)?(?:(?: go)? the other way(?: round| around)?)?$|^not that(?: one| way)?(?: go)? the other way(?: round| around)?$/],
  ["repeat", /^(?:do (?:that|it|this|the same)(?: again| one more time| once more)|(?:same|the same)(?: thing)? again|again|one more time|once more|more of that|(?:a |just a )?(?:bit|little|touch|tad|lot) more(?: again)?|more(?: again)?)$/],
  ["restart", new RegExp(`^(?:start|restart|replay|rewind) ${TRACK_WORD}(?: again| over| from the (?:top|start|beginning))?$|^(?:restart|replay|rewind)$|^(?:take it |back |go back |back to |go |start )?(?:from |to )?the (?:top|start|beginning)$|^(?:(?:hit |press )?play|run|give me|give us) ${TRACK_WORD} (?:again|from the (?:top|start|beginning)|one more time|once more)$|^run it back$`)],
  ["play", new RegExp(`^(?:(?:hit|press) )?play(?: ${TRACK_WORD})?${WHEN}$|^resume$|^(?:keep|carry on|go on) playing$|^give (?:it|that) a (?:play|spin|listen)$`)],
  ["pause", new RegExp(`^(?:(?:hit|press) )?pause(?: ${TRACK_WORD})?${WHEN}$`)],
  ["stop", /^(?:(?:hit|press) )?stop(?: it| that| this| the (?:song|track|tune|music|mix|playback)| playing)?$|^(?:turn|shut|switch) (?:it|the (?:song|track|tune|music|mix)) off$|^(?:turn|shut|switch) off the (?:song|track|tune|music|mix)$|^kill the (?:song|track|tune|music|mix)$/],
];
const HEAR = new RegExp(`^(?:let's |lets |let us |let me |i want to |i wanna |i'd like to |can (?:i|we) |could (?:i|we) )?hear ${TRACK_WORD}${WHEN}$`);
// Ordinary words said to people too: beside a clause about people, they're about the people.
const LOOSE_CONTROL = /^(?:stop(?: it| that| this)?|go back|again|one more time|once more|more(?: again)?|(?:go )?the other way(?: round| around)?|wrong way(?: round| around)?|(?:the )?opposite)$/;

function readControl(t, q) {
  const framed = ASK_FRAME.test(t), body = t.replace(ASK_FRAME, "");
  if (q && !framed) return null;
  if (HEAR.test(t)) return { kind: "control", action: "transport", control: /\b(again|top|start|beginning|once more|one more time)\b/.test(t) ? "restart" : "play" };
  const hit = CONTROLS.find(([, re]) => re.test(body));
  if (!hit) return null;
  const bare = LOOSE_CONTROL.test(body);
  if (hit[0] === "undo" || hit[0] === "reverse" || hit[0] === "repeat") return { kind: "control", action: hit[0], bare };
  return { kind: "control", action: "transport", control: hit[0], bare };
}

function readClauseWords(w, t, q, polite = false) {
  if (!w.length) return { kind: "chat" };
  if (/(^| )as$/.test(t) || /^(if|be)\b/.test(t) || /^\w+ as\b/.test(t)) return { kind: "chat" };
  if (QUESTION_START.test(t) && !PROPOSAL.test(t)) return { kind: "question" };
  if (q && (w.includes("too") || w.includes("any"))) return { kind: "question" };
  const control = readControl(t, q);
  if (control) return control;
  const fb = readFeedback(w, t);
  if (fb) return q ? { kind: "question" } : fb;
  if (NEGATED.test(t) && !PROPOSAL.test(t)) return { kind: "chat" };
  if (/^no\b/.test(t) && !/^no (reverb|echo)\b/.test(t)) return { kind: "chat" };
  const fresh = readNewSong(w, t, q, polite);
  if (fresh) return fresh;
  const asked = readRequest(w, t);
  if (asked) return asked;
  const frag = readFragment(w, t, q);
  if (frag) return frag;
  if (w[w.length - 1] === "maybe" && w.length > 1) return hedged(readClauseWords(w.slice(0, -1), w.slice(0, -1).join(" "), q));
  return q ? { kind: "question" } : { kind: "chat" };
}

const LEAD_FILLER = /^(but|yeah|yep|yes|yup|nah|ok|okay|righto|right|alright|hey|oi|so|and|now|then|well|look|mate|bro|brother|salty|please|um|uh|er|anyway|actually|sorry|hmm|ah|oh|just|also|sure|thanks)$/;
const TRAIL_FILLER = /^(mate|bro|brother|salty|please|thanks|ta|cheers|eh|hey|yeah|aye|ya)$/;

// Spoken words often come with no commas: "love it just slow it down", "faster it's dragging". A request later in
// the words counts only if it really starts there, as a command. Not after "to", "said" or a subject doing the
// making: "my boss told me to make it faster", "the curtains make it darker". Only a clear request counts.
const COMMAND_VERB = /^(make|give|add|slow|speed|change|bring|turn|drop|cut|mute|strip|lose|kill|throw|simplify|swap|can|could|start|write|create)$/;
const NOT_COMMAND = /^(to|i|you|he|she|we|they|who|which|that|or|not|never|would|will|should|could|can|might|must|may|did|does|do|if|when|as|than|for|of)$/;
const REPORTED = /^(said|says|say|saying|told|tells|tell|telling|asked|asks|asking|wants|wanted|reckons|reckoned|thinks|thought|if|when|unless|until|because|cos|remember|how|what|why|not|never|no)$|n't$/;
const canCommand = (w, k) => !NOT_COMMAND.test(w[k - 1]) && !/n't$|'(ll|d)$/.test(w[k - 1]) && (!/[a-z]s$/.test(w[k - 1]) || /^(this|thanks|cheers|yes)$/.test(w[k - 1])) && !w.slice(0, k).some((x) => REPORTED.test(x));
const clearRequest = (r) => (r.kind === "modify" && r.ops?.length && !r.bare) || r.kind === "new" || r.kind === "soft" || r.kind === "control";
function readRunOn(w, polite) {
  const thrown = w.length > 2 && /^(scrap|bin|ditch|forget|chuck|dump|toss)$/.test(w[0]) && (/^(it|this|that)$/.test(w[1]) ? (w[2] === "one" ? 3 : 2) : 0);
  if (thrown && w[thrown]) { const r = readClauseWords(w.slice(thrown), w.slice(thrown).join(" "), false, polite); if (clearRequest(r)) return r; }
  for (let k = 1; k < w.length - 1; k++) {
    if (!COMMAND_VERB.test(w[k]) || !canCommand(w, k) || (/^(can|could)$/.test(w[k]) && !/^(you|ya|u|we)$/.test(w[k + 1]))) continue;
    const r = readClauseWords(w.slice(k), w.slice(k).join(" "), false, polite);
    if (clearRequest(r)) return { ...r, offer: [], about: "" };
  }
  // "It's too busy take some out": a whole complaint, then more words.
  const complaint = w.join(" ").match(/^(?:it's|that's|this is) (?:way |far |just |a bit |bit )*too \w+ (\w+)/);
  if (complaint && (COMMAND_VERB.test(complaint[1]) || complaint[1] === "take")) { const said = wordsOf(complaint[0]).slice(0, -1), r = readFeedback(said, said.join(" ")); if (r?.kind === "feedback") return r; }
  // "Faster it's dragging", "make it brighter it's too dark": a whole request, then a new clause.
  const cut = w.findIndex((x, k) => k > 0 && /^(it's|that's|i'm|we're|they're)$/.test(x) && !/^(think|reckon|know|guess|believe|feel|hope|say|said|if|because|cos|when|what|how|and|but|so|that|like|than|see|hear)$/.test(w[k - 1]));
  if (cut > 0) {
    const r = readClauseWords(w.slice(0, cut), w.slice(0, cut).join(" "), false, polite);
    const people = /^(i'm|we're|they're)$/.test(w[cut]);
    if (clearRequest(r) || (r.kind === "modify" && r.ops?.length)) return { ...r, human: people };
  }
  return {};
}

function readClause(text) {
  const q = /\?\s*$/.test(text);
  let t = norm(text).replace(/[.!?;:,]+$/, "").replace(/\b(?:a (?:little )?bit|a lot|lots|heaps|plenty|a touch|a tad) of\b/g, "some").replace(/\bget rid of\b/g, "remove").replace(/^no more /, "less ").replace(/^(?:don't make it (?:so|too) busy|not (?:so|as) busy)$/, "less busy").replace(/^not (?:so|as|too) much (?=\w)/, "less ").replace(/,? (?:isn't it|innit)$/, "");
  let w = wordsOf(t);
  while (w.length && LEAD_FILLER.test(w[0])) w.shift();
  const polite = w[w.length - 1] === "please";
  while (w.length && TRAIL_FILLER.test(w[w.length - 1])) w.pop();
  // Spoken words often come with no commas: "no make it darker", "no go back to the old version".
  const afterNo = w.findIndex((x) => !/^(no|nah|nope)$/.test(x) && !LEAD_FILLER.test(x));
  if (afterNo > 0) {
    const rest = w.slice(afterNo), said = rest.join(" ");
    if (readControl(said, false) || /^(?:i )?(?:meant|said|wanted)\b/.test(said) || (baseVerb(rest[0]) && /^(it|this|that|the)$/.test(rest[1] || ""))) w = rest;
  }
  if (w.join(" ").endsWith("would ya") || w.join(" ").endsWith("will ya")) w = w.slice(0, -2);
  t = w.join(" ");
  const read = readClauseWords(w, t, q, polite);
  const human = /^(?:i|we|you|he|she|they)(?:'[a-z]+)?\b/.test(t) && !["modify", "new", "soft", "control", "feedback"].includes(read.kind);
  const settled = q || read.ops?.length || ["new", "soft", "control", "question"].includes(read.kind);
  const runOn = settled ? {} : readRunOn(w, polite);
  return { ...read, ...runOn, text: t, human: human || Boolean(runOn.human) };
}

// Sentences, and clauses: after a comma, after "but", and after "and"/"then" when a new verb or subject starts.
const clausesOf = (text) => String(text || "")
  .split(/(?<=[.!?;])\s+|,\s*|\s+(?:but|although|though)\s+|\s+(?:and then|and|then)\s+(?=(?:make|give|add|try|change|switch|slow|speed|bring|put|turn|build|let'?s|cut|mute|drop|strip|throw|lose|kill|write|create|play|start|mix)\b)|\s+and\s+(?=(?:the|this|that|it|it's)\b[^,]*\b(?:is|are|'s|needs?|should)\b)/i)
  .map((x) => x.trim()).filter(Boolean);

/**
 * His words -> what he is doing, and what the studio should do about it.
 *   intent   new | modify | feedback | question | chat | ambiguous | clarify | undo | reverse | repeat | transport
 *   ops      changes to make now (only modify, and feedback with a small, single fix)
 *   offer    op names to suggest, changing nothing until he says yes ("undo" means putting it back)
 *   about    a few of his words, for her note
 *   control  play | pause | stop | restart, for the speakers (with transport, or after a change)
 *   undoFirst  he also took back the last change: "undo that and make it darker"
 *   answer   yes | no | new | this, when the whole message is a short answer. Only counts if something was offered
 *   mentions the words name the music, so she's told plainly when nothing changed
 */
export function readIntent(text, opts = {}) {
  const raw = norm(text).replace(/[.!?,;:]+/g, " ").replace(/\s+/g, " ").trim();
  return { ...readWhole(text, opts), answer: answerOf(raw), mentions: MENTIONS.test(raw) };
}

const ANSWER_FILLER = /\b(?:mate|salty|bro|brother|thanks|thank you|ta|cheers|then|please|eh|hey)\b/g;
const SAID_YES = /^(?:yes|yeah|yep|yup|yeh|ya|aye|sure|ok|okay|alright|righto|absolutely|definitely|go on|go ahead|go for it|do it|try it|why not|let's do it|lets do it|let's try it|lets try it|let's go|sounds good|sounds great|give it a go|give it a try|(?:yes|yeah|yep|ok|okay|sure) (?:do it|go on|go for it|try it|let's do it|lets do it|let's try it|lets try it|sounds good))$/;
const SAID_NO = /^(?:no|nah|nope|not now|not yet|not really|leave it|leave it as it is|leave it alone|don't bother|forget it|never mind|nevermind|don't|don't do it|i'm good|it's fine|that's fine|all good|no need|(?:no|nah|nope) (?:don't|leave it|not now|not really))$/;
const SAID_NEW = /^(?:(?:a )?(?:new|fresh) (?:one|song|track|tune)|(?:a )?new|another one|(?:make |start )(?:a )?new one|new one)$/;
const SAID_THIS = /^(?:(?:change |keep |this )?this one|(?:change |keep )(?:this|it|the one (?:we've got|i've got))|the same one)$/;
function answerOf(raw) {
  const t = raw.replace(ANSWER_FILLER, " ").replace(/\s+/g, " ").trim();
  if (!t) return /\bplease\b/.test(raw) ? "yes" : "";
  return SAID_YES.test(t) ? "yes" : SAID_NO.test(t) ? "no" : SAID_NEW.test(t) ? "new" : SAID_THIS.test(t) ? "this" : "";
}
const MENTIONS = /\b(songs?|tracks?|tunes?|music|mix|drums?|kick|snare|bass|bassline|chorus|verse|intro|outro|melody|hook|riff|chords?|synths?|harmony|reverb|tempo|bpm|groove|rhythm|breakdown|what key)\b/;

function readWhole(text, { hasSong = true } = {}) {
  const none = (intent, extra = {}) => ({ intent, ops: [], offer: [], about: "", ...extra });
  const raw = norm(text);
  if (!raw) return none("chat");
  if (SARCASM.test(raw)) return none("chat", { sarcasm: true });
  const sentences = String(text).split(/(?<=[.!?;])\s+/).filter(Boolean).map((x) => clausesOf(x).map(readClause));
  // "Go faster, we're late": a request with no object, beside a clause about people, is about the people.
  for (const sentence of sentences) {
    if (!sentence.some((c) => c.human)) continue;
    for (const c of sentence) if (c.bare || (c.kind === "ambiguous" && c.offer?.length)) { c.kind = "chat"; c.ops = []; c.offer = []; c.action = ""; }
  }
  const clauses = sentences.flat();
  if (clauses.some((c) => c.kind === "new")) return none("new");
  if (clauses.some((c) => c.kind === "soft")) return hasSong ? none("clarify", { about: "a new song, or a change to this one", newOrThis: true }) : none("new");
  // With nothing to change, "make me something cool" and "surprise me" can only mean a song.
  if (!hasSong && clauses.some((c) => c.wantsSong || /\bsurprise me\b/.test(c.text))) return none("new");
  const merged = [];
  for (const c of clauses) for (const o of c.ops || []) if (!merged.some((x) => x.op === o.op)) merged.push(o);
  const ops = merged;
  // Opposites together can't be a request: nothing changes, she asks which.
  if (ops.some((o) => ops.some((x) => OPPOSITE[o.op] === x.op && o.arg === x.arg))) return none("clarify", { about: "which way he wants it" });
  const controls = clauses.filter((c) => c.kind === "control");
  const speakers = controls.find((c) => c.action === "transport")?.control || "";
  if (ops.length) return { intent: clauses.some((c) => c.kind === "modify" && c.ops?.length) ? "modify" : "feedback", ops, offer: [], about: clauses.find((c) => c.about)?.about || "", control: speakers, undoFirst: controls.some((c) => c.action === "undo") };
  if (controls.length) return none(controls[0].action, { control: speakers });
  const said = clauses.find((c) => c.kind === "feedback");
  if (said) return { intent: "feedback", ops: [], offer: said.offer || [], about: said.about || "", open: Boolean(said.open) };
  // A lone "hook," beside chat ("hook, line and sinker") is chat, not a question about the hook.
  const alone = clauses.every((c) => c.kind === "clarify" || c.kind === "ambiguous");
  const unclear = clauses.find((c) => c.kind === "clarify") || clauses.find((c) => c.kind === "ambiguous");
  if (unclear && (alone || clauses.length === 1 || unclear.offer?.length)) return { intent: unclear.kind, ops: [], offer: unclear.offer || [], about: unclear.about || "" };
  if (clauses.some((c) => c.kind === "question")) return none("question");
  return none("chat");
}

/** One sentence of his: does it change the song? */
export function isInstruction(sentence) {
  return readIntent(sentence).ops.length > 0;
}

// Sentences, and a clause after a comma that starts a new instruction ("love it, now make the bass dirtier").
const sentencesOf = (text) => String(text || "")
  .split(/(?<=[.!?;])\s+|\s+(?:but|although|though)\s+|,\s+(?=(?:and |then |also |now |so )?(?:make|give|add|try|change|slow|speed|bring|put|turn|build|let'?s|cut|mute|drop|strip|throw)\b)/i)
  .map((x) => x.trim()).filter(Boolean);

/** The ops one piece of text names, with no thought for whether it asked for them. */
function opsIn(t, opts) {
  const out = [];
  for (const { op, test } of OPS) {
    const arg = test(t, opts);
    if (arg) out.push({ op, arg });
  }
  return resolveOverlaps(out);
}

/** His words -> the ops they ask for (possibly none). Each op is { op, arg }. A brief, or her reply clause, is read whole. */
export function parseRevision(text, opts = {}) {
  return opts.inBrief || opts.raw ? opsIn(norm(text), opts) : readIntent(text).ops;
}

function resolveOverlaps(ops) {
  const has = (op) => ops.some((o) => o.op === op);
  const drop = new Set();
  // A darker melody is the melody's job; don't also re-key the whole song.
  if (has("leadDarker")) drop.add("darker");
  // "A stronger hook" is the melody, not the whole drop.
  if (has("hookUp")) drop.add("chorusUp");
  // "Change the drum groove" is the drums, not the bass.
  if (has("drumsVary")) drop.add("bassGroove");
  // "A walking bass that moves" is movement, not swing.
  if (has("bassMove")) drop.add("bassGroove");
  // "New chords" asks for a chord turn, not a harmony layer.
  if (has("chordsNew")) drop.add("harmony");
  // "Simpler"/"busier" with the melody named is the melody's density only.
  return ops.filter((o) => !drop.has(o.op));
}

// ---------- applying ops ----------

const describe = {
  breakdown: "a breakdown: the build opens on pads and the hook alone",
  tension: "a longer build, and a beat of silence before the drop",
  counter: "a countermelody answering the hook",
  harmony: "the hook doubled a third above",
  texture: "a wash of deep-sea air under the intro and outro",
  fills: "drum fills every four bars",
};

/**
 * Applies ops to a plan. Returns { plan, changes, regen } — `changes` are log lines with their
 * source, `regen` the tracks whose notes must be composed again. A request the song can't take
 * further ("heavier" on drums already at full weight) does the nearest real change instead and
 * says so (`already`), so no accepted request ever leaves the music as it was.
 */
export function applyOps(planIn, ops, source = "you", ctx = {}) {
  const plan = structuredClone(planIn);
  plan.arr = { ...(plan.arr || {}) };
  const changes = [];
  const regen = new Set();
  const say = (field, value, why, extra = {}) => changes.push({ field, value, source, why, ...extra });
  const all = () => TRACKS.forEach((t) => regen.add(t));
  const T = plan.tracks;
  const setArr = (k, field) => { plan.arr[k] = true; say(field, k === "fills" ? "more fills" : k, describe[k]); };
  const queue = ops.slice();
  while (queue.length) {
    const { op, arg } = queue.shift();
    switch (op) {
      case "genre": {
        const g = GENRES[arg];
        plan.genre = arg; plan.swing = g.swing; plan.pump = g.pump;
        for (const [name, [style, sound]] of [["drums", g.drums], ["bass", g.bass], ["chords", g.chords], ["lead", g.lead]]) Object.assign(T[name], { style, sound });
        plan.bpm = clamp(Math.round((g.bpm[0] + g.bpm[1]) / 2), 70, 180);
        plan.sections = sectionsFor(plan.bpm, plan.energy, plan.arr.tension);
        say("genre", g.label, `now ${g.label} at ${plan.bpm} BPM`); all(); break;
      }
      case "key": plan.key = { tonic: arg.tonic, mode: arg.mode || plan.key.mode }; say("key", keyName(plan.key), "new key"); all(); break;
      case "bpm": plan.bpm = clamp(arg, 70, 180); plan.sections = sectionsFor(plan.bpm, plan.energy, plan.arr.tension); say("bpm", plan.bpm, "tempo set"); all(); break;
      case "slower":
        if (plan.bpm <= 70) { say("bpm", plan.bpm, "already as slow as it goes, so the drums went lighter instead", { already: true }); queue.unshift({ op: "drumsDown" }); break; }
        plan.bpm = clamp(plan.bpm - 14, 70, 180); say("bpm", plan.bpm, "slowed down 14 BPM"); break;
      case "faster":
        if (plan.bpm >= 180) { say("bpm", plan.bpm, "already flat out, so more energy instead", { already: true }); queue.unshift({ op: "energyUp" }); break; }
        plan.bpm = clamp(plan.bpm + 12, 70, 180); say("bpm", plan.bpm, "sped up 12 BPM"); break;
      case "drumsUp":
        if (T.drums.intensity >= 1 && (T.drums.sound === "heavy" || T.drums.sound === "808")) {
          if (!plan.arr.fills) { say("drums", "already at full weight", "so the studio added fills instead", { already: true }); setArr("fills", "drums"); regen.add("drums"); break; }
          say("drums", "already at full weight", "so the studio pushed the drop instead", { already: true }); queue.unshift({ op: "chorusUp" }); break;
        }
        T.drums.intensity = clamp(T.drums.intensity + 0.3, 0, 1);
        if (T.drums.sound !== "808") T.drums.sound = "heavy";
        say("drums", "heavier", "heavy kit, harder kick, more hits"); regen.add("drums"); break;
      case "drumsDown":
        T.drums.intensity = clamp(T.drums.intensity - 0.3, 0, 1);
        if (T.drums.sound === "heavy") T.drums.sound = "punchy";
        say("drums", "lighter", "fewer hits, softer kit"); regen.add("drums"); break;
      case "drumsVary": T.drums.variant += 1; T.drums.intensity = clamp(T.drums.intensity + 0.1, 0, 1); say("drums", "new groove", "syncopated hits moved around the bar"); regen.add("drums"); break;
      case "bassDirty": T.bass.sound = "dirty"; T.bass.intensity = clamp(T.bass.intensity + 0.2, 0, 1); say("bass", "dirty", "distorted bass, more bite"); regen.add("bass"); break;
      case "bassClean": T.bass.sound = "sub"; say("bass", "clean sub", "smooth sub bass"); regen.add("bass"); break;
      case "bassMove":
        if (T.bass.style === "walk") { T.bass.variant += 1; say("bass", "new walk", "a different walking line"); }
        else { T.bass.style = "walk"; say("bass", "walking", "the bass walks through the chords, leading into each new one"); }
        regen.add("bass"); break;
      case "bassGroove":
        T.bass.style = "groove"; T.bass.variant += 1;
        plan.swing = clamp(plan.swing + 0.06, 0, 0.3);
        say("bass", "groovier", "syncopated bass line, a touch of swing"); regen.add("bass"); break;
      case "darker":
        if (plan.key.mode === "phrygian") { say("mood", "already its darkest mode", "so the melody went lower instead", { already: true }); queue.unshift({ op: "leadDarker" }); break; }
        plan.key = { ...plan.key, mode: plan.key.mode === "minor" ? "phrygian" : "minor" };
        plan.mood = "dark"; plan.harmonicV = true; plan.progression = null;
        say("mood", "darker", `now ${keyName(plan.key)}`); all(); break;
      case "brighter":
        plan.key = { ...plan.key, mode: plan.key.mode === "major" ? "mixolydian" : "major" };
        plan.mood = "bright"; plan.harmonicV = false; plan.progression = null;
        say("mood", "brighter", `now ${keyName(plan.key)}`); all(); break;
      case "dreamier":
        plan.sevenths = true; plan.fx.reverb = clamp(plan.fx.reverb + 0.25, 0, 1); T.chords.sound = "pad"; T.chords.style = "pad"; T.lead.sound = "bell";
        say("mood", "dreamier", "seventh chords, washy pad, glass-bell lead, more reverb"); regen.add("chords"); regen.add("lead"); break;
      case "texture": plan.fx.reverb = clamp(plan.fx.reverb + 0.1, 0, 1); setArr("texture", "texture"); break;
      case "hookUp":
        if (T.lead.hook >= 1) { T.lead.variant += 1; say("lead", "a new catchy hook", "the hook was already repeating; here's a fresh one"); }
        else { T.lead.hook = 1; T.lead.density = clamp(Math.max(T.lead.density, 0.5), 0, 1); say("lead", "stronger hook", "a syncopated motif that repeats, so it sticks"); }
        regen.add("lead"); break;
      case "chorusUp":
        if (plan.chorusBoost >= 3) {
          if (!plan.arr.harmony) { say("drop", "already at full size", "so the studio layered the hook in thirds", { already: true }); setArr("harmony", "lead"); break; }
          say("drop", "already at full size", "so the build got longer instead", { already: true }); queue.unshift({ op: "tensionUp" }); break;
        }
        plan.chorusBoost = clamp(plan.chorusBoost + 1, 0, 3);
        plan.sections = plan.sections.map((s) => (s.id === "drop" ? { ...s, energy: clamp(s.energy + 2, 1, 10) } : s.id === "build" ? { ...s, energy: clamp(s.energy + 1, 1, 10) } : s));
        T.lead.style = "anthem";
        say("drop", "bigger", "anthem lead an octave up and doubled, wider chords"); regen.add("lead"); regen.add("drums"); regen.add("chords"); break;
      case "tensionUp":
        if (plan.arr.tension) { if (!plan.arr.breakdown) { say("build", "already long", "so it opens on a breakdown too", { already: true }); setArr("breakdown", "build"); break; }
          say("build", "already at full stretch", "so the riser and snare roll hit harder", { already: true });
          plan.sections = plan.sections.map((s) => (s.id === "build" ? { ...s, energy: clamp(s.energy + 2, 1, 10) } : s)); break; }
        plan.arr.tension = true;
        plan.sections = plan.sections.map((s) => (s.id === "build" ? { ...s, bars: clamp(s.bars + 4, 1, 16) } : s));
        say("build", "more tension", describe.tension); break;
      case "breakdown": if (plan.arr.breakdown) { say("build", "already has a breakdown", "so the build got longer", { already: true }); queue.unshift({ op: "tensionUp" }); break; } setArr("breakdown", "build"); break;
      // ☠️ Each of these used to hand over to the other. With both on, they handed over for ever and froze the studio (found 4 Nov).
      case "counter":
      case "harmony": {
        if (!plan.arr[op]) { setArr(op, "lead"); break; }
        const other = op === "counter" ? "harmony" : "counter";
        if (plan.arr[other]) { say("lead", "already has a countermelody and a harmony", "there's nothing more to layer on it", { already: true }); break; }
        say("lead", op === "counter" ? "already has a countermelody" : "already harmonised", op === "counter" ? "so the hook got a harmony too" : "so a countermelody joined it", { already: true });
        setArr(other, "lead"); break;
      }
      case "chordsNew": plan.progVariant = (plan.progVariant + 1) % 100; plan.progression = null; say("chords", "new chord turn", "a different progression; bass and melody follow it"); all(); break;
      case "fillsMore": if (plan.arr.fills) { T.drums.variant += 1; say("drums", "new fills", "different fills every four bars"); regen.add("drums"); break; } setArr("fills", "drums"); break;
      case "energyUp":
        plan.energy = clamp(plan.energy + 1, 1, 10);
        plan.sections = plan.sections.map((s) => ({ ...s, energy: clamp(s.energy + 1, 1, 10) }));
        T.drums.intensity = clamp(T.drums.intensity + 0.15, 0, 1);
        say("energy", plan.energy, "every section pushed up"); all(); break;
      case "energyDown":
        plan.energy = clamp(plan.energy - 1, 1, 10);
        plan.sections = plan.sections.map((s) => ({ ...s, energy: clamp(s.energy - 1, 1, 10) }));
        T.drums.intensity = clamp(T.drums.intensity - 0.15, 0, 1);
        say("energy", plan.energy, "every section eased off"); all(); break;
      case "endingDramatic":
        if (plan.ending === "dramatic") { say("ending", "already dramatic", "so the drop before it got bigger", { already: true }); queue.unshift({ op: "chorusUp" }); break; }
        plan.ending = "dramatic"; say("ending", "dramatic", "drum fill, then one huge final hit that rings out"); break;
      case "endingFade": plan.ending = "fade"; say("ending", "fade", "fades out"); break;
      case "leadNew": T.lead.variant += 1; say("lead", "new melody", "a fresh hook"); regen.add("lead"); break;
      case "leadDarker":
        T.lead.octave = clamp(T.lead.octave - 1, -1, 1);
        if (plan.key.mode === "major" || plan.key.mode === "mixolydian") plan.key = { ...plan.key, mode: "minor" };
        else if (plan.key.mode === "minor" || plan.key.mode === "dorian") plan.key = { ...plan.key, mode: "phrygian" };
        T.lead.variant += 1;
        say("lead", "darker", `lower and in ${keyName(plan.key)}`); all(); break;
      case "lessBusy":
        T.drums.intensity = clamp(Math.min(T.drums.intensity - 0.3, 0.45), 0, 1);
        T.chords.intensity = clamp(Math.min(T.chords.intensity - 0.3, 0.3), 0, 1);
        T.lead.density = clamp(T.lead.density - 0.35, 0, 1);
        if (["pulse", "arp", "stabs"].includes(T.chords.style)) T.chords.style = "pad";
        plan.arr.fills = false;
        say("density", "less busy", "hats on the beat, no ghost notes, a sparser hook, held chords"); regen.add("drums"); regen.add("lead"); regen.add("chords"); break;
      case "busier":
        T.drums.intensity = clamp(T.drums.intensity + 0.25, 0, 1);
        T.lead.density = clamp(T.lead.density + 0.35, 0, 1);
        if (T.chords.style === "pad") T.chords.style = "pulse";
        T.chords.intensity = clamp(Math.max(T.chords.intensity, 0.5), 0, 1);
        say("density", "busier", "more drum hits, a busier hook, pulsing chords"); regen.add("drums"); regen.add("lead"); regen.add("chords"); break;
      case "reverbUp": plan.fx.reverb = clamp(plan.fx.reverb + 0.25, 0, 1); say("fx", "more reverb", "bigger room"); break;
      case "reverbDown": plan.fx.reverb = clamp(plan.fx.reverb - 0.25, 0, 1); say("fx", "less reverb", "drier"); break;
      case "surprise": {
        // The studio picks the contrast (and says so): the best-fitting idea this song hasn't had.
        const [idea] = ideasFor(plan, { seed: seedOf(plan.seed, "surprise", changes.length, ctx.turn || 0), used: ctx.used || [] });
        if (idea) { changes.push({ field: "surprise", value: idea.label, source: "studio", why: "you asked for a surprise; the studio picked one the song hasn't had" }); queue.unshift({ op: idea.op }); }
        break;
      }
      case "mute": T[arg].mute = true; say(arg, "muted", ""); break;
      case "unmute": T[arg].mute = false; say(arg, "back in", ""); break;
      case "solo": for (const n of TRACKS) T[n].solo = n === arg; say(arg, "solo", ""); break;
      default: break;
    }
  }
  return { plan, changes, regen };
}

// ---------- Salty's ideas ----------
//
// ☠️ SHE PICKED "A BIGGER CHORUS" TWICE OUT OF TWO (3 Nov, phone): her note listed seven fixed
// options with "a bigger chorus" last. Now the studio offers her three ideas the song can actually
// use (nothing it already has), weighted by what suits the style, never the ones she has already
// pushed this session, in an order set by the song's seed so no position always comes last.
// The choice among them, or an idea of her own, is hers. The menu is the studio's, and says so.

export const IDEAS = [
  { op: "breakdown", label: "a breakdown before the build, just pads and the hook", fits: (p) => !p.arr.breakdown, w: { house: 2, techno: 2, synthwave: 1, pop: 1, trap: 1, "electro-rock": 1, dnb: 1 } },
  { op: "counter", label: "a countermelody answering the hook", fits: (p) => !p.arr.counter, w: { synthwave: 2, pop: 2, cinematic: 2, lofi: 1, house: 1, ambient: 1 } },
  { op: "harmony", label: "the hook doubled a third above", fits: (p) => !p.arr.harmony, w: { "electro-rock": 2, cinematic: 2, pop: 1, synthwave: 1 } },
  { op: "bassMove", label: "a walking bassline that moves between the chords", fits: (p) => p.tracks.bass.style !== "walk", w: { lofi: 2, house: 2, pop: 1, dnb: 1, synthwave: 1 } },
  { op: "tensionUp", label: "a longer build with a beat of silence before the drop", fits: (p) => !p.arr.tension, w: { techno: 2, house: 1, "electro-rock": 2, dnb: 2, trap: 1, cinematic: 2 } },
  { op: "hookUp", label: "a catchier hook that repeats", fits: (p) => p.tracks.lead.hook < 1, w: { pop: 2, synthwave: 1, house: 1, trap: 1 } },
  { op: "chordsNew", label: "a different chord turn", fits: (p) => p.progVariant < 3, w: { lofi: 1, ambient: 2, pop: 1, cinematic: 1 } },
  { op: "fillsMore", label: "drum fills every four bars", fits: (p) => !p.arr.fills && p.genre !== "ambient", w: { "electro-rock": 2, dnb: 2, cinematic: 1, pop: 1 } },
  { op: "texture", label: "a wash of deep-sea air in the intro and outro", fits: (p) => !p.arr.texture, w: { ambient: 2, lofi: 2, synthwave: 1, cinematic: 1 } },
  { op: "drumsVary", label: "a more syncopated drum groove", fits: (p) => p.tracks.drums.variant < 2 && p.genre !== "ambient", w: { dnb: 1, lofi: 1, house: 1, trap: 1 } },
  { op: "drumsUp", label: "heavier drums", fits: (p) => p.tracks.drums.intensity < 0.8, w: { "electro-rock": 1, trap: 1, techno: 1 } },
  { op: "chorusUp", label: "a bigger drop", fits: (p) => p.chorusBoost < 1, w: { "electro-rock": 1, synthwave: 1 } },
  { op: "endingDramatic", label: "a dramatic final hit", fits: (p) => p.ending !== "dramatic", w: { cinematic: 2, "electro-rock": 1 } },
  { op: "darker", label: "a darker turn into minor", fits: (p) => p.key.mode === "major" || p.key.mode === "mixolydian", w: {} },
  { op: "faster", label: "a faster tempo", fits: (p) => p.bpm < GENRES[p.genre].bpm[0], w: {} },
  { op: "lessBusy", label: "less going on, so it can breathe", fits: (p) => p.tracks.lead.density > 0.45 && p.tracks.drums.intensity > 0.7, w: {} },
];

// What the room calls a change it is only offering, for the ones the idea menu doesn't list.
const OP_LABEL = { undo: "it put back how it was", bassGroove: "a groovier bassline", endingFade: "a fade at the end", brighter: "a brighter turn into major", busier: "a busier arrangement", slower: "a slower tempo", drumsDown: "lighter drums", leadNew: "a new melody", energyUp: "more energy", energyDown: "less energy", reverbDown: "less reverb", reverbUp: "more reverb", surprise: "a surprise from the studio", dreamier: "a dreamier sound", bassDirty: "a dirtier bass", bassClean: "a cleaner bass", leadDarker: "a darker melody" };
export const opLabel = (op) => IDEAS.find((i) => i.op === op)?.label || OP_LABEL[op] || op;

/** Three ideas for this song, best-fitting first by score, then shuffled by the seed for her note. */
export function ideasFor(plan, { seed = plan.seed, used = [], n = 3 } = {}) {
  const r = rng(seedOf(seed, "ideas"));
  const scored = IDEAS.filter((i) => i.fits(plan)).map((i) => ({ ...i, score: 1 + (i.w[plan.genre] || 0) - (used.includes(i.op) ? 3 : 0) + r() * 1.6 }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, n);
  for (let i = top.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [top[i], top[j]] = [top[j], top[i]]; }
  return top;
}

// ---------- Salty's part ----------

/** The track's name from her reply: the first quoted phrase of 1-6 words. Her words only. */
export function titleFromReply(reply) {
  const m = String(reply || "").match(/[“"«]([A-Za-z][^“”"«»\n]{1,40}?)[”"»]/);
  if (!m) return "";
  const t = m[1].trim().replace(/[.!?,]+$/, "");
  const words = t.split(/\s+/);
  if (words.length < 1 || words.length > 6) return "";
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

// What a producer says when she pushes for something: "I'd", "let's", "we should", "how about"...
const HER_ASK = /\b(i'?d|i would|i'?ll|i will|let'?s|let me|we should|we could|you should|how about|what if|i'?m (thinking|hearing|going|gonna)|push|pushing|try|add|adding|give|make|throw|bring|strip|needs?|could use|i want|time for|time to|go for|going for|how 'bout|want to try|wanna try)\b/i;
const HER_MOOD = { darker: /\b(darker|moodier|gloomier|more (sinister|ominous|menacing)|into minor)\b/i, leadDarker: /\b(darker|moodier|sadder|lower)\b/i,
  brighter: /\b(brighter|happier|sunnier|more uplifting|bright twist)\b/i, dreamier: /\b(dreamier|floatier|spacier|more (ethereal|atmospheric))\b/i };
const HER_ALLOWED = new Set(["slower", "faster", "drumsUp", "drumsDown", "drumsVary", "bassDirty", "bassClean", "bassMove", "darker", "brighter", "dreamier", "texture",
  "hookUp", "chorusUp", "tensionUp", "breakdown", "counter", "harmony", "chordsNew", "fillsMore", "energyUp", "energyDown", "endingDramatic", "leadNew", "leadDarker", "lessBusy", "busier", "reverbUp"]);

/**
 * The changes her reply asks for, through the same rules as his words, from sentences where she
 * is pushing for something. Never mute/solo, a named tempo or key, or a new genre. At most two.
 * ☠️ "a hook that hits right after the dark drop" (her first phone reply, 3 Nov) read as "make the
 * melody darker": "dark" there describes, it doesn't ask. Her mood pushes must be comparatives.
 */
export function opsFromReply(reply) {
  const sentences = sentencesOf(reply).filter((s) => !/\bnot\b|n[’']t\b|\bnever\b|\bno\b/i.test(s));
  const asking = sentences.filter((s) => HER_ASK.test(s) || /^[“"]/.test(s));
  // ☠️ ONE SENTENCE AT A TIME (3 Nov, phone): "...drops right into the chorus. Big enough to make it
  // sound like the whole city is singing" was read whole, and "chorus" + "big" across the full stop
  // credited her with a bigger chorus she never asked for. Her pick was the countermelody.
  // And clause by clause, so "the breakdown, or a catchier hook" keeps the order she said them in.
  const ops = [];
  for (const s of asking) {
    for (const clause of s.split(/,?\s+or\s+/i)) {
      for (const o of parseRevision(clause, { raw: true })) {
        if (HER_ALLOWED.has(o.op) && (!HER_MOOD[o.op] || HER_MOOD[o.op].test(s)) && !ops.some((x) => x.op === o.op)) ops.push(o);
      }
    }
  }
  return resolveOverlaps(ops).slice(0, 2); // her call, not a rewrite
}

/** A name the studio gives the track when Salty doesn't (or can't) name it. */
export function engineTitle(plan) {
  const r = rng(seedOf(plan.seed, "title"));
  const A = { dark: ["Abyss", "Undertow", "Midnight", "Trench", "Pressure", "Black Current"], bright: ["Sunlit", "Coral", "Golden", "Shallows", "Lagoon"],
    dreamy: ["Drift", "Moon Jelly", "Glass", "Bioluminous", "Kelp"], epic: ["Leviathan", "Tidal", "Riptide", "Titan", "Deepwater"], chill: ["Slow Tide", "Bubble", "Kelp Forest", "Low Light", "Still Water"] };
  const B = ["Engine", "Signal", "Pulse", "Run", "Dream", "Machine", "Rising", "Echoes", "Heart", "Lights"];
  return `${pick(r, A[plan.mood] || A.dreamy)} ${pick(r, B)}`;
}

/** One line describing the plan, for her note and the room's header. */
export function planSummary(plan) {
  const bits = [`${plan.mood} ${GENRES[plan.genre].label}`, keyName(plan.key), `${plan.bpm} BPM`];
  const T = plan.tracks;
  bits.push(`${SOUNDS.drums[T.drums.sound].toLowerCase()}`, `${SOUNDS.bass[T.bass.sound].toLowerCase()}`);
  if (plan.chorusBoost) bits.push("a big melodic drop");
  return bits.join(", ");
}

/**
 * The studio note appended to his message for her (salty-tank.mjs turnNotes): what the studio did,
 * and what only she decides. For a new song: its name, and which of three ideas (or one of her own)
 * she'd push, and why. For a change: what she thinks of it, and optionally one next idea.
 * Short on purpose: every word is prefill, and her reply is the only thing she writes.
 * No brackets: adaptMessages wraps the note in its own.
 */
// ☠️ Told "back how it was. Nothing else changed", she said "You said undo, I did nothing" (4 Nov, phone). When
// something did happen, the note says only that. She repeats what she's told, and she hangs on to "nothing".
const CONTROL_NOTE = {
  nosong: ["there's no track yet, so that couldn't happen.", "There's no track yet. What should we make?"],
  undone: ["done: the studio took back his last change, and his track is how it was before it.", "Back how it was."],
  nothingToUndo: ["there's nothing to undo yet, so the track is as it was.", "Nothing to undo yet."],
  nothingToRepeat: ["there's no last change to do again yet, so the track is as it was.", "Nothing to do again yet."],
  noWayBack: ["his last change has no other way to go, so the track is as it was.", "Which way do you want it?"],
  playing: ["done: his track is playing now.", "Here it is."],
  alreadyPlaying: ["his track was already playing.", "It's playing."],
  restarted: ["done: his track has started again from the top.", "From the top."],
  stopped: ["done: his track has stopped.", "Stopped."],
  notPlaying: ["his track isn't playing.", "It's not playing."],
  alreadyThat: ["his track is already like that, so it hasn't changed.", "It's already like that."],
};
export function studioNoteFor(kind, plan, changes = [], { ideas = [], about = "", intent = "", newOrThis = false, what: event = "", kept = "" } = {}) {
  const menu = ideas.map((i) => i.label);
  // ☠️ Handed the summary for a remark, she recited it: "My mate said his song needs more bass", "Dark electro-rock with a big melodic drop" (4 Nov, phone). Only a question gets the facts.
  if (kind === "still") return intent === "question" ? `MUSEick studio: his track has not changed. It is ${planSummary(plan)}. If he's asking about it, answer from that, and don't say you changed anything.` : "MUSEick studio: his track has not changed, so don't say you changed anything.";
  if (kind === "declined") return "MUSEick studio: he said no to that, so nothing has changed. Say something like \"Righto.\" to him, and no more.";
  if (kind === "which") return "MUSEick studio: he said yes, but more than one thing was on offer, so nothing has changed. Say something like \"Which one?\" to him, and no more.";
  if (kind === "control") return `MUSEick studio: ${CONTROL_NOTE[event][0]} Say something like "${CONTROL_NOTE[event][1]}" to him, and no more.`;
  if (kind === "ask") {
    // Nothing changed, and she has to know that: she has told him things were done that weren't.
    const open = "MUSEick studio: nothing has changed.";
    if (newOrThis) return `${open} He may want a new song or a change to this one. Say something like "A new one, or change this one?" to him, and no more.`;
    if (intent === "feedback") return `${open} He's not happy with his track: ${about}. Say something like "${menu.length ? `Want ${menu.join(" or ")}?` : "What do you want changed?"}" to him, and no more.`;
    if (intent === "clarify") return `${open} He wants something done to his track but hasn't said what. Say something like "What do you want done to it?" to him, and no more.`;
    return `${open} He may or may not mean his track. If he does, say something like "${menu.length ? `Want ${menu[0]}?` : "What do you want changed?"}" to him. If he doesn't, reply as you normally would.`;
  }
  const offer = menu.length > 1 ? `${menu.slice(0, -1).join("; ")}; or ${menu[menu.length - 1]}` : menu.join("");
  if (kind === "brief") {
    return `MUSEick studio: you're producing his track. Studio draft: ${planSummary(plan)}. ${kept ? `His last track, “${kept}”, is safe on his shelf. ` : ""}` +
      `In two short sentences, in character and talking to him as "you": name it in quotes, then say which idea you'd push and why: ${offer || "any idea of yours"}. Or an idea of your own.`;
  }
  const what = changes.map((c) => `${c.field} ${c.value}${c.already ? `, ${c.why}` : ""}`).join("; ");
  const tease = changes.some((c) => c.already) ? " It was already maxed out, so tease him a little." : "";
  // ☠️ "The hook's been doubled, third above" (3 Nov, phone): offered "you may suggest: the hook doubled
  // a third above", she told him it was done. The note now says nothing else changed, and asks her to
  // OFFER the ideas as a question; his tap on her idea is what makes one real.
  return `MUSEick studio: the studio just changed his track: ${what}. That's all that changed.${tease} In one or two short sentences, in character and talking to him as "you", say what you think of the change` +
    (menu.length ? `, then ask him if he wants to try ${menu.join(" or ")} next.` : ".");
}
