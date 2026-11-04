// MUSEick — Salty's studio: the room, the four-track timeline, and Salty directing.
//
// Opened from the tank (salty-tank.mjs) with a small host object; it never reaches into
// app.js. How Salty takes part, honestly:
//
//   * His words (typed here, or spoken while the studio is open) are read by rules
//     (museick-plan.mjs). A brief composes a new song at once, and the old one goes on his shelf first;
//     a revision changes the song at once; "undo", "the other way", "do that again" and "play it" do
//     what they say. Words that are unclear change nothing: she asks, and a short "yes" takes her up
//     on what's offered, for his very next words only.
//   * The same words then go to Salty as an ordinary turn, through Veridity's own form (crisis
//     net first), with a short studio note saying what the studio did, or that it did nothing
//     (host.setNote, the same mechanism as her care and memory notes). Her trained prompt is untouched.
//   * For a new song her reply is read too: a name in quotes becomes the title, and a push she
//     asks for ("make the chorus bigger") is applied as hers. The log marks every decision with
//     who made it: you (rules on your words), Salty (rules on her words), or the studio.
//   * If her mind is asleep or silent, the studio's own draft stands and the log says so.

import { compose, recompose, compile, validateSong, DRUM_LANES, CLIP_LEN } from "./museick-compose.mjs";
import { planFromBrief, parseRevision, applyOps, isNewBrief, readIntent, opLabel, titleFromReply, opsFromReply, engineTitle, studioNoteFor,
  planSummary, ideasFor, OPPOSITE, SOUNDS, TRACKS, GENRES, validatePlan } from "./museick-plan.mjs";
import { keyName, seedOf } from "./museick-theory.mjs";
import { createMuseickAudio, renderOffline, wavBytes } from "./museick-audio.mjs";
import { onSaltyVoiceSounding, saltyVoiceSounding } from "../salty-mind.mjs";

const CSS_HREF = "./museick/museick.css?v=20261103-1";
const CURRENT_KEY = "vfl.museick.current";
const PROJECTS_KEY = "vfl.museick.projects";
const MAX_PROJECTS = 12;
const OFFER_MS = 3 * 60e3; // how long a spoken "yes" can still take up an offer
const PUT_TO_HIM = /\b(want|wanna|shall i|should i|fancy|how about|try|like me to|let me)\b[^.!?]*\?\s*$/i; // her last sentence offers something
const ECHO_MS = 10e3; // how long a typed message waits for the app to add it to the log

// Line icons, drawn here so nothing depends on how a phone's emoji happen to look.
const svg = (d) => `<svg class="ms-i" viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;
const ICON = {
  back: svg('<path d="M10 3 5 8l5 5"/>'),
  undo: svg('<path d="M5.5 2.5 2.5 5.5l3 3"/><path d="M2.5 5.5H10a3.5 3.5 0 0 1 0 7H6.5"/>'),
  songs: svg('<path d="M2.5 4h11M2.5 8h11M2.5 12h7"/>'),
  stop: svg('<rect class="f" x="3.8" y="3.8" width="8.4" height="8.4" rx="1"/>'),
  play: svg('<path class="f" d="M4.8 2.9v10.2c0 .4.4.6.7.4l8-5.1c.3-.2.3-.6 0-.8l-8-5.1c-.3-.2-.7 0-.7.4z"/>'),
  pause: svg('<rect class="f" x="3.8" y="3" width="3" height="10" rx=".7"/><rect class="f" x="9.2" y="3" width="3" height="10" rx=".7"/>'),
  loop: svg('<path d="M11.2 1.8 13.5 4l-2.3 2.2"/><path d="M13.5 4H5.2A2.7 2.7 0 0 0 2.5 6.7v.8"/><path d="M4.8 14.2 2.5 12l2.3-2.2"/><path d="M2.5 12h8.3a2.7 2.7 0 0 0 2.7-2.7v-.8"/>'),
  minus: svg('<path d="M3.5 8h9"/>'),
  plus: svg('<path d="M3.5 8h9M8 3.5v9"/>'),
  vary: svg('<path d="M1.8 11.5h1.9c1 0 1.9-.5 2.4-1.3l2.6-4.4c.5-.8 1.4-1.3 2.4-1.3h3"/><path d="M12.2 2.6 14.1 4.5l-1.9 1.9"/><path d="M1.8 4.5h1.9c.9 0 1.7.4 2.2 1.1M8.9 10.4c.5.7 1.3 1.1 2.2 1.1h3"/><path d="M12.2 9.6l1.9 1.9-1.9 1.9"/>'),
  mic: svg('<rect x="5.5" y="1.6" width="5" height="8.2" rx="2.5"/><path d="M3 7.6a5 5 0 0 0 10 0M8 12.6v1.9"/>'),
  send: svg('<path d="M8 13V3.4M3.7 7.6 8 3.2l4.3 4.4"/>'),
  close: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
};
const TRACK_UI = {
  drums: { icon: svg('<ellipse cx="8" cy="5" rx="5.8" ry="2.4"/><path d="M2.2 5v5.8c0 1.3 2.6 2.4 5.8 2.4s5.8-1.1 5.8-2.4V5"/>'), name: "Drums", color: "#e8836f" },
  bass: { icon: svg('<path d="M1.5 8c1.1-3.6 2.2-5.4 3.3-5.4S7 8 8 8s2.1 5.4 3.2 5.4S13.4 11.6 14.5 8"/>'), name: "Bass", color: "#a893e0" },
  chords: { icon: svg('<rect x="2" y="2.8" width="12" height="10.4" rx="1.2"/><path d="M6 2.8v6.4M10 2.8v6.4M6 9.2v4M10 9.2v4"/>'), name: "Chords", color: "#57c2ae" },
  lead: { icon: svg('<path d="M6 12.4V3.6l7-1.4v8.6"/><circle cx="4.2" cy="12.4" r="1.8"/><circle cx="11.2" cy="10.8" r="1.8"/>'), name: "Lead", color: "#6bb3ea" },
};
const SECTION_COLOR = { intro: "#2b5f8a", groove: "#1f8a86", build: "#7a4fc7", drop: "#e0567a", outro: "#3b4f7a" };
const CHIPS = [
  ["Heavier drums", "Make the drums heavier"],
  ["Stronger hook", "Give it a stronger hook"],
  ["More tension", "Build more tension before the drop"],
  ["Bass movement", "Give the bass more movement"],
  ["Bigger chorus", "Make the chorus more powerful"],
  ["Less busy", "Less busy"],
  ["Darker melody", "Make the melody darker"],
  ["Dramatic ending", "Make the ending more dramatic"],
  ["Surprise me", "Surprise me"],
  ["More groove", "Give the bass more groove"],
  ["Slow it down", "Slow it down"],
  ["Dreamier", "Make it dreamier"],
];
const STARTERS = [
  "Make me a dark electronic rock track with massive drums, dirty bass and an enormous melodic chorus.",
  "A dreamy underwater synthwave song.",
  "Chill lo-fi beat for studying, in D minor.",
];

const norm = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function loadJson(key, dflt) { try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v ?? dflt; } catch { return dflt; } }
function saveJson(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } }

/**
 * Opens the studio inside the tank's root. Returns { close }.
 * host: { root, tank, salty3d(), send(text), setNote(fn|null), onWords(fn|null), mic(), close() }
 */
export function openMuseick(host) {
  if (!document.querySelector("link[data-museick]")) {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = CSS_HREF; l.dataset.museick = "";
    document.head.append(l);
  }
  const audio = createMuseickAudio({ onEnded: () => render.transport() });
  const S = {
    song: null, compiled: null, title: "", history: [], log: [], projectId: null,
    turn: null, pending: null, offered: [], saltyPicks: [], idea: null, offer: null, lastOps: null, turns: 0, wasPlayingBeforeMic: false, editing: null,
    raf: 0, timers: [], cleanup: [], lastSection: "", closed: false,
  };

  // ---------- DOM ----------
  const room = document.createElement("div");
  room.className = "ms-room";
  room.setAttribute("role", "application");
  room.setAttribute("aria-label", "MUSEick, Salty's music studio");
  room.innerHTML = `
    <header class="ms-top">
      <button class="ms-btn ms-back" type="button" aria-label="Back to Salty's tank">${ICON.back}Tank</button>
      <div class="ms-logo" aria-hidden="true"><span>MUSEick</span></div>
      <div class="ms-topr">
        <button class="ms-btn ms-undo" type="button" aria-label="Undo" disabled>${ICON.undo}</button>
        <button class="ms-btn ms-projects" type="button" aria-label="Songs">${ICON.songs}</button>
      </div>
    </header>
    <section class="ms-hero" aria-label="Studio">
      <div class="ms-booth"><div class="ms-booth-glass"></div><div class="ms-booth-label">SALTY · DIRECTOR</div></div>
      <div class="ms-bubble" hidden><b>Salty</b> <span class="ms-bubble-text"></span></div>
      <div class="ms-status" hidden></div>
      <div class="ms-desk" aria-hidden="true">
        <div class="ms-strips">${TRACKS.map((t) => `<div class="ms-strip" data-t="${t}"><em></em><s><i></i></s></div>`).join("")}</div>
        <div class="ms-viz">${"<i></i>".repeat(24)}</div>
      </div>
    </section>
    <section class="ms-song">
      <div class="ms-title-row"><div class="ms-title">No song yet</div><div class="ms-meta"></div></div>
      <div class="ms-transport">
        <div class="ms-tbtns"><button class="ms-btn ms-stop" type="button" aria-label="Stop">${ICON.stop}</button>
        <button class="ms-btn ms-play" type="button" aria-label="Play">${ICON.play}</button>
        <button class="ms-btn ms-loop on" type="button" aria-label="Loop" aria-pressed="true">${ICON.loop}</button></div>
        <div class="ms-bpm"><button class="ms-btn ms-bpm-dn" type="button" aria-label="Slower">${ICON.minus}</button>
          <span class="ms-bpm-v">120</span><small>BPM</small>
          <button class="ms-btn ms-bpm-up" type="button" aria-label="Faster">${ICON.plus}</button></div>
        <div class="ms-time">0:00 / 0:00</div>
      </div>
    </section>
    <section class="ms-timeline" aria-label="Tracks">
      <div class="ms-ribbon"></div>
      <div class="ms-lanes">${TRACKS.map((t) => `
        <div class="ms-track" data-t="${t}" style="--tc:${TRACK_UI[t].color}">
          <div class="ms-thead">
            <span class="ms-ticon">${TRACK_UI[t].icon}</span>
            <span class="ms-tname">${TRACK_UI[t].name}</span>
            <button class="ms-sound" type="button" aria-label="Change ${TRACK_UI[t].name} sound"></button>
            <span class="ms-tctl">
              <button class="ms-btn ms-m" type="button" aria-label="Mute ${TRACK_UI[t].name}" aria-pressed="false">M</button>
              <button class="ms-btn ms-s" type="button" aria-label="Solo ${TRACK_UI[t].name}" aria-pressed="false">S</button>
              <button class="ms-btn ms-vary" type="button" aria-label="New ${TRACK_UI[t].name} pattern">${ICON.vary}</button>
              <input class="ms-vol" type="range" min="0" max="100" value="80" aria-label="${TRACK_UI[t].name} volume">
            </span>
          </div>
          <div class="ms-lane"></div>
        </div>`).join("")}
        <div class="ms-playhead"></div>
      </div>
      <div class="ms-empty">
        <p>Tell Salty what to make. She'll direct; the studio composes four tracks you can play and change.</p>
        <div class="ms-starters">${STARTERS.map((s) => `<button class="ms-chip ms-starter" type="button">${esc(s)}</button>`).join("")}</div>
        <button class="ms-chip ms-demo" type="button">${ICON.play}Hear the demo song</button>
      </div>
    </section>
    <section class="ms-direct">
      <button class="ms-chip ms-idea" type="button" hidden></button>
      <div class="ms-chips">${CHIPS.map(([l, p]) => `<button class="ms-chip" type="button" data-say="${esc(p)}">${esc(l)}</button>`).join("")}</div>
      <form class="ms-form" autocomplete="off">
        <button class="ms-btn ms-mic" type="button" aria-label="Talk to Salty">${ICON.mic}</button>
        <input class="ms-input" type="text" enterkeyhint="send" placeholder="Tell Salty what to make…" aria-label="Tell Salty what to make" maxlength="240">
        <button class="ms-btn ms-send" type="submit" aria-label="Send to Salty">${ICON.send}</button>
      </form>
      <details class="ms-logbox"><summary>Director's log</summary><ol class="ms-log"></ol></details>
    </section>
    <div class="ms-sheet" hidden role="dialog" aria-label="Edit clip">
      <div class="ms-sheet-head"><b class="ms-sheet-title"></b><button class="ms-btn ms-sheet-close" type="button" aria-label="Close">${ICON.close}</button></div>
      <div class="ms-grid-wrap"><div class="ms-grid"></div></div>
      <div class="ms-sheet-foot">
        <button class="ms-chip ms-ed-listen" type="button">${ICON.play}From here</button>
        <button class="ms-chip ms-ed-vary" type="button">${ICON.vary}Vary</button>
        <button class="ms-chip ms-ed-clear" type="button">Clear</button>
        <button class="ms-chip ms-ed-done" type="button">Done</button>
      </div>
    </div>
    <div class="ms-sheet ms-songs" hidden role="dialog" aria-label="Songs">
      <div class="ms-sheet-head"><b>Your songs</b><button class="ms-btn ms-songs-close" type="button" aria-label="Close">${ICON.close}</button></div>
      <div class="ms-songs-actions">
        <button class="ms-chip ms-save" type="button">Save this song</button>
        <button class="ms-chip ms-new" type="button">New song</button>
        <button class="ms-chip ms-export" type="button">Export WAV</button>
      </div>
      <ul class="ms-songlist"></ul>
      <p class="ms-note">Songs are kept only on this phone.</p>
    </div>
    <div class="ms-toast" hidden aria-live="polite"></div>`;
  host.root.append(room);
  const q = (s) => room.querySelector(s);
  const qa = (s) => [...room.querySelectorAll(s)];

  // Salty comes into the studio: her tank (3D or video) moves into the booth window.
  const tankHome = { parent: host.tank.parentNode, next: host.tank.nextSibling };
  q(".ms-booth-glass").append(host.tank);
  host.root.classList.add("st-studio");

  // ---------- state changes ----------

  function pushHistory() {
    if (!S.song) return;
    S.history.push({ song: structuredClone(S.song), title: S.title, projectId: S.projectId });
    if (S.history.length > 30) S.history.shift();
    q(".ms-undo").disabled = false;
  }

  /** The one way a song reaches the speakers: validated, compiled, hot-loaded. */
  function setSong(song, { keepHistory = false } = {}) {
    const errs = validateSong(song);
    if (errs.length) {
      console.warn("MUSEick: song failed validation; not played", errs);
      logLine("studio", "Couldn't use that change (it failed the song check)", errs.slice(0, 3).join("; "));
      return false;
    }
    if (!keepHistory) pushHistory();
    const before = S.compiled;
    S.song = song;
    S.lastOps = null; // what "do that again" and "the other way" mean: applyChange sets it after this
    S.compiled = compile(song);
    audio.load(song, S.compiled);
    render.all();
    markChanged(before, S.compiled);
    saveCurrent();
    return true;
  }

  // Every clip whose notes changed glows for a moment: a revision you can see, not just hear.
  function markChanged(a, b) {
    S.lastChanged = 0;
    if (!a || !b) return;
    const sig = (c, tr, id) => {
      const sec = c.sections.find((x) => x.id === id);
      if (!sec) return "";
      const lo = sec.start, hi = sec.start + sec.bars * 16;
      return c.events.filter((e) => e.tr === tr && e.step >= lo && e.step < hi)
        .map((e) => [e.step - lo, e.kind || "", e.midi ?? "", e.midis || "", e.dur ?? "", e.harm ?? "", e.counter ? 1 : ""].join(":")).join("|") + "#" + sec.bars;
    };
    let n = 0;
    for (const tr of TRACKS) {
      const boxes = room.querySelectorAll(`.ms-track[data-t="${tr}"] .ms-clip`);
      b.sections.forEach((sec, i) => {
        if (sig(a, tr, sec.id) === sig(b, tr, sec.id) && a.stepSec === b.stepSec) return;
        boxes[i]?.classList.add("ms-changed"); n++;
      });
    }
    S.lastChanged = n;
  }

  function changePlan(mutate, regen = []) {
    if (!S.song) return;
    const plan = structuredClone(S.song.plan);
    mutate(plan);
    const fixed = validatePlan(plan).plan;
    const next = regen.length ? recompose(S.song, fixed, regen) : { ...S.song, plan: fixed };
    setSong(next);
  }

  // ---------- Salty directing ----------

  /** His words -> what the studio does with them. Call once per message. Returns the note for her, or null. */
  function interpret(words) {
    if (!norm(words)) return null;
    const read = readIntent(words, { hasSong: Boolean(S.song) });
    // What's on offer waits for his very next words and no longer: a "yes" after talking about the weather isn't for it.
    const offer = S.offer && performance.now() - S.offer.at < OFFER_MS ? S.offer.idea : null;
    S.offer = null;
    if (S.idea?.brief && !(read.answer === "yes" || read.answer === "new")) setIdea(null); // "a new one, or this one?" is answered now or not at all
    let note = null;
    const named = offer?.menu && !read.ops.length && !["new", "question"].includes(read.intent) ? namedFrom(words, offer.menu) : [];
    if (offer?.several && read.answer === "yes") {
      // "A or B?" "Yes." Nothing's guessed: she asks which, and the offer stands for his next words.
      S.offer = { idea: offer, at: performance.now(), asked: true };
      note = studioNoteFor("which");
    } else if (offer && (read.answer === "yes" || (read.answer === "new" && offer.brief))) {
      note = acceptIdea(offer);
    } else if (named.length === 1) {
      setIdea(null);
      note = applyChange(named, offer.studio ? "you" : "salty", words, "you picked it from what was on offer") || studioNoteFor("still", S.song.plan);
    } else if (offer && (read.answer === "no" || read.answer === "this")) {
      setIdea(null);
      logLine("you", `said no to ${offer.label}`, "nothing changed");
      note = studioNoteFor("declined");
    } else if (read.answer === "no" && S.idea?.studio) {
      setIdea(null); // she never put it to him, but he's said no to something: the button doesn't hang about
    } else if (read.intent === "new") {
      note = startSong(words);
    } else if (["undo", "reverse", "repeat", "transport"].includes(read.intent)) {
      // With no song, "play it" and "undo that" have to be answered. "Again" and "stop it" are just talk.
      note = S.song ? control(read, words) : read.intent === "undo" || ["play", "restart"].includes(read.control) ? studioNoteFor("control", null, [], { what: "nosong" }) : null;
    } else if (!S.song && read.ops.length) {
      note = studioNoteFor("control", null, [], { what: "nosong" }); // "heavier drums" with no song: she mustn't say it's done
    } else if (S.song && read.ops.length) {
      if (S.idea?.studio) setIdea(null);
      if (read.undoFirst) undoLast();
      note = applyChange(read.ops, "you", words, read.intent === "feedback" ? `you said ${read.about}` : "");
      if (note && read.control) playback(read.control);
    } else if (S.song && ["feedback", "clarify", "ambiguous"].includes(read.intent)) {
      note = askFirst(read, words);
    }
    if (note) {
      if (!S.pending && !read.control && !["undo", "transport"].includes(read.intent) && read.answer !== "no") startPending("rev");
      return note;
    }
    // No change, so she has to know that, or she tells him things happened that didn't. Her trained
    // replies say "done!" readily: a question about his track, or a "yes" to something nobody offered.
    const asking = /\?\s*$/.test(words) || (read.intent === "question" && !/^\s*(don'?t|doesn'?t|won'?t|can'?t|isn'?t|never)\b/i.test(words));
    return S.song && (read.mentions || read.answer === "yes" || read.ops.length) ? studioNoteFor("still", S.song.plan, [], { intent: asking ? "question" : "" }) : null;
  }

  // "A breakdown or a countermelody?" "The breakdown." With something on offer, a few words naming it are an answer.
  function namedFrom(words, menu) {
    const t = norm(words).replace(/[.!?,]+/g, " ").replace(/\s+/g, " ").trim();
    const nth = t.match(/^(?:(?:yes|yeah|yep|ok|okay|sure) )?(?:the )?(first|second|last)(?: one)?$/);
    if (nth) return menu.length > 1 ? [{ op: nth[1] === "first" ? menu[0] : menu[1], arg: true }] : [];
    if (t.split(" ").length > 5 || !/^(?:(?:yes|yeah|yep|ok|okay|sure|maybe) )?(?:let's (?:try|have|do) |try |go with |i'll take |give me )?(?:the|a|an|that|some|more)\b/.test(t)) return [];
    return parseRevision(t, { raw: true }).filter((o) => menu.includes(o.op));
  }

  /** A new song. Nothing he made goes because of one: it goes on his shelf first, and Undo still brings it back. */
  function startSong(words) {
    const seed = seedOf(words, Date.now());
    const { plan, decisions } = planFromBrief(words, seed);
    const song = compose(plan);
    const old = S.song ? { title: S.title, projectId: S.projectId } : null;
    const kept = old ? shelve(true) : null;
    if (old) pushHistory();
    audio.stop();
    S.title = ""; S.projectId = null;
    if (!setSong(song, { keepHistory: true })) {
      if (old) { S.history.pop(); q(".ms-undo").disabled = !S.history.length; S.title = old.title; S.projectId = S.projectId || old.projectId; }
      return null;
    }
    logLine("you", `New song: “${words.slice(0, 80)}”`);
    if (kept) logLine("studio", `kept “${kept.title}” on your shelf`, "before starting the new song");
    else if (old) logLine("studio", "couldn't keep the last song on your shelf", "Undo still brings it back until you leave the studio");
    for (const d of decisions) logLine(d.source, `${d.field}: ${d.value}`, d.why);
    S.offered = ideasFor(plan, { used: S.saltyPicks, seed: seedOf(plan.seed, S.turns++) });
    logLine("studio", `offered Salty three ideas: ${S.offered.map((i) => i.label).join("; ")}`, "chosen from what this song doesn't have yet");
    setIdea(null);
    S.offer = null;
    const note = studioNoteFor("brief", plan, [], { ideas: S.offered, kept: kept?.title || "" });
    startPending("brief");
    S.pending.replaced = Boolean(old);
    saltyMove("think");
    return note;
  }

  /** "Undo that", "the other way", "do that again", "play it": the note says what really happened. */
  function control(read, words) {
    if (read.intent === "transport") {
      if ((read.control === "stop" || read.control === "pause") && !audio.playing) return read.mentions ? studioNoteFor("control", S.song.plan, [], { what: "notPlaying" }) : null; // "stop it" with nothing playing is just talk
      return studioNoteFor("control", S.song.plan, [], { what: playback(read.control) });
    }
    if (read.intent === "undo") return studioNoteFor("control", S.song.plan, [], { what: undoLast() ? "undone" : "nothingToUndo" });
    const last = S.lastOps;
    if (read.intent === "repeat") {
      if (!last) return studioNoteFor("control", S.song.plan, [], { what: "nothingToRepeat" });
      return applyChange(last, "you", words, "again") || studioNoteFor("still", S.song.plan);
    }
    const back = (last || []).filter((o) => OPPOSITE[o.op]).map((o) => ({ op: OPPOSITE[o.op], arg: o.arg }));
    if (!back.length) return studioNoteFor("control", S.song.plan, [], { what: "noWayBack" });
    undoLast();
    return applyChange(back, "you", words, "the other way from your last change") || studioNoteFor("still", S.song.plan);
  }

  /** The speakers. Returns what's true now, for her note. */
  function playback(what) {
    const was = audio.playing;
    if (what === "pause") audio.pause();
    else if (what === "stop") audio.stop();
    else {
      if (what === "restart") audio.stop();
      audio.play(what === "restart" ? 0 : null).then(render.transport).catch((e) => { console.warn("MUSEick could not play", e); logLine("studio", "couldn't start the speakers"); });
    }
    render.transport();
    logLine("you", what, "playback");
    if (what === "pause" || what === "stop") return "stopped";
    return what === "restart" ? "restarted" : was ? "alreadyPlaying" : "playing";
  }

  function undoLast() {
    const prev = S.history.pop();
    if (!prev) return false;
    const held = { title: S.title, projectId: S.projectId };
    S.title = prev.title; S.projectId = prev.projectId ?? null;
    if (!setSong(prev.song, { keepHistory: true })) { S.history.push(prev); S.title = held.title; S.projectId = held.projectId; return false; }
    // She may be mid-way through naming the song he just took back: her reply is no longer about this one.
    if (S.pending?.kind === "brief") { S.pending = null; status(""); }
    setIdea(null);
    S.offer = null;
    logLine("you", "undo");
    q(".ms-undo").disabled = !S.history.length;
    return true;
  }

  function applyChange(ops, source, words = "", why = "", { sameStep = false } = {}) {
    const { plan, changes, regen } = applyOps(S.song.plan, ops, source, { used: S.saltyPicks, turn: S.turns });
    if (!changes.length) return null;
    const next = regen.size ? recompose(S.song, plan, [...regen]) : { ...S.song, plan: validatePlan(plan).plan };
    // ☠️ "Fade it out" when it already fades: she was told the studio had changed it (4 Nov, phone).
    if (JSON.stringify(next) === JSON.stringify(S.song)) {
      logLine(source, changes.map((c) => `${c.field}: ${c.value}`).join("; "), "already like that; nothing changed");
      return studioNoteFor("control", S.song.plan, [], { what: "alreadyThat" });
    }
    if (!setSong(next, { keepHistory: sameStep })) return null;
    S.lastOps = ops;
    if (words) logLine(source, `“${words.slice(0, 80)}”`);
    for (const c of changes) logLine(c.source, `${c.field}: ${c.value}`, [c.why, why].filter(Boolean).join("; "));
    const changed = S.lastChanged ? ` — ${S.lastChanged} clip${S.lastChanged > 1 ? "s" : ""} changed` : "";
    flash(changes.map((c) => `${c.field} ${c.value}`).join(" · ") + changed);
    // Two ideas she may suggest next: what the song still lacks, minus what just changed.
    const done = ops.map((o) => o.op);
    S.offered = ideasFor(S.song.plan, { used: [...S.saltyPicks, ...done], n: 2, seed: seedOf(S.song.plan.seed, S.turns++) });
    return studioNoteFor("rev", S.song.plan, changes, { ideas: S.offered });
  }

  /** What one of her ops is called in the room: the studio's idea label, or the op's own name. */
  const ideaLabel = opLabel;

  // He criticised it, or it isn't clear what he wants: nothing changes. She asks, and any fix waits on a button or his "yes".
  function askFirst(read, words) {
    const ideas = read.offer.filter((op) => op !== "undo" || S.history.length).map((op) => ({ op, label: ideaLabel(op) }));
    const menu = ideas.map((i) => i.op), several = ideas.length > 1;
    if (read.newOrThis) setIdea({ brief: words, label: "a new song", studio: true, several: true });
    else if (ideas.length) setIdea(ideas[0].op === "undo" ? { undo: true, label: ideas[0].label, studio: true } : { ops: [{ op: ideas[0].op, arg: true }], label: ideas[0].label, studio: true, menu, several });
    else setIdea(null);
    logLine("you", read.about || "unclear", "nothing changed; waiting for you");
    return studioNoteFor("ask", S.song.plan, [], { ideas, about: read.about, intent: read.intent, newOrThis: read.newOrThis });
  }

  // Her next idea after a change waits on him too: it is hers, but it is his song.
  function setIdea(idea) {
    S.idea = idea;
    S.offer = idea ? { idea, at: performance.now() } : null;
    const b = q(".ms-idea");
    b.hidden = !idea;
    if (idea) b.textContent = idea.studio ? `Try it: ${idea.label}` : `Try Salty's idea: ${idea.label}`;
  }
  /** He said yes, by button or by voice. Returns the note for her. */
  function acceptIdea(idea) {
    setIdea(null);
    if (idea.brief) { logLine("you", "accepted the studio's offer", idea.label); return startSong(idea.brief); }
    if (idea.undo) return undoLast() ? studioNoteFor("control", S.song.plan, [], { what: "undone" }) : studioNoteFor("control", S.song.plan, [], { what: "nothingToUndo" });
    const note = applyChange(idea.ops, idea.studio ? "you" : "salty", "", idea.studio ? "the studio's offer after your feedback; you said yes" : "Salty's idea; you said yes");
    if (!note) return studioNoteFor("still", S.song.plan);
    logLine("you", idea.studio ? "accepted the studio's offer" : "accepted Salty's idea", idea.label);
    if (!idea.studio) S.saltyPicks.push(...idea.ops.map((o) => o.op));
    return note;
  }
  q(".ms-idea").addEventListener("click", () => {
    const idea = S.idea;
    if (!idea || !S.song) return;
    const free = !mindState().busy && !S.pending;
    const text = idea.brief ? `Yes, ${idea.label}` : idea.undo ? "Yes, put it back" : idea.studio ? `Yes, let's try ${idea.label}` : `Yes, let's try your idea: ${idea.label}`;
    const note = acceptIdea(idea);
    // She hears that he took her idea, through the same note path as any change.
    if (note && free) {
      if (!S.pending) startPending("rev");
      beginTurn(text, note);
      host.send(text);
    }
  });

  // ---------- one message, one action ----------
  //
  // ☠️ "Quicker", "Quicker", "Quicker" (audit, 4 Nov): the words were remembered for a minute, so the same
  // words again did nothing and she was told, again, that they had. A message is an element in Veridity's
  // log, not its words. Typed words are read in say() before the app has added theirs, and wait for it;
  // spoken words are read when their element arrives; her note may ask first. Whoever gets there first
  // acts, once, and the others get what it did.
  //
  // ☠️ NOT FOR A MESSAGE FROM BEFORE THE STUDIO OPENED (3 Nov, phone): her boot prewarm carries the
  // conversation from before the restart, and its newest message (an old brief) was read as a new one
  // and replaced his song. Only a message added to the log since he opened the studio counts.
  const lastUserMsg = () => [...document.querySelectorAll("#log .log-message.user")].pop() || null;
  const msgAtOpen = lastUserMsg();
  const sameWords = (c, key) => c === key || c.startsWith(`${key} (worked out`) || (key.includes(" ") && c.includes(key));
  function beginTurn(words, note) { S.turn = { key: norm(words), note, msg: null, at: performance.now() }; }
  // ☠️ Pressing New forgot which message had been read. Her next prewarm asked about the old message, it was read
  // again, and "make me something cool" made a song nobody asked for (4 Nov, phone). An element is read once, ever.
  const readMsgs = new WeakSet();
  function readMessage(msg, words) {
    if (readMsgs.has(msg)) return;
    readMsgs.add(msg);
    const key = norm(words), t = S.turn;
    if (t && !t.msg && t.key === key && performance.now() - t.at < ECHO_MS) { t.msg = msg; return; }
    S.turn = { key, note: interpret(words), msg, at: performance.now() };
  }
  function noteFor(content) {
    const c = norm(content), msg = lastUserMsg();
    const last = msg?.querySelector("p")?.textContent || "";
    // The newest message, if the log watcher hasn't got to it yet. Never a spoken turn's early, partial prefill.
    if (msg && msg !== msgAtOpen && last && sameWords(c, norm(last))) readMessage(msg, last);
    const t = S.turn;
    return t && (!t.msg || t.msg === msg) && sameWords(c, t.key) ? t.note : null;
  }
  host.setNote(noteFor);
  host.onWords((words) => { const msg = lastUserMsg(); if (!S.closed && msg && msg !== msgAtOpen) readMessage(msg, words); });

  const mindState = () => {
    const L = globalThis.__vflLocal || {};
    const c = document.querySelector(".phone-shell")?.classList;
    return {
      awake: L.mindAwake === true,
      busy: L.turnPending === true || L.thinking === true || L.speaking === true || saltyVoiceSounding()
        || Boolean(c?.contains("thinking") || c?.contains("turn-active") || c?.contains("aoede-speaking")),
    };
  };

  function startPending(kind) {
    S.pending = { kind, since: performance.now(), sawTurn: false, quietSince: 0 };
    status(kind === "brief" ? "Salty is directing…" : "Salty is listening…");
  }

  function watchPending() {
    const p = S.pending;
    if (!p) return;
    const now = performance.now();
    const m = mindState();
    if (m.busy) { p.sawTurn = true; p.quietSince = 0; return; }
    if (p.sawTurn) {
      p.quietSince ||= now;
      if (now - p.quietSince > 900) finishPending(replyText());
      return;
    }
    // No turn ever started: her mind is asleep, or the words went elsewhere.
    if (now - p.since > (m.awake ? 14e3 : 3e3)) finishPending(null);
  }

  function replyText() {
    const t = (document.getElementById("homeReplyBody")?.textContent || "").trim();
    return /her reply appears here/i.test(t) ? "" : t;
  }

  function finishPending(reply) {
    const p = S.pending;
    S.pending = null;
    status("");
    if (!p || !S.song) return;
    if (p.kind === "brief") {
      if (reply == null) {
        S.title = engineTitle(S.song.plan);
        logLine("studio", `Salty's mind didn't answer, so the studio's draft stands: “${S.title}”`);
      } else {
        const title = titleFromReply(reply);
        if (title) { S.title = title; logLine("salty", `named it “${title}”`, "from her reply"); }
        else { S.title = engineTitle(S.song.plan); logLine("studio", `named it “${S.title}”`, "Salty didn't name it"); }
        const ops = opsFromReply(reply);
        if (ops.length) {
          const offered = new Set(S.offered.map((i) => i.op));
          const why = ops.every((o) => offered.has(o.op)) ? "her pick from the studio's three ideas" : "her own idea, from her reply";
          S.saltyPicks.push(...ops.map((o) => o.op));
          // ☠️ "Undo that" after a new song took away her idea and left the new song (4 Nov, phone). One undo brings the old song back.
          applyChange(ops, "salty", "", why, { sameStep: Boolean(p.replaced) });
        } else logLine("salty", "kept the studio's draft", "no change asked for in her reply");
      }
      render.all();
      saveCurrent();
      saltyMove("celebrate");
      if (!audio.playing && !audio.held) audio.play(0).then(render.transport);
    } else if (p.kind === "rev" && reply) {
      // ☠️ She was told to offer a slower tempo and said "How's it sitting?". "Yep" slowed the song (4 Nov, phone).
      // A voice "yes" takes up only what she really put to him. The button stays either way.
      const standing = S.offer?.asked ? null : S.offer?.idea;
      if (standing?.ops && !parseRevision(reply, { raw: true }).some((o) => o.op === standing.ops[0].op) && !PUT_TO_HIM.test(reply)) S.offer = null;
      if (standing?.undo && !/\b(back|undo|before)\b/i.test(reply) && !PUT_TO_HIM.test(reply)) S.offer = null;
      // After a change she may suggest the next one: it waits on his tap or his "yes". What he just did isn't a suggestion
      // (☠️ 4 Nov, phone: "heavy drums make everything else sound like a whisper" offered him the heavier drums he'd just got),
      // and what she was told to offer comes first. If she gave him a choice, a bare "yes" doesn't pick for him.
      const done = (S.lastOps || []).map((o) => o.op), told = S.offered.map((i) => i.op);
      const hasIt = (o) => !applyOps(S.song.plan, [o], "salty", { used: S.saltyPicks, turn: S.turns }).changes.some((c) => !c.already);
      const ops = opsFromReply(reply).filter((o) => !done.includes(o.op) && !hasIt(o));
      const pick = ops.find((o) => told.includes(o.op)) || ops[0];
      if (pick) {
        const label = ideaLabel(pick.op);
        setIdea({ ops: [pick], label, menu: [...new Set([...ops.map((o) => o.op), ...told])], several: ops.length > 1 || /\bor\b[^.?!]*\?\s*$/i.test(reply) });
        logLine("salty", `suggested ${label}`, "from her reply; waiting for you");
      }
    }
  }

  function saltyMove(name) {
    const api = host.salty3d();
    if (!api || saltyVoiceSounding() || api.moodPlaying?.()) return;
    api.playMood(name);
  }

  // ---------- his input ----------

  function say(text) {
    const t = String(text || "").trim();
    if (!t) return;
    audio.ensure(); // a gesture: the audio context may start now
    const m = mindState();
    if (S.pending || (m.busy && S.song && !isNewBrief(t, true))) {
      // She's mid-reply: the studio acts now rather than queue her another turn. She isn't told, so it says so.
      const read = readIntent(t, { hasSong: Boolean(S.song) });
      if (S.song && (read.ops.length || ["undo", "reverse", "repeat", "transport"].includes(read.intent))) { interpret(t); logLine("studio", "Salty was busy, so the studio did that on its own"); }
      else toast("Salty's still answering…");
      return;
    }
    beginTurn(t, interpret(t));
    host.send(t);
  }

  q(".ms-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = q(".ms-input");
    say(input.value);
    input.value = "";
    input.blur();
  });
  for (const chip of qa(".ms-chips .ms-chip")) chip.addEventListener("click", () => {
    if (!S.song) { toast("Make a song first: tell Salty what you'd like"); q(".ms-input").focus(); return; }
    say(chip.dataset.say);
  });
  for (const b of qa(".ms-starter")) b.addEventListener("click", () => say(b.textContent));
  q(".ms-demo").addEventListener("click", () => loadDemo());
  q(".ms-mic").addEventListener("click", () => { audio.ensure(); host.mic(); });

  function loadDemo() {
    const words = STARTERS[0];
    const { plan, decisions } = planFromBrief(words, 20261105);
    const song = compose(plan);
    if (S.song) shelve(true);
    if (!setSong(song)) return;
    S.title = "Abyss Engine"; S.projectId = null;
    logLine("studio", "Demo song loaded (the studio's rules only; Salty wasn't asked)", planSummary(plan));
    for (const d of decisions) logLine(d.source === "you" ? "studio" : d.source, `${d.field}: ${d.value}`, d.why);
    render.all();
    audio.play(0).then(render.transport);
  }

  // ---------- transport and tracks ----------

  q(".ms-play").addEventListener("click", async () => {
    if (!S.song) return;
    if (audio.playing) audio.pause(); else await audio.play();
    render.transport();
  });
  q(".ms-stop").addEventListener("click", () => { audio.stop(); render.transport(); });
  q(".ms-loop").addEventListener("click", () => { audio.setLoop(!audio.loop); render.transport(); });
  const bpmBy = (d) => changePlan((p) => { p.bpm = Math.max(70, Math.min(180, p.bpm + d)); });
  q(".ms-bpm-dn").addEventListener("click", () => bpmBy(-2));
  q(".ms-bpm-up").addEventListener("click", () => bpmBy(2));
  q(".ms-undo").addEventListener("click", () => undoLast());
  q(".ms-back").addEventListener("click", () => close());

  for (const tr of TRACKS) {
    const el = q(`.ms-track[data-t="${tr}"]`);
    el.querySelector(".ms-m").addEventListener("click", () => mix(tr, (t) => { t.mute = !t.mute; }));
    el.querySelector(".ms-s").addEventListener("click", () => mix(tr, (t) => { t.solo = !t.solo; }));
    el.querySelector(".ms-vol").addEventListener("input", (e) => mix(tr, (t) => { t.vol = Number(e.target.value) / 100; }, true));
    el.querySelector(".ms-vary").addEventListener("click", () => {
      changePlan((p) => { p.tracks[tr].variant += 1; }, [tr]);
      logLine("you", `${tr}: new pattern`, "variation");
    });
    el.querySelector(".ms-sound").addEventListener("click", () => {
      const names = Object.keys(SOUNDS[tr]);
      changePlan((p) => { p.tracks[tr].sound = names[(names.indexOf(p.tracks[tr].sound) + 1) % names.length]; });
      logLine("you", `${tr}: ${SOUNDS[tr][S.song.plan.tracks[tr].sound]}`);
    });
    el.querySelector(".ms-lane").addEventListener("click", (e) => {
      if (!S.compiled) return;
      const r = e.currentTarget.getBoundingClientRect();
      const step = ((e.clientX - r.left) / r.width) * S.compiled.totalSteps;
      const sec = S.compiled.sections.find((s) => step >= s.start && step < s.start + s.bars * 16);
      if (sec) openEditor(tr, sec.id);
    });
  }

  /** Volume, mute and solo: no recompile, no history spam (a drag is one change). */
  function mix(tr, f, quiet = false) {
    if (!S.song) return;
    if (!quiet) pushHistory();
    const plan = structuredClone(S.song.plan);
    f(plan.tracks[tr]);
    S.song = { ...S.song, plan };
    audio.setMix(plan);
    render.tracks();
    render.desk();
    saveCurrent();
  }

  q(".ms-ribbon").addEventListener("click", (e) => {
    const id = e.target.closest("[data-sec]")?.dataset.sec;
    const sec = S.compiled?.sections.find((s) => s.id === id);
    if (sec) { audio.seek(sec.start); if (!audio.playing) audio.play(sec.start); render.transport(); }
  });

  // ---------- the clip editor ----------

  function rowsFor(tr, secId) {
    if (tr === "drums") return DRUM_LANES.map((name, p) => ({ p, label: name })).reverse();
    if (tr === "bass") return [[7, "Oct"], [4, "5th"], [2, "3rd"], [0, "Root"], [-1, "Low"]].map(([p, label]) => ({ p, label }));
    if (tr === "chords") return [{ p: null, label: "Chord" }];
    const lo = secId === "drop" ? 3 : 0, hi = lo + 9;
    const names = ["1", "2", "3", "4", "5", "6", "7"];
    const out = [];
    for (let p = hi; p >= lo; p--) out.push({ p, label: names[((p % 7) + 7) % 7] + (p >= 7 ? "′" : "") });
    return out;
  }

  function openEditor(tr, secId) {
    if (!S.song) return;
    S.editing = { tr, secId };
    q(".ms-sheet-title").textContent = `${TRACK_UI[tr].name} · ${S.song.plan.sections.find((s) => s.id === secId).name} · ${SOUNDS[tr][S.song.plan.tracks[tr].sound]}`;
    q(".ms-sheet:not(.ms-songs)").hidden = false;
    room.classList.add("ms-editing");
    drawGrid();
  }

  function drawGrid() {
    const ed = S.editing;
    if (!ed) return;
    const { tr, secId } = ed;
    const clip = S.song.clips[tr][secId];
    const len = CLIP_LEN[tr];
    const rows = rowsFor(tr, secId);
    const grid = q(".ms-grid");
    grid.style.setProperty("--cols", len);
    grid.style.setProperty("--tc", TRACK_UI[tr].color);
    grid.classList.toggle("wide", len > 16);
    let html = "";
    for (const row of rows) {
      html += `<div class="ms-row"><span class="ms-rlabel">${row.label}</span>`;
      for (let s = 0; s < len; s++) {
        const hit = clip.notes.find((n) => (tr === "chords" ? true : n.p === row.p) && s >= n.s && s < n.s + (tr === "drums" ? 1 : n.d));
        const head = hit && hit.s === s;
        html += `<button type="button" class="ms-cell${s % 4 === 0 ? " beat" : ""}${s % 16 === 0 ? " bar" : ""}${hit ? (head ? " on" : " tail") : ""}" data-s="${s}" data-p="${row.p}"></button>`;
      }
      html += "</div>";
    }
    grid.innerHTML = html;
  }

  q(".ms-grid").addEventListener("click", (e) => {
    const cell = e.target.closest(".ms-cell");
    if (!cell || !S.editing) return;
    const { tr, secId } = S.editing;
    const s = Number(cell.dataset.s);
    const p = cell.dataset.p === "null" ? null : Number(cell.dataset.p);
    pushHistory();
    const song = structuredClone(S.song);
    const clip = song.clips[tr][secId];
    const idx = clip.notes.findIndex((n) => (tr === "chords" || n.p === p) && s >= n.s && s < n.s + (tr === "drums" ? 1 : n.d));
    if (idx >= 0) clip.notes.splice(idx, 1);
    else {
      const d = tr === "drums" ? 1 : tr === "lead" ? 2 : 2;
      // A new note never overlaps the next one on its row.
      const nextOn = clip.notes.filter((n) => (tr === "chords" || n.p === p) && n.s > s).map((n) => n.s).sort((a, b) => a - b)[0];
      clip.notes.push({ s, d: Math.max(1, Math.min(d, (nextOn ?? s + d) - s, clip.len - s)), p, v: 0.85 });
      clip.notes.sort((a, b) => a.s - b.s);
      if (tr === "drums" || tr === "lead") previewNote(tr, p);
    }
    song.edited = { ...song.edited, [tr]: true };
    setSong(song, { keepHistory: true });
    drawGrid();
  });

  function previewNote() { /* the loop plays it on its next pass; no extra voice while Salty may be talking */ }

  const closeEditor = () => { q(".ms-sheet:not(.ms-songs)").hidden = true; room.classList.remove("ms-editing"); S.editing = null; };
  q(".ms-sheet-close").addEventListener("click", closeEditor);
  q(".ms-ed-done").addEventListener("click", closeEditor);
  q(".ms-ed-clear").addEventListener("click", () => {
    const { tr, secId } = S.editing;
    pushHistory();
    const song = structuredClone(S.song);
    song.clips[tr][secId].notes = [];
    song.edited = { ...song.edited, [tr]: true };
    // A track silent for the whole song fails the song check, which is right for a composition
    // but not for an edit: allow it by checking the rest of the song is still sound.
    S.song = song; S.compiled = compile(song); audio.load(song, S.compiled); render.all(); saveCurrent();
    drawGrid();
  });
  q(".ms-ed-vary").addEventListener("click", () => {
    const { tr } = S.editing;
    changePlan((p) => { p.tracks[tr].variant += 1; }, [tr]);
    logLine("you", `${tr}: new pattern`, "variation");
    drawGrid();
  });
  q(".ms-ed-listen").addEventListener("click", () => {
    const sec = S.compiled.sections.find((s) => s.id === S.editing.secId);
    audio.seek(sec.start); if (!audio.playing) audio.play(sec.start);
    render.transport();
  });

  // ---------- songs: save, reopen, export ----------

  function saveCurrent() {
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(() => { if (S.song) saveJson(CURRENT_KEY, { v: 1, song: S.song, title: S.title, projectId: S.projectId, log: S.log.slice(-40) }); }, 400);
  }
  function restore() {
    const cur = loadJson(CURRENT_KEY, null);
    if (!cur?.song) return;
    if (validateSong(cur.song).length) return;
    S.title = cur.title || ""; S.projectId = cur.projectId || null; S.log = Array.isArray(cur.log) ? cur.log : [];
    setSong(cur.song, { keepHistory: true });
  }
  /** Puts the song on his shelf. What he saved himself outlasts what the studio kept for him. Returns the entry, or null if it couldn't. */
  function shelve(auto) {
    const list = loadJson(PROJECTS_KEY, []), mine = list.find((x) => x.id === S.projectId);
    if (auto && mine && !mine.auto) {
      // A version he saved himself isn't written over by what the studio keeps for him.
      if (JSON.stringify(mine.song) === JSON.stringify(S.song)) return mine;
      S.projectId = null;
    }
    S.projectId ||= `s${Date.now().toString(36)}`;
    const entry = { id: S.projectId, title: S.title || engineTitle(S.song.plan), savedAt: Date.now(), song: S.song, ...(auto ? { auto: true } : {}) };
    const next = [entry, ...list.filter((x) => x.id !== S.projectId)];
    if (next.length > MAX_PROJECTS) {
      const i = next.findLastIndex((x, k) => k > 0 && x.auto);
      if (i > 0) next.splice(i, 1);
      else if (auto) return null;
      else next.pop();
    }
    const ok = saveJson(PROJECTS_KEY, next);
    renderSongs();
    return ok ? entry : null;
  }
  function renderSongs() {
    const list = loadJson(PROJECTS_KEY, []);
    const ul = q(".ms-songlist");
    ul.innerHTML = list.length ? "" : "<li class='ms-note'>No saved songs yet.</li>";
    for (const p of list) {
      const li = document.createElement("li");
      li.innerHTML = `<button class="ms-chip ms-open" type="button">${esc(p.title || "Untitled")}</button><small>${new Date(p.savedAt).toLocaleString()}</small><button class="ms-btn ms-del" type="button" aria-label="Delete ${esc(p.title || "song")}">${ICON.close}</button>`;
      li.querySelector(".ms-open").addEventListener("click", () => {
        if (validateSong(p.song).length) { toast("That song couldn't be opened"); return; }
        audio.stop();
        if (S.song) { shelve(true); pushHistory(); }
        S.title = p.title; S.projectId = p.id;
        setSong(p.song, { keepHistory: true });
        logLine("you", `opened “${p.title}”`);
        q(".ms-songs").hidden = true;
      });
      li.querySelector(".ms-del").addEventListener("click", () => {
        saveJson(PROJECTS_KEY, loadJson(PROJECTS_KEY, []).filter((x) => x.id !== p.id));
        renderSongs();
      });
      ul.append(li);
    }
    q(".ms-save").disabled = !S.song;
    q(".ms-export").disabled = !S.song;
  }
  q(".ms-projects").addEventListener("click", () => { renderSongs(); q(".ms-songs").hidden = false; });
  q(".ms-songs-close").addEventListener("click", () => { q(".ms-songs").hidden = true; });
  q(".ms-save").addEventListener("click", () => {
    if (!S.song) return;
    const entry = shelve(false);
    toast(entry ? `Saved “${entry.title}”` : "Couldn't save (storage full?)");
  });
  q(".ms-new").addEventListener("click", () => {
    audio.stop();
    if (S.song) shelve(true);
    setIdea(null);
    S.song = null; S.compiled = null; S.title = ""; S.projectId = null; S.history = []; S.lastOps = null; S.pending = null; S.turn = null;
    q(".ms-undo").disabled = true;
    try { localStorage.removeItem(CURRENT_KEY); } catch { /* fine */ }
    q(".ms-songs").hidden = true;
    render.all();
    q(".ms-input").focus();
  });
  q(".ms-export").addEventListener("click", () => exportWav());

  async function exportWav() {
    if (!S.song || S.exporting) return;
    if (saltyVoiceSounding()) { toast("Wait until Salty finishes speaking"); return; }
    S.exporting = true;
    const btn = q(".ms-export");
    const t0 = performance.now();
    // An offline render reports no progress of its own: show the time against the song's length.
    const tick = () => { btn.textContent = `Rendering… ${Math.round((performance.now() - t0) / 1000)} s (song ${Math.round(S.compiled.seconds)} s)`; };
    tick();
    const ticker = setInterval(tick, 1000);
    try {
      const buf = await renderOffline(S.song, S.compiled);
      const bytes = wavBytes(buf);
      const name = `MUSEick-${(S.title || "song").replace(/[^\w-]+/g, "_")}.wav`;
      const fs = globalThis.Capacitor?.Plugins?.Filesystem;
      if (fs && globalThis.Capacitor?.isNativePlatform?.()) {
        let b64 = "";
        for (let i = 0; i < bytes.length; i += 0x8000) b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        b64 = btoa(b64);
        let where = null;
        for (const directory of ["DOCUMENTS", "EXTERNAL_STORAGE", "DATA"]) {
          try { const w = await fs.writeFile({ path: `MUSEick/${name}`, data: b64, directory, recursive: true }); where = w?.uri || directory; break; } catch { /* next */ }
        }
        toast(where ? `Saved ${name} to Documents/MUSEick` : "Couldn't save the WAV on this phone");
        if (where) logLine("you", `exported ${name}`, `${(bytes.length / 1048576).toFixed(1)} MB, rendered in ${Math.round((performance.now() - t0) / 1000)} s`);
        q(".ms-songs .ms-note").textContent = where ? `Last export: Documents/MUSEick/${name}` : "Songs are kept only on this phone.";
      } else {
        const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
        const a = document.createElement("a"); a.href = url; a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast(`Saved ${name}`);
      }
    } catch (e) {
      console.warn("MUSEick export failed", e);
      toast("Export failed");
    } finally {
      clearInterval(ticker);
      S.exporting = false; btn.textContent = "Export WAV";
    }
  }

  // ---------- her voice, his mic ----------

  // ☠️ THE MUSIC FOLLOWED HER BREATH. It dropped for each burst of her voice and swelled in every gap, so under a long reply it
  // kept cutting in and out, and she was hard to hear (the owner, 5 Nov). Now it goes down once when her turn starts, stays
  // down through every gap, and comes back once, after she has finished.
  const DUCK_HOLD_MS = 900;
  let duckUntil = 0;
  const syncDuck = () => {
    const now = performance.now();
    if (S.dip || S.pending || mindState().busy) duckUntil = now + DUCK_HOLD_MS;
    const want = now < duckUntil;
    if (want !== audio.ducked) { audio.duck(want); render.desk(); }
  };
  const duckTimer = setInterval(syncDuck, 120);
  S.cleanup.push(() => clearInterval(duckTimer), onSaltyVoiceSounding(syncDuck));
  const shell = document.querySelector(".phone-shell");
  const onShell = () => {
    const listening = Boolean(shell?.classList.contains("mic-listening"));
    q(".ms-mic").classList.toggle("live", listening);
    if (listening === audio.held) return;
    if (listening) {
      // The ears' echo reference doesn't include the web page's audio: the music must not play into the mic.
      S.wasPlayingBeforeMic = audio.playing;
      audio.hold(true);
      if (audio.playing) audio.pause();
      status("Listening, music paused");
    } else {
      audio.hold(false);
      status("");
      if (S.wasPlayingBeforeMic && !S.pending) audio.play();
      S.wasPlayingBeforeMic = false;
    }
    render.transport();
  };
  if (shell) {
    const o = new MutationObserver(onShell);
    o.observe(shell, { attributes: true, attributeFilter: ["class"] });
    S.cleanup.push(() => o.disconnect());
    onShell();
  }
  const reply = document.getElementById("homeReplyBody");
  let replyAtOpen = replyText();
  const onReply = () => {
    const t = replyText();
    if (!t || t === replyAtOpen) return;
    replyAtOpen = null;
    const b = q(".ms-bubble");
    b.hidden = false;
    q(".ms-bubble-text").textContent = t.length > 170 ? `…${t.slice(-170).replace(/^\S*\s/, "")}` : t;
    clearTimeout(S.bubbleTimer);
    S.bubbleTimer = setTimeout(() => { if (!mindState().busy) b.hidden = true; }, 14e3);
  };
  if (reply) {
    const o = new MutationObserver(onReply);
    o.observe(reply, { childList: true, characterData: true, subtree: true });
    S.cleanup.push(() => o.disconnect());
  }
  const onVis = () => { if (document.hidden && audio.playing) { audio.pause(); render.transport(); } };
  document.addEventListener("visibilitychange", onVis);
  S.cleanup.push(() => document.removeEventListener("visibilitychange", onVis));

  // ---------- drawing ----------

  const render = {
    all() { render.header(); render.ribbon(); render.tracks(); render.lanes(); render.transport(); render.desk(); render.log(); },
    header() {
      const p = S.song?.plan;
      room.classList.toggle("ms-has-song", Boolean(p));
      q(".ms-title").textContent = p ? (S.title || "Untitled") : "No song yet";
      q(".ms-meta").textContent = p ? `${GENRES[p.genre].label} · ${p.mood} · ${keyName(p.key)}` : "";
      q(".ms-bpm-v").textContent = p ? p.bpm : "–";
      if (!p) q(".ms-time").textContent = "0:00 / 0:00";
    },
    ribbon() {
      const c = S.compiled;
      q(".ms-ribbon").innerHTML = c ? c.sections.map((s) => `<button type="button" data-sec="${s.id}" style="flex:${s.bars};--sc:${SECTION_COLOR[s.id]}">${s.name}<small>${s.bars}</small></button>`).join("") : "";
    },
    tracks() {
      const p = S.song?.plan;
      for (const tr of TRACKS) {
        const el = q(`.ms-track[data-t="${tr}"]`);
        const t = p?.tracks[tr];
        el.querySelector(".ms-sound").textContent = t ? SOUNDS[tr][t.sound] : "";
        const m = el.querySelector(".ms-m"), s = el.querySelector(".ms-s");
        m.classList.toggle("on", Boolean(t?.mute)); m.setAttribute("aria-pressed", String(Boolean(t?.mute)));
        s.classList.toggle("on", Boolean(t?.solo)); s.setAttribute("aria-pressed", String(Boolean(t?.solo)));
        const vol = el.querySelector(".ms-vol");
        if (t && document.activeElement !== vol) vol.value = String(Math.round(t.vol * 100));
        const soloed = p && TRACKS.some((x) => p.tracks[x].solo);
        el.classList.toggle("quiet", Boolean(t && (t.mute || (soloed && !t.solo))));
        el.classList.toggle("edited", Boolean(S.song?.edited?.[tr]));
      }
    },
    lanes() {
      const c = S.compiled;
      for (const tr of TRACKS) {
        const lane = q(`.ms-track[data-t="${tr}"] .ms-lane`);
        lane.innerHTML = "";
        if (!c) continue;
        for (const sec of c.sections) {
          const box = document.createElement("div");
          box.className = "ms-clip";
          box.style.flex = String(sec.bars);
          box.style.setProperty("--sc", SECTION_COLOR[sec.id]);
          const cv = document.createElement("canvas");
          box.append(cv);
          lane.append(box);
          drawClip(cv, tr, sec);
        }
      }
    },
    transport() {
      const playing = audio.playing;
      const play = q(".ms-play");
      play.innerHTML = playing ? ICON.pause : ICON.play;
      play.setAttribute("aria-label", playing ? "Pause" : "Play");
      play.classList.toggle("on", playing);
      q(".ms-loop").classList.toggle("on", audio.loop);
      q(".ms-loop").setAttribute("aria-pressed", String(audio.loop));
      room.classList.toggle("ms-playing", playing);
      for (const b of qa(".ms-transport .ms-btn")) b.disabled = !S.song;
    },
    desk() {
      const p = S.song?.plan;
      for (const tr of TRACKS) {
        const st = q(`.ms-strip[data-t="${tr}"]`);
        st.style.setProperty("--fader", p ? String(p.tracks[tr].mute ? 0 : p.tracks[tr].vol) : "0.6");
      }
      room.classList.toggle("ms-ducked", audio.ducked);
    },
    log() {
      const ol = q(".ms-log");
      ol.innerHTML = S.log.slice(-40).reverse().map((l) => `<li class="src-${l.source}"><b>${{ you: "You", salty: "Salty", studio: "Studio", engine: "Studio" }[l.source] || l.source}</b> ${esc(l.text)}${l.why ? ` <small>${esc(l.why)}</small>` : ""}</li>`).join("");
    },
  };

  function drawClip(cv, tr, sec) {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.max(8, cv.parentElement.clientWidth), h = Math.max(8, cv.parentElement.clientHeight);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const g = cv.getContext("2d");
    g.scale(dpr, dpr);
    const clip = S.song.clips[tr][sec.id];
    const steps = sec.bars * 16;
    const sx = w / steps;
    g.fillStyle = TRACK_UI[tr].color;
    const notes = clip.notes;
    if (!notes.length) return;
    const ps = notes.map((n) => n.p ?? 0);
    const pmin = Math.min(...ps), pmax = Math.max(...ps);
    for (let rep = 0; rep * clip.len < steps; rep++) {
      for (const n of notes) {
        const s = rep * clip.len + n.s;
        if (s >= steps) continue;
        const y = tr === "chords" ? h * 0.3 : tr === "drums" ? h - 3 - ((n.p + 1) / 5.5) * (h - 6)
          : h - 3 - ((n.p - pmin) / Math.max(1, pmax - pmin)) * (h - 9) - 3;
        const nh = tr === "chords" ? h * 0.4 : tr === "drums" ? 2.5 : 3;
        g.globalAlpha = tr === "chords" ? 0.3 + 0.35 * n.v : 0.45 + 0.55 * n.v; // chords are a band, not a block, or they'd shout over the rest
        g.fillRect(s * sx, y, Math.max(1.2, (tr === "drums" ? 0.7 : n.d) * sx - 0.6), nh);
      }
    }
  }

  // The animation loop: playhead, clock, lights, visualiser — and it only touches the page when
  // something changed, with every light and bar a transform or an opacity (no repaint, no canvas).
  // ☠️ MEASURED ON THE ROG (3 Nov, app process CPU, docs/museick/TEST_LOG.md): the first studio
  // cost ~70% idle against the tank's ~50% (clock rewritten every frame, forced layout per light);
  // then playing cost +49%: a canvas visualiser redrawn at 30 fps (~18%), and box-shadow lights and a
  // full-room kick glow repainted per note (~31%). The music itself measured ~0%.
  const el = { playhead: q(".ms-playhead"), lanes: q(".ms-lanes"), time: q(".ms-time"), bars: qa(".ms-viz i"),
    leds: Object.fromEntries(TRACKS.map((t) => [t, room.querySelector(`[data-led="${t}"]`)])),
    meters: Object.fromEntries(TRACKS.map((t) => [t, room.querySelector(`.ms-strip[data-t="${t}"] s i`)])) };
  const meter = Object.fromEntries(TRACKS.map((t) => [t, 0]));
  const fft = new Uint8Array(128);
  const barV = new Float32Array(el.bars.length);
  let lastTick = 0, lastTime = "", lastX = -1, lanesW = 0, vizZero = false;
  const measureLanes = () => { lanesW = el.lanes.querySelector(".ms-lane").clientWidth; };
  const LED_FLASH = [{ opacity: 1 }, { opacity: 0.18 }];
  function frame(ts) {
    S.raf = requestAnimationFrame(frame);
    if (ts - lastTick < 48) return; // 20 updates a second is plenty for lights; the audio clock is separate
    lastTick = ts;
    watchPending();
    const c = S.compiled;
    const playing = audio.playing;
    if (c) {
      const pos = audio.position();
      if (!lanesW) measureLanes();
      const x = Math.round((pos / c.totalSteps) * lanesW);
      if (x !== lastX) { lastX = x; el.playhead.style.transform = `translateX(${x}px)`; }
      const time = `${fmtTime(pos * c.stepSec)} / ${fmtTime(c.seconds)}`;
      if (time !== lastTime) { lastTime = time; el.time.textContent = time; }
      const sec = playing ? c.sections.find((s) => pos >= s.start && pos < s.start + s.bars * 16) : null;
      const id = sec ? sec.id : "";
      if (id !== S.lastSection) {
        S.lastSection = id;
        room.dataset.section = id;
        if (id === "drop") saltyMove("celebrate");
      }
    }
    const hit = {};
    for (const h of audio.takeHits()) hit[h.tr] = Math.max(hit[h.tr] || 0, h.v);
    // While she speaks the lights hold still: her voice synthesises on the same CPU, and it is the
    // one thing in the room that must not stutter.
    if (audio.ducked) return;
    for (const t of TRACKS) {
      if (hit[t]) { el.leds[t]?.animate(LED_FLASH, { duration: 240, easing: "ease-out" }); meter[t] = Math.min(1, 0.35 + hit[t] * 0.65); }
      else if (meter[t] > 0.03) meter[t] *= 0.72;
      else if (meter[t]) meter[t] = 0;
      else continue;
      el.meters[t].style.transform = `scaleY(${meter[t].toFixed(2)})`;
    }
    const an = playing ? audio.analyser() : null;
    if (an) {
      an.getByteFrequencyData(fft);
      vizZero = false;
      el.bars.forEach((b, i) => {
        const v = Math.max(0.04, fft[Math.floor(Math.pow(i / el.bars.length, 1.6) * 96) + 1] / 255);
        if (Math.abs(v - barV[i]) < 0.03) return;
        barV[i] = v; b.style.transform = `scaleY(${v.toFixed(2)})`;
      });
    } else if (!vizZero) {
      vizZero = true;
      el.bars.forEach((b, i) => { barV[i] = 0.04; b.style.transform = "scaleY(.04)"; });
    }
  }

  // ---------- small bits ----------

  function logLine(source, text, why = "") {
    S.log.push({ source, text, why, at: Date.now() });
    if (S.log.length > 80) S.log.splice(0, S.log.length - 80);
    render.log?.();
  }
  function status(text) { const s = q(".ms-status"); s.hidden = !text; s.textContent = text; }
  let toastTimer = 0;
  function toast(text) {
    const t = q(".ms-toast"); t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function flash(text) { if (text) toast(`✓ ${text}`); }

  const onResize = () => requestAnimationFrame(() => { render.lanes(); measureLanes(); });
  window.addEventListener("resize", onResize);
  S.cleanup.push(() => window.removeEventListener("resize", onResize));

  // ---------- open / close ----------

  restore();
  render.all();
  S.raf = requestAnimationFrame(frame);
  // Her reply is also watched off the frame loop: frames pause when the page isn't being drawn,
  // and a reply must still be read (and her title and idea applied) when they do.
  const pendingTimer = setInterval(watchPending, 250);
  S.cleanup.push(() => clearInterval(pendingTimer));

  // For phone checks over CDP: what the studio is doing (read-only).
  globalThis.__museick = {
    state: () => ({ title: S.title, plan: S.song?.plan || null, song: S.song, playing: audio.playing, position: audio.position(), ducked: audio.ducked, held: audio.held,
      pending: S.pending?.kind || null, ctx: audio.contextState(), latency: audio.outputLatency(), log: S.log.slice(-12),
      idea: S.idea?.label || null, offerArmed: Boolean(S.offer), undoDepth: S.history.length, projectId: S.projectId, turnKey: S.turn?.key || "", turnNote: S.turn?.note || "" }),
    say, demo: loadDemo,
    // For filming: the music dips under a line that's added in the edit.
    dip: (on) => { S.dip = Boolean(on); syncDuck(); },
  };

  function close() {
    if (S.closed) return;
    S.closed = true;
    cancelAnimationFrame(S.raf);
    clearTimeout(S.saveTimer);
    if (S.song) saveJson(CURRENT_KEY, { v: 1, song: S.song, title: S.title, projectId: S.projectId, log: S.log.slice(-40) });
    for (const f of S.cleanup) { try { f(); } catch { /* gone */ } }
    host.setNote(null);
    host.onWords(null);
    audio.dispose();
    // Salty goes home to her tank, exactly where she was.
    if (tankHome.parent) tankHome.parent.insertBefore(host.tank, tankHome.next && tankHome.next.parentNode === tankHome.parent ? tankHome.next : null);
    host.root.classList.remove("st-studio");
    room.remove();
    delete globalThis.__museick;
    host.close();
  }
  return { close };
}
