// Salty hackathon: what she remembers about him between conversations (2 Nov).
//
// Her prompt keeps only her last few turns, and Veridity's own memory never reaches her (her prompt
// drops it), so every restart she met him for the first time. These are short notes kept on this
// phone only (localStorage in the app's own storage), captured from HIS words by plain rules, never
// written by her model: she once invented a recap, so nothing here is her guess. Two kinds:
//   facts   — "Their dog is called Biscuit." One per key, newest wins.
//   moments — his own sentence, quoted, from a turn that moved her (salty-moods.mjs).
// The tank loads them once per session and hands memoryPromptLine() to salty-mind.mjs, which puts it
// after her system prompt, so her held prefix stays the same all session. New notes reach her next session.

export const SALTY_MEMORY_KEY = "vfl.saltyMemory.v1";
export const SALTY_MEMORY_MAX_FACTS = 8;
export const SALTY_MEMORY_MAX_MOMENTS = 4;

const empty = () => ({ facts: [], moments: [] });

export function loadSaltyMemory(storage = globalThis.localStorage) {
  try {
    const m = JSON.parse(storage?.getItem(SALTY_MEMORY_KEY) || "null");
    if (m && Array.isArray(m.facts) && Array.isArray(m.moments)) return m;
  } catch { /* no storage or a broken record: start fresh */ }
  return empty();
}

export function saveSaltyMemory(mem, storage = globalThis.localStorage) {
  try { storage?.setItem(SALTY_MEMORY_KEY, JSON.stringify(mem)); return true; } catch { return false; }
}

export function forgetSaltyMemory(storage = globalThis.localStorage) {
  try { storage?.removeItem(SALTY_MEMORY_KEY); } catch { /* nothing kept anyway */ }
  return empty();
}

/** Removes one note (a fact by key, or a moment by its text). */
export function forgetSaltyNote(mem, id) {
  return { facts: mem.facts.filter((f) => f.key !== id), moments: mem.moments.filter((m) => m.text !== id) };
}

// Words that follow "my dog" but are not her name: "my dog nicked", "my dog is…".
const NOT_A_NAME = new Set(("is was has had just and got nicked ate stole the a an said says loves likes hates went came left "
  + "does did will can called named who that which keeps kept always never really also too here there his her its "
  + "my our your their one two old new little big"). split(" "));
const NAMING = String.raw`(?:'s name is|\s+is called|\s+called|\s+named|,)?\s+`;
const NAME = String.raw`([A-Za-z][A-Za-z'-]{1,20})`;
const PETS = "dog|cat|puppy|pup|kitten|budgie|parrot|cockatoo|bird|horse|rabbit|bunny|chook|goldfish|lizard|snake";
const PEOPLE = "wife|husband|partner|girlfriend|boyfriend|missus|son|daughter|mum|mom|dad|brother|sister|best mate|mate|boss|nan|nana|pop|grandma|grandpa";
const OBJECT_END = String.raw`(?=[.,!?;]|\s+(?:and|but|so|because|when)\b|$)`;

// A name must be capitalised as he wrote it, unless he said "called"/"named" outright: voice
// transcripts and quick typing lose capitals, and "my dog biscuit" alone is too easy to misread.
function nameFrom(match, wholeMatch) {
  const n = match;
  if (!n || NOT_A_NAME.has(n.toLowerCase())) return null;
  const explicit = /called|named|name is/i.test(wholeMatch);
  if (!explicit && !/^[A-Z]/.test(n)) return null;
  return n[0].toUpperCase() + n.slice(1);
}

/** Facts in one message of his, as [{ key, text }]. */
export function factsFromWords(words) {
  const t = String(words || "").slice(0, 400);
  const out = [];
  let m;
  if ((m = t.match(/\b(?:my name(?:'s| is)|call me|i'?m called)\s+([A-Za-z][A-Za-z'-]{1,20})\b/i))) {
    const n = nameFrom(m[1], "named");
    if (n) out.push({ key: "name", text: `Their name is ${n}.` });
  }
  for (const [re, kind] of [[new RegExp(String.raw`\bmy (${PETS})${NAMING}${NAME}\b`, "gi"), "pet"],
    [new RegExp(String.raw`\bmy (${PEOPLE})${NAMING}${NAME}\b`, "gi"), "person"]]) {
    for (const x of t.matchAll(re)) {
      const n = nameFrom(x[2], x[0]);
      if (n) out.push({ key: `${kind}:${x[1].toLowerCase()}`, text: `Their ${x[1].toLowerCase()} is called ${n}.` });
    }
  }
  // Case-sensitive on purpose: only a capitalised place counts ("I live in a van" is not a home).
  if ((m = t.match(/\b[Ii] live (?:in|at|near) ((?:[A-Z][a-z]+)(?:\s+[A-Z][a-z]+){0,2})/))) {
    out.push({ key: "home", text: `They live in ${m[1]}.` });
  }
  if ((m = t.match(new RegExp(String.raw`\bi work (as an?|as|at|for) ([a-z][a-z' -]{2,40}?)${OBJECT_END}`, "i")))) {
    out.push({ key: "work", text: `They work ${m[1].toLowerCase()} ${m[2].trim()}.` });
  }
  for (const x of t.matchAll(new RegExp(String.raw`\bi (love|really like|like|hate|can'?t stand) ([a-z][a-z' -]{2,40}?)${OBJECT_END}`, "gi"))) {
    const thing = x[2].trim();
    if (/^(it|that|this|you|them|him|her|to|doing|when|how|what|the way)\b/i.test(thing)) continue;
    const verb = x[1].toLowerCase().replace("cant", "can't");
    out.push({ key: `taste:${thing.toLowerCase()}`, text: `They ${verb} ${thing}.` });
  }
  return out;
}

// Never kept, never repeated back: a moment of crisis is not a memory for a cartoon to bring up.
const CRISIS = /\b(kill(ing)? myself|suicid|self[- ]?harm|hurt(ing)? myself|end it all|want to die|don'?t want to (live|be here))/i;

/**
 * Folds one message of his into her memory. `mood` is what salty-moods.mjs played for it:
 * outrage, sympathy or celebrate keep his sentence as a moment. Returns { mem, added }.
 */
export function captureFromWords(mem, words, { mood = null, now = Date.now() } = {}) {
  const t = String(words || "").trim();
  const added = [];
  if (!t || CRISIS.test(t)) return { mem, added };
  let facts = [...mem.facts], moments = [...mem.moments];
  for (const f of factsFromWords(t)) {
    const old = facts.find((x) => x.key === f.key);
    if (old && old.text === f.text) continue;
    facts = facts.filter((x) => x.key !== f.key);
    facts.push({ ...f, at: now });
    added.push(f.text);
  }
  if (facts.length > SALTY_MEMORY_MAX_FACTS) facts = facts.slice(-SALTY_MEMORY_MAX_FACTS);
  if (mood === "outrage" || mood === "sympathy" || mood === "celebrate") {
    const sentence = (t.match(/^[^.!?]*[.!?]?/)?.[0] || t).trim().slice(0, 140);
    if (sentence.length >= 8 && !moments.some((x) => x.text === sentence)) {
      moments.push({ text: sentence, at: now });
      added.push(`“${sentence}”`);
      if (moments.length > SALTY_MEMORY_MAX_MOMENTS) moments = moments.slice(-SALTY_MEMORY_MAX_MOMENTS);
    }
  }
  return { mem: { facts, moments }, added };
}

/**
 * A note for his question when he asks her to remember something about him, so she answers from her
 * notes instead of guessing. ☠️ "Anything else about them, you don't know" in her prompt was not
 * enough: asked "What's my cat called?" with no cat in her notes, she said "Muffin" (2 Nov, phone).
 * Returns the note's text, or null when his words aren't that kind of question.
 */
export function recallNoteFor(mem, words) {
  const t = String(words || "").slice(0, 300);
  const asking = /\?|^\W*(what|who|whats|do you|did i|have i|tell me|remind me)\b/i.test(t);
  if (!asking || !mem) return null;
  const facts = mem.facts || [], moments = mem.moments || [];
  const about = t.match(new RegExp(String.raw`\bmy (${PETS}|${PEOPLE}|name)\b`, "i"));
  if (about) {
    const kind = about[1].toLowerCase();
    const key = kind === "name" ? "name" : new RegExp(String.raw`^(${PETS})$`, "i").test(kind) ? `pet:${kind}` : `person:${kind}`;
    const known = facts.find((f) => f.key === key);
    if (known) return `You remember: ${known.text}`;
    return kind === "name" ? "They have never told you their name, so you don't know it. Say so; don't make one up."
      : `They have never told you anything about a ${kind}, so you don't know. Say so; don't make anything up.`;
  }
  if (/\b(remember|know|recall)\b[^.?!]*\babout me\b|\bwhat (do|did) i (tell|told) you\b/i.test(t)) {
    const all = [...facts.map((f) => f.text), ...moments.map((m) => `they told you "${m.text}"`)];
    return all.length ? `You remember only this: ${all.join(" ")}` : "You don't remember anything they've told you yet. Say so.";
  }
  return null;
}

const DAY = (at) => new Date(at).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });

/** The lines her prompt gets, or "" when she remembers nothing. */
export function memoryPromptLine(mem) {
  if (!mem || (!mem.facts?.length && !mem.moments?.length)) return "";
  const lines = [
    ...mem.facts.map((f) => `- ${f.text}`),
    ...mem.moments.map((m) => `- On ${DAY(m.at)} they told you: "${m.text}"`),
  ];
  return "From earlier chats on this phone, you remember only these things they told you. "
    + "Anything else about them, you don't know.\n" + lines.join("\n");
}
