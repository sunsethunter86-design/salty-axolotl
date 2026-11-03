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
import { loadCare, saveCare, feed, noticed, restFaceOf, moodOf, careNoteFor, shouldGreet, greetingCue, isGreetingCue } from "./salty-care.mjs";
import { createSalty3D } from "./salty-tank-3d.mjs?v=20261103-life2";

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
// Her care loop (salty-care.mjs): hunger and loneliness that grew while the app was closed. How long
// he'd been away is taken once, now, so his first message of the session carries it.
let care = loadCare();
const sessionGapMs = Date.now() - care.lastSeenAt;
// The "you've been gone" note goes on whatever he says in the first 25 s after he's back: a spoken
// turn's early prefill sees part of his sentence before the final words land, and both must carry it.
let firstActivityAt = 0, hungerToldAt = 0, fedToldAt = 0;
// She speaks first (greet()): the gap her greeting is about, and whether it has been said.
let greetGapMs = null, gapSpent = false;
const GREET_AT_KEY = "vfl.saltyGreetAt";
// One care note per message: computed the first time a request carries that message, then reused for
// every request of the turn (early prefill, final prompt), so her prompt for a turn never shifts.
let careNoteCache = { words: null, note: null };
// ☠️ HER BOOT PREWARM SPENT HER FEELINGS ON AN OLD MESSAGE (2 Nov, phone). At start-up the engine is
// prewarmed with the conversation from before the restart, whose newest user message passed through
// here, used up the "you've been gone" window and the hunger ration, and her real first turn got no
// note at all. Only a live turn gets one: Veridity's own turn state, an open mic, or his words just landed.
let lastWordsAt = -Infinity;
const liveTurn = () => {
  const L = globalThis.__vflLocal;
  if (L && (L.turnPending === true || L.thinking === true)) return true;
  if (document.querySelector(".phone-shell")?.classList.contains("mic-listening")) return true;
  return performance.now() - lastWordsAt < 10e3;
};
function careNote(words) {
  if (careNoteCache.words === words) return careNoteCache.note;
  if (!liveTurn()) return null;
  const now = Date.now();
  if (!firstActivityAt) firstActivityAt = now;
  const back = now - firstActivityAt < 25e3;
  const sinceFed = now - care.lastFedAt;
  const justFed = sinceFed < 3 * 60e3 && fedToldAt < care.lastFedAt;
  // Hunger at most every 20 minutes, or she'd talk about nothing else.
  const mentionHunger = now - hungerToldAt > 20 * 60e3;
  // Her greeting carries how long he was away (its own gap: a warm return has no session gap); once she
  // has said it, his reply doesn't get it again, or she'd sulk twice.
  const greeting = isGreetingCue(words);
  const gapMs = greeting ? (greetGapMs ?? 0) : (back && !gapSpent ? sessionGapMs : 0);
  if (greeting) gapSpent = true;
  const note = careNoteFor(care, { now, gapMs, justFedMs: justFed ? sinceFed : Infinity, mentionHunger });
  if (note && /starving|peckish/.test(note)) hungerToldAt = now;
  if (justFed) fedToldAt = care.lastFedAt;
  careNoteCache = { words, note };
  // For checking on the phone what her last turn was told (read-only; nothing reads it back).
  globalThis.__saltyLastCareNote = { words, note, at: now };
  return note;
}
const turnNotes = (words) => [recallNoteFor(memory, words), careNote(words)].filter(Boolean).join(" ") || null;
setSaltyMemory(memoryPromptLine(memory), turnNotes);

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
    css = el("link", "", { rel: "stylesheet", href: `${BASE}salty-tank.css?v=20261103-life2`, "data-salty-tank": "" });
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
  // The buttons are placed from the stage's size, which only exists once the sheet has landed: place them again then.
  const ready = () => requestAnimationFrame(() => requestAnimationFrame(() => { root?.classList.remove("st-css-pending"); placeLegs(); }));
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
      <img class="st-room" src="${BASE}room_soft.png" alt="">
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
    <button class="st-feed" type="button" aria-label="Feed Salty some bloodworms">🪱</button>
    <div class="st-toast" aria-live="polite" hidden></div>
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
  wireCare();
  placeLegs();
  // Cold start after a while away: once her mind is awake she says hello first (greetSoon).
  greetSoon(sessionGapMs);
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
        attention();
        mine.tapAlt = !mine.tapAlt;
        mine.salty3d?.playMood(mine.tapAlt ? "wave" : "wink");
      },
      // Her swims round the tank (salty-life.mjs): the tank pulls back to show all of it.
      onWide: (on, quick) => { if (state === mine) setWide(on, quick); },
      getView: () => tankView(),
    });
    if (!state || state !== mine) { api.dispose(); return; }
    mine.salty3d = api;
    mine.tank.classList.add("st-3d-on");
    for (const v of mine.videos) v.pause();
    // Re-apply whatever she was doing when the model finished loading.
    const mood = mine.mood;
    mine.mood = ""; mine.target = "";
    setMood(mood);
    applyRestFace();
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
    else { d.setTalking(false); toIdle(); d.setExpression("rest"); }
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

// ---------- her swims: the tank pulls back to show all of it ----------
//
// In portrait the close-up crops the tank to its middle half, and her laps (salty-life.mjs) go end to end.
// While she's out the stage scales about the tank's centre (salty-tank.css .st-wide) until the whole tank
// fits the screen, and comes back in as she heads home: quick when he interrupts her. Landscape already
// shows the whole tank, so nothing moves there. The buttons stay put meanwhile (placeLegs skips).
function setWide(on, quick = false) {
  if (!state || on === root.classList.contains("st-wide")) return;
  if (on) {
    const r = state.tank.getBoundingClientRect();
    const s = Math.min(1, (window.innerWidth - 24) / r.width, (window.innerHeight * 0.7) / r.height);
    if (!(s < 0.97)) return;
    root.style.setProperty("--st-wide", s.toFixed(3));
  }
  root.style.setProperty("--st-zoom-t", quick ? ".8s" : "2.2s");
  root.style.setProperty("--st-zoom-ease", "cubic-bezier(.45, 0, .25, 1)");
  root.classList.toggle("st-wide", on);
}

// How much of her tank the close-up shows, as half-extents (1 = all of it): the 3D layer keeps her resting
// spot and her worms inside it. From the tank's layout size, which no zoom changes (the tank is centred).
function tankView() {
  const t = state?.tank;
  if (!t?.offsetWidth || !t.offsetHeight) return { x: 1, y: 1 };
  return { x: Math.min(1, window.innerWidth / t.offsetWidth), y: Math.min(1, window.innerHeight / t.offsetHeight) };
}

// Buttons sit on the table legs. In portrait the legs run off the sides of the screen, so the
// buttons are held inside it (a 16px gutter plus half a button, clear of the system bars), still low on the table.
function placeLegs() {
  if (!state || root.classList.contains("st-wide")) return;
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
    // Back after a while with the app still running: she may greet him (warm return).
    if (!document.hidden) greetSoon(Date.now() - care.lastSeenAt);
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
  // Typing to her is time with her: she comes home, and the panel slides at its own quick pace.
  if (open) { root.style.removeProperty("--st-zoom-t"); root.style.removeProperty("--st-zoom-ease"); root.classList.remove("st-wide"); }
  root.classList.toggle("typing", open);
  state.salty3d?.setBusy(open || state.busy);
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
  lastWordsAt = performance.now(); // before the submit: her first request for this turn may go out inside it
  form.requestSubmit();
  state.you.textContent = `you: ${text}`;
  state.typed = ""; state.shift = true; state.symbols = false;
  renderKeyboard(); renderLine();
}

// ---------- she speaks first ----------
//
// When he comes back after a while she greets him before he says a word. The tank sends a stage cue
// (salty-care.mjs greetingCue) through the same form his typed words use, so her engine treats it as
// an ordinary turn (no side door to her mind); her care note says how long he was gone and how she
// feels, and her memory may give her something to ask about. The cue never shows as his words, never
// becomes a memory or a mood, and is not him paying her attention.

let greetTimer = 0;
const mindIdle = () => {
  const L = globalThis.__vflLocal;
  if (!L || L.mindAwake !== true) return false;
  if (L.turnPending === true || L.thinking === true || L.speaking === true) return false;
  return !document.querySelector(".phone-shell")?.classList.contains("mic-listening");
};
const lastGreetAt = () => { try { return Number(localStorage.getItem(GREET_AT_KEY)) || 0; } catch { return 0; } };
// Test hook (phone checks over adb/CDP): pretend he last paid her attention `hours` ago, so a warm
// return can be checked without waiting hours. Only touches her own care record on this phone.
globalThis.__saltyCareTest = {
  backdate(hours) { care = { ...care, lastSeenAt: Date.now() - hours * 3600e3 }; saveCare(care); applyRestFace(); return care.lastSeenAt; },
  // Retakes of feeding her: forget this hour's feeds, so she isn't "stuffed", and/or pretend she was last fed
  // `hours` ago, so she's hungry again (10 h+ is starving).
  unstuff() { care = { ...care, feeds: [] }; saveCare(care); return true; },
  starve(hours) { care = { ...care, lastFedAt: Date.now() - hours * 3600e3, feeds: [] }; saveCare(care); applyRestFace(); return care.lastFedAt; },
};
// Her life in the tank on demand (salty-life.mjs), for phone checks and video retakes over CDP:
// swim() a lap of the tank, quirk("yawn"|"bubble"|"peek"|...) one of her quirks, calm(secs) no swims for a
// while (a close-up take), state() what she's up to.
globalThis.__saltyTankTest = {
  swim: () => Boolean(state?.salty3d?.swimNow()),
  quirk: (name) => Boolean(state?.salty3d?.quirkNow(name)),
  calm: (secs = 120) => Boolean(state?.salty3d?.calm(secs)),
  quirks: () => state?.salty3d?.quirkNames() || [],
  state: () => state?.salty3d?.lifeState() || null,
};

/** Greets him once her mind is ready, if he has been gone long enough; gives up after `waitMs`. */
function greetSoon(gapMs, waitMs = 4 * 60e3) {
  clearTimeout(greetTimer);
  if (!shouldGreet({ gapMs, lastGreetAt: lastGreetAt() })) return;
  const since = Date.now(), seenAt = care.lastSeenAt;
  const tryNow = () => {
    greetTimer = 0;
    // He spoke, typed or tapped first, or she's away for a dialog: he's started without her.
    if (!state || !root || root.dataset.away || root.classList.contains("st-yield") || root.classList.contains("typing")) return;
    if (care.lastSeenAt !== seenAt || document.hidden) return;
    if (!mindIdle()) { if (Date.now() - since < waitMs) greetTimer = setTimeout(tryNow, 2000); return; }
    greet(gapMs);
  };
  greetTimer = setTimeout(tryNow, 1500);
}

function greet(gapMs) {
  const input = document.getElementById("textInput");
  const form = document.getElementById("textForm");
  if (!input || !form) return;
  try { localStorage.setItem(GREET_AT_KEY, String(Date.now())); } catch { /* she may greet again next time */ }
  greetGapMs = gapMs;
  input.value = greetingCue({ remembersSomething: memory.facts.length > 0 || memory.moments.length > 0 });
  input.dispatchEvent(new Event("input", { bubbles: true }));
  lastWordsAt = performance.now();
  form.requestSubmit();
}

// ---------- her care loop: feeding, attention, her resting face ----------

/** He talked to her, tapped her or fed her: she's not lonely any more. */
function attention() {
  if (!firstActivityAt) firstActivityAt = Date.now();
  care = noticed(care);
  saveCare(care);
  applyRestFace();
}

/** Her resting face and the 🪱 button follow how she feels (checked every minute, and on any change). */
function applyRestFace() {
  if (!state) return;
  state.salty3d?.setRestExpression?.(restFaceOf(care));
  root.querySelector(".st-feed")?.classList.toggle("hungry", moodOf(care).hunger !== "full");
}

function wireCare() {
  root.querySelector(".st-feed").addEventListener("click", () => {
    const r = feed(care);
    care = r.care;
    saveCare(care);
    if (r.result === "stuffed") { toast("She's stuffed. Maybe later."); state.salty3d?.quirkNow("full"); applyRestFace(); return; }
    // 3D (3 Nov): real worms sink in front of her and she snaps them up one by one (salty-life.mjs).
    // Video fallback: emoji worms drift to her mouth and she lunges (the celebrate move).
    if (!state.salty3d?.feed(6)) {
      dropWorms();
      setTimeout(() => { if (state && state.mood !== "talk") state.salty3d?.playMood("celebrate"); }, 1500);
    }
    applyRestFace();
  });
  state.timers.push(setInterval(applyRestFace, 60e3));
  applyRestFace();
}

// Bloodworms drift down from the surface to about her mouth, sway a little, and are gone.
function dropWorms() {
  const tank = state?.tank;
  if (!tank) return;
  // ☠️ The fall was sized to the worm (a % of its own height): they stopped a third of the way down,
  // nowhere near her (2 Nov, phone). It's sized to the tank now: to about her mouth.
  const fall = `${Math.round(tank.clientHeight * 0.46)}px`;
  for (let i = 0; i < 7; i++) {
    const w = el("span", "st-worm");
    w.textContent = "🪱";
    w.style.setProperty("--fall", fall);
    w.style.setProperty("--x", `${38 + Math.random() * 24}%`);
    w.style.setProperty("--sway", `${(Math.random() - 0.5) * 30}px`);
    w.style.setProperty("--spin", `${(Math.random() - 0.5) * 120}deg`);
    w.style.animationDelay = `${i * 110}ms`;
    w.addEventListener("animationend", () => w.remove(), { once: true });
    tank.append(w);
  }
}

let toastTimer = 0;
function toast(text) {
  const t = root?.querySelector(".st-toast");
  if (!t) return;
  t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------- what she remembers: the shell button and its card ----------

function wireMemory() {
  const btn = root.querySelector(".st-mem"), card = root.querySelector(".st-memcard");
  btn.addEventListener("click", () => { renderMemory(); card.hidden = !card.hidden; });
  root.querySelector(".st-memclose").addEventListener("click", () => { card.hidden = true; });
  // Forgetting takes effect now, in her prompt too (one re-read of it), not next session.
  const forgotten = () => { setSaltyMemory(memoryPromptLine(memory), turnNotes); renderMemory(); };
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
      // He's with her (a turn under way, her reply, typing): no swims or quirks, she comes home and
      // faces him (salty-life.mjs).
      // ☠️ NOT AN OPEN MIC (3 Nov, phone): Veridity's live mic can sit listening for ages, and counting it
      // froze her life, stuck mid-meal with no worms left. She smiles while it listens; his words landing
      // start a turn, and that brings her home.
      state.busy = thinking || turn || replying || speaking;
      state.salty3d.setBusy(state.busy || root.classList.contains("typing"));
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
    state.capYou.textContent = words ? `You: ${tail(words.trim(), 90)}` : "";
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
      // Her own greeting cue (she speaks first): her words get captions, nothing else happens.
      if (isGreetingCue(words)) { lastWordsAt = performance.now(); captionYou(""); return; }
      if (words.trim()) { lastWordsAt = performance.now(); captionYou(words); attention(); clearTimeout(greetTimer); }
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
