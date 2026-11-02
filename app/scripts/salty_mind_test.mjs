// Salty (hackathon, Meta Llama): the prompt she gets, and the words she says.
//
// ☠️ SHE WAS TRAINED ON ONE EXACT PROMPT. These cases pin that every request
// shape the page sends reaches her as: her one system prompt, then plain turns.
// A guard that has never been seen red is not a guard; mutations at the end.

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const MOD = resolve(here, "../public/salty-mind.mjs");
const GUARD = resolve(here, "../public/helpline-guard.mjs");
const AU = { name: "Lifeline", tel: "13 11 14", emergency: "000" };

const PERSONA = "You are Veridity. ".repeat(50);
const SITUATION = "It is a quiet Tuesday evening in Adelaide.";
const RECALL = "[recall] He mentioned his dog Biscuit last week.";

async function run(m) {
  const fails = [];
  const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`${what}\n    got  ${JSON.stringify(a)}\n    want ${JSON.stringify(b)}`); };

  // Model detection: only Llama files switch her on.
  for (const [name, want] of [["Llama-3.2-3B-Salty-v6b_int4_b32_emb8_c4096.litertlm", true],
    ["llama-3.2-3b-instruct.litertlm", true], ["gemma-4-E4B-it-fp32.litertlm", false],
    ["gemma-4-E2B-it-mind-fp32.litertlm", false], ["", false], [undefined, false]]) {
    if (m.isSaltyModel(name) !== want) fails.push(`isSaltyModel(${name}) should be ${want}`);
  }

  // A full Veridity-shaped chat request.
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    request_id: "r1", n_predict: 120,
    messages: [
      { role: "system", content: PERSONA },
      { role: "user", content: "hey" },
      { role: "assistant", content: "Oh, look who's back." },
      { role: "system", content: SITUATION },
      { role: "system", content: RECALL },
      { role: "user", content: `the printer jammed again\n\n(You know without checking that it is Tue 27 Oct, 6:02 pm; it stays in the background.)\n\n(${"She feels wry."})` },
    ] }) };
  const out = m.adaptMindRequestForSalty(init);
  const body = JSON.parse(out.body);
  eq(body.messages, [
    { role: "system", content: m.SALTY_SYSTEM },
    { role: "user", content: "hey" },
    { role: "assistant", content: "Oh, look who's back." },
    { role: "user", content: "the printer jammed again" },
  ], "chat request: one Salty system prompt, plain turns, notes stripped");
  eq([body.request_id, body.n_predict], ["r1", 120], "other request fields survive");
  eq(out.headers, init.headers, "headers survive");
  if (!m.SALTY_SYSTEM.startsWith("Cutting Knowledge Date: December 2023\n\nYou are Salty,")) fails.push("SALTY_SYSTEM must match the training render");

  // Prefix stability: the same history adapts to the same bytes every time (KV cache reuse).
  if (m.adaptMindRequestForSalty(init).body !== out.body) fails.push("adaptation is not deterministic");

  // His own parentheses are his words: only trailing "\n\n(…)" notes go.
  eq(m.stripSituationNotes("I (finally) fixed it"), "I (finally) fixed it", "inline parentheses kept");
  eq(m.stripSituationNotes("done (sort of)"), "done (sort of)", "own trailing bracket without a blank line kept");
  eq(m.stripSituationNotes("hi\n\n(note one)\n\n(note two)"), "hi", "stacked notes stripped");

  // Rewind route: the situation head is dropped, his lead is stripped, an empty system stays empty.
  const turn = JSON.parse(m.adaptMindRequestForSalty({ body: JSON.stringify({
    nextTurn: { system: SITUATION, userLead: "ok\n\n(It is late.)", closeTurn: true } }) }).body);
  eq(turn.nextTurn, { system: "", userLead: "ok", closeTurn: true }, "turn head adapted");
  const idle = { body: JSON.stringify({ nextTurn: { system: "", userLead: "" } }) };
  if (JSON.parse(m.adaptMindRequestForSalty(idle).body).nextTurn.system !== "") fails.push("empty turn system must stay empty");

  // Requests with no messages pass through untouched.
  const health = { method: "GET" };
  if (m.adaptMindRequestForSalty(health) !== health) fails.push("bodiless request must pass through as-is");
  const prompt = { body: JSON.stringify({ prompt: "raw", n_predict: 70 }) };
  if (m.adaptMindRequestForSalty(prompt) !== prompt) fails.push("raw-prompt request must pass through as-is");

  // Speech: every text she speaks is guarded; other calls and fields untouched.
  const said = [];
  const voice = { speakStreaming: async (o) => { said.push(o.text); return { frames: 1, seq: o.seq }; },
    synthesize: async (o) => { said.push(o.text); return { path: "x" }; }, stopSpeaking: async () => "stopped", ready: true };
  const wrapped = m.wrapVoiceForSalty(voice, AU);
  const r = await wrapped.speakStreaming({ text: "Ring 1800 656 463 now.", voice: "Ava", seq: 7 });
  await wrapped.synthesize({ text: "Call 000 132 237.", voice: "Ava" });
  if (said.some((t) => /1800 656 463|000 132 237/.test(t))) fails.push(`voice heard a fake number: ${JSON.stringify(said)}`);
  if (!said.every((t) => t.includes("13 11 14"))) fails.push(`voice missing the real line: ${JSON.stringify(said)}`);
  if (r.seq !== 7) fails.push("speakStreaming result or options lost");
  if ((await wrapped.stopSpeaking()) !== "stopped" || wrapped.ready !== true) fails.push("other voice members must pass through");

  // Display text guard.
  if (/656/.test(m.guardSaltyText("Call 1800 656 463", AU))) fails.push("display text kept a fake number");

  // Voice yield: Salty's gentler numbers replace Veridity's; prime and chunking untouched.
  const vf = { primeMs: 240, chunkFrames: 2, yield: { low: 250, high: 400, budget: 8000 } };
  eq(m.applySaltyVoiceYield(vf), { primeMs: 240, chunkFrames: 2, yield: { low: 150, high: 250, budget: 3000 } },
    "salty voice yield replaces only the yield");
  if (m.applySaltyVoiceYield(null) !== null) fails.push("null voice-first must pass through");
  if (m.SALTY_VOICE_YIELD.high < m.SALTY_VOICE_YIELD.low) fails.push("salty yield high must not sit below low");

  // Wake line: Salty's app names Salty; Gemma's line passes through untouched.
  eq(m.wakeLineForSalty(true, "GEMMA LINE"), m.SALTY_WAKE_LINE, "salty wake line when Salty is the mind");
  eq(m.wakeLineForSalty(false, "GEMMA LINE"), "GEMMA LINE", "Gemma wake line untouched otherwise");
  if (!/built with Llama/.test(m.SALTY_WAKE_LINE)) fails.push("salty wake line must carry the Built with Llama credit");

  // First words: Salty opens on four; Veridity's dial still wins when larger or off.
  eq([m.saltyFirstWordsWant(2), m.saltyFirstWordsWant(3), m.saltyFirstWordsWant(6), m.saltyFirstWordsWant(0)],
    [4, 4, 6, 0], "salty first-words floor of four, owner dial respected");

  // History window: 1..3 earlier exchanges plus his new message, moving in steps of 3.
  const chat = (n, endOnUser = true) => {
    const m = [{ role: "system", content: PERSONA }];
    for (let i = 0; i < n; i++) m.push({ role: "user", content: `q${i}` }, { role: "assistant", content: `a${i}` });
    if (endOnUser) m.push({ role: "user", content: `q${n}` });
    return m;
  };
  const kept = (n, endOnUser = true) => m.adaptMessages(chat(n, endOnUser)).filter((x) => x.role === "assistant").length;
  eq([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => kept(n)), [0, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1],
    "she keeps 1 to 3 earlier exchanges, stepping every 3");
  eq(m.adaptMessages(chat(7)).map((x) => x.content).slice(1), ["q6", "a6", "q7"], "the window keeps the newest exchanges");
  for (let n = 1; n < 12; n++) {
    const a = m.adaptMessages(chat(n)), b = m.adaptMessages(chat(n + 1));
    const prefix = JSON.stringify(a.slice(0, -1)), next = JSON.stringify(b.slice(0, a.length - 1));
    const step = m.saltyHistoryStart(n + 1) !== m.saltyHistoryStart(n);
    if (!step && prefix !== next) fails.push(`turn ${n + 1} must extend turn ${n}'s prompt (no step)`);
    if (b[0].content !== m.SALTY_SYSTEM) fails.push("every prompt still starts with her system prompt");
  }
  // The step is prepared when the reply that makes it due is saved: after exchanges 4, 7, 10.
  eq([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((n) => m.saltyWindowStepDue(n)), [4, 7, 10],
    "window step is due right after exchanges 4, 7 and 10");
  for (let n = 1; n < 12; n++) {
    const due = m.saltyWindowStepDue(n);
    const prepared = JSON.stringify(m.adaptMessages(chat(n, false)));
    const before = JSON.stringify(m.adaptMessages(chat(n - 1)).slice(0, -1));
    if (due && prepared.startsWith(before.slice(0, -1) + ",")) fails.push(`exchange ${n}: a due step must change the window`);
    if (!due && n > 1 && !prepared.startsWith(before.slice(0, -1))) fails.push(`exchange ${n}: no step means the window only grows`);
  }
  // A wake prewarm (history, no new message) renders the window the next turn extends.
  for (let n = 1; n < 10; n++) {
    const warm = JSON.stringify(m.adaptMessages(chat(n, false)));
    const turn = JSON.stringify(m.adaptMessages(chat(n)).slice(0, -1));
    if (warm !== turn) fails.push(`prewarm of ${n} exchanges must be the prefix of the next turn`);
  }

  // Side jobs: only a background /completion is deferred; his turns and everything else go through.
  const req = (body) => ({ method: "POST", body: JSON.stringify(body) });
  eq([m.saltyDefersBackgroundJob("/completion", req({ prompt: "p", background: true })),
    m.saltyDefersBackgroundJob("/completion", req({ prompt: "p", background: false })),
    m.saltyDefersBackgroundJob("/completion", req({ prompt: "p" })),
    m.saltyDefersBackgroundJob("/prewarm", req({ messages: [], background: true })),
    m.saltyDefersBackgroundJob("/completion", { method: "POST", body: "not json" }),
    m.saltyDefersBackgroundJob("/completion", null)],
  [true, false, false, false, false, false], "salty defers background /completion only");
  const deferred = await m.saltyDeferredResponse().json();
  eq([deferred.cancel_reason, deferred.cancelled, deferred.content], ["background-deferred", false, ""],
    "deferred reply is the mind's own not-now shape");

  // Mouth: moves only while a spoken chunk is in flight (after its prime), not between chunks,
  // and never for synthesize (her warm-up renders without playing).
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const seen = [];
  const off = m.onSaltyVoiceSounding((v) => seen.push(v));
  const ends = [];
  const fakeVoice = { speakStreaming: () => new Promise((r) => ends.push(r)), synthesize: () => new Promise((r) => ends.push(r)) };
  const mouthVoice = m.wrapVoiceForSalty(fakeVoice, AU);
  mouthVoice.synthesize({ text: "warm" });
  await wait(m.SALTY_MOUTH_LEAD_MS + 60);
  if (m.saltyVoiceSounding()) fails.push("synthesize must not move her mouth");
  ends.shift()();
  mouthVoice.speakStreaming({ text: "Right." });
  await wait(m.SALTY_MOUTH_LEAD_MS - 150);
  if (m.saltyVoiceSounding()) fails.push("mouth must wait for the prime before moving");
  await wait(210);
  if (!m.saltyVoiceSounding()) fails.push("mouth must move while a chunk plays");
  mouthVoice.speakStreaming({ text: "Next bit." });   // back to back: queued behind the first
  ends.shift()();
  await wait(m.SALTY_MOUTH_GRACE_MS + 60);
  if (!m.saltyVoiceSounding()) fails.push("mouth must keep moving while the next chunk plays");
  ends.shift()();
  await wait(m.SALTY_MOUTH_GRACE_MS + 60);
  if (m.saltyVoiceSounding()) fails.push("mouth must stop when no chunk is playing");
  eq(seen, [true, false], "one open and one close for two back-to-back chunks");
  off();

  // Mouth follows the sound when the phone reports it: shut in a pause inside a chunk.
  let lvl = 0, endLevelCall;
  const levelVoice = { speakStreaming: () => new Promise((r) => { endLevelCall = r; }),
    playbackLevel: async () => ({ active: true, established: true, level: lvl }) };
  const lv = m.wrapVoiceForSalty(levelVoice, AU);
  lv.speakStreaming({ text: "Nope. I live right here." });
  lvl = 0.05; await wait(200);
  if (!m.saltyVoiceSounding()) fails.push("mouth must open on her voice level");
  if (Math.abs(m.saltyVoiceLevel() - 0.05) > 0.001) fails.push("the 3D mouth must read her real voice level (saltyVoiceLevel)");
  lvl = 0.003; await wait(m.SALTY_MOUTH_QUIET_MS + 200);
  if (m.saltyVoiceSounding()) fails.push("mouth must shut in a pause inside a chunk");
  lvl = 0.05; await wait(200);
  if (!m.saltyVoiceSounding()) fails.push("mouth must reopen when her voice comes back");
  lvl = 0.015; await wait(m.SALTY_MOUTH_QUIET_MS + 200);
  if (!m.saltyVoiceSounding()) fails.push("a soft consonant must not shut her mouth");
  endLevelCall(); lvl = 0; await wait(m.SALTY_MOUTH_QUIET_MS + 250);
  if (m.saltyVoiceSounding()) fails.push("mouth must shut when the chunk is done");

  // Her words become her mouth shapes: one viseme per syllable, lips shut for b/p/m,
  // and the queue is hers alone (synthesize never speaks, a finished chunk clears it).
  eq(m.saltySpeechVisemes("Salty says hello."), ["a", "i", "a", "e", "o", "pause"],
    "visemes follow her actual syllables");
  eq(m.saltySpeechVisemes("Mum pops."), ["closed", "u", "closed", "closed", "o", "pause"],
    "lips close for m and p");
  eq(m.saltySpeechVisemes("oh wow"), ["o", "o"], "round vowels stay round");

  lv.speakStreaming({ text: "Salty says hello." });
  eq(m.saltySpeechVisemesLeft(), 6, "a spoken chunk queues its mouth shapes");
  eq([m.saltyNextSpeechViseme(), m.saltyNextSpeechViseme()], ["a", "i"],
    "mouth shapes come off the queue in speaking order");
  endLevelCall(); await wait(50);
  eq(m.saltySpeechVisemesLeft(), 0, "a finished chunk clears its leftover mouth shapes");

  // Worked-out facts: deterministic answers appended to arithmetic questions
  // so the 3B never has to do sums in her head; chat is never annotated.
  eq(m.saltyFacts("What's 17 times 23?"), "17 × 23 = 391", "multiplication is worked out");
  eq(m.saltyFacts("what is 391 + 1?"), "391 + 1 = 392", "addition is worked out");
  eq(m.saltyFacts("How much is 15% of 200?"), "15% of 200 = 30", "percentages are worked out");
  eq(m.saltyFacts("A train leaves at 3:40pm and the trip takes 2 hours 35 minutes. When does it arrive?"),
     "3:40pm + 2 hours 35 minutes = 6:15pm", "arrival times are worked out");
  eq(m.saltyFacts("Roughly how many kilometres is 5 miles?"), "5 miles = 8.0 km", "miles convert to kilometres");
  eq(m.saltyFacts("My dog is called Biscuit and he chased 2 cats today."), null, "ordinary chat gets no facts note");
  eq(m.saltyFacts("I have 2 dogs and 3 cats, aren't they cute?"), null, "numbers in passing get no facts note");
  const mathsTurn = JSON.parse(m.adaptMindRequestForSalty({ body: JSON.stringify({
    messages: [{ role: "user", content: "What's 17 times 23?" }] }) }).body);
  if (!mathsTurn.messages.at(-1).content.includes("= 391"))
    fails.push("adapted request must carry the worked-out answer");

  // Her cartoon voice: every spoken chunk gets the Salty pitch lift, clamped
  // at the native ceiling so she stays herself, only higher and brighter.
  const pitchCalls = [];
  const pv = m.wrapVoiceForSalty({ speakStreaming: (o) => { pitchCalls.push(o); return Promise.resolve(); } }, AU);
  pv.speakStreaming({ text: "Hi there!" });
  pv.speakStreaming({ text: "Hi again!", pitch: 1.05 });
  if (Math.abs(pitchCalls[0].pitch - m.SALTY_VOICE_PITCH) > 0.001)
    fails.push(`salty pitch lift missing: got ${pitchCalls[0].pitch}, want ${m.SALTY_VOICE_PITCH}`);
  if (Math.abs(pitchCalls[1].pitch - Math.min(1.25, 1.05 * m.SALTY_VOICE_PITCH)) > 0.001)
    fails.push(`salty pitch must multiply an asked pitch, clamped: got ${pitchCalls[1].pitch}`);

  // The tank's mic leg is her Stop whenever Stop would stop something: a turn
  // ("turn-active") or anything else Stop stops, a Replay included ("stop-armed").
  // Otherwise it is Start Mic. Pressed during a replay it used to open the mic.
  const shellWith = (...names) => ({ contains: (name) => names.includes(name) });
  for (const [names, want] of [[[], "mic"], [["mic-listening"], "mic"], [["aoede-speaking"], "mic"],
    [["turn-active"], "stop"], [["stop-armed"], "stop"], [["turn-active", "stop-armed"], "stop"]]) {
    eq(m.saltyLegAction(shellWith(...names)), want, `tank leg with shell [${names.join(" ")}]`);
  }
  eq(m.saltyLegAction(null), "mic", "tank leg with no shell");
  return fails;
}

const fails = await run(await import(pathToFileURL(MOD).href));

// Mutations must turn the suite red. The module imports the guard relatively, so
// mutants are written as data: modules with that import resolved to a file URL.
const src = readFileSync(MOD, "utf8").replace('"./helpline-guard.mjs"', JSON.stringify(pathToFileURL(GUARD).href));
const mutants = {
  "situation system kept": src.replace('if (!m || m.role === "system") continue;', "if (!m) continue;"),
  "notes not stripped": src.replace("content: stripSituationNotes(m.content)", "content: m.content"),
  "voice not guarded": src.replace("text: guardSaltyText(options.text, line)", "text: options.text"),
  "turn system kept": src.replace('next.system = ""; changed = true;', "changed = true;"),
  "salty yield not applied": src.replace("voiceFirst.yield = { ...SALTY_VOICE_YIELD }", "voiceFirst.yield = voiceFirst.yield"),
  "salty first words not floored": src.replace("Math.max(dialled, SALTY_FIRST_WORDS)", "dialled"),
  "wake line not switched": src.replace("return saltyActive ? SALTY_WAKE_LINE : gemmaLine;", "return gemmaLine;"),
  "side jobs not deferred": src.replace("return JSON.parse(init.body)?.background === true;", "return false;"),
  "his turns deferred too": src.replace('if (path !== "/completion" ||', "if ("),
  "deferred reply wrong shape": src.replace('cancel_reason: "background-deferred",', 'cancel_reason: "done",'),
  "mouth stays open after her voice": src.replace("if (voiceCalls === 0) settleSounding(SALTY_MOUTH_GRACE_MS);", ""),
  "mouth ignores the prime": src.replace("if (!sounding) settleSounding(SALTY_MOUTH_LEAD_MS);", "if (!sounding) setSounding(true);"),
  "history not capped": src.replace("return start > 0 ? turns.slice(userAt[start]) : turns;", "return turns;"),
  "window slides every turn": src.replace("return exchanges - 1 - ((exchanges - 1) % SALTY_HISTORY_STEP);", "return Math.max(0, exchanges - SALTY_HISTORY_STEP);"),
  "new message counted as history": src.replace("? userAt.length - 1 : userAt.length", "? userAt.length : userAt.length"),
  "window step never prepared": src.replace("return exchanges > 0 && saltyHistoryStart(exchanges) !== saltyHistoryStart(exchanges - 1);", "return false;"),
  "mouth ignores the voice level": src.replace("if (levelMode()) pollLevel();", "if (false) pollLevel();"),
  "3d mouth gets no level": src.replace("voiceLevel = level;", "voiceLevel = 0;"),
  "mouth never shuts in a pause": src.replace("if (now - quietSince >= SALTY_MOUTH_QUIET_MS) levelOpen = false;", ""),
  "mouth shuts on soft consonants": src.replace("else if (level < SALTY_MOUTH_LEVEL_CLOSE || voiceCalls === 0) {", "else {"),
  "mouth moves for synthesize": src.replace('if (prop === "speakStreaming") {', 'if (prop === "speakStreaming" || prop === "synthesize") {'),
  "speech plan ignores her words": src.replace("speechQueue.push(...saltySpeechVisemes(guarded.text));", ""),
  "mouth plan never consumed": src.replace("return speechQueue.length ? speechQueue.shift() : null;", "return speechQueue.length ? speechQueue[0] : null;"),
  "salty pitch not lifted": src.replace("pitch: saltyVoicePitch(options.pitch)", "pitch: options.pitch"),
  "facts note never appended": src.replace("content: `${trimmed[i].content}\\n\\n(Worked out for you: ${fact}.)`", "content: trimmed[i].content"),
  "leg starts the mic over a replay": src.replace('return has("turn-active") || has("stop-armed") ? "stop" : "mic";', 'return has("turn-active") ? "stop" : "mic";'),
  "leg starts the mic over a turn": src.replace('return has("turn-active") || has("stop-armed") ? "stop" : "mic";', 'return has("stop-armed") ? "stop" : "mic";'),
  "leg is always stop": src.replace('return has("turn-active") || has("stop-armed") ? "stop" : "mic";', 'return "stop";'),
};
for (const [name, code] of Object.entries(mutants)) {
  if (code === src) { fails.push(`mutation "${name}" did not apply (test is stale)`); continue; }
  const mf = await run(await import(`data:text/javascript,${encodeURIComponent(code)}`));
  if (!mf.length) fails.push(`mutation "${name}" was not caught`);
}

if (fails.length) {
  console.error(`salty_mind_test: ${fails.length} failure(s)`);
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
console.log(`salty_mind_test: OK (${Object.keys(mutants).length} mutations caught)`);
// Mutant pollers that never shut (by design of the mutation) would keep the process alive.
process.exit(0);
