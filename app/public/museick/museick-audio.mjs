// MUSEick — the sound: synthesised instruments, effects and a look-ahead scheduler on Web Audio.
//
// Every sound is synthesised here from oscillators, filters and one noise buffer. Nothing is
// fetched, decoded or shipped as a recording, so there are no sample rights to clear.
//
// Graph (one per AudioContext; the same builder renders WAV offline):
//
//   voices -> session gate[track] -> track gain -> pump[track] -> bus -> section filter -> song fade
//          -> glue compressor -> Salty duck -> master -> limiter -> analyser -> speakers
//   track gain -> reverb send / delay send -> returns -> bus
//
// Timing: notes are scheduled on the audio clock up to AHEAD seconds before they sound, from a
// main-thread timer. A stall on the page (her mind's JSON, a layout) shorter than AHEAD costs
// nothing: the audio thread already has the notes. Mute, solo and volume act on gains, so they
// are instant; pattern edits are heard from the next unscheduled step.

import { midiToHz } from "./museick-theory.mjs";

const AHEAD = 0.45;
const TICK_MS = 40;
const TAIL = 4; // the dramatic ending's final hit rings for about this long
const TRACKS = ["drums", "bass", "chords", "lead"];
// Mix balance: what each track's fader at 100% means. Measured offline (see docs/museick).
const TRACK_BASE = { drums: 0.95, bass: 0.62, chords: 0.36, lead: 0.42 };
const REVERB_SEND = { drums: 0.08, bass: 0, chords: 0.38, lead: 0.3 };
const DELAY_SEND = { drums: 0, bass: 0, chords: 0.08, lead: 0.32 };
// Her voice needs to sit well clear of the music: 0.28 left it only about 6 dB above, and she was hard to hear (5 Nov).
const DUCK_LEVEL = 0.16;
// A little width: chords left of centre, lead right, its countermelody further left. Drums and bass stay
// in the middle, where a phone's speakers (and the kick/bass weight) belong.
const PAN = { drums: 0, bass: 0, chords: -0.18, lead: 0.14 };
const COUNTER_PAN = -0.38;
// Per-sound trims, so a track sits at the same level whichever sound it wears. From offline solo
// renders (RMS, 3 Nov, docs/museick/TEST_LOG.md): targets drums -15, bass -16.5, chords -19.5, lead -18 dBFS.
const SOUND_GAIN = {
  drums: { heavy: 0.83, punchy: 1.7, house: 1.5, "808": 1.5, lofi: 1.55 },
  bass: { dirty: 0.66, sub: 0.5, pluck: 1.8, "808": 0.55 },
  chords: { power: 1.25, keys: 1.5, pad: 1.05, stab: 1.5 },
  lead: { supersaw: 1.2, bell: 1.9, pluck: 1.9, square: 1.3 },
};

// ---------- graph ----------

function makeNoise(ctx) {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = 22222;
  for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
  return buf;
}

function makeImpulse(ctx, seconds = 2.4) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let s = 1234 + c * 999, lp = 0;
    for (let i = 0; i < len; i++) {
      s = (s * 16807) % 2147483647;
      const n = (s / 2147483647) * 2 - 1;
      // A gentle low-pass that closes over the tail: bright early reflections, dark decay.
      const k = 0.25 + 0.6 * (i / len);
      lp = lp * k + n * (1 - k);
      d[i] = lp * Math.pow(1 - i / len, 2.6) * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1);
    }
  }
  return buf;
}

function shaperCurve(amount) {
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * amount) / Math.tanh(amount); }
  return curve;
}

function buildGraph(ctx) {
  const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const bus = g(1);
  const secFilter = ctx.createBiquadFilter();
  secFilter.type = "lowpass"; secFilter.frequency.value = 16000; secFilter.Q.value = 0.8;
  const fade = g(1);
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16; glue.ratio.value = 3.5; glue.knee.value = 8; glue.attack.value = 0.006; glue.release.value = 0.18;
  const duck = g(1);
  const master = g(0.85);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2.5; limiter.ratio.value = 20; limiter.knee.value = 0; limiter.attack.value = 0.002; limiter.release.value = 0.08;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.78;
  bus.connect(secFilter); secFilter.connect(fade); fade.connect(glue); glue.connect(duck); duck.connect(master); master.connect(limiter);
  limiter.connect(analyser); analyser.connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx);
  const revReturn = g(0.3);
  reverb.connect(revReturn); revReturn.connect(bus);
  const delay = ctx.createDelay(2);
  const fb = g(0.36);
  const dlp = ctx.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 3200;
  const delReturn = g(0.25);
  delay.connect(dlp); dlp.connect(fb); fb.connect(delay); dlp.connect(delReturn); delReturn.connect(bus);

  const track = {}, pump = {}, revSend = {}, delSend = {};
  for (const t of TRACKS) {
    track[t] = g(TRACK_BASE[t] * 0.8);
    pump[t] = g(1);
    const pan = ctx.createStereoPanner(); pan.pan.value = PAN[t];
    track[t].connect(pump[t]); pump[t].connect(pan); pan.connect(bus);
    revSend[t] = g(REVERB_SEND[t]); pan.connect(revSend[t]); revSend[t].connect(reverb);
    delSend[t] = g(DELAY_SEND[t]); pan.connect(delSend[t]); delSend[t].connect(delay);
  }
  // The countermelody rides the lead's fader (mute/solo/volume) on its own side of the stereo field.
  const counterIn = g(0.85), counterPan = ctx.createStereoPanner();
  counterPan.pan.value = COUNTER_PAN;
  counterIn.connect(counterPan); counterPan.connect(track.lead);
  const drive = { light: shaperCurve(1.6), mid: shaperCurve(3), hard: shaperCurve(7) };
  return { ctx, bus, secFilter, fade, duck, master, analyser, reverb, revReturn, delay, delReturn, track, pump, revSend, delSend, counterIn, noise: makeNoise(ctx), drive };
}

// ---------- instruments ----------
//
// Each voice: (G, out, t, e, P) where G is the graph, out the session gate for its track, t the
// start time, e the event, P { stepSec, sounds, intensity }. Voices stop and disconnect themselves.

function env(param, t, peak, attack, hold, release, floor = 0.0001) {
  param.setValueAtTime(floor, t);
  param.linearRampToValueAtTime(peak, t + attack);
  if (hold > 0) param.setValueAtTime(peak, t + attack + hold);
  param.exponentialRampToValueAtTime(floor, t + attack + Math.max(0, hold) + release);
  return t + attack + Math.max(0, hold) + release;
}

function osc(ctx, type, freq, t, end, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (detune) o.detune.setValueAtTime(detune, t);
  o.start(t); o.stop(end + 0.02);
  return o;
}

function noise(G, t, end) {
  const s = G.ctx.createBufferSource();
  s.buffer = G.noise; s.loop = true;
  s.start(t, Math.random() * 1.5); s.stop(end + 0.02);
  return s;
}

function filt(ctx, type, freq, Q = 0.7) {
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; return f;
}

function cleanup(src, nodes) {
  src.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch { /* already gone */ } } };
}

const KITS = {
  punchy: { kick: [150, 46, 0.42], click: 0.22, snareTone: 190, snareDecay: 0.17, hatHp: 7600, drive: null, lp: 18000 },
  heavy: { kick: [170, 42, 0.55], click: 0.38, snareTone: 175, snareDecay: 0.27, hatHp: 7000, drive: "mid", lp: 18000 },
  house: { kick: [125, 48, 0.36], click: 0.15, snareTone: 210, snareDecay: 0.15, hatHp: 8200, drive: null, lp: 18000 },
  "808": { kick: [90, 44, 0.9], click: 0.1, snareTone: 220, snareDecay: 0.14, hatHp: 8600, drive: "light", lp: 18000 },
  lofi: { kick: [115, 50, 0.32], click: 0.08, snareTone: 200, snareDecay: 0.16, hatHp: 6500, drive: "light", lp: 6500 },
};

function drumVoice(G, out, t, e, P) {
  const { ctx } = G;
  const kit = KITS[P.sounds.drums] || KITS.punchy;
  const v = e.v;
  let dest = out;
  const extra = [];
  if (kit.lp < 18000) { const lp = filt(ctx, "lowpass", kit.lp); lp.connect(out); dest = lp; extra.push(lp); }
  switch (e.kind) {
    case "kick": {
      const [f0, f1, dec] = kit.kick;
      const o = osc(ctx, "sine", f0, t, t + dec + 0.05);
      o.frequency.exponentialRampToValueAtTime(f1, t + 0.09);
      const a = ctx.createGain();
      env(a.gain, t, v * 1.1, 0.002, 0.01, dec);
      o.connect(a);
      let k = a;
      if (kit.drive) { const sh = ctx.createWaveShaper(); sh.curve = G.drive[kit.drive]; a.connect(sh); k = sh; extra.push(sh); }
      k.connect(dest);
      const n = noise(G, t, t + 0.02), hp = filt(ctx, "highpass", 2800), ng = ctx.createGain();
      env(ng.gain, t, v * kit.click, 0.001, 0, 0.014);
      n.connect(hp); hp.connect(ng); ng.connect(dest);
      cleanup(o, [o, a, n, hp, ng, ...extra]);
      break;
    }
    case "snare": {
      const dec = kit.snareDecay;
      const n = noise(G, t, t + dec + 0.05), hp = filt(ctx, "highpass", 1100), bp = filt(ctx, "peaking", 3500, 1), ng = ctx.createGain();
      bp.gain.value = 4;
      env(ng.gain, t, v * 0.75, 0.001, 0.005, dec);
      n.connect(hp); hp.connect(bp); bp.connect(ng); ng.connect(dest);
      const o = osc(ctx, "triangle", kit.snareTone, t, t + 0.12), og = ctx.createGain();
      o.frequency.exponentialRampToValueAtTime(kit.snareTone * 0.8, t + 0.08);
      env(og.gain, t, v * 0.55, 0.001, 0, 0.09);
      o.connect(og); og.connect(dest);
      cleanup(n, [n, hp, bp, ng, o, og, ...extra]);
      break;
    }
    case "clap": {
      const n = noise(G, t, t + 0.25), bp = filt(ctx, "bandpass", 1150, 1.1), ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      for (const d of [0, 0.011, 0.022]) { ng.gain.setValueAtTime(v * 0.9, t + d); ng.gain.exponentialRampToValueAtTime(v * 0.12, t + d + 0.009); }
      ng.gain.setValueAtTime(v * 0.6, t + 0.031);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      n.connect(bp); bp.connect(ng); ng.connect(dest);
      cleanup(n, [n, bp, ng, ...extra]);
      break;
    }
    case "hat": case "open": {
      const dec = e.kind === "open" ? 0.26 : 0.045;
      const n = noise(G, t, t + dec + 0.03), hp = filt(ctx, "highpass", kit.hatHp), pk = filt(ctx, "peaking", 10500, 1.2), ng = ctx.createGain();
      pk.gain.value = 5;
      env(ng.gain, t, v * (e.kind === "open" ? 0.32 : 0.38), 0.001, 0, dec);
      n.connect(hp); hp.connect(pk); pk.connect(ng); ng.connect(dest);
      cleanup(n, [n, hp, pk, ng, ...extra]);
      break;
    }
    case "crash": {
      const n = noise(G, t, t + 1.8), hp = filt(ctx, "highpass", 4200), pk = filt(ctx, "peaking", 7000, 0.8), ng = ctx.createGain();
      pk.gain.value = 3;
      env(ng.gain, t, v * 0.3, 0.002, 0.02, 1.6);
      n.connect(hp); hp.connect(pk); pk.connect(ng); ng.connect(dest);
      cleanup(n, [n, hp, pk, ng, ...extra]);
      break;
    }
    case "tom": {
      const f = e.pitch || 140;
      const o = osc(ctx, "sine", f * 1.4, t, t + 0.35), a = ctx.createGain();
      o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
      env(a.gain, t, v * 0.9, 0.002, 0.02, 0.28);
      o.connect(a); a.connect(dest);
      cleanup(o, [o, a, ...extra]);
      break;
    }
    default: break;
  }
}

function bassVoice(G, out, t, e, P) {
  const { ctx } = G;
  const f = midiToHz(e.midi);
  const len = Math.max(0.06, e.dur * P.stepSec * 0.92);
  const v = e.v;
  const sound = P.sounds.bass;
  const a = ctx.createGain();
  const nodes = [a];
  let end;
  if (sound === "dirty") {
    const o1 = osc(ctx, "sawtooth", f, t, t + len + 0.1, -9), o2 = osc(ctx, "sawtooth", f, t, t + len + 0.1, 9), o3 = osc(ctx, "square", f / 2, t, t + len + 0.1);
    const sg = ctx.createGain(); sg.gain.value = 0.35;
    const sh = ctx.createWaveShaper(); sh.curve = G.drive[P.intensity.bass > 0.6 ? "hard" : "mid"];
    const lp = filt(ctx, "lowpass", 300, 5);
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.linearRampToValueAtTime(380 + 1900 * v, t + 0.012);
    lp.frequency.exponentialRampToValueAtTime(420, t + Math.min(len, 0.3));
    const pre = ctx.createGain(); pre.gain.value = 0.5;
    o1.connect(pre); o2.connect(pre); o3.connect(sg); sg.connect(pre); pre.connect(sh); sh.connect(lp); lp.connect(a);
    end = env(a.gain, t, v * 0.55, 0.004, len, 0.05);
    nodes.push(o1, o2, o3, sg, sh, lp, pre);
    cleanup(o1, nodes);
  } else if (sound === "808") {
    const o = osc(ctx, "sine", f * 1.6, t, t + len + 0.3);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    const sh = ctx.createWaveShaper(); sh.curve = G.drive.light;
    o.connect(sh); sh.connect(a);
    end = env(a.gain, t, v * 0.95, 0.003, len * 0.6, len * 0.5 + 0.2);
    nodes.push(o, sh);
    cleanup(o, nodes);
  } else if (sound === "pluck") {
    const o = osc(ctx, "sawtooth", f, t, t + len + 0.2), o2 = osc(ctx, "square", f / 2, t, t + len + 0.2);
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    const lp = filt(ctx, "lowpass", 2400, 4);
    lp.frequency.setValueAtTime(2600 * (0.5 + v / 2), t);
    lp.frequency.exponentialRampToValueAtTime(320, t + 0.22);
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(a);
    end = env(a.gain, t, v * 0.6, 0.003, Math.min(len, 0.08), Math.max(0.12, len * 0.7));
    nodes.push(o, o2, g2, lp);
    cleanup(o, nodes);
  } else {
    // A quiet sawtooth an octave up: phone speakers barely move below ~150 Hz, so a pure sub vanishes there.
    const o = osc(ctx, "sine", f, t, t + len + 0.1), o2 = osc(ctx, "sawtooth", f * 2, t, t + len + 0.1);
    const g2 = ctx.createGain(); g2.gain.value = 0.16;
    const lp = filt(ctx, "lowpass", 900);
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(a);
    end = env(a.gain, t, v * 0.9, 0.006, len, 0.06);
    nodes.push(o, o2, g2, lp);
    cleanup(o, nodes);
  }
  a.connect(out);
  return end;
}

function chordVoice(G, out, t, e, P) {
  const { ctx } = G;
  const len = Math.max(0.05, e.dur * P.stepSec * 0.95);
  const v = e.v / Math.sqrt(e.midis.length);
  const sound = P.sounds.chords;
  const a = ctx.createGain();
  const nodes = [a];
  let first = null;
  const add = (o) => { nodes.push(o); if (!first) first = o; return o; };
  if (sound === "pad") {
    const lp = filt(ctx, "lowpass", 1700, 0.9); nodes.push(lp);
    const attack = Math.min(0.35, len * 0.4), rel = 0.55;
    for (const m of e.midis) {
      const f = midiToHz(m);
      add(osc(ctx, "sawtooth", f, t, t + len + rel, -11)).connect(lp);
      add(osc(ctx, "sawtooth", f, t, t + len + rel, 11)).connect(lp);
    }
    lp.connect(a);
    env(a.gain, t, v * 0.45, attack, len - attack, rel);
  } else if (sound === "power") {
    const pre = ctx.createGain(); pre.gain.value = 0.35;
    const sh = ctx.createWaveShaper(); sh.curve = G.drive.hard;
    const lp = filt(ctx, "lowpass", 3400, 0.8), hp = filt(ctx, "highpass", 90);
    nodes.push(pre, sh, lp, hp);
    for (const m of e.midis) {
      const f = midiToHz(m);
      add(osc(ctx, "sawtooth", f, t, t + len + 0.1, -7)).connect(pre);
      add(osc(ctx, "sawtooth", f, t, t + len + 0.1, 7)).connect(pre);
    }
    pre.connect(sh); sh.connect(hp); hp.connect(lp); lp.connect(a);
    env(a.gain, t, v * 0.42, 0.004, len, len < 0.2 ? 0.04 : 0.12);
  } else if (sound === "keys") {
    for (const m of e.midis) {
      const f = midiToHz(m);
      const o = add(osc(ctx, "sine", f, t, t + len + 1.2)), o2 = add(osc(ctx, "triangle", f * 2, t, t + len + 1.2));
      const g2 = ctx.createGain(); g2.gain.value = 0.16; nodes.push(g2);
      o.connect(a); o2.connect(g2); g2.connect(a);
    }
    env(a.gain, t, v * 0.75, 0.004, Math.min(len, 0.05), Math.max(0.5, len));
  } else {
    const lp = filt(ctx, "lowpass", 3600, 2); nodes.push(lp);
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.2);
    for (const m of e.midis) {
      const f = midiToHz(m);
      add(osc(ctx, "sawtooth", f, t, t + len + 0.25, -6)).connect(lp);
      add(osc(ctx, "square", f, t, t + len + 0.25, 6)).connect(lp);
    }
    lp.connect(a);
    env(a.gain, t, v * 0.5, 0.003, Math.min(len, 0.06), Math.max(0.12, len * 0.6));
  }
  a.connect(out);
  if (first) cleanup(first, nodes);
}

function leadVoice(G, out, t, e, P, midi = e.midi, gain = 1, soundAs = null) {
  const { ctx } = G;
  const f = midiToHz(midi);
  const len = Math.max(0.06, e.dur * P.stepSec * 0.9);
  const v = e.v * gain;
  const sound = soundAs || P.sounds.lead;
  const a = ctx.createGain();
  const nodes = [a];
  let first;
  // Vibrato that arrives late on long notes, as a player would add it.
  const vib = (o) => {
    if (len < 0.35) return;
    const l = osc(ctx, "sine", 5.5, t, t + len + 0.2), lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.5, len));
    l.connect(lg); lg.connect(o.frequency); nodes.push(l, lg);
  };
  if (sound === "supersaw") {
    const lp = filt(ctx, "lowpass", 3800, 1); nodes.push(lp);
    for (const d of [-16, 0, 16]) { const o = osc(ctx, "sawtooth", f, t, t + len + 0.2, d); vib(o); o.connect(lp); nodes.push(o); first = first || o; }
    lp.connect(a);
    env(a.gain, t, v * 0.32, 0.01, len, 0.14);
  } else if (sound === "square") {
    const lp = filt(ctx, "lowpass", 3000, 1.5); nodes.push(lp);
    const o = osc(ctx, "square", f, t, t + len + 0.15), o2 = osc(ctx, "square", f, t, t + len + 0.15, 9);
    vib(o); vib(o2);
    o.connect(lp); o2.connect(lp); lp.connect(a); nodes.push(o, o2); first = o;
    env(a.gain, t, v * 0.26, 0.008, len, 0.1);
  } else if (sound === "bell") {
    const c = osc(ctx, "sine", f, t, t + len + 1.4), m = osc(ctx, "sine", f * 3.5, t, t + len + 1.4), mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.9);
    m.connect(mg); mg.connect(c.frequency); c.connect(a); nodes.push(c, m, mg); first = c;
    env(a.gain, t, v * 0.5, 0.003, 0.02, Math.max(0.8, len + 0.6));
  } else {
    const lp = filt(ctx, "lowpass", 4000, 3); nodes.push(lp);
    lp.frequency.setValueAtTime(4500, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.25);
    const o = osc(ctx, "sawtooth", f, t, t + len + 0.3), o2 = osc(ctx, "triangle", f * 2, t, t + len + 0.3);
    o.connect(lp); o2.connect(lp); lp.connect(a); nodes.push(o, o2); first = o;
    env(a.gain, t, v * 0.42, 0.003, Math.min(len, 0.05), Math.max(0.2, len * 0.8));
  }
  a.connect(out);
  cleanup(first, nodes);
}

function fxVoice(G, out, t, e, P) {
  const { ctx } = G;
  if (e.kind === "sweep") {
    const f = G.secFilter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(e.from, t);
    if (e.dur > 1) f.exponentialRampToValueAtTime(e.to, t + e.dur * P.stepSec);
  } else if (e.kind === "fade") {
    G.fade.gain.cancelScheduledValues(t);
    G.fade.gain.setValueAtTime(1, t);
    G.fade.gain.linearRampToValueAtTime(0.0001, t + e.dur * P.stepSec);
  } else if (e.kind === "riser") {
    const len = e.dur * P.stepSec;
    const n = noise(G, t, t + len), bp = filt(ctx, "bandpass", 300, 2.5), ng = ctx.createGain();
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(7500, t + len);
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.32, t + len * 0.98); ng.gain.linearRampToValueAtTime(0.0001, t + len);
    n.connect(bp); bp.connect(ng); ng.connect(out);
    cleanup(n, [n, bp, ng]);
  } else if (e.kind === "impact") {
    const o = osc(ctx, "sine", 70, t, t + 1.8), a = ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(32, t + 1.2);
    env(a.gain, t, e.v * 0.9, 0.003, 0.05, 1.5);
    o.connect(a); a.connect(out);
    const n = noise(G, t, t + 1.5), lp = filt(ctx, "lowpass", 2400), ng = ctx.createGain();
    lp.frequency.exponentialRampToValueAtTime(300, t + 1.2);
    env(ng.gain, t, e.v * 0.35, 0.002, 0.02, 1.3);
    n.connect(lp); lp.connect(ng); ng.connect(out);
    cleanup(o, [o, a]); cleanup(n, [n, lp, ng]);
  } else if (e.kind === "air") {
    // Deep-sea air: filtered noise that drifts slowly, faded in and out under a section.
    const len = e.dur * P.stepSec;
    const n = noise(G, t, t + len), bp = filt(ctx, "bandpass", 700, 0.8), lp = filt(ctx, "lowpass", 2600), ng = ctx.createGain();
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(1600, t + len * 0.5);
    bp.frequency.exponentialRampToValueAtTime(600, t + len);
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.09, t + Math.min(2, len * 0.3));
    ng.gain.setValueAtTime(0.09, t + Math.max(0, len - Math.min(2, len * 0.3)));
    ng.gain.linearRampToValueAtTime(0.0001, t + len);
    n.connect(bp); bp.connect(lp); lp.connect(ng); ng.connect(out);
    cleanup(n, [n, bp, lp, ng]);
  }
}

function playEvent(G, gates, t, ev, P) {
  if (ev.tr === "fx") return fxVoice(G, gates.fx, t, ev, P);
  const e = { ...ev, v: ev.v * (SOUND_GAIN[ev.tr]?.[P.sounds[ev.tr]] ?? 1) };
  const out = gates[e.tr];
  if (e.tr === "drums") {
    drumVoice(G, out, t, e, P);
    if (e.kind === "kick" && P.pump) for (const tr of ["bass", "chords"]) {
      const p = G.pump[tr].gain;
      p.setTargetAtTime(0.32, t, 0.004);
      p.setTargetAtTime(1, t + 0.05, 0.08);
    } else if (e.kind === "kick") {
      // No pump in this style, but the bass still steps aside for the kick's first moment, so the two
      // don't pile up in the same low frequencies.
      const p = G.pump.bass.gain;
      p.setTargetAtTime(0.7, t, 0.003);
      p.setTargetAtTime(1, t + 0.04, 0.05);
    }
  } else if (e.tr === "bass") bassVoice(G, out, t, e, P);
  else if (e.tr === "chords") chordVoice(G, out, t, e, P);
  else if (e.tr === "lead" && e.counter) leadVoice(G, gates.counter, t, e, P, e.midi, 1, P.sounds.lead === "bell" ? "square" : "bell");
  else if (e.tr === "lead") {
    leadVoice(G, out, t, e, P);
    if (e.double) leadVoice(G, out, t, e, P, e.double, 0.55);
    if (e.harm) leadVoice(G, out, t, e, P, e.harm, 0.45);
  }
}

function sessionGates(G) {
  const gates = {};
  for (const t of TRACKS) { gates[t] = G.ctx.createGain(); gates[t].connect(G.track[t]); }
  gates.counter = G.ctx.createGain(); gates.counter.connect(G.counterIn);
  gates.fx = G.ctx.createGain(); gates.fx.connect(G.bus);
  return gates;
}

function paramsOf(plan, stepSec) {
  const T = plan.tracks;
  return {
    stepSec, pump: plan.pump,
    sounds: { drums: T.drums.sound, bass: T.bass.sound, chords: T.chords.sound, lead: T.lead.sound },
    intensity: { drums: T.drums.intensity, bass: T.bass.intensity, chords: T.chords.intensity, lead: T.lead.intensity },
  };
}

function trackLevels(plan) {
  const T = plan.tracks;
  const solo = TRACKS.some((t) => T[t].solo);
  const out = {};
  for (const t of TRACKS) out[t] = T[t].mute || (solo && !T[t].solo) ? 0 : TRACK_BASE[t] * Math.pow(T[t].vol, 1.6);
  return out;
}

function applyMix(G, plan, now, tc = 0.015) {
  const lv = trackLevels(plan);
  for (const t of TRACKS) G.track[t].gain.setTargetAtTime(lv[t], now, tc);
  G.revReturn.gain.setTargetAtTime(plan.fx.reverb * 0.9, now, 0.05);
  G.delReturn.gain.setTargetAtTime(plan.fx.delay * 0.7, now, 0.05);
}

// ---------- the live engine ----------

/**
 * The studio's player. `onEnded` fires when a non-looping song finishes.
 * Created lazily: the AudioContext only exists once he presses something (autoplay rules).
 */
export function createMuseickAudio({ onEnded = () => {} } = {}) {
  let G = null, gates = null, timer = 0;
  let song = null, plan = null, byStep = [], total = 0, stepSec = 0.125, swing = 0, P = null;
  let playing = false, loop = true, start = 0, next = 0, pausedAt = 0, endAt = 0;
  let ducked = false, held = false;
  const hits = [];

  function ensure() {
    if (G) return G;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    // ☠️ "playback" WASN'T LARGE ENOUGH. On the phone it meant a 21 ms buffer. While her mind and voice worked through a
    // long reply, the audio thread missed its deadline 53 times in 9 s, which cut 1.1 s of silence into the song (4 Nov,
    // the owner heard it, playbackStats counted it). A number asks for that much buffer, and Chrome gives its largest:
    // 8192 frames, 171 ms. The same kind of turns then missed none. Nothing here needs low latency, because every note is
    // scheduled ahead. What he sees allows for the delay (heardLag), so the lights still land on the beat.
    const ctx = new AC({ latencyHint: 0.35 });
    G = buildGraph(ctx);
    if (plan) applyMix(G, plan, ctx.currentTime, 0.001);
    return G;
  }

  const timeOf = (s) => start + s * stepSec + (s % 2 ? swing * stepSec : 0);
  /** How far the audio clock runs ahead of what the speaker is playing. */
  const heardLag = () => (G ? G.ctx.outputLatency || 0 : 0);

  function tick() {
    if (!playing || !G) return;
    const now = G.ctx.currentTime;
    while (playing && timeOf(next) < now + AHEAD) {
      if (next >= total) {
        if (loop) {
          start += total * stepSec;
          next = 0;
          G.fade.gain.cancelScheduledValues(timeOf(0)); G.fade.gain.setValueAtTime(1, timeOf(0));
          continue;
        }
        if (!endAt) endAt = timeOf(total) + TAIL;
        if (now > endAt) { stop(); onEnded(); }
        return;
      }
      const t = Math.max(timeOf(next), now + 0.005);
      for (const e of byStep[next] || []) {
        try { playEvent(G, gates, t, e, P); } catch (err) { console.warn("MUSEick note failed", err); }
        if (e.tr !== "fx") hits.push({ tr: e.tr, at: t, kind: e.kind || "", v: e.v });
      }
      if (hits.length > 256) hits.splice(0, hits.length - 256);
      next++;
    }
  }

  function load(nextSong, compiled) {
    const wasStep = playing ? positionStep() : pausedAt;
    song = nextSong; plan = nextSong.plan;
    const oldStepSec = stepSec;
    total = compiled.totalSteps; stepSec = compiled.stepSec; swing = compiled.swing;
    byStep = new Array(total);
    for (const e of compiled.events) (byStep[e.step] ||= []).push(e);
    P = paramsOf(plan, stepSec);
    if (G) applyMix(G, plan, G.ctx.currentTime);
    if (playing && oldStepSec !== stepSec) {
      // A new tempo: keep the bar he is in, re-time what follows.
      const now = G.ctx.currentTime;
      start = now - wasStep * stepSec;
    }
    if (next > total) next = 0;
    if (pausedAt >= total) pausedAt = 0;
  }

  function positionStep() {
    if (!G || !playing) return pausedAt;
    const s = (G.ctx.currentTime - start) / stepSec;
    return Math.max(0, Math.min(total, s));
  }

  async function play(fromStep = null) {
    if (!song) return false;
    ensure();
    if (G.ctx.state !== "running") { try { await G.ctx.resume(); } catch { /* resumes on next gesture */ } }
    if (playing) return true;
    const from = fromStep ?? (pausedAt >= total ? 0 : pausedAt);
    gates = sessionGates(G);
    const now = G.ctx.currentTime + 0.06;
    start = now - from * stepSec;
    next = Math.ceil(from);
    endAt = 0;
    G.fade.gain.cancelScheduledValues(0); G.fade.gain.setValueAtTime(1, G.ctx.currentTime);
    // Re-apply the section filter for where he starts: the last sweep at or before `from`.
    let sweep = null;
    for (let s = Math.floor(from); s >= 0 && !sweep; s--) sweep = (byStep[s] || []).find((e) => e.kind === "sweep") || null;
    G.secFilter.frequency.cancelScheduledValues(0);
    G.secFilter.frequency.setValueAtTime(sweep ? sweep.to : 16000, G.ctx.currentTime);
    playing = true;
    clearInterval(timer);
    timer = setInterval(tick, TICK_MS);
    tick();
    return true;
  }

  function silenceGates(g, now) {
    if (!g) return;
    for (const k of Object.keys(g)) {
      const n = g[k];
      n.gain.cancelScheduledValues(now); n.gain.setValueAtTime(n.gain.value, now); n.gain.linearRampToValueAtTime(0, now + 0.03);
      setTimeout(() => { try { n.disconnect(); } catch { /* gone */ } }, 900);
    }
  }

  function pause() {
    if (!playing) return;
    pausedAt = positionStep();
    playing = false;
    clearInterval(timer);
    silenceGates(gates, G.ctx.currentTime); gates = null;
    hits.length = 0;
  }

  function stop() {
    if (playing) pause();
    pausedAt = 0;
  }

  function seek(step) {
    const was = playing;
    if (was) pause();
    pausedAt = Math.max(0, Math.min(total - 1, step));
    if (was) play(pausedAt);
  }

  function setMix(nextPlan) {
    plan = nextPlan;
    if (song) song = { ...song, plan };
    if (G) applyMix(G, plan, G.ctx.currentTime);
  }

  function updateDuck() {
    if (!G) return;
    const now = G.ctx.currentTime;
    const target = held ? 0.0001 : ducked ? DUCK_LEVEL : 1;
    // Gently both ways, so the music never seems to cut in or out. Only the mic is quick: the music mustn't play into it.
    G.duck.gain.setTargetAtTime(target, now, held ? 0.07 : target < 1 ? 0.22 : 0.7);
  }

  return {
    ensure,
    load,
    play,
    pause,
    stop,
    seek,
    setMix,
    setLoop(on) { loop = Boolean(on); },
    get loop() { return loop; },
    get playing() { return playing; },
    get totalSteps() { return total; },
    get stepSec() { return stepSec; },
    /** Where the song is as he hears it, for the playhead. */
    position: () => (playing ? Math.max(0, positionStep() - heardLag() / stepSec) : positionStep()),
    /** Salty is speaking: the music sits under her voice. */
    duck(on) { ducked = Boolean(on); updateDuck(); },
    /** The mic is open: the music goes silent so her ears hear only him. */
    hold(on) { held = Boolean(on); updateDuck(); },
    get ducked() { return ducked; },
    get held() { return held; },
    analyser: () => G?.analyser || null,
    /** Notes that have started sounding since the last call (for the room's lights). */
    takeHits() {
      if (!G) return [];
      const now = G.ctx.currentTime - heardLag();
      const out = [];
      while (hits.length && hits[0].at <= now) out.push(hits.shift());
      return out;
    },
    contextState: () => G?.ctx.state || "none",
    outputLatency: () => (G ? (G.ctx.outputLatency || 0) + (G.ctx.baseLatency || 0) : 0),
    async dispose() {
      stop();
      clearInterval(timer);
      if (G) { const c = G.ctx; G = null; try { await c.close(); } catch { /* closed */ } }
    },
  };
}

// ---------- offline render (WAV export and level checks) ----------

/** Renders the whole song offline. Returns an AudioBuffer. Never touches the live context. */
export async function renderOffline(song, compiled, { sampleRate = 44100, tracks = null } = {}) {
  const seconds = compiled.seconds + TAIL;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const G = buildGraph(ctx);
  const plan = tracks ? { ...song.plan, tracks: Object.fromEntries(TRACKS.map((t) => [t, { ...song.plan.tracks[t], mute: !tracks.includes(t), solo: false }])) } : song.plan;
  applyMix(G, plan, 0, 0.001);
  const gates = sessionGates(G);
  const P = paramsOf(plan, compiled.stepSec);
  const t0 = 0.05;
  for (const e of compiled.events) {
    const t = t0 + e.step * compiled.stepSec + (e.step % 2 ? compiled.swing * compiled.stepSec : 0);
    playEvent(G, gates, t, e, P);
  }
  return ctx.startRendering();
}

/** 16-bit PCM WAV bytes from an AudioBuffer. */
export function wavBytes(buffer) {
  const ch = buffer.numberOfChannels, len = buffer.length, rate = buffer.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); out.setUint32(4, 36 + len * ch * 2, true); str(8, "WAVE"); str(12, "fmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, rate, true);
  out.setUint32(28, rate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, len * ch * 2, true);
  const data = [];
  for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Uint8Array(out.buffer);
}

/** Peak and RMS (dBFS) of a rendered buffer, for the level checks in the test log. */
export function levels(buffer) {
  let peak = 0, sum = 0, n = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; n++; }
  }
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / n)) };
}
