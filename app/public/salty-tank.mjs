// Hackathon (Meta Llama): Salty's tank, the home screen while the Salty mind is loaded.
//
// Self-contained on purpose: it draws over Veridity's own screens and drives them only through their
// real controls (#micBtn, #textInput + #textForm, #homeStopBtn) and reads her state only from what they
// already show (the .phone-shell classes and #homeReplyBody). So the mic, the crisis net, the helpline
// guard and the turn machinery are exactly Veridity's; nothing here talks to the mind.
//
// app.js calls syncSaltyTank(true|false) once /health names the loaded mind file. The last answer is
// remembered so a restart opens straight into the tank instead of flashing Veridity's screen first.

import { onSaltyVoiceSounding, saltyVoiceSounding, saltyVoiceLevel, saltyNextSpeechViseme, saltyLegAction } from "./salty-mind.mjs";
import { saltyMoodFor } from "./salty-moods.mjs";
import { setSaltyMemory } from "./salty-mind.mjs";
import { loadSaltyMemory, saveSaltyMemory, forgetSaltyMemory, forgetSaltyNote, captureFromWords, memoryPromptLine, recallNoteFor } from "./salty-memory.mjs";
import { createSalty3D } from "./salty-tank-3d.mjs?v=20261102-moods";

const KEY = "vfl.saltyTank";
const BASE = "./salty/";

// Mood -> cut-out loop (salty-video/cutout.py). x/y/w line the wide clip up with the idle one.
const MOODS = {
  idle:  { clip: "idle_listen_cut" },
  talk:  { clip: "talk_medium_cut" },
  happy: { clip: "happy_wide_cut", x: "-4%", y: "-6%", w: "100%" },
};
// Pose match between the idle and talk loops (salty-video/pose_match.py, 28 Oct): for each idle
// frame the talk frame whose silhouette and colour sit closest, and back. A switch starts the new loop
// on the matched frame, so her head and body barely move under the cross-fade.
const IDLE_TO_TALK = [28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,27,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,27,27,27,13,12,12,12,12,12,11,11,11,11,11,11,78,78,78,78,78,78,84,84,11,11,11,4,4,84,11,84,84,84,83,4,4,4,83,83,83,83,83,83,12,12,12,12,12,12,12,12,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,76,12,12,12,76,76,76,12,76,76,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,76,76,76,76,76,12,12,12,12,12,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,12,12,12,12,12,12,12,12,83,83,83,83,83,83,4,4,4,83,84,84,4,11,84,4,4,11,11,11,84,84,78,78,78,78,78,78,11,11,11,11,11,11,12,12,12,12,12,13,27,27,27,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,27,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28];
const TALK_TO_IDLE = [391,391,391,392,407,28,36,36,36,50,168,168,251,183,204,221,221,221,221,221,221,221,221,221,167,167,261,383,383,204,221,221,221,221,221,221,221,221,221,221,221,221,221,221,221,221,221,221,221,221,221,221,221,221,221,221,221,221,221,204,383,383,261,167,167,221,221,221,221,221,221,221,221,221,204,183,251,168,168,50,36,36,36,28,407,392,391,391];
const MATCH = { "idle>talk": IDLE_TO_TALK, "talk>idle": TALK_TO_IDLE };
// Table legs in the room photo (1024 x 572): left leg x 297-335, right 690-728, button centres low on the legs.
const LEGS = { left: 0.310, right: 0.692, y: 0.915 };

const LETTERS = ["qwertyuiop", "asdfghjkl", "⇧zxcvbnm⌫", "?,␣.↵"];
const SYMBOLS = ["1234567890", "@#$%&-+()/", "=*\"':;!?⌫", "abc,␣.↵"];

let root = null;
let state = null;
// Her mind runs on the Hexagon NPU when it is a GGUF (the -PvfMetaHex lane); the LiteRT lane
// (.litertlm) decodes on the GPU the tank draws with. Only that lane needs the tank to hold still.
let mindOnNpu = false;
// What she remembers about him (salty-memory.mjs). Loaded once, at module load, which is before her
// mind's first request of the session: her system prompt then stays the same all session. Notes made
// during the session are saved at once and shown in the card, and reach her prompt next session.
let memory = loadSaltyMemory();
setSaltyMemory(memoryPromptLine(memory), (words) => recallNoteFor(memory, words));

function remembered() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
function remember(on) {
  try { on ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY); } catch { /* private mode: just no head start */ }
}

/** The one entry point app.js uses. Idempotent. `modelFile` is the loaded mind file from /health. */
export function syncSaltyTank(on, modelFile = "") {
  mindOnNpu = /\.gguf$/i.test(String(modelFile));
  remember(on);
  if (on) mount();
  else { document.documentElement.classList.remove("salty-boot"); unmount(); }
}

function el(tag, cls, attrs = {}) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function mount() {
  if (root || !document.body) return;
  let css = document.querySelector("link[data-salty-tank]");
  if (!css) {
    css = el("link", "", { rel: "stylesheet", href: `${BASE}salty-tank.css?v=20261102-captions`, "data-salty-tank": "" });
    document.head.append(css);
  }
  root = el("div", "", { id: "saltyTank", role: "application", "aria-label": "Salty's tank" });
  // No Veridity flash (Shaun, 30 Oct): the tank stylesheet loads async above, so
  // for a split second the unstyled tank sat over Veridity's home screen and he
  // saw it before she took over. The tank's own critical layout is inline from
  // the first paint; salty-tank.css takes over identical values when it lands.
  root.style.cssText = "position:fixed;inset:0;z-index:100;overflow:hidden;background:#1d1a17;color:#f3ece6";
  // ☠️ ...but only her layout was inline. Until salty-tank.css landed, her typing panel and RGB keyboard
  // (kept off-screen by that sheet) sat unstyled in plain view for a frame or two on every cold launch
  // (2 Nov, launch recording). Everything but her dark background stays hidden until the sheet has loaded.
  // ☠️ Hiding alone wasn't enough: when the sheet landed, the panel *transitioned* to its off-screen spot,
  // and revealing her caught it mid-slide. No transitions while the sheet is pending.
  root.className = "st-css-pending";
  // Two frames after the sheet lands, so a style pass has already run with transitions off.
  const ready = () => requestAnimationFrame(() => requestAnimationFrame(() => root?.classList.remove("st-css-pending")));
  if (css.sheet) ready();
  else { css.addEventListener("load", ready, { once: true }); css.addEventListener("error", ready, { once: true }); }
  root.innerHTML = `
    <style>#saltyTank.st-css-pending > :not(.st-bg) { visibility: hidden; }
      #saltyTank.st-css-pending, #saltyTank.st-css-pending * { transition: none !important; }</style>
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <filter id="st-reeflight" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values=".90 0 0 0 0   0 .84 0 0 0   0 0 .96 0 .05   0 0 0 1 0"/>
      </filter>
    </svg>
    <div class="st-bg"></div>
    <div class="st-stage">
      <img class="st-room" src="${BASE}room.jpg" alt="">
      <div class="st-lamp halo"></div><div class="st-lamp cone"></div><div class="st-lamp shade"></div><div class="st-lamp rim"></div>
      <div class="st-tank">
        <img class="st-reef" src="${BASE}reef_inside.png" alt="">
        <div class="st-contact"></div>
        ${Object.entries(MOODS).map(([mood, m]) => `<video data-mood="${mood}" muted loop playsinline preload="auto" src="${BASE}loops/${m.clip}.webm"></video>`).join("")}
        <div class="st-sandfront"></div>
        <div class="st-shine"></div>
      </div>
      <div class="st-glass"></div>
      <div class="st-neonglow"></div>
      <div class="st-neon">Salty</div>
    </div>
    <button class="st-leg st-mic" type="button" aria-label="Mic"><span>mic</span></button>
    <button class="st-leg st-txt" type="button" aria-label="Type to Salty"><span>txt</span></button>
    <!-- Licence duty (Llama 3.2 Community License 1.b.i) and AUP section 4, Salty-only: kept outside
         .st-stage because every press on the stage is a press on Salty (salty-tank-3d.mjs taps). -->
    <a class="st-credit" href="./licenses/SALTY_NOTICES.txt" target="_blank" rel="noopener noreferrer">Built with Llama<span class="st-credit-muse">coded with Muse Wonder</span><span>Salty is an AI · she can be wrong</span></a>
    <button class="st-mem" type="button" aria-label="What Salty remembers about you">🐚 <span class="st-mem-n"></span></button>
    <div class="st-memcard" role="dialog" aria-label="What Salty remembers" hidden>
      <div class="st-memhead"><b>What Salty remembers</b><button class="st-memclose" type="button" aria-label="Close">×</button></div>
      <ul class="st-memlist"></ul>
      <p class="st-memnote">Kept only on this phone, never sent anywhere. Things you tell her now, she remembers from the next time she wakes up.</p>
      <button class="st-memforget" type="button">Forget everything</button>
    </div>
    <div class="st-caps" aria-live="polite" hidden><div class="st-cap-you"></div><div class="st-cap-her"></div></div>
    <div class="st-panel" aria-hidden="true">
      <div class="st-tile">
        <button class="st-close" type="button" aria-label="Close">×</button>
        <div class="st-you"></div>
        <div class="st-her" aria-live="polite"></div>
        <div class="st-line"></div>
      </div>
      <div class="st-kb" role="group" aria-label="Keyboard"></div>
    </div>`;
  document.body.append(root);
  // She now covers the screen herself: lift index.html's first-paint cover (salty-boot).
  document.documentElement.classList.remove("salty-boot");

  const q = (s) => root.querySelector(s);
  state = {
    stage: q(".st-stage"), tank: q(".st-tank"), videos: [...root.querySelectorAll(".st-tank video")],
    mic: q(".st-mic"), txt: q(".st-txt"), credit: q(".st-credit"), neon: q(".st-neon"), neonGlow: q(".st-neonglow"),
    caps: q(".st-caps"), capYou: q(".st-cap-you"), capHer: q(".st-cap-her"), panel: q(".st-panel"), you: q(".st-you"), her: q(".st-her"),
    line: q(".st-line"), kb: q(".st-kb"),
    front: null, target: null, mood: "idle", typed: "", shift: true, symbols: false, happyTimer: 0,
    switchId: 0, salty3d: null, thinkShown: false, tapAlt: false,
    timers: [], observers: [], cleanup: [],
  };
  for (const v of state.videos) {
    const m = MOODS[v.dataset.mood];
    for (const k of ["x", "y", "w"]) if (m[k]) v.style.setProperty(`--${k}`, m[k]);
  }

  addBubbles();
  setMood("idle");
  init3D();
  renderKeyboard();
  renderLine();
  wireControls();
  wireAppState();
  wireMemory();
  placeLegs();
}

// 3D Salty (29 Oct model) replaces the video loops when she loads. Any failure — no WebGL,
// a bad model file, an old WebView — keeps the proven video tank exactly as it was.
async function init3D() {
  const mine = state;
  try {
    const api = await createSalty3D(mine.tank, {
      // RMS envelope -> mouth amount. Her soft consonants sit just above the quiet floor
      // salty-mind.mjs uses (open 0.02); loud speech on the ROG sits around 0.1-0.15.
      getLevel: () => Math.min(1, Math.max(0, (saltyVoiceLevel() - 0.015) / 0.1)),
      // Her actual words, one mouth shape per syllable, consumed as she says them.
      getViseme: () => saltyNextSpeechViseme(),
      onTap: () => {
        if (!state || state !== mine || state.mood === "talk") return;
        mine.tapAlt = !mine.tapAlt;
        mine.salty3d?.playMood(mine.tapAlt ? "wave" : "wink");
      },
    });
    if (!state || state !== mine) { api.dispose(); return; }
    mine.salty3d = api;
    mine.tank.classList.add("st-3d-on");
    for (const v of mine.videos) v.pause();
    // Re-apply whatever she was doing when the model finished loading.
    const mood = mine.mood;
    mine.mood = ""; mine.target = "";
    setMood(mood);
  } catch (e) {
    console.warn("Salty 3D did not load; keeping her video loops", e);
  }
}

function unmount() {
  if (!root) return;
  state.salty3d?.dispose();
  for (const t of state.timers) clearInterval(t);
  for (const o of state.observers) o.disconnect();
  for (const f of state.cleanup) f();
  for (const v of state.videos) { v.pause(); v.removeAttribute("src"); v.load(); }
  root.remove();
  document.querySelector(".st-return")?.remove();
  root = null; state = null;
  uncovered();
}

// While she is up, salty-tank.css hides Veridity's home screen and its orb stops drawing (heat, 2 Nov).
// Whenever the tank steps aside, app.js hears this and asks the orb for a frame so it is never left frozen.
function uncovered() {
  window.dispatchEvent(new Event("salty-tank-uncovered"));
}

// ---------- scene ----------

// One loaded video per mood. A switch seeks the next loop to the frame that matches her current
// pose (MATCH), starts it, and only once that frame is on screen fades it in ON TOP while the
// current one stays fully solid underneath; then the old one is hidden and paused.
// ☠️ SHE WENT SEE-THROUGH ON EVERY SWITCH (Shaun, 28 Oct). Both layers used to fade at once
// (out .25 s, in .25 s), so halfway through each was ~half opaque and the tank showed through her.
// ☠️ AND THE SWITCH TO TALKING LOOKED GLITCHY (Shaun, same day): every switch re-set the src (a
// reload), always started the talk loop on frame 0 whatever pose she was in (her head jumped,
// two outlines in the fade), and faded on "playing", before the new frame was always painted.
// A switch that is overtaken before it shows is dropped (switchId).
// ☠️ THE SEEK IS ONLY CHEAP IF THE CLIP HAS KEYFRAMES. The cut-outs were encoded with 1 (talk)
// and 4 (idle, 434 frames) keyframes, so a matched seek decoded up to ~4 s of alpha VP9 on a
// phone whose GPU her mind is using: the frozen old loop held 0.5-1.3 s at every switch (take 4,
// freezedetect lined up with her voice). Re-encoded 28 Oct with a keyframe every 6 frames
// (-g 6, same frames and alpha; originals in salty-video/loops).
const FPS = 24;
const FADE_MS = 300;

function seekThen(v, seconds, fn) {
  if (v.readyState < 1) { v.addEventListener("loadedmetadata", () => seekThen(v, seconds, fn), { once: true }); return; }
  if (Math.abs(v.currentTime - seconds) < 0.5 / FPS && v.readyState >= 2) { fn(); return; }
  v.addEventListener("seeked", fn, { once: true });
  v.currentTime = seconds;
}

function setMood(mood) {
  if (!MOODS[mood]) mood = "idle";
  state.mood = mood;
  if (state.target === mood) return;
  state.target = mood;
  // 3D: talking is her idle body with a live mouth (not a separate loop), happy is the
  // happy loop with a laugh face. Moods like think/wave go through playMood directly.
  if (state.salty3d) {
    const d = state.salty3d;
    // A reaction move (outrage, sympathy…) finishes before her body goes back to idle; it does
    // that itself when it ends. Her mouth still follows her voice meanwhile (speech wins on it).
    const toIdle = () => { if (!d.moodPlaying?.()) d.playLoop("idle"); };
    if (mood === "talk") { toIdle(); d.setExpression("neutral"); d.setTalking(true); }
    else if (mood === "happy") { d.setTalking(false); d.playLoop("happy"); d.setExpression("laugh"); }
    else { d.setTalking(false); toIdle(); d.setExpression("neutral"); }
    return;
  }
  const id = ++state.switchId;
  const next = state.videos.find((v) => v.dataset.mood === mood);
  const old = state.front;
  if (next === old) { next.play().catch(() => {}); return; }   // switched back before the fade began
  // ☠️ FREEZE HER FIRST, THEN MATCH. The seek + start + first painted frame of the next loop takes
  // ~0.35 s on the ROG; an idle loop left playing had moved on by then, so the matched pose was
  // stale and the fade showed two sets of eyes (screenrecord, 28 Oct). Held still, the frame she
  // is matched from is the frame she is showing when the next loop fades in over it.
  old?.pause();
  const from = old?.dataset.mood;
  const table = MATCH[`${from}>${mood}`];
  const fromFrame = Math.floor((old?.currentTime || 0) * FPS);
  const start = table ? table[Math.min(Math.max(fromFrame, 0), table.length - 1)] : 0;
  next.classList.remove("on", "top");
  next.pause();
  const show = () => {
    if (!state || id !== state.switchId) return;
    next.classList.add("top", "on"); old?.classList.remove("top"); state.front = next;
    setTimeout(() => {
      if (state && old && state.front !== old) { old.classList.remove("on"); old.pause(); }
    }, FADE_MS + 40);
  };
  seekThen(next, (start + 0.5) / FPS, () => {
    if (!state || id !== state.switchId) return;
    next.play().catch(() => {});
    if (typeof next.requestVideoFrameCallback === "function") next.requestVideoFrameCallback(show);
    else next.addEventListener("playing", show, { once: true });
  });
}

function addBubbles() {
  const { tank } = state;
  for (let i = 0; i < 14; i++) {
    const s = el("div", "st-bubble");
    const size = (tank.clientWidth || 500) * (0.003 + Math.random() * 0.006);
    s.style.cssText = `left:${4 + Math.random() * 92}%;width:${size}px;height:${size}px;` +
      `--h:${(tank.clientHeight || 250) * 0.9}px;--sway:${(Math.random() - .5) * 24}px;` +
      `animation-duration:${5 + Math.random() * 6}s;animation-delay:${-Math.random() * 10}s`;
    tank.insertBefore(s, tank.querySelector(".st-sandfront"));
  }
}

// ☠️ THE WEBVIEW DRAWS UNDER ANDROID'S BACK/HOME BAR. On the ROG (27 Oct) the leg buttons sat half
// under it: this build reports env(safe-area-inset-*) as 0 (Capacitor's safe-area injection fails).
// So: the reported inset when there is one, otherwise the standard 48dp button bar - at the bottom in
// portrait, at the right in landscape (3-button nav moves to the side when the phone turns).
function systemBars() {
  const probe = el("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const px = (v) => parseFloat(v) || 0;
  const bars = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
  probe.remove();
  const portrait = window.innerHeight >= window.innerWidth;
  const native = Boolean(window.Capacitor?.isNativePlatform?.());
  if (native && portrait && !bars.bottom) bars.bottom = 48;
  if (native && !portrait && !bars.right && !bars.left) bars.right = 48;
  root.style.setProperty("--st-bar-b", `${bars.bottom}px`);
  root.style.setProperty("--st-bar-r", `${bars.right}px`);
  root.style.setProperty("--st-bar-l", `${bars.left}px`);
  return bars;
}

// Buttons sit on the table legs. In portrait the legs run off the sides of the screen, so the
// buttons are held inside it (a 16px gutter plus half a button, clear of the system bars), still low on the table.
function placeLegs() {
  if (!state) return;
  const bars = systemBars();
  const r = state.stage.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const size = Math.round(Math.max(58, Math.min(84, Math.min(vw, vh) * 0.15)));
  const pad = 16 + size / 2;
  const y = Math.min(r.top + r.height * LEGS.y, vh - bars.bottom - pad - 8);
  const xs = [];
  for (const [btn, fx] of [[state.mic, LEGS.left], [state.txt, LEGS.right]]) {
    const x = Math.max(bars.left + pad, Math.min(vw - bars.right - pad, r.left + r.width * fx));
    btn.style.setProperty("--size", `${size}px`);
    btn.style.left = `${x}px`; btn.style.top = `${y}px`;
    xs.push(x);
  }
  // The credit line sits level with the buttons, centred in the gap between them.
  const mid = (xs[0] + xs[1]) / 2;
  state.credit.style.left = `${mid}px`; state.credit.style.top = `${y}px`;
  state.credit.style.maxWidth = `${Math.max(120, xs[1] - xs[0] - size - 16)}px`;
  // ☠️ Her neon sign is placed on the room art (stage %), the buttons on the screen: in portrait
  // the stage overhangs the screen unevenly, so the sign sat ~5% left of the buttons' middle
  // (Shaun, 2 Nov). It now takes the same middle, as a stage % so it still rides the stage.
  if (r.width > 0) {
    const pct = `${((mid - r.left) / r.width) * 100}%`;
    state.neon.style.left = pct; state.neonGlow.style.left = pct;
  }
}

// ---------- controls ----------

function wireControls() {
  const onResize = () => requestAnimationFrame(placeLegs);
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  state.stage.addEventListener("transitionend", onResize);
  state.cleanup.push(() => {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onResize);
  });

  // The mic leg is Veridity's own Start Mic; whenever Stop would stop something it is her Stop.
  state.mic.addEventListener("click", () => {
    const shell = document.querySelector(".phone-shell");
    const stop = document.getElementById("homeStopBtn");
    if (saltyLegAction(shell?.classList) === "stop" && stop) stop.click();
    else document.getElementById("micBtn")?.click();
  });
  state.txt.addEventListener("click", () => openTyping(true));
  root.querySelector(".st-close").addEventListener("click", () => openTyping(false));
  state.kb.addEventListener("pointerdown", onKeyDown);
  state.kb.addEventListener("pointerup", onKeyUp);
  state.kb.addEventListener("pointercancel", onKeyUp);
  state.kb.addEventListener("pointerleave", onKeyUp);

  // Long-press the neon sign: put the tank away to reach Veridity's own screens (settings, debug).
  const neon = root.querySelector(".st-neon");
  let press = 0;
  neon.addEventListener("pointerdown", () => { press = setTimeout(hideForNow, 900); });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) neon.addEventListener(ev, () => clearTimeout(press));

  // Nothing to watch while the phone is face down or the app is behind another: stop the clips.
  const onVis = () => {
    if (!state) return;
    state.salty3d?.setPaused(document.hidden);
    if (document.hidden) state.videos.forEach((v) => v.pause());
    else if (!state.salty3d) state.front?.play().catch(() => {});
  };
  document.addEventListener("visibilitychange", onVis);
  state.cleanup.push(() => document.removeEventListener("visibilitychange", onVis));
}

function hideForNow() {
  root.classList.add("st-yield");
  root.dataset.away = "1";
  uncovered();
  const pill = el("button", "st-return", { type: "button" });
  pill.textContent = "🐠 Salty's tank";
  pill.addEventListener("click", () => { pill.remove(); delete root.dataset.away; root.classList.remove("st-yield"); placeLegs(); });
  document.body.append(pill);
}

function openTyping(open) {
  root.classList.toggle("typing", open);
  state.panel.setAttribute("aria-hidden", String(!open));
  if (open) { state.shift = state.typed === ""; renderKeyboard(); }
  setTimeout(placeLegs, 480);
}

// ---------- keyboard ----------

function keyLabel(ch) {
  if (ch === "⇧") return "⇧";
  if (ch === "⌫") return "⌫";
  if (ch === "␣") return "space";
  if (ch === "↵") return "send";
  if (ch === "?") return "?123";
  if (ch === "a" && state.symbols) return "ABC";
  return state.shift && !state.symbols ? ch.toUpperCase() : ch;
}

function renderKeyboard() {
  const rows = state.symbols ? SYMBOLS : LETTERS;
  state.kb.textContent = "";
  rows.forEach((row, r) => {
    const line = el("div", "st-row");
    // "abc" on the symbols page is one key, not three letters.
    const keys = r === 3 && state.symbols ? ["a", ...row.slice(3)] : [...row];
    keys.forEach((ch, c) => {
      const key = el("button", "st-key", { type: "button", "data-k": ch });
      key.style.setProperty("--i", String(c + r * 0.5));
      if ("⇧⌫?a".includes(ch) && (r >= 2)) key.classList.add("wide");
      if (ch === "␣") key.classList.add("space");
      if (ch === "↵") key.classList.add("send");
      if (ch === "⇧" && state.shift) key.classList.add("on");
      key.textContent = keyLabel(ch);
      line.append(key);
    });
    state.kb.append(line);
  });
}

let repeat = 0;
function onKeyDown(event) {
  const key = event.target.closest(".st-key");
  if (!key) return;
  event.preventDefault();
  key.classList.add("down");
  navigator.vibrate?.(6);
  press(key.dataset.k);
  if (key.dataset.k === "⌫") {
    clearTimeout(repeat);
    repeat = setTimeout(function again() { press("⌫"); repeat = setTimeout(again, 60); }, 420);
  }
}
function onKeyUp() {
  clearTimeout(repeat);
  state?.kb.querySelectorAll(".st-key.down").forEach((k) => k.classList.remove("down"));
}

function press(k) {
  if (k === "⇧") { state.shift = !state.shift; renderKeyboard(); return; }
  if (k === "?") { state.symbols = true; renderKeyboard(); return; }
  if (k === "a" && state.symbols) { state.symbols = false; renderKeyboard(); return; }
  if (k === "⌫") { state.typed = state.typed.slice(0, -1); }
  else if (k === "↵") { send(); return; }
  else if (k === "␣") { state.typed += " "; }
  else {
    state.typed += state.shift && !state.symbols ? k.toUpperCase() : k;
    if (state.shift) { state.shift = false; renderKeyboard(); }
  }
  // Capital after a sentence ends, like a phone keyboard.
  const autoCap = state.typed === "" || /[.!?]\s$/.test(state.typed);
  if (!state.symbols && autoCap !== state.shift) { state.shift = autoCap; renderKeyboard(); }
  renderLine();
}

function renderLine() {
  state.line.textContent = "";
  if (state.typed) state.line.append(document.createTextNode(state.typed));
  else {
    const hint = el("span", "st-placeholder");
    hint.textContent = "Say something to Salty...";
    state.line.append(hint);
  }
  state.line.append(el("span", "st-caret"));
}

// Through Veridity's own form: submitTypedMessage keeps its order (crisis net, commands, then the mind).
function send() {
  const text = state.typed.trim();
  const input = document.getElementById("textInput");
  const form = document.getElementById("textForm");
  if (!text || !input || !form) return;
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  form.requestSubmit();
  state.you.textContent = `you: ${text}`;
  state.typed = ""; state.shift = true; state.symbols = false;
  renderKeyboard(); renderLine();
}

// ---------- what she remembers: the shell button and its card ----------

function wireMemory() {
  const btn = root.querySelector(".st-mem"), card = root.querySelector(".st-memcard");
  btn.addEventListener("click", () => { renderMemory(); card.hidden = !card.hidden; });
  root.querySelector(".st-memclose").addEventListener("click", () => { card.hidden = true; });
  // Forgetting takes effect now, in her prompt too (one re-read of it), not next session.
  const forgotten = () => { setSaltyMemory(memoryPromptLine(memory), (words) => recallNoteFor(memory, words)); renderMemory(); };
  root.querySelector(".st-memforget").addEventListener("click", () => {
    memory = forgetSaltyMemory();
    forgotten();
  });
  root.querySelector(".st-memlist").addEventListener("click", (e) => {
    const id = e.target.closest?.("button[data-id]")?.dataset.id;
    if (!id) return;
    memory = forgetSaltyNote(memory, id);
    saveSaltyMemory(memory);
    forgotten();
  });
  renderMemory();
}

function renderMemory() {
  if (!root) return;
  const notes = [
    ...memory.facts.map((f) => ({ id: f.key, text: f.text.replace(/^Their /, "Your ").replace(/^They /, "You ") })),
    ...memory.moments.map((m) => ({ id: m.text, text: `You told her: “${m.text}”` })),
  ];
  root.querySelector(".st-mem-n").textContent = notes.length ? String(notes.length) : "";
  const list = root.querySelector(".st-memlist");
  list.textContent = "";
  if (!notes.length) {
    const li = el("li", "st-memempty"); li.textContent = "Nothing yet. Tell her about your day, your dog, what you love.";
    list.append(li);
  }
  for (const n of notes) {
    const li = el("li");
    const span = el("span"); span.textContent = n.text;
    const x = el("button", "st-memx", { type: "button", "aria-label": "Forget this", "data-id": n.id }); x.textContent = "×";
    li.append(span, x);
    list.append(li);
  }
  root.querySelector(".st-memforget").hidden = !notes.length;
}

// ---------- her state, read from Veridity's screen ----------

function wireAppState() {
  const shell = document.querySelector(".phone-shell");
  const reply = document.getElementById("homeReplyBody");
  const micBtn = document.getElementById("micBtn");
  const log = document.getElementById("log");
  let wasSpeaking = false;
  let pendingMood = null;

  const sync = () => {
    if (!state) return;
    const c = shell?.classList;
    // Her reply is under way (stays on between chunks) vs her voice actually making sound.
    const replying = Boolean(c?.contains("aoede-speaking"));
    const speaking = saltyVoiceSounding();
    const thinking = Boolean(c?.contains("thinking"));
    const turn = Boolean(c?.contains("turn-active"));
    // Wider than the turn (a replay is not one); the leg's label and its click agree.
    const stoppable = saltyLegAction(c) === "stop";
    const listening = Boolean(c?.contains("mic-listening"));
    state.mic.classList.toggle("live", listening || stoppable);
    state.mic.querySelector("span").textContent = stoppable ? "stop" : "mic";
    state.mic.disabled = !stoppable && Boolean(micBtn?.disabled);
    state.txt.classList.toggle("live", root.classList.contains("typing"));
    // 3D: while she thinks, she does her think move once per turn; while listening, a soft smile.
    if (state.salty3d) {
      // ☠️ GPU CONTENTION ATE HER REPLY SPEED (29 Oct, Shaun's turns). Her tank
      // renders WebGL flat-out on the same GPU her mind decodes on and her voice
      // synthesises with: first token ~1.9 s, then up to ~3.8 s more before the
      // first spoken chunk was even cut. While a turn is under way and she is
      // not yet making sound, freeze the canvas — she holds her think/idle pose
      // and the GPU belongs to her mind and voice. Sound starting unfreezes
      // her, so her mouth still animates while she talks.
      // On the NPU lane her mind is off the GPU, and the freeze read as a stall on camera
      // (2 Nov): she keeps moving there, think move and all.
      state.salty3d.setPaused(!mindOnNpu && turn && !speaking);
      // Her reaction to what he just said (salty-moods.mjs): only once a real turn is under way,
      // so a conversation Veridity restores into its log on wake never sets her off.
      const now = performance.now();
      if (pendingMood && (turn || thinking) && now - pendingMood.at < 2500) {
        const secs = state.salty3d.playMood(pendingMood.mood);
        if (secs) state.reactUntil = now + secs * 1000;
        pendingMood = null;
      } else if (pendingMood && now - pendingMood.at >= 2500) pendingMood = null;
      if (thinking && !replying) {
        // The think move waits while a reaction is still playing, so it never cuts one off.
        if (!state.thinkShown && !speaking && now > (state.reactUntil || 0)) { state.thinkShown = true; state.salty3d.playMood("think"); }
      } else if (!thinking) state.thinkShown = false;
      if (listening && !speaking && !replying && !thinking) state.salty3d.setExpression("smile");
    }
    if (speaking) {
      clearTimeout(state.happyTimer);
      setMood("talk");
    } else if (replying) {
      // A real break mid-reply (her voice quiet SALTY_MOUTH_QUIET_MS): back to the idle loop,
      // mouth shut and body still moving, by the same pose-matched solid switch.
      // ☠️ NOT holdMouth: a still body reads as a stalled video. Take 3 still froze her for up
      // to 2.3 s per break; the idle loop while she thinks froze at most 0.45 s (freezedetect).
      if (state.mood === "talk") setMood("idle");
    } else if (wasSpeaking || state.mood === "talk") {
      // Finished the reply: a laugh in it gets a happy wiggle before she settles.
      const last = reply?.textContent || "";
      if (wasSpeaking && /\b(ha(ha)+|heh(eh)*|lol)\b|😂|🤣|😆/i.test(last)) {
        setMood("happy");
        state.happyTimer = setTimeout(() => state && setMood("idle"), 3200);
      } else setMood("idle");
    }
    // Remembered across mid-reply gaps, so the end-of-reply wiggle still knows she spoke.
    if (speaking) wasSpeaking = true;
    else if (!replying) wasSpeaking = false;
    showHer(thinking && !replying);
    showCaptions(thinking && !replying, replying || speaking);
  };

  // Live captions: only for a turn that started while she was up (capTurn), never a reply restored
  // into Veridity's card at boot. Her words follow the reply as it streams; the last ~150 characters
  // show, so a long reply keeps its newest line in view. Fades out 5 s after she finishes.
  let capTurn = false, capBusy = false, capHide = 0;
  const tail = (s, n) => (s.length <= n ? s : `…${s.slice(s.length - n).replace(/^\S*\s/, "")}`);
  const showCaptions = (waiting, talking) => {
    if (!capTurn) return;
    let text = (reply?.textContent || "").trim();
    if (/her reply appears here/i.test(text)) text = "";
    if (waiting || talking) capBusy = true;
    if (waiting) state.capHer.textContent = "…";
    else if (talking && text) state.capHer.textContent = tail(text, 150);
    // Fade only once she has actually thought or spoken: his words land a moment before she starts.
    if (capBusy && !waiting && !talking && !capHide) {
      if (text) state.capHer.textContent = tail(text, 150);
      capHide = setTimeout(() => { capHide = 0; capTurn = false; capBusy = false; if (state) state.caps.hidden = true; }, 5000);
    }
  };
  const captionYou = (words) => {
    clearTimeout(capHide); capHide = 0; capTurn = true; capBusy = false;
    state.capYou.textContent = `You: ${tail(words.trim(), 90)}`;
    state.capHer.textContent = "";
    state.caps.hidden = false;
  };

  const showHer = (waiting) => {
    let text = (reply?.textContent || "").trim();
    // index.html's empty-card hint is Veridity's, not something Salty said.
    if (/her reply appears here/i.test(text)) text = "";
    state.her.textContent = "";
    if (waiting) {
      const b = el("b"); b.textContent = "Salty"; state.her.append(b, " ");
      state.her.append(el("span", "st-dots"));
    } else if (text) {
      const b = el("b"); b.textContent = "Salty"; state.her.append(b, ` ${text}`);
      state.her.scrollTop = state.her.scrollHeight;
    }
  };

  if (shell) {
    const o = new MutationObserver(sync);
    o.observe(shell, { attributes: true, attributeFilter: ["class"] });
    state.observers.push(o);
  }
  if (reply) {
    const o = new MutationObserver(sync);
    o.observe(reply, { childList: true, characterData: true, subtree: true });
    state.observers.push(o);
  }
  // His words land in Veridity's log (typed and spoken alike) as .log-message.user <p>.
  if (log) {
    const o = new MutationObserver((records) => {
      const added = records.flatMap((r) => [...r.addedNodes]).filter((n) => n.classList?.contains("log-message") && n.classList.contains("user"));
      if (added.length !== 1) return; // a batch is a restored conversation, not him talking now
      const words = added[0].querySelector("p")?.textContent || "";
      if (words.trim()) captionYou(words);
      const mood = saltyMoodFor(words);
      // What he tells her now is kept for next time (salty-memory.mjs; rules on his words only).
      const kept = captureFromWords(memory, words, { mood });
      if (kept.added.length) { memory = kept.mem; saveSaltyMemory(memory); renderMemory(); }
      if (mood) { pendingMood = { mood, at: performance.now() }; sync(); }
    });
    o.observe(log, { childList: true });
    state.observers.push(o);
  }
  state.cleanup.push(onSaltyVoiceSounding(sync));
  sync();

  // Veridity's dialogs (mic permission, first run, delivery) must be reachable: the tank steps aside.
  const DIALOGS = '[role="dialog"]:not([hidden]), [aria-modal="true"]:not([hidden]), .first-run-tile:not([hidden])';
  state.timers.push(setInterval(() => {
    if (!root || root.dataset.away) return;
    const open = [...document.querySelectorAll(DIALOGS)].some((d) => !root.contains(d) && d.getClientRects().length > 0);
    if (open !== root.classList.contains("st-yield")) {
      root.classList.toggle("st-yield", open);
      if (open) uncovered();
      else placeLegs();
    }
  }, 500));
}

// A restart opens straight into the tank when Salty was the mind last time.
if (remembered()) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
}
