/**
 * Salty: Meta's Llama 3.2 3B, fine-tuned into a foul-mouthed cartoon axolotl,
 * running behind the same mind service as Veridity (hackathon build).
 *
 * Everything here is INERT unless the loaded mind file is a Llama model
 * (the service reports its filename on /health). Veridity's Gemma path is
 * byte-identical with or without this module.
 *
 * ☠️ SHE WAS TRAINED ON ONE EXACT PROMPT, SO SHE GETS ONE EXACT PROMPT.
 * Salty learned her voice under a single short system prompt and plain
 * user/assistant turns. Veridity's page sends a 14k-character persona, extra
 * system messages (session situation, memory answers) and "\n\n(...)" notes on
 * the end of his message (the clock, her felt state, photo and recall notes).
 * None of that was in Salty's training, so a turn that carries it is a turn she
 * has never seen. The adapter below rewrites every request at mindFetch, the one
 * funnel every request to the mind passes through.
 *
 * ☠️ SHE INVENTS PHONE NUMBERS. Every word she says, on screen and aloud, passes
 * through the helpline guard. See helpline-guard.mjs.
 */
import { guardHelplineNumbers } from "./helpline-guard.mjs";

/** The training system prompt, rendered exactly as in training (Llama 3 header line first). */
export const SALTY_SYSTEM = "Cutting Knowledge Date: December 2023\n\n"
  + "You are Salty, a companion who lives on this phone as an axolotl character from an adult cartoon, "
  + "and runs entirely offline. You talk like yourself.";

/** A Llama mind file ("Llama-3.2-3B-Salty-v6b_….litertlm"). */
export function isSaltyModel(modelFile) {
  return /^llama-3/i.test(String(modelFile || ""));
}

/**
 * Removes the "\n\n(…)" notes the page rides on the end of his message.
 * Only trailing notes, only in that exact shape, so his own words are never cut.
 */
export function stripSituationNotes(text) {
  if (typeof text !== "string") return text;
  let out = text;
  for (;;) {
    if (!/\)\s*$/.test(out)) return out;
    const at = out.lastIndexOf("\n\n(");
    if (at < 0) return out;
    out = out.slice(0, at).replace(/\s+$/, "");
  }
}

/**
 * How many earlier exchanges she sees: 1 to SALTY_HISTORY_STEP, plus his new message.
 *
 * ☠️ A LONG HISTORY MADE HER REPEAT HERSELF (Shaun's spoken run, 28 Oct). She was
 * trained on chats of 1 to 4 turns; with ~10 earlier exchanges in her prompt
 * (5.9k chars) she brought back "Axolotl Surprise Cake" in 4 of 6 replies.
 *
 * ☠️ THE WINDOW MOVES IN STEPS, NEVER ONE TURN AT A TIME. Dropping the oldest
 * exchange on every turn changes the FRONT of her prompt every turn, so nothing
 * the engine holds is a prefix any more and every reply re-reads the lot.
 * Stepped, each prompt inside a step only extends the last one (the engine
 * appends). On a step turn the prompt still starts with her system prompt, which
 * the engine checkpoints (persona_end), and only one exchange is re-read: one
 * prefill call, ~0.2 s, once every SALTY_HISTORY_STEP turns.
 */
export const SALTY_HISTORY_STEP = 3;

/** Index of the first earlier exchange she keeps, given how many there are. */
export function saltyHistoryStart(exchanges) {
  if (exchanges <= 0) return 0;
  return exchanges - 1 - ((exchanges - 1) % SALTY_HISTORY_STEP);
}

/**
 * Whether the turn after `exchanges` saved exchanges starts a new window.
 *
 * ☠️ A STEP LEFT FOR HIS TURN COST HIM 2-3.5 s (spoken run, 28 Oct). The speech
 * early turn only extends what the engine holds; a prompt with a new front is
 * refused ("EARLY_REFUSED: the session holds a conversation this prompt does not
 * extend") and the turn falls back to the slow path: 4.3 s and 5.4 s ear to
 * sound on the two step turns. So the step is made the moment her reply is
 * saved: a plain /prewarm of the trimmed window, which the rewind engine runs as
 * prepareEpoch (rewind to persona_end, feed in chunks, yield to a waiting turn),
 * usually while her voice is still finishing. His turn then only extends it.
 */
export function saltyWindowStepDue(exchanges) {
  return exchanges > 0 && saltyHistoryStart(exchanges) !== saltyHistoryStart(exchanges - 1);
}

/** Drops the exchanges before her window. An exchange starts at a user message. */
function trimToWindow(turns) {
  const userAt = [];
  turns.forEach((m, i) => { if (m.role === "user") userAt.push(i); });
  // His new message, when the turns end on one, is not an earlier exchange.
  const earlier = turns.length && turns[turns.length - 1].role === "user" ? userAt.length - 1 : userAt.length;
  const start = saltyHistoryStart(earlier);
  return start > 0 ? turns.slice(userAt[start]) : turns;
}

/**
 * Worked-out facts for questions with one right answer. A 3B doing mental
 * arithmetic is how she says "391" to 391+1 with total confidence; the page
 * can just do the sum. Conservative shapes only — explicit binary arithmetic,
 * percentages, stated-clock arrival times, miles→km — and only in a question,
 * so ordinary chat is never annotated. Returns e.g. "17 × 23 = 391" or null.
 */
export function saltyFacts(text) {
  const t = String(text || "");
  if (!/\?|^(what|how|when|if)\b/i.test(t.trim())) return null;
  const num = (s) => Number(s.replace(/,/g, ""));
  const fmt = (n) => Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);

  const clock = t.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i);
  const dur = t.match(/(\d+)\s*hours?\s*(?:and\s*)?(\d+)?\s*min(?:ute)?s?/i)
    || t.match(/in\s+(\d+)\s*min(?:ute)?s?\b/i) || t.match(/takes\s+(\d+)\s*min(?:ute)?s?\b/i);
  if (clock && dur) {
    let h = Number(clock[1]) % 12;
    if (/pm/i.test(clock[3] || "")) h += 12;
    const start = h * 60 + Number(clock[2]);
    const add = dur[2] !== undefined && dur[2] !== "" ? Number(dur[1]) * 60 + Number(dur[2] || 0)
      : (/hour/i.test(dur[0]) ? Number(dur[1]) * 60 : Number(dur[1]));
    const end = (start + add) % (24 * 60);
    const eh = Math.floor(end / 60), em = end % 60;
    const ap = eh >= 12 ? "pm" : "am";
    const shown = `${((eh + 11) % 12) + 1}:${String(em).padStart(2, "0")}${ap}`;
    return `${clock[1]}:${clock[2]}${(clock[3] || "").toLowerCase()} + ${dur[0].replace(/^in\s+/i, "")} = ${shown}`;
  }

  const pct = t.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(\d[\d,]*(?:\.\d+)?)/i);
  if (pct) return `${pct[1]}% of ${pct[2]} = ${fmt(num(pct[1]) * num(pct[2]) / 100)}`;

  const miles = t.match(/(\d+(?:\.\d+)?)\s*miles?\b/i);
  if (miles && /kilo|km\b/i.test(t)) return `${miles[1]} miles = ${(num(miles[1]) * 1.60934).toFixed(1)} km`;

  const bin = t.match(/(-?\d[\d,]*(?:\.\d+)?)\s*(\+|-|×|x|\*|\/|÷|plus|minus|times|multiplied by|divided by)\s*(-?\d[\d,]*(?:\.\d+)?)/i);
  if (bin) {
    const a = num(bin[1]), b = num(bin[3]);
    const op = bin[2].toLowerCase();
    const [sym, val] = op === "+" || op === "plus" ? ["+", a + b]
      : op === "-" || op === "minus" ? ["−", a - b]
      : op === "/" || op === "÷" || op === "divided by" ? ["÷", b !== 0 ? a / b : NaN]
      : ["×", a * b];
    if (Number.isFinite(val)) return `${fmt(a)} ${sym} ${fmt(b)} = ${fmt(val)}`;
  }
  return null;
}

/** Her conversation as Salty was trained to see it: one system prompt, then her last few turns. */
export function adaptMessages(messages) {
  const turns = [];
  for (const m of messages) {
    if (!m || m.role === "system") continue;
    turns.push(m.role === "user" ? { ...m, content: stripSituationNotes(m.content) } : m);
  }
  const trimmed = trimToWindow(turns);
  // Append the worked-out answer to his newest question (deterministic: the
  // same history re-annotates identically, so her held prefix never moves).
  for (let i = trimmed.length - 1; i >= 0; i--) {
    if (trimmed[i].role !== "user") continue;
    const fact = saltyFacts(trimmed[i].content);
    if (fact) trimmed[i] = { ...trimmed[i], content: `${trimmed[i].content}\n\n(Worked out for you: ${fact}.)` };
    break;
  }
  return [{ role: "system", content: SALTY_SYSTEM }, ...trimmed];
}

/**
 * Rewrites a mind request for Salty. Same request shapes the page already uses:
 * `messages` (chat completions, apply-template) and the rewind route's
 * `nextTurn.system` (dropped) / `nextTurn.userLead` (notes stripped). Anything
 * else passes through untouched.
 */
export function adaptMindRequestForSalty(init) {
  if (!init || typeof init.body !== "string") return init;
  let body;
  try { body = JSON.parse(init.body); } catch { return init; }
  if (!body || typeof body !== "object") return init;
  let changed = false;
  if (Array.isArray(body.messages)) {
    body.messages = adaptMessages(body.messages);
    changed = true;
  }
  const next = body.nextTurn;
  if (next && typeof next === "object") {
    // ☠️ nextTurn.system is NOT the persona: it is the session-situation note,
    // rendered as a system turn just before his first live message
    // (LiteRtMindService.renderTurnHead). adaptMessages drops that same system
    // message from the full prompt, so it is dropped here too, or the pre-fed
    // head would never match the prompt that follows it.
    if (typeof next.system === "string" && next.system.length > 0) { next.system = ""; changed = true; }
    if (typeof next.userLead === "string") { next.userLead = stripSituationNotes(next.userLead); changed = true; }
  }
  return changed ? { ...init, body: JSON.stringify(body) } : init;
}

/**
 * Salty's voice yield: her mind pauses less while her voice renders.
 *
 * ☠️ HER MIND WAS SPENDING A THIRD OF EVERY REPLY WAITING FOR HER VOICE.
 * On the ROG (Shaun talking, 27 Oct, GPU) VFL_MIND_CADENCE showed
 * voiceYieldMs at 1.4–6.2 s of each 6–12 s decode (median 3.1 s), with
 * 2–9 stalls over 250 ms and gaps up to 2.6 s: her voice finished its
 * tiny first chunk (5–15 chars) long before the mind, held back by the
 * yield, produced the next sentence, so silence fell between her first
 * few words. Veridity's yield (250/400 ms, 8 s budget) suits a mind
 * that writes at ~8 pieces/s; Salty writes at ~3.4 with the yield and
 * ~5.2 without it, so the same cushion starves her. These gentler
 * numbers (hold only below 150 ms banked, release at 250 ms, at most
 * 3 s per turn) keep a cushion against Pocket underruns while letting
 * her stay ahead of her voice. The thin prime itself is untouched.
 *
 * Second pass (same evening, Shaun: "still slightly too much gap
 * sometimes") was tried at 100/200/1500 and REJECTED the same evening:
 * Shaun heard crackle, and the log agreed - underrun events 3 (before)
 * -> 9 (these numbers) -> 23 in 23 utterances (tighter), margins near
 * 100 ms. A glitching voice is worse than a gap (see the prime history
 * in app.js), so these numbers stand. The remaining first-words gap is
 * the opener's job (SALTY_FIRST_WORDS), not the yield's.
 */
export const SALTY_VOICE_YIELD = Object.freeze({ low: 150, high: 250, budget: 3000 });

/**
 * Salty's first spoken chunk: four words, not two.
 *
 * ☠️ "I CAN (BIG GAP) HEAR YOU LOUD AND CLEAR" (Shaun, live, 27 Oct).
 * Veridity's opener starts her voice after 2 words because her mind
 * writes at ~8 pieces/s and the rest lands while she talks. Salty
 * writes at ~half that (pass-2 log: FIRSTCHUNK "I", -b1 textLen 5 =
 * "I can", next chunk heard 1.9 s later, while the mind's own biggest
 * gap was down to 439 ms). Two words is ~0.5 s of speech; the remainder
 * of her sentence is not ready when it ends. Four words ("I can hear
 * you") roughly doubles what her voice holds before it needs the mind
 * again, at the cost of two more decoded pieces before her first
 * sound. An explicit owner dial (0 = opener off) still wins.
 */
export const SALTY_FIRST_WORDS = 4;

/** The first-words count for a Salty turn, from Veridity's dialled one. */
export function saltyFirstWordsWant(dialled) {
  return dialled > 0 ? Math.max(dialled, SALTY_FIRST_WORDS) : dialled;
}

/** Gives a voice-first turn Salty's yield. Null/other shapes pass through. */
export function applySaltyVoiceYield(voiceFirst) {
  if (voiceFirst && voiceFirst.yield) voiceFirst.yield = { ...SALTY_VOICE_YIELD };
  return voiceFirst;
}

/**
 * What the wake line says when Salty is the mind. Veridity's line names
 * Gemma; in Salty's own app that is someone else's name on her door
 * (seen in the chat log on boot, 28 Oct). The Gemma line itself is
 * passed in and returned untouched when she is not the mind.
 */
export const SALTY_WAKE_LINE = "Her local mind is awake — Salty, built with Llama, running on this phone, no cloud, no key.";

/** The wake line for whichever mind is loaded. */
export function wakeLineForSalty(saltyActive, gemmaLine) {
  return saltyActive ? SALTY_WAKE_LINE : gemmaLine;
}

/**
 * Salty's mind does no side jobs: every background request is answered
 * "deferred" at mindFetch, before it reaches the engine.
 *
 * ☠️ A SIDE JOB COST HIM A 6.8 s REPLY (run-salty-shaun-3, 27 Oct). Veridity's
 * quiet work (follow-up plans, quiet beats, memory distillation, photo
 * verdicts, radio choices) borrows the one mind session. One of them was
 * mid-decode (9 s, bg=true) when he spoke; the cancel left
 * BACKGROUND_RESTORE_FAILED, the session fell back to her persona, and his
 * next turn re-prefilled the whole 4011-char conversation: ttft 6777 ms
 * against a ~1.2 s median. Nothing those jobs produce reaches Salty anyway:
 * her prompt drops every system message and strips every "(…)" note
 * (adaptMessages), which is where their results ride. "background-deferred"
 * is the mind's own "not now" answer; every caller already treats it as
 * "try again on a later pass", so nothing is lost or mistaken for an answer.
 */
export function saltyDefersBackgroundJob(path, init) {
  if (path !== "/completion" || !init || typeof init.body !== "string") return false;
  try { return JSON.parse(init.body)?.background === true; } catch { return false; }
}

/** The mind's own "not now" reply, made at the page so the engine stays free. */
export function saltyDeferredResponse() {
  return new Response(JSON.stringify({ content: "", cancelled: false, cancel_reason: "background-deferred",
    deferred_by: "salty" }), { status: 200, headers: { "Content-Type": "application/json" } });
}

/** Display and speech both pass through here. `line` is app.js crisisLine(). */
export function guardSaltyText(text, line) {
  if (typeof text !== "string" || !text) return text;
  return guardHelplineNumbers(text, line).text;
}

/**
 * The voice plugin, with every text she speaks passed through the guard.
 *
 * ☠️ speakStreaming receives her reply in pieces. A phone number never spans a
 * sentence break, and the pieces are cut at sentence and clause ends, so a
 * number arrives whole in one piece. If the chunking ever changes to cut
 * mid-clause, a number could be split across two calls and slip through: guard
 * the joined text instead.
 */
/**
 * Her cartoon voice (Shaun's SaltyVibes reference: excited, high, bright).
 * A fixed pitch lift on every chunk she speaks; the native side resamples,
 * which also shrinks the apparent vocal tract — wrong for a human voice,
 * right for a tiny axolotl. Clamped at the native 1.25 ceiling.
 */
export const SALTY_VOICE_PITCH = 1.14;
export function saltyVoicePitch(asked) {
  const base = Number.isFinite(asked) && asked > 0 ? asked : 1;
  return Math.min(1.25, Math.max(1, base * SALTY_VOICE_PITCH));
}

export function wrapVoiceForSalty(voice, line) {
  if (!voice) return voice;
  levelSource = typeof voice.playbackLevel === "function" ? voice : null;
  return new Proxy(voice, {
    get(target, prop) {
      const value = target[prop];
      if (typeof value !== "function") return value;
      if (prop === "speakStreaming") {
        return (options, ...rest) => {
          const guarded = options && typeof options.text === "string"
            ? { ...options, text: guardSaltyText(options.text, line), pitch: saltyVoicePitch(options.pitch) } : options;
          // Her mouth plan is the guarded words she is about to actually say.
          if (guarded && typeof guarded.text === "string") speechQueue.push(...saltySpeechVisemes(guarded.text));
          return trackVoiceCall(value.call(target, guarded, ...rest));
        };
      }
      if (prop === "synthesize") {
        return (options, ...rest) => value.call(target,
          options && typeof options.text === "string" ? { ...options, text: guardSaltyText(options.text, line) } : options,
          ...rest);
      }
      return value.bind(target);
    },
  });
}

/**
 * Whether her voice is actually making sound, for her mouth in the tank.
 *
 * ☠️ HER MOUTH KEPT TALKING THROUGH THE SILENCES (Shaun, 28 Oct). The tank read
 * Veridity's "aoede-speaking" class, which stays on for the whole reply, so
 * while her mind was still writing the next sentence her mouth flapped at
 * nothing. Each spoken chunk is one speakStreaming call, and the native side
 * resolves it only once the playback head has drained every sample
 * (LocalVoicePlugin finishUtterance), so "a call is in flight" is "a chunk is
 * playing or about to". Sound starts one prime after the call (firstAudioMs
 * 343–468 ms on the ROG), hence the lead; the grace stops the mouth snapping
 * shut between two chunks that play back to back. synthesize() is not counted:
 * it renders without playing (her voice warm-up).
 */
export const SALTY_MOUTH_LEAD_MS = 300;
export const SALTY_MOUTH_GRACE_MS = 200;
let voiceCalls = 0;
let sounding = false;
const soundingListeners = new Set();
let soundingTimer = null;

/**
 * Her mouth follows the sound itself when the phone can say how loud it is.
 *
 * ☠️ A CHUNK IN FLIGHT STILL HAS PAUSES IN IT (Shaun, 28 Oct, watching the Day 2
 * video: "her mouth keeps moving between sentences or during a pause"). One
 * speakStreaming chunk can hold a full stop, a comma and a breath, and the next
 * chunk is already queued, so "a call is in flight" stayed true through all of
 * them. LocalVoicePlugin.playbackLevel() reads the playback monitor's 20 ms
 * envelope at the live head (the same envelope her ears use for echo), so the
 * mouth opens on her voice and shuts in the quiet. Open above OPEN, shut after
 * QUIET_MS under CLOSE (her soft consonants sit between the two). An older
 * native build without the method falls back to the in-flight rule above.
 */
// ☠️ 60 ms polling + a 150 ms quiet rule shut her mouth at every comma and breath, and the
// tank held her body still each time: the Day 2 take 2 recording froze her 12-21 times per
// answer. It also ran a bridge call (logged by Capacitor) every 60 ms beside her voice
// synthesis, and her voice margin fell to ~80 ms with 3 underruns (clicks) in 14 chunks.
// 100 ms polling; only a real break (400 ms) shuts her mouth.
export const SALTY_MOUTH_POLL_MS = 100;
export const SALTY_MOUTH_LEVEL_OPEN = 0.02;
export const SALTY_MOUTH_LEVEL_CLOSE = 0.01;
export const SALTY_MOUTH_QUIET_MS = 400;
let levelSource = null;
let levelBroken = false;
let levelPolling = false;
let levelOpen = false;
let quietSince = 0;
let voiceLevel = 0;

/** Her voice level right now (the playback monitor's RMS envelope, 0 when quiet). The 3D tank's mouth reads this. */
export function saltyVoiceLevel() { return voiceLevel; }

/**
 * Her words as mouth shapes, in speaking order: one viseme per syllable, so the
 * 3D mouth articulates what she is actually saying instead of cycling random
 * vowels. Shapes are the face morphs the model has: a (open), e (wide-ish),
 * i (wide smile), o (round open), u (small round), f (teeth-ish, small wide),
 * closed (lips together, for b/p/m and short gaps), pause (sentence break).
 *
 * Syllables are vowel groups. A syllable starting on b/p/m gets a closed beat
 * first (her lips really do shut for those), one starting on f/v gets an f.
 * Pure and exported for the test suite: the queue below is only plumbing.
 */
export function saltySpeechVisemes(text) {
  const out = [];
  const tokens = String(text || "").toLowerCase().match(/[a-z']+|[.!?]+|[,;:]+/g) || [];
  for (const tok of tokens) {
    if (/^[.!?]/.test(tok)) { out.push("pause"); continue; }
    if (/^[,;:]/.test(tok)) { out.push("closed"); continue; }
    const word = tok.replace(/'/g, "");
    const groups = [...word.matchAll(/ee|ea|ie|ei|oo|oa|ow|ou|oi|oy|au|aw|ay|ey|[aeiouy]/g)];
    if (!groups.length) { if (word.length > 1) out.push("closed"); continue; }
    let prevEnd = 0;
    for (const g of groups) {
      const onset = word.slice(prevEnd, g.index);
      const tail = onset.slice(-1);
      if (tail && "bmp".includes(tail)) out.push("closed");
      else if (tail && "fv".includes(tail)) out.push("f");
      const v = g[0];
      out.push(/^(ee|ie|ei|i|y)/.test(v) ? "i" : /^(ea|e)/.test(v) ? "e"
        : /^(oo|u)/.test(v) ? "u" : /^a/.test(v) ? "a" : "o");
      prevEnd = g.index + v.length;
    }
    if (/[bmp]$/.test(word)) out.push("closed");
  }
  return out;
}

let speechQueue = [];
/** The next mouth shape for her speech, or null when the plan is used up. The 3D mouth asks once per syllable. */
export function saltyNextSpeechViseme() { return speechQueue.length ? speechQueue.shift() : null; }
/** Mouth shapes still queued for her current speech (test visibility). */
export function saltySpeechVisemesLeft() { return speechQueue.length; }

const levelMode = () => levelSource !== null && !levelBroken;

async function pollLevel() {
  if (levelPolling) return;
  levelPolling = true;
  try {
    while (levelMode() && (voiceCalls > 0 || levelOpen)) {
      let r = null;
      try { r = await levelSource.playbackLevel(); } catch { r = null; }
      if (!r || typeof r.level !== "number") { levelBroken = true; setSounding(voiceCalls > 0); break; }
      const level = r.active ? r.level : 0;
      voiceLevel = level;
      const now = Date.now();
      if (level >= SALTY_MOUTH_LEVEL_OPEN) { levelOpen = true; quietSince = 0; }
      else if (level < SALTY_MOUTH_LEVEL_CLOSE || voiceCalls === 0) {
        if (!quietSince) quietSince = now;
        if (now - quietSince >= SALTY_MOUTH_QUIET_MS) levelOpen = false;
      }
      setSounding(levelOpen);
      await new Promise((res) => setTimeout(res, SALTY_MOUTH_POLL_MS));
    }
  } finally {
    levelPolling = false;
    voiceLevel = 0;
  }
}

function setSounding(next) {
  if (next === sounding) return;
  sounding = next;
  for (const fn of soundingListeners) { try { fn(sounding); } catch { /* a listener never stops her voice */ } }
}

function settleSounding(delayMs) {
  clearTimeout(soundingTimer);
  if (levelMode()) return;
  soundingTimer = setTimeout(() => setSounding(voiceCalls > 0), delayMs);
}

/** Counts one spoken chunk from call to drained; the promise itself is returned untouched. */
export function trackVoiceCall(promise) {
  if (!promise || typeof promise.then !== "function") return promise;
  voiceCalls++;
  if (levelMode()) pollLevel();
  else if (!sounding) settleSounding(SALTY_MOUTH_LEAD_MS);
  const done = () => { voiceCalls = Math.max(0, voiceCalls - 1); if (voiceCalls === 0) speechQueue = []; if (voiceCalls === 0) settleSounding(SALTY_MOUTH_GRACE_MS); };
  promise.then(done, done);
  return promise;
}

/** Calls fn(true|false) when her voice starts or stops making sound. Returns the unsubscribe. */
export function onSaltyVoiceSounding(fn) {
  soundingListeners.add(fn);
  return () => soundingListeners.delete(fn);
}

/** Her voice is making sound right now. */
export function saltyVoiceSounding() { return sounding; }

/**
 * What the tank's mic leg does when pressed: "stop" or "mic", from the shell classes Veridity
 * already shows.
 *
 * ☠️ THE LEG STARTED THE MIC WHILE SHE WAS TALKING. It read "turn-active" alone, which covers a
 * turn (admitted, thinking, speaking, and a room introduction, which holds the speech latch) but not
 * a Replay of her last reply or a file clip, and Stop (stopHerVoice) stops those too. Pressed during
 * a replay, the leg opened the mic over her voice instead of stopping her. app.js publishes
 * "stop-armed" from the same predicate stopHerVoice acts on (herStopScope); "turn-active" stays as
 * the fallback for early paint.
 */
export function saltyLegAction(classes) {
  const has = (name) => Boolean(classes?.contains?.(name));
  return has("turn-active") || has("stop-armed") ? "stop" : "mic";
}
