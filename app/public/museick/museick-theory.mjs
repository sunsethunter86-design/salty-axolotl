// MUSEick — music theory: seeded randomness, scales, chords and voicing.
//
// Pure functions, no DOM, no audio: the composer (museick-compose.mjs) and the tests
// (scripts/museick_test.mjs) both run on this. Every "random" choice in MUSEick comes
// from a seeded generator, so the same plan always composes the same notes.

/** mulberry32: small, fast, good enough for musical choices. Returns () => [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 32-bit seed from any mix of numbers and strings (FNV-1a). */
export function seedOf(...parts) {
  let h = 0x811c9dc5;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
export const chance = (r, p) => r() < p;

export const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

export const MODES = Object.freeze({
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
});

export const MODE_LABEL = Object.freeze({
  major: "major", minor: "minor", dorian: "dorian", phrygian: "phrygian", mixolydian: "mixolydian",
});

export function keyName(key) {
  return `${NOTE_NAMES[key.tonic]} ${MODE_LABEL[key.mode] || key.mode}`;
}

/** MIDI note of a scale degree (0 = tonic, 7 = tonic an octave up, negatives go down). */
export function degreeToMidi(key, degree, octave = 4) {
  const steps = MODES[key.mode] || MODES.minor;
  const oct = Math.floor(degree / 7);
  const idx = ((degree % 7) + 7) % 7;
  return 12 * (octave + 1) + key.tonic + steps[idx] + 12 * oct;
}

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * The notes of the chord on scale degree `d`, as MIDI numbers in root position from `octave`.
 * `harmonicV`: in a minor key the chord on the fifth degree gets a major third (the leading
 * tone), which gives dark and epic progressions their pull back home.
 */
export function chordTones(key, d, { seventh = false, octave = 3, harmonicV = false } = {}) {
  const degs = seventh ? [d, d + 2, d + 4, d + 6] : [d, d + 2, d + 4];
  const notes = degs.map((g) => degreeToMidi(key, g, octave));
  const minorish = key.mode === "minor" || key.mode === "phrygian" || key.mode === "dorian";
  if (harmonicV && minorish && ((d % 7) + 7) % 7 === 4) notes[1] += notes[1] - notes[0] === 3 ? 1 : 0;
  return notes;
}

/** Chord tones of degree `d` as scale degrees (pitch classes in scale steps, 0..6). */
export function chordDegrees(d, seventh = false) {
  const base = ((d % 7) + 7) % 7;
  const out = [base, (base + 2) % 7, (base + 4) % 7];
  if (seventh) out.push((base + 6) % 7);
  return out;
}

/**
 * Smooth voice leading: of every inversion/octave placement of `tones` inside [lo, hi],
 * the one closest to the previous voicing (or to the middle of the range).
 */
export function voiceLead(tones, prev = null, lo = 52, hi = 76) {
  const pcs = tones.map((t) => ((t % 12) + 12) % 12);
  const target = prev && prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : (lo + hi) / 2;
  let best = null, bestCost = Infinity;
  for (let inv = 0; inv < pcs.length; inv++) {
    const order = pcs.slice(inv).concat(pcs.slice(0, inv));
    for (let base = lo - 12; base <= hi; base++) {
      if (((base % 12) + 12) % 12 !== order[0]) continue;
      const v = [base];
      for (let i = 1; i < order.length; i++) {
        let n = v[i - 1] + 1;
        while (((n % 12) + 12) % 12 !== order[i]) n++;
        v.push(n);
      }
      if (v[0] < lo || v[v.length - 1] > hi) continue;
      const cost = prev && prev.length === v.length
        ? v.reduce((s, n, i) => s + Math.abs(n - prev[i]), 0)
        : Math.abs(v.reduce((a, b) => a + b, 0) / v.length - target);
      if (cost < bestCost) { bestCost = cost; best = v; }
    }
  }
  return best || tones.slice();
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
