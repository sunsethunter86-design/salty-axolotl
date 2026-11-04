// MUSEick (Salty's music studio): the composer, the validator, and the rules that read words.
//
// Node only, no audio, no DOM: everything that decides WHAT plays. What it sounds like is
// checked by ear and by offline level renders on the device (docs/museick/TEST_LOG.md).
// The last block breaks things on purpose: a check that has never been seen red is not a check.

import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const load = (f) => import(pathToFileURL(resolve(here, "../public/museick", f)).href);
const T = await load("museick-theory.mjs");
const P = await load("museick-plan.mjs");
const C = await load("museick-compose.mjs");

const fails = [];
const ok = (cond, what) => { if (!cond) fails.push(what); };
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`${what}\n    got  ${JSON.stringify(a)}\n    want ${JSON.stringify(b)}`); };
const song = (brief, seed = 7) => C.compose(P.planFromBrief(brief, seed).plan);
const inScale = (plan, midi) => {
  const steps = T.MODES[plan.key.mode];
  const pc = (((midi - plan.key.tonic) % 12) + 12) % 12;
  return steps.includes(pc);
};
const COMPETITION = "Salty, make me a dark electronic rock track with massive drums, dirty bass and an enormous melodic chorus.";

// 1. Same words, same seed: the same notes, every time.
eq(C.compile(song(COMPETITION, 99)).events, C.compile(song(COMPETITION, 99)).events, "composition is deterministic");
ok(JSON.stringify(C.compile(song(COMPETITION, 1)).events) !== JSON.stringify(C.compile(song(COMPETITION, 2)).events), "a new seed gives a new song");

// 2. Every genre and mood composes a valid, complete 30-75 s song.
for (const genre of Object.keys(P.GENRES)) {
  for (const mood of P.MOODS) {
    for (const seed of [1, 2, 3]) {
      const plan = P.validatePlan({ ...P.defaultPlan(seed), genre, mood, tracks: undefined, seed }).plan;
      const g = P.GENRES[genre];
      plan.tracks.drums.style = g.drums[0]; plan.tracks.drums.sound = g.drums[1];
      plan.tracks.bass.style = g.bass[0]; plan.tracks.bass.sound = g.bass[1];
      plan.tracks.chords.style = g.chords[0]; plan.tracks.chords.sound = g.chords[1];
      plan.tracks.lead.style = g.lead[0]; plan.tracks.lead.sound = g.lead[1];
      plan.bpm = Math.round((g.bpm[0] + g.bpm[1]) / 2); plan.sections = P.sectionsFor(plan.bpm, plan.energy);
      const s = C.compose(plan);
      const errs = C.validateSong(s);
      ok(errs.length === 0, `${genre}/${mood}/${seed}: ${errs.slice(0, 3).join("; ")}`);
      const c = C.compile(s);
      ok(c.seconds >= 30 && c.seconds <= 75, `${genre}/${mood}: ${c.seconds.toFixed(1)} s is outside 30-75 s`);
      // 3. Harmony: lead and bass stay in the key; chords too, bar the raised leading tone of a minor V.
      for (const e of c.events) {
        if (e.tr === "lead" || e.tr === "bass") ok(inScale(s.plan, e.midi), `${genre}/${mood}: ${e.tr} note ${e.midi} out of ${T.keyName(s.plan.key)}`);
        if (e.tr === "chords") {
          const off = e.midis.filter((m) => !inScale(s.plan, m));
          const leading = (s.plan.key.tonic + 11) % 12;
          ok(off.every((m) => s.plan.harmonicV && ((m % 12) + 12) % 12 === leading), `${genre}/${mood}: chord ${e.midis} has ${off} out of key`);
        }
      }
      ok(c.sections.map((x) => x.id).join() === "intro,groove,build,drop,outro", `${genre}: sections`);
    }
  }
}

// 4. The competition brief reads as asked.
{
  const { plan, decisions } = P.planFromBrief(COMPETITION, 5);
  eq([plan.genre, plan.mood], ["electro-rock", "dark"], "brief: genre and mood");
  eq(plan.tracks.drums.sound, "heavy", "brief: massive drums -> heavy kit");
  eq(plan.tracks.bass.sound, "dirty", "brief: dirty bass");
  ok(plan.chorusBoost >= 1, "brief: enormous melodic chorus -> bigger drop");
  ok(decisions.some((d) => d.field === "genre" && d.source === "you"), "brief: genre decision credited to his words");
  ok(decisions.some((d) => d.field === "key" && d.source === "engine"), "brief: key decision credited to the studio");
  ok(["minor", "phrygian"].includes(plan.key.mode), "brief: dark is a minor mode");
}
{
  const { plan } = P.planFromBrief("a chill lofi beat in D minor at 82 bpm", 5);
  eq([plan.genre, plan.mood, plan.key, plan.bpm], ["lofi", "chill", { tonic: 2, mode: "minor" }, 82], "brief: key and tempo by name");
}

// 5. Revisions make real changes to the music, not just to words.
const base = song(COMPETITION, 11);
const baseC = C.compile(base);
const revise = (words) => {
  const ops = P.parseRevision(words);
  const { plan, changes, regen } = P.applyOps(base.plan, ops, "you");
  const next = C.recompose(base, plan, [...regen]);
  return { ops: ops.map((o) => o.op), changes, next, c: C.compile(next), errs: C.validateSong(next) };
};
const count = (c, f) => c.events.filter(f).length;
const secOf = (c, id) => c.sections.find((s) => s.id === id);
const inSec = (c, id) => (e) => { const s = secOf(c, id); return e.step >= s.start && e.step < s.start + s.bars * 16; };
{
  const r = revise("Make the drums heavier.");
  eq(r.ops, ["drumsUp"], "rev drums: op");
  ok(r.next.plan.tracks.drums.intensity > base.plan.tracks.drums.intensity || base.plan.tracks.drums.intensity === 1, "rev drums: intensity up");
  ok(count(r.c, (e) => e.tr === "drums") >= count(baseC, (e) => e.tr === "drums"), "rev drums: no fewer hits");
  ok(r.errs.length === 0, `rev drums: valid (${r.errs})`);
}
{
  const r = revise("Give the bass more groove.");
  eq(r.ops, ["bassGroove"], "rev groove: op");
  eq(r.next.plan.tracks.bass.style, "groove", "rev groove: syncopated bass style");
  ok(JSON.stringify(r.next.clips.bass) !== JSON.stringify(base.clips.bass), "rev groove: bass notes changed");
  ok(r.next.plan.swing > base.plan.swing, "rev groove: swing added");
}
{
  const r = revise("Make the melody darker.");
  eq(r.ops, ["leadDarker"], "rev darker melody: op");
  const avg = (c) => { const l = c.events.filter((e) => e.tr === "lead"); return l.reduce((a, e) => a + e.midi, 0) / l.length; };
  ok(avg(r.c) < avg(baseC), `rev darker melody: lead lower (${avg(r.c).toFixed(1)} vs ${avg(baseC).toFixed(1)})`);
  ok(r.next.plan.key.mode !== "major", "rev darker melody: not major");
}
{
  const r = revise("Add more energy to the chorus.");
  eq(r.ops, ["chorusUp"], "rev chorus: op");
  ok(secOf(r.c, "drop").energy >= secOf(baseC, "drop").energy, "rev chorus: drop energy not lower");
  ok(r.next.plan.chorusBoost === base.plan.chorusBoost + 1, "rev chorus: boost +1");
  ok(count(r.c, (e) => e.tr === "lead" && e.double && inSec(r.c, "drop")(e)) > 0, "rev chorus: lead doubled in the drop");
}
{
  const r = revise("Slow it down.");
  eq(r.ops, ["slower"], "rev slow: op");
  ok(r.next.plan.bpm < base.plan.bpm && r.c.seconds > baseC.seconds, "rev slow: lower BPM, longer song");
}
{
  const r = revise("Make the ending dramatic.");
  eq(r.ops, ["endingDramatic"], "rev ending: op");
  const last = r.c.totalSteps - 16;
  ok(r.c.events.some((e) => e.kind === "impact" && e.step === last), "rev ending: a final impact on the last bar");
  ok(!r.c.events.some((e) => e.kind === "fade"), "rev ending: no fade");
}
eq(P.parseRevision("make the chorus more powerful").map((o) => o.op), ["chorusUp"], "rev: 'chorus more powerful'");
eq(P.parseRevision("what a lovely day").length, 0, "rev: small talk changes nothing");

// 6. The validator repairs a bad plan and says what was wrong.
{
  const { ok: good, errors, plan } = P.validatePlan({ ...P.defaultPlan(3), bpm: 500, genre: "polka", key: { tonic: 13, mode: "minor" } });
  ok(!good && errors.some((e) => e.startsWith("bpm")) && errors.some((e) => e.startsWith("genre")) && errors.some((e) => e.startsWith("key")), `validator flags bpm, genre, key: ${errors}`);
  ok(plan.bpm === 180 && P.GENRES[plan.genre] && plan.key.tonic <= 11, "validator repairs bpm, genre, key");
  ok(P.validatePlan(P.defaultPlan(3)).ok, "validator passes a default plan");
}

// 7. Salty's part: her title, her push, never through a negation; her note stays short.
eq(P.titleFromReply('Ooh, let\'s call it "Pressure Drop" and make the chorus huge!'), "Pressure Drop", "title from her quotes");
eq(P.titleFromReply("I love it, let's go!"), "", "no quotes, no title");
eq(P.opsFromReply("Let's call it “Abyss”. I'd make the chorus bigger.").map((o) => o.op), ["chorusUp"], "her push is read");
eq(P.opsFromReply("I wouldn't make it slower. It's perfect.").length, 0, "a negated push is ignored");
// Her first real reply on the phone (3 Nov, NPU): one push, the chorus; "dark drop" describes, it doesn't ask.
eq(P.opsFromReply("\"Echo Chamber\" - I'd push for a bigger chorus, a soaring, anthemic hook that hits right after the dark drop, leaving the listener wanting more.").map((o) => o.op),
  ["chorusUp"], "her phone reply: bigger chorus only");
eq(P.titleFromReply("\"Echo Chamber\" - I'd push for a bigger chorus"), "Echo Chamber", "her phone reply: title");
eq(P.opsFromReply("Let's make the melody darker and moodier.").map((o) => o.op), ["leadDarker"], "a comparative mood push still counts");
// Her first reply on the phone under the three-idea note (3 Nov, build 6): the countermelody, and nothing from across the full stop.
eq(P.opsFromReply("\"Neon Graveyard\". I'd push for the countermelody answering the hook, something that takes the hook and makes it the main event, and then drops right into the chorus. Big enough to make it sound like the whole city is singing with you.").map((o) => o.op),
  ["counter"], "her phone reply: the countermelody only");
eq(P.opsFromReply("Mute the drums and solo the bass!").length, 0, "she can't mute or solo his tracks");
{
  const note = P.studioNoteFor("brief", base.plan);
  ok(note.length < 420, `brief note is short (${note.length} chars)`);
  ok(!/[()]/.test(note), "note has no brackets (adaptMessages wraps it in its own)");
  ok(P.studioNoteFor("rev", base.plan, [{ field: "drums", value: "heavier" }]).length < 200, "revision note is short");
}

// 8. A brief vs a change.
ok(P.isNewBrief("make me a house track", false), "first words make a song");
ok(!P.isNewBrief("Make the drums heavier", true), "a change is not a new song");
ok(P.isNewBrief("make me a new song, something chill", true), "'new song' is a new song");

// 10. His words: a request changes the song; praise, description, questions about it, negations
// and if-clauses about outcomes do not.
const opsOf = (w) => P.parseRevision(w).map((o) => o.op);
for (const [words, want] of [
  ["Make the melody darker", "leadDarker"],
  ["Give the bass more movement", "bassMove"],
  ["Make the drums heavier", "drumsUp"],
  ["Build more tension before the drop", "tensionUp"],
  ["Give it a stronger hook", "hookUp"],
  ["Less busy", "lessBusy"],
  ["Make the ending more dramatic", "endingDramatic"],
  ["It's too busy", "lessBusy"],
  ["What if the drums were heavier?", "drumsUp"],
  ["Can you add a countermelody?", "counter"],
  ["The bass should move more", "bassMove"],
  ["Love it, now make the bass dirtier", "bassDirty"],
  ["Salty, add a breakdown", "breakdown"],
  ["Surprise me", "surprise"],
  ["Try some new chords", "chordsNew"],
  ["Add more fills", "fillsMore"],
  ["Harmonise the hook", "harmony"],
  ["Give it more atmosphere", "texture"],
  ["Change up the drum groove", "drumsVary"],
  ["make the drums heavier and slow it down", "drumsUp,slower"],
]) {
  const got = opsOf(words);
  for (const w of want.split(",")) ok(got.includes(w), `"${words}" should ask for ${w} (got ${got})`);
}
eq(opsOf("Build more tension before the drop").includes("chorusUp"), false, "tension before the drop is not a bigger drop");
eq(opsOf("Give it a stronger hook").includes("chorusUp"), false, "a stronger hook is the melody, not the drop");
for (const words of [
  "The dark drop sounds good", "I love the heavier drums", "Are the drums heavy enough?", "Should the drums be heavier?",
  "If the drums were heavier it would be too much", "Don't slow it down", "That hook is so catchy", "The bass has great movement",
  "Wow, what a build", "I don't want it darker", "The chorus is huge", "nice, the breakdown works",
]) eq(opsOf(words), [], `"${words}" changes nothing`);
eq(P.isInstruction("Heavier drums!"), true, "a comparative fragment is a request");
eq(P.isInstruction("I love the heavier drums"), false, "praise is not a request");

// 10b. What he is doing, read before any keyword counts (audit, 4 Nov). See BUILD10_INTENT_DESIGN.md.
const readBoth = (w) => [P.readIntent(w, { hasSong: true }), P.readIntent(w, { hasSong: false })];
const changedNothing = (r) => r.intent !== "new" && r.ops.length === 0;
// Ordinary talk: no song, no change, with a song loaded or not. Every sentence here broke Build 9 or the first patch.
for (const w of [
  "I'm feeling darker lately", "Faster than I expected", "Slower day today", "Give me a minute", "Make me a sandwich", "Start the car", "Build me a shed", "My house is a mess",
  "I like rock climbing", "My pop is sick", "What do you do", "I do love you", "Do you want to go for a walk", "Play with me", "Can you give me a hand", "My car won't start again",
  "I had to start over at work", "Make sure you track my parcel", "Make a piece of toast", "Give my mate a tune-up on his ute", "Write down that track number", "Another song I love is that Paul Kelly one",
  "That's a different track to the one we walked", "We walked a different track yesterday", "New song from Paul Kelly is great", "Make the room darker", "Make my day brighter", "Make dinner faster",
  "Could you be quicker", "You should go slower", "I'm too busy", "You're too slow", "It's too dark in here", "It's too bright outside", "Work is too busy", "That movie was too dark", "I need a faster car", "I need to slow down",
  "I need a breakdown of my bills", "Can you give me a breakdown of the costs", "We need more space in the shed", "It should be faster by now", "Go faster, we're late", "Slow down, you're talking too fast",
  "Let's make tracks", "Too easy", "Too right", "Heavy as", "Dark as", "Fast as lightning", "More room in the back", "Rap on the door", "Rave about it", "Knock it off", "Dial it in", "Top track", "Start over with the painting", "Make something for lunch",
]) { const [L, E] = readBoth(w); ok(changedNothing(L), `"${w}" changes nothing with a song loaded (${L.intent}, ${L.ops.map((o) => o.op)})`); ok(E.intent !== "new", `"${w}" starts no song in an empty studio`); ok(!P.isNewBrief(w, false) && !P.isNewBrief(w, true), `isNewBrief agrees on "${w}"`); eq(P.parseRevision(w), [], `parseRevision agrees on "${w}"`); }
// Questions, negation and sarcasm never change anything.
for (const w of [
  "Is it too dark?", "Should it be darker", "Too busy?", "Do you make songs", "A new song?", "You into house music?", "Darker or brighter?", "Faster or slower?", "Can you hear the bass",
  "Try not adding a breakdown", "Don't make it darker", "I don't want a new song", "It's not too dark", "Not darker", "No breakdown please", "Don't start again", "Stop making it darker", "It doesn't need more reverb",
  "Oh great, more drums", "Yeah right, make it darker, that'll fix it", "Because that's what it needed, more reverb", "Great, another new song, just what I needed", "Good one, make the drums louder why don't you",
]) { const [L, E] = readBoth(w); ok(changedNothing(L), `"${w}" changes nothing (${L.intent})`); ok(E.intent !== "new", `"${w}" starts no song`); }
// A new song: in both states.
for (const w of [
  "Create a dark cinematic soundtrack", "Make me a song", "Write a song about my dog", "Can you make me a synthwave track", "Let's make some music", "I want a new song", "I'd love a chill lo-fi track", "How about a new song",
  "Time for a new track", "New song", "Another track", "Start over", "Let's start from scratch", "Start over with a techno beat", "Scrap it and make me a house track", "Put the kettle on and make me a track",
  "Make me a dark electronic rock track with massive drums, dirty bass and an enormous melodic chorus.", "Salty make me a dark synthwave track with a slow heavy beat and a haunting melody",
]) { const [L, E] = readBoth(w); eq(L.intent, "new", `"${w}" is a new song, song loaded`); eq(E.intent, "new", `"${w}" is a new song, empty studio`); }
// A description that could be either: a song when the studio is empty; with one loaded, she asks.
for (const w of ["Something chill", "Dark techno", "House music", "Lo-fi please", "Make something dark", "Play some techno", "Chill lo-fi beat for studying, in D minor.", "A sad song", "A dreamy underwater synthwave song.", "Start again", "A good song please"]) {
  const [L, E] = readBoth(w); eq(E.intent, "new", `"${w}" starts a song when empty`); ok(changedNothing(L) && L.newOrThis, `"${w}" asks first when a song is loaded`);
}
// The other way to say it: finalisation, 4 Nov. Each of these once fell through to talk, or to a needless question.
for (const [w, want] of [
  ["Set the tempo to 95", "bpm"], ["Drop the tempo a bit", "slower"], ["Take the reverb off the lead", "reverbDown"], ["Add some more tension going into the drop", "tensionUp"], ["I want the hook to be more memorable", "hookUp"],
  ["Add another layer on the melody", "harmony"], ["Not so much going on in the drop", "lessBusy"], ["No, I said darker", "darker"], ["Give the chorus a bit more lift", "chorusUp"], ["Swap the melody for something else", "leadNew"],
  ["Make the outro fade away", "endingFade"], ["Make the ending hit harder", "endingDramatic"], ["Make it sound more spacious", "reverbUp"], ["Take the drums out", "mute"], ["The kick needs more punch", "drumsUp"], ["no make it darker", "darker"],
]) { const r = P.readIntent(w); ok(r.ops.some((o) => o.op === want), `"${w}" asks for ${want} (got ${r.intent}: ${r.ops.map((o) => o.op)})`); ok(P.readIntent(w, { hasSong: false }).intent !== "new", `"${w}" starts no song`); }
for (const w of ["Can you compose a lullaby", "Could you put together a chill beat for me", "Make a new one, nice and dreamy", "Start again with something dark", "Let's come up with a new song"]) eq(P.readIntent(w).intent, "new", `"${w}" is a new song`);
// A question only when one is needed: "make it", "turn it", "that should" and a song noun don't ask for anything by themselves.
for (const w of ["Turn it over", "Turn it around", "Turn it inside out", "Make it a double", "Make it happen", "Make it snappy", "Top tune", "Decent track", "Old song", "Long song", "Stupid song", "That should do it", "That could be anything", "Lift it up", "Pump it up with air", "My mate said his song needs more bass"]) {
  const r = P.readIntent(w); ok(changedNothing(r), `"${w}" changes nothing (${r.intent}: ${r.ops.map((o) => o.op)})`); ok(!["clarify", "ambiguous", "feedback"].includes(r.intent), `"${w}" asks nothing (${r.intent})`);
}
// It may be the music, so she asks, and it changes nothing.
for (const [w, offer] of [["Take it down a bit", "energyDown"], ["Bring it up a notch", "energyUp"], ["Turn it down", "energyDown"], ["Turn it up", "energyUp"]]) { const r = P.readIntent(w); eq(r.intent, "ambiguous", `"${w}" may be the music`); eq(r.ops, [], `"${w}" changes nothing yet`); ok(r.offer.includes(offer), `"${w}" offers ${offer}`); }
for (const w of ["Can you fix the middle bit", "Try it another way", "It sounds like a toy piano", "The chorus is a letdown", "The intro takes forever", "This is way too noisy", "I can barely hear the melody", "Can't hear the drums", "Something's not quite right with the second half", "Great, now it sounds even worse", "I'm not really feeling the melody"]) {
  const r = P.readIntent(w); ok(["ambiguous", "clarify", "feedback"].includes(r.intent), `"${w}" gets a question (${r.intent})`); eq(r.ops, [], `"${w}" changes nothing`);
}
eq(P.readIntent("That was better before").offer, ["undo"], "liking it better before offers going back");
// From the first run of validation set V2 (4 Nov).
for (const w of ["Drop me a hip hop beat", "Let's do a heavy metal one", "I want you to write me a love song"]) eq(P.readIntent(w).intent, "new", `"${w}" is a new song`);
eq(P.readIntent("Give me a lofi beat to study to", { hasSong: false }).intent, "new", "a beat to study to");
for (const [w, want] of [["Slow the whole thing down a touch", "slower"], ["No I wanted it darker", "darker"], ["The bassline should be a lot dirtier", "bassDirty"], ["Give the hook more punch", "hookUp"], ["nah it's too busy take some out", "lessBusy"]]) ok(P.readIntent(w).ops.some((o) => o.op === want), `"${w}" asks for ${want} (got ${P.readIntent(w).intent}: ${P.readIntent(w).ops.map((o) => o.op)})`);
eq(P.readIntent("Put the old drums back").ops, [], "putting something back doesn't turn it down");
for (const [w, intent] of [["Take that last change out", "undo"], ["no not that go back", "undo"], ["Go from the start", "transport"]]) eq(P.readIntent(w).intent, intent, `"${w}" is ${intent}`);
for (const w of ["The melody's all over the place", "It's sounding pretty muddy", "Can you do something about the ending", "It needs a bit of work", "Just tweak it a little"]) { const r = P.readIntent(w); ok(["ambiguous", "clarify", "feedback"].includes(r.intent), `"${w}" gets a question (${r.intent})`); eq(r.ops, [], `"${w}" changes nothing`); }
{ const r = P.readIntent("Slow down, I can't keep up with you"); eq(r.intent, "chat", "a clause about people beside a bare slow down"); eq(r.offer, [], "and no offer"); }
// First words in an empty studio. With a song loaded, none of these replaces it without asking.
for (const w of ["Make me something new", "Let's make something new", "Make something cool", "Make me something cool", "Can you make me something cool", "Make me something good", "Make me something different", "Sing me a song", "Sing something", "Surprise me"]) eq(P.readIntent(w, { hasSong: false }).intent, "new", `"${w}" starts a song in an empty studio`);
for (const w of ["Make me something new", "Let's make something new", "Make something cool", "Make me something good", "Sing me a song", "Sing something"]) { const r = P.readIntent(w, { hasSong: true }); ok(r.intent !== "new" && r.ops.length === 0, `"${w}" asks with a song loaded (${r.intent})`); }
eq(P.readIntent("Mix it up a bit", { hasSong: false }).intent === "new", false, "in an empty studio there's nothing to mix up");
for (const w of ["Do something different", "I can sing a song", "She sang a song", "Sing along", "Make something for lunch", "Give me something good to read", "Make me something to eat", "Something different", "Try something different"]) ok(P.readIntent(w, { hasSong: false }).intent !== "new", `"${w}" starts no song`);
ok(/no track yet/.test(P.studioNoteFor("control", null, [], { what: "nosong" })), "no song is said, and she asks what to make");
// Spoken words often come with no commas: a request later in the words still counts, if it really starts there.
for (const [w, want] of [["love it just slow it down a bit", "slower"], ["cool now make it darker", "darker"], ["sorry i was on the phone can you add a breakdown", "breakdown"], ["it's getting dark outside make it brighter", "brighter"], ["faster it's dragging", "faster"], ["i love the hook now give the bass more movement", "bassMove"]]) {
  ok(P.readIntent(w).ops.some((o) => o.op === want), `"${w}" asks for ${want} (got ${P.readIntent(w).intent})`);
}
eq(P.readIntent("scrap that new track").intent, "new", "thrown away, with no comma: a new song");
eq(P.readIntent("forget this one make me a lo-fi track").intent, "new", "a new song later in the words");
for (const w of ["my boss told me to make it faster", "dad said make it louder or go home", "i'm not saying make it faster", "those curtains make it darker", "i told him to make the drums louder", "she wants to make the chorus bigger", "if you make it darker i'll leave", "the garage could use more room", "can we go faster we're late"]) { const r = P.readIntent(w); ok(changedNothing(r), `"${w}" changes nothing (${r.intent}: ${r.ops.map((o) => o.op)})`); }
// The way back from a change is the way back.
for (const [a, b] of [["faster", "slower"], ["darker", "brighter"], ["drumsUp", "drumsDown"], ["reverbUp", "reverbDown"], ["energyUp", "energyDown"], ["lessBusy", "busier"], ["bassDirty", "bassClean"], ["mute", "unmute"]]) { eq(P.OPPOSITE[a], b, `the other way from ${a}`); eq(P.OPPOSITE[b], a, `the other way from ${b}`); }
// The last change, and the speakers.
for (const [w, intent, control = ""] of [
  ["Undo that", "undo"], ["Actually, put it back how it was", "undo"], ["No no, go back to the old version", "undo"], ["no no go back to the old version", "undo"], ["Scratch that", "undo"], ["Change that back", "undo"], ["Revert", "undo"], ["Could you undo that", "undo"],
  ["Wrong way, go the other way", "reverse"], ["Not that one, the other way round", "reverse"], ["No, the other way", "reverse"], ["That's the wrong way", "reverse"], ["The opposite", "reverse"],
  ["Do that again", "repeat"], ["Do that one more time", "repeat"], ["And again", "repeat"], ["Same again", "repeat"], ["A bit more", "repeat"],
  ["Play it", "transport", "play"], ["Play it for me", "transport", "play"], ["Let's hear it", "transport", "play"], ["Hit play", "transport", "play"], ["Pause it a sec", "transport", "pause"], ["Stop the music", "transport", "stop"], ["Turn it off", "transport", "stop"],
  ["Play it from the top", "transport", "restart"], ["Start it again", "transport", "restart"], ["Can you play me the song again", "transport", "restart"], ["From the top", "transport", "restart"], ["I want to hear it again", "transport", "restart"],
]) { const r = P.readIntent(w); eq(r.intent, intent, `"${w}" is ${intent}`); eq(r.control || "", control, `"${w}" is ${control || "not playback"}`); eq(r.ops, [], `"${w}" changes no notes`); }
// None of these is a control, whatever words they share with one.
for (const w of ["Play nice with the other fish", "Play it safe", "Play it by ear", "Stop the car", "Don't stop the music", "Stop making it darker", "Go back to work", "Go back home", "We went the other way", "Can you hear it?", "I hear it", "Did you play it?", "Should I undo that?", "Again?", "Give it a minute and the rain'll stop", "Put it back in the fridge", "Stop it, you're cracking me up", "Go the other way, we're lost", "I did it again", "My back is killing me", "That's the wrong way to the shops"]) {
  const r = P.readIntent(w); ok(!["undo", "reverse", "repeat", "transport"].includes(r.intent), `"${w}" isn't a control (${r.intent})`); ok(changedNothing(r), `"${w}" changes nothing (${r.intent})`);
}
eq(P.readIntent("Undo that and make it darker").undoFirst, true, "undo beside a change: both");
eq(P.readIntent("Undo that and make it darker").ops.map((o) => o.op), ["darker"], "undo beside a change: the change");
eq(P.readIntent("Make it darker and play it").control, "play", "a change, then the speakers");
// A short whole answer, and only that. It means nothing unless something's on offer (the room's job).
for (const [w, a] of [["Yes", "yes"], ["Yeah", "yes"], ["Yes please", "yes"], ["Yep, do it", "yes"], ["Go on then", "yes"], ["Sure mate", "yes"], ["Please", "yes"], ["No", "no"], ["Nah", "no"], ["No thanks", "no"], ["Leave it", "no"], ["Nah, leave it", "no"], ["Not now", "no"], ["A new one", "new"], ["New song", "new"], ["This one", "this"], ["Change this one", "this"]]) eq(P.readIntent(w).answer, a, `"${w}" answers ${a}`);
for (const w of ["Yeah, I was just thinking that", "Yes but I'm tired", "No idea", "Right", "Thanks", "Yes it's raining", "Go on, tell me more", "Sure, why would I", "Nah I'm tired"]) eq(P.readIntent(w).answer, "", `"${w}" isn't an answer`);
eq(P.readIntent("What key are we in?").mentions, true, "naming the music: she's told plainly nothing changed");
eq(P.readIntent("How's the water?").mentions, false, "not naming the music: no note");
// ☠️ Harmony and countermelody handed over to each other for ever when a song had both, and the studio ran out of memory (found 4 Nov, also in Build 9).
{
  for (const genre of Object.keys(P.GENRES)) {
    const base = P.planFromBrief(`make me a ${P.GENRES[genre].label} track`, 7).plan;
    for (const list of [["counter"], ["harmony"], ["counter", "harmony"], ["surprise"], ["chorusUp"], ["slower"], ["faster"], ["drumsUp"], ["darker"], ["breakdown"], ["endingDramatic"], ["tensionUp"], ["hookUp"], ["energyUp"], ["energyDown"], ["drumsDown"], ["busier"], ["lessBusy"]]) {
      let plan = base;
      for (let i = 0; i < 14; i++) { const r = P.applyOps(plan, list.map((op) => ({ op, arg: true })), "you", { used: [], turn: i }); ok(r.changes.length < 12, `${list} doesn't run away on ${genre}, step ${i}`); plan = P.validatePlan(r.plan).plan; }
    }
  }
  const both = P.applyOps(P.applyOps(P.planFromBrief("make me a house track", 3).plan, [{ op: "counter", arg: true }, { op: "harmony", arg: true }], "you").plan, [{ op: "harmony", arg: true }], "you");
  ok(both.changes.length === 1 && both.changes[0].already, "asking for a third layer says it's already there");
}
// With the studio open, the room's background-audio commands don't take his words (4 Nov, phone: "Radio paused.").
{
  const { readFileSync, existsSync } = await import("node:fs");
  // The host app is private, so the public tree doesn't have this file.
  const appPath = resolve(here, "../public/app.js");
  if (existsSync(appPath)) {
    const app = readFileSync(appPath, "utf8");
    const fn = app.slice(app.indexOf("async function handlePostCrisisAudioCommand"));
    ok(fn.indexOf('document.querySelector(".st-studio")) return false') > 0 && fn.indexOf('document.querySelector(".st-studio")) return false') < fn.indexOf("ambienceController?.tryCommand"), "the studio comes before the background-audio commands");
  }
  const room = readFileSync(resolve(here, "../public/museick/museick-room.mjs"), "utf8");
  ok(room.includes('host.root.classList.add("st-studio")') && room.includes('host.root.classList.remove("st-studio")'), "the room marks itself open, and closed");
}
// Her questions come with a line to say, so she really puts them (4 Nov, phone).
{
  const plan = P.planFromBrief("make me a house track", 3).plan;
  const ask = (o) => P.studioNoteFor("ask", plan, [], o);
  ok(/"Want a brighter turn into major\?"/.test(ask({ ideas: [{ op: "brighter", label: "a brighter turn into major" }], about: "too dark", intent: "feedback" })), "a complaint's offer is put as a question");
  ok(/"Want lighter drums or less reverb\?"/.test(ask({ ideas: [{ label: "lighter drums" }, { label: "less reverb" }], about: "too loud", intent: "feedback" })), "two fixes are put as a choice");
  ok(/"A new one, or change this one\?"/.test(ask({ newOrThis: true, intent: "clarify" })), "new or this is put plainly");
  ok(/"What do you want done to it\?"/.test(ask({ intent: "clarify" })), "clarify gets a line");
  ok(/"Want a slower tempo\?"/.test(ask({ ideas: [{ label: "a slower tempo" }], intent: "ambiguous" })) && /reply as you normally would/.test(ask({ ideas: [{ label: "a slower tempo" }], intent: "ambiguous" })), "may-or-may-not leaves her free to just talk");
  for (const o of [{ newOrThis: true }, { intent: "clarify" }, { intent: "feedback", about: "x" }, { intent: "ambiguous" }]) ok(/nothing has changed/.test(ask(o)), "she's told nothing changed");
  ok(/already like that/.test(P.studioNoteFor("control", plan, [], { what: "alreadyThat" })), "a change that changes nothing is said");
  ok(/isn't playing/.test(P.studioNoteFor("control", plan, [], { what: "notPlaying" })), "nothing to stop is said");
}
// Her notes say what really happened.
const fullPlan = P.planFromBrief("make me a house track", 3).plan;
ok(/has not changed/.test(P.studioNoteFor("still", fullPlan)), "the still note says the track hasn't changed");
ok(!P.studioNoteFor("still", fullPlan).includes(P.planSummary(fullPlan)), "a remark isn't handed the summary to recite");
ok(P.studioNoteFor("still", fullPlan, [], { intent: "question" }).includes(P.planSummary(fullPlan)), "a question gets the truth about the track");
ok(/nothing to undo/.test(P.studioNoteFor("control", fullPlan, [], { what: "nothingToUndo" })), "nothing to undo is said");
ok(/no last change/.test(P.studioNoteFor("control", fullPlan, [], { what: "nothingToRepeat" })), "nothing to repeat is said");
ok(/no track yet/.test(P.studioNoteFor("control", null, [], { what: "nosong" })), "no song is said");
for (const what of ["undone", "playing", "restarted", "stopped"]) ok(!/\bnothing\b/i.test(P.studioNoteFor("control", fullPlan, [], { what })), `when something happened (${what}), the note doesn't say "nothing"`);
ok(/nothing has changed/.test(P.studioNoteFor("declined")), "a no is said");
ok(/nothing has changed/.test(P.studioNoteFor("which")) && /which/i.test(P.studioNoteFor("which")), "yes to a choice: she asks which");
ok(P.studioNoteFor("brief", fullPlan, [], { kept: "Abyss Engine" }).includes("Abyss Engine"), "she's told the last song is safe");
for (const op of ["slower", "faster", "drumsUp", "drumsDown", "drumsVary", "bassDirty", "bassClean", "bassMove", "bassGroove", "darker", "brighter", "dreamier", "texture", "hookUp", "chorusUp", "tensionUp", "breakdown", "counter", "harmony", "chordsNew", "fillsMore", "energyUp", "energyDown", "endingDramatic", "endingFade", "leadNew", "leadDarker", "lessBusy", "busier", "reverbUp", "reverbDown", "surprise", "undo"]) ok(P.opLabel(op) !== op, `${op} has a name he can read on a button`);
eq(P.opsFromReply("Less time to get into the groove. Do you want to get into the groove?").map((o) => o.op), [], "the word groove in her reply isn't a request");
for (const what of ["undone", "playing", "restarted", "stopped", "nothingToUndo", "nothingToRepeat", "nosong"]) ok(/Say something like ".+" to him, and no more\.$/.test(P.studioNoteFor("control", fullPlan, [], { what })), `a report turn gives her a line to say (${what})`);

// A change to this song.
for (const [w, want] of [
  ["Make the music darker", "darker"], ["Make the song faster", "faster"], ["Make this track slower", "slower"], ["Make the whole thing brighter", "brighter"], ["Make it less dark", "brighter"], ["Make it darker, like a funeral", "darker"],
  ["Darker, like a funeral", "darker"], ["Faster, it's dragging", "faster"], ["Would you mind making it darker", "darker"], ["Can ya speed it up a touch", "faster"], ["I reckon it should be darker", "darker"], ["I think it needs more tension", "tensionUp"],
  ["Why don't we add a countermelody", "counter"], ["What if we added a breakdown", "breakdown"], ["How about we slow it down", "slower"], ["Not so busy", "lessBusy"], ["No more reverb", "reverbDown"], ["Crank the drums", "drumsUp"], ["Pull the reverb back", "reverbDown"], ["Liven it up", "energyUp"],
  ["Slow the track down", "slower"], ["Get rid of the bass", "mute"], ["Less reverb in a bit", "reverbDown"], ["Countermelody", "counter"], ["Walking bass", "bassMove"], ["In A minor", "key"], ["120 bpm please", "bpm"],
]) {
  const [L, E] = readBoth(w);
  ok(L.ops.some((o) => o.op === want), `"${w}" asks for ${want} (got ${L.intent}: ${L.ops.map((o) => o.op)})`);
  ok(E.intent !== "new", `"${w}" starts no song in an empty studio`);
}
eq(P.readIntent("My day was long. Anyway, make the bass dirtier.").ops.map((o) => o.op), ["bassDirty"], "his life beside a request: only the request counts");
eq(P.readIntent("Don't touch the drums but make the bass dirtier").ops.map((o) => o.op), ["bassDirty"], "a negated clause beside a request");
eq(P.readIntent("Bigger drop, heavier kick, catchier hook").ops.map((o) => o.op), ["chorusUp", "drumsUp", "hookUp"], "one clause's overlap rules don't cross clauses");
eq(P.readIntent("Slow it down in a bit").ops.some((o) => o.op === "key"), false, "'in a bit' is not the key of A");
// Criticism: an obvious small fix is made; a taste call is offered; with no single fix she asks. Never the opposite.
for (const [w, fix] of [["Too busy", "lessBusy"], ["It's too fast", "slower"], ["This is too slow", "faster"], ["The drums are too loud", "drumsDown"], ["The bass is too dirty", "bassClean"], ["Not fast enough", "faster"], ["The chorus isn't big enough", "chorusUp"], ["Too much reverb", "reverbDown"]]) {
  const r = P.readIntent(w); eq(r.intent, "feedback", `"${w}" is feedback`); eq(r.ops.map((o) => o.op), [fix], `"${w}" is fixed by ${fix}`);
}
for (const [w, fix] of [["It's too dark", "brighter"], ["Too dark", "brighter"], ["Too bright", "darker"], ["It's too bright", "darker"], ["It's not dark enough", "darker"], ["Too fast for my liking", "slower"]]) {
  const r = P.readIntent(w); eq(r.intent, "feedback", `"${w}" is feedback`); eq(r.ops, [], `"${w}" changes nothing yet`); ok(r.offer.includes(fix), `"${w}" offers ${fix}`);
}
for (const w of ["Too loud", "Too quiet", "Too repetitive", "Too boring", "It's boring", "Bit samey", "The chorus is weak", "I don't like the drums", "It's missing something", "The chorus doesn't hit"]) {
  const r = P.readIntent(w); eq(r.intent, "feedback", `"${w}" is feedback`); eq(r.ops, [], `"${w}" changes nothing`);
}
// Ambiguous or incomplete: nothing changes.
for (const w of ["Slow down", "Slow down mate", "Speed up", "Maybe faster", "Perhaps less reverb", "It's a bit dark", "Bit busy eh", "Make it better", "Fix it", "Change it", "Drums", "The chorus", "Bigger", "Add some", "Make it pop", "Something different"]) {
  const [L, E] = readBoth(w); ok(["ambiguous", "clarify", "feedback"].includes(L.intent), `"${w}" is unclear (${L.intent})`); eq(L.ops, [], `"${w}" changes nothing`); ok(E.intent !== "new", `"${w}" starts no song`);
}
ok(P.readIntent("Slow down mate").offer.includes("slower"), "an ambiguous tempo word offers the tempo change");
// Opposites at once are never applied.
eq(P.readIntent("Make it darker and make it brighter").ops, [], "opposites together change nothing");
eq(P.readIntent("Make it darker and make it brighter").intent, "clarify", "opposites together: she asks which");
// Everything the room's own buttons send still works.
for (const [w, want] of [["Make the drums heavier", "drumsUp"], ["Give it a stronger hook", "hookUp"], ["Build more tension before the drop", "tensionUp"], ["Give the bass more movement", "bassMove"], ["Make the chorus more powerful", "chorusUp"], ["Less busy", "lessBusy"], ["Make the melody darker", "leadDarker"], ["Make the ending more dramatic", "endingDramatic"]]) {
  ok(P.readIntent(w).ops.some((o) => o.op === want), `room button "${w}" still asks for ${want}`);
}
// Her note says nothing changed, stays short, and has no brackets.
{
  const asks = [
    P.studioNoteFor("ask", base.plan, [], { intent: "feedback", about: "too dark", ideas: [{ op: "brighter", label: P.opLabel("brighter") }] }),
    P.studioNoteFor("ask", base.plan, [], { intent: "clarify", about: "make it better" }),
    P.studioNoteFor("ask", base.plan, [], { intent: "ambiguous", about: "slow down", ideas: [{ op: "slower", label: P.opLabel("slower") }] }),
    P.studioNoteFor("ask", base.plan, [], { newOrThis: true }),
  ];
  for (const n of asks) { ok(/nothing has changed/i.test(n), `the note says nothing changed: ${n}`); ok(n.length < 260, `ask note is short (${n.length})`); ok(!/[()]/.test(n), "ask note has no brackets"); }
}

// 10c. Salty's nine real phone replies read exactly as they did.
for (const [where, text, title, want] of [
  ["pass1 brief (Echo Chamber)", "\"Echo Chamber\" - I'd push for a bigger chorus, a soaring, anthemic hook that hits right after the dark drop, leaving the listener wanting more.", "Echo Chamber", ["chorusUp"]],
  ["pass1 brief (Glass Reef)", "\"Glass Reef\". I'd push for a bigger chorus, something big and soaring that catches the listener in the gut, and then lets them sink back down into the dream.", "Glass Reef", ["chorusUp"]],
  ["pass1 revision", "Bigger drums, bigger bass, and the chorus is now a bloody wall, with the hook hitting right after the drop, so it never gets lost.", "", []],
  ["b6 brief (Neon Graveyard)", "\"Neon Graveyard\". I'd push for the countermelody answering the hook, something that takes the hook and makes it the main event, and then drops right into the chorus. Big enough to make it sound like the whole city is singing with you.", "Neon Graveyard", ["counter"]],
  ["b6 revision (old note)", "The hook's been doubled, third above, and that's a big one. I'll keep the walking bass moving between the chords, give it a bit of tension and release, and then the drop hits. The drums come in on beat, but with a sub that moves like a heartbeat, making the whole thing feel like you're swimming through the wreck with a ghost in your pocket.", "", ["bassMove","tensionUp"]],
  ["b7 revision", "The hook's been turned into a bloody anthem, and I'm fine with it. Is it time to take the build down a peg and see what happens with a few spare pads, or do I just ride it into the depths?", "", ["breakdown"]],
  ["b8 brief (Underwater Paradise)", "\"Underwater Paradise\". I'd push the break, give it about 16 bars of nothing but the hook and the pads, and then the build comes in like a dolphin on a jet ski, and the whole thing just lifts off. I'm starving right now, and I'm going to eat all the sandwiches.", "Underwater Paradise", ["breakdown"]],
  ["b8 revision", "Great. Less busy is a great look. I love it. Do you want to try the breakdown with just the pads and the hook, or a catchier hook that repeats?", "", ["breakdown","hookUp"]],
  ["b8 idea accepted", "Ah, you've turned me into a producer. I love it. Lead stronger hook, and nothing else changed. That's a bold move, and I want to see it. If you want to try a breakdown, the pads and the hook work, or a walking bassline that moves between the chords. What do you think?", "", ["breakdown","bassMove"]],
]) {
  eq(P.titleFromReply(text), title, `real reply ${where}: title`);
  eq(P.opsFromReply(text).map((o) => o.op), want, `real reply ${where}: what she asked for`);
}

// 11. Every accepted revision is a measurable change to the notes, and each move does what it says.
const SONGS = [COMPETITION, "a chill lofi beat for studying", "happy house tune", "dreamy synthwave", "epic cinematic trailer music", "fast drum and bass"].map((b, i) => song(b, 100 + i));
// The notes and their timing: a tempo change is a real change even when the note list is the same.
const evs = (c) => JSON.stringify([c.stepSec, c.events]);
const applyTo = (s, ops) => { const { plan, changes, regen } = P.applyOps(s.plan, ops, "you"); const next = C.recompose(s, plan, [...regen]); return { next, c: C.compile(next), changes, errs: C.validateSong(next) }; };
for (const op of ["bassMove", "tensionUp", "hookUp", "lessBusy", "busier", "breakdown", "counter", "harmony", "chordsNew", "fillsMore", "texture", "drumsVary", "surprise", "endingDramatic", "drumsUp", "chorusUp", "leadDarker", "bassGroove", "slower"]) {
  for (const s of SONGS) {
    const r = applyTo(s, [{ op, arg: true }]);
    ok(r.changes.length > 0, `${op} on ${s.plan.genre}: no change recorded`);
    ok(evs(r.c) !== evs(C.compile(s)), `${op} on ${s.plan.genre}: the notes did not change`);
    ok(r.errs.length === 0, `${op} on ${s.plan.genre}: ${r.errs.slice(0, 2)}`);
  }
}
{
  const s = SONGS[0], c0 = C.compile(s);
  const sec = (c, id) => c.sections.find((x) => x.id === id);
  const inS = (c, id, e) => { const x = sec(c, id); return e.step >= x.start && e.step < x.start + x.bars * 16; };
  const less = applyTo(s, [{ op: "lessBusy" }]);
  ok(less.c.events.length < c0.events.length * 0.92, `less busy: ${less.c.events.length} vs ${c0.events.length} events`);
  const ten = applyTo(s, [{ op: "tensionUp" }]);
  const b = sec(ten.c, "build");
  ok(b.bars === sec(c0, "build").bars + 4, "tension: build 4 bars longer");
  const gap = ten.c.events.filter((e) => e.tr !== "fx" && e.step >= b.start + b.bars * 16 - 4 && e.step < b.start + b.bars * 16);
  eq(gap.length, 0, "tension: the beat before the drop is silent");
  ok(ten.c.events.every((e) => e.tr === "fx" || !e.dur || e.step + e.dur <= b.start + b.bars * 16 - 4 || e.step >= b.start + b.bars * 16 || e.step < b.start), "tension: nothing rings into the gap");
  const brk = applyTo(s, [{ op: "breakdown" }]);
  const bb = sec(brk.c, "build");
  eq(brk.c.events.filter((e) => e.tr === "drums" && e.step >= bb.start && e.step < bb.start + (bb.bars / 2) * 16).length, 0, "breakdown: no drums in the build's first half");
  ok(brk.c.events.some((e) => e.tr === "lead" && inS(brk.c, "build", e)), "breakdown: the hook plays in it");
  const ctr = applyTo(s, [{ op: "counter" }]);
  ok(ctr.c.events.filter((e) => e.counter).length >= 8, "counter: a countermelody appears");
  ok(ctr.c.events.filter((e) => e.counter).every((e) => inScale(ctr.next.plan, e.midi)), "counter: in key");
  const har = applyTo(s, [{ op: "harmony" }]);
  ok(har.c.events.some((e) => e.harm) && har.c.events.filter((e) => e.harm).every((e) => inScale(har.next.plan, e.harm) && e.harm > e.midi), "harmony: a third above, in key");
  const hk = applyTo(s, [{ op: "hookUp" }]);
  const drop = hk.next.clips.lead.drop.notes;
  const bar = (k) => drop.filter((n) => n.s >= k * 16 && n.s < k * 16 + 16).map((n) => [n.s - k * 16, n.p, n.d]);
  eq(bar(2), bar(0), "stronger hook: the hook comes back note for note");
  const walk = applyTo(s, [{ op: "bassMove" }]);
  eq(walk.next.plan.tracks.bass.style, "walk", "bass movement: walking bass");
  ok(walk.next.clips.bass.groove.notes.some((n) => n.ap), "bass movement: passing notes into the next chord");
  const ch = applyTo(s, [{ op: "chordsNew" }]);
  ok(JSON.stringify(C.progressionFor(ch.next.plan)) !== JSON.stringify(C.progressionFor(s.plan)), "new chords: a different progression");
  const tx = applyTo(s, [{ op: "texture" }]);
  ok(tx.c.events.some((e) => e.kind === "air"), "atmosphere: the air wash plays");
  const fl = applyTo({ ...s, plan: { ...s.plan, arr: { ...s.plan.arr, fills: false } } }, [{ op: "fillsMore" }]);
  ok(fl.c.events.filter((e) => e.kind === "tom" || (e.kind === "snare" && e.v > 0.6)).length > 0, "fills: fills appear");
  // Already maxed: still a real change, and it says so.
  let m = s;
  for (let i = 0; i < 4; i++) m = applyTo(m, [{ op: "drumsUp" }]).next;
  const maxed = applyTo(m, [{ op: "drumsUp" }]);
  ok(maxed.changes.some((c) => c.already), "heavier at full weight: says it was already maxed");
  ok(evs(maxed.c) !== evs(C.compile(m)), "heavier at full weight: still changes the music");
}

// 12. Every arrangement move together, in every style: valid, in key, sensible length.
for (const genre of Object.keys(P.GENRES)) {
  const base = P.planFromBrief(`a ${P.GENRES[genre].label} track`, 9).plan;
  const plan = { ...base, arr: Object.fromEntries(P.ARR_KEYS.map((k) => [k, true])), chorusBoost: 2, ending: "dramatic" };
  plan.sections = P.sectionsFor(plan.bpm, plan.energy, true);
  plan.tracks = { ...plan.tracks, lead: { ...plan.tracks.lead, hook: 1 }, bass: { ...plan.tracks.bass, style: "walk" } };
  const s = C.compose(plan);
  const errs = C.validateSong(s);
  ok(errs.length === 0, `${genre} with every move: ${errs.slice(0, 2)}`);
  const c = C.compile(s);
  ok(c.seconds <= 90, `${genre} with every move: ${c.seconds.toFixed(1)} s`);
  for (const e of c.events) {
    if ((e.tr === "lead" || e.tr === "bass") && !inScale(s.plan, e.midi)) { fails.push(`${genre}: ${e.tr} ${e.midi} out of key`); break; }
    if (e.harm && !inScale(s.plan, e.harm)) { fails.push(`${genre}: harmony ${e.harm} out of key`); break; }
  }
}
// Songs saved before this pass open unchanged: no arr, no progVariant, no lead.hook.
{
  const old = structuredClone(base.plan);
  delete old.arr; delete old.progVariant; delete old.tracks.lead.hook;
  const v = P.validatePlan(old);
  ok(v.plan.arr && v.plan.progVariant === 0 && v.plan.tracks.lead.hook === 0, "an old saved song opens with every new move off");
}

// 13. Salty's ideas: fitted to the song, not dominated by one, never in a fixed order, and every
// idea the studio offers can be read back from her reply.
{
  const BRIEFS = ["dark electronic rock", "chill lofi", "happy house", "dreamy synthwave", "epic cinematic", "drum and bass", "dark techno", "trap beat", "ambient drone", "catchy pop song"];
  const offered = {}, first = {}, last = {};
  let slots = 0;
  for (const b of BRIEFS) for (let seed = 1; seed <= 6; seed++) {
    const plan = P.planFromBrief(b, seed * 77).plan;
    const ideas = P.ideasFor(plan, { seed: seed * 13 });
    eq(ideas.length, 3, `${b}/${seed}: three ideas`);
    for (const i of ideas) { offered[i.op] = (offered[i.op] || 0) + 1; slots++; ok(i.fits(plan), `${b}: offered ${i.op}, which the song already has`); }
    first[ideas[0].op] = (first[ideas[0].op] || 0) + 1;
    last[ideas[2].op] = (last[ideas[2].op] || 0) + 1;
  }
  const share = (m) => Math.max(...Object.values(m)) / Object.values(m).reduce((a, b) => a + b, 0);
  ok(Object.keys(offered).length >= 9, `ideas offered: only ${Object.keys(offered).length} kinds`);
  ok(share(offered) < 0.2, `one idea takes ${(share(offered) * 100).toFixed(0)}% of offered slots`);
  ok(share(first) < 0.3 && share(last) < 0.3, `position bias: first ${(share(first) * 100).toFixed(0)}%, last ${(share(last) * 100).toFixed(0)}%`);
  ok(!("chorusUp" in last) || last.chorusUp / 60 < 0.15, "a bigger chorus is not the usual last option any more");
  // What she already pushed isn't offered again while there are others.
  const plan = P.planFromBrief(COMPETITION, 5).plan;
  const used = P.ideasFor(plan, { seed: 1 }).map((i) => i.op);
  const again = P.ideasFor(plan, { seed: 2, used }).map((i) => i.op);
  ok(again.every((op) => !used.includes(op)), `ideas already used come back: ${again} vs ${used}`);
  for (const idea of P.IDEAS) eq(P.opsFromReply(`"Tide Engine". I'd push for ${idea.label}, it'll hit so hard.`).map((o) => o.op).includes(idea.op), true, `her reply naming "${idea.label}" reads as ${idea.op}`);
  const note = P.studioNoteFor("brief", plan, [], { ideas: P.ideasFor(plan, { seed: 3 }) });
  ok(note.length < 520 && !/[()]/.test(note), `brief note with ideas: ${note.length} chars`);
  ok(P.ideasFor(plan, { seed: 3 }).every((i) => note.includes(i.label)), "the note names the three ideas");
  ok(!/or a bigger chorus\.$/.test(note), "the note no longer ends on a bigger chorus");
  const rev = P.studioNoteFor("rev", plan, [{ field: "build", value: "more tension" }], { ideas: P.ideasFor(plan, { seed: 4, n: 2 }) });
  ok(/That's all that changed\./.test(rev) && /ask him if he wants to try .+ next\.$/.test(rev), "a change note says nothing else changed and asks, not tells");
  // Her offer, phrased as the note asks, still reads back as her idea.
  eq(P.opsFromReply("Ooh, that build is mean. Want to try a walking bassline that moves between the chords next?").map((o) => o.op), ["bassMove"], "her offered idea is read from a question");
  // Her phone reply to "Give it a stronger hook" (build 7): the breakdown, in her own words.
  eq(P.opsFromReply("The hook's been turned into a bloody anthem, and I'm fine with it. Is it time to take the build down a peg and see what happens with a few spare pads, or do I just ride it into the depths?").map((o) => o.op),
    ["breakdown"], "her paraphrase of the breakdown reads as the breakdown");
  // Build 8 on the phone: her brief pick in her own words, and two offers kept in her order.
  eq(P.opsFromReply("\"Underwater Paradise\". I'd push the break, give it about 16 bars of nothing but the hook and the pads, and then the build comes in like a dolphin on a jet ski, and the whole thing just lifts off.").map((o) => o.op)[0],
    "breakdown", "her 'push the break… nothing but the hook and the pads' is the breakdown");
  eq(P.opsFromReply("Great. Less busy is a great look. Do you want to try the breakdown with just the pads and the hook, or a catchier hook that repeats?").map((o) => o.op),
    ["breakdown", "hookUp"], "two offers keep the order she said them in");
}

// 9. Seen red: the checks catch broken songs.
{
  const bad = structuredClone(base);
  bad.clips.drums.drop.notes.push({ s: 99, d: 1, p: 0, v: 0.9 });
  ok(C.validateSong(bad).some((e) => /outside clip/.test(e)), "validateSong catches a note outside its clip");
  const bad2 = structuredClone(base);
  bad2.clips.lead.groove.notes.push({ s: 3, d: 2, p: 60, v: 0.9 });
  ok(C.validateSong(bad2).some((e) => /out of range/.test(e)), "validateSong catches an unplayable note");
  const bad3 = structuredClone(base);
  for (const id of P.SECTION_IDS) bad3.clips.bass[id].notes = [];
  ok(C.validateSong(bad3).some((e) => /bass: silent/.test(e)), "validateSong catches a silent track");
  const bad4 = structuredClone(base);
  bad4.plan.sections[3].bars = 60;
  ok(C.validateSong(bad4).length > 0, "validateSong catches an over-long song");
}

if (fails.length) {
  console.error(`museick_test: ${fails.length} FAILED`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("museick_test: OK (composer, validator, brief and revision rules, Salty's title and push, seen red)");
