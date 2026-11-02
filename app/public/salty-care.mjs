// Salty hackathon: her care loop (2 Nov, Shaun: "feed her, and she gets sad if I don't pay any
// attention to her"). Two needs that grow in real time, even while the app is closed, kept on this
// phone only (localStorage), like her memory:
//   hunger  — since she was last fed (bloodworms, the 🪱 button)
//   lonely  — since he last talked to her, tapped her or fed her
// Her body shows them (a hungry or sulky face at rest), and her mind hears them: careNoteFor() is a
// short note on his message when how she feels is worth saying, so the Llama on the phone answers
// in her own words ("Oh, now you want to talk?"), not a canned line. Kind, never guilt-tripping:
// no notifications, and she's always glad he's back.

export const SALTY_CARE_KEY = "vfl.saltyCare.v1";
const HOUR = 3600e3;
export const HUNGRY_AFTER_H = 10;   // fully hungry this long after a feed
export const LONELY_AFTER_H = 18;   // fully put out this long after he last paid her attention
export const STUFFED_FEEDS = 3;     // this many feeds within STUFFED_WINDOW and she refuses
export const STUFFED_WINDOW_MS = HOUR;

/** A first meeting starts her fed and seen: she never opens hungry or sulking on day one. */
export function newCare(now = Date.now()) {
  return { v: 1, lastFedAt: now, lastSeenAt: now, feeds: [] };
}

export function loadCare(storage = globalThis.localStorage, now = Date.now()) {
  try {
    const c = JSON.parse(storage?.getItem(SALTY_CARE_KEY) || "null");
    if (c && c.v === 1 && Number.isFinite(c.lastFedAt) && Number.isFinite(c.lastSeenAt) && Array.isArray(c.feeds)) return c;
  } catch { /* no storage or a broken record */ }
  return newCare(now);
}

export function saveCare(care, storage = globalThis.localStorage) {
  try { storage?.setItem(SALTY_CARE_KEY, JSON.stringify(care)); return true; } catch { return false; }
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const hungerOf = (care, now = Date.now()) => clamp01((now - care.lastFedAt) / (HUNGRY_AFTER_H * HOUR));
export const lonelyOf = (care, now = Date.now()) => clamp01((now - care.lastSeenAt) / (LONELY_AFTER_H * HOUR));

/** How she feels, in words the tank and her note use. */
export function moodOf(care, now = Date.now()) {
  const h = hungerOf(care, now), l = lonelyOf(care, now);
  return {
    hunger: h < 0.35 ? "full" : h < 0.75 ? "peckish" : "starving",
    lonely: l < 0.35 ? "content" : l < 0.75 ? "missed" : "sulking",
  };
}

/** Her face at rest: sulking wins over hunger (you can be hungry and cross), else hungry, else neutral. */
export function restFaceOf(care, now = Date.now()) {
  const m = moodOf(care, now);
  if (m.lonely === "sulking") return "sulk";
  if (m.hunger === "starving") return "hungry";
  return "neutral";
}

/** He talked to her, tapped her or fed her. */
export function noticed(care, now = Date.now()) {
  return { ...care, lastSeenAt: now };
}

/** Feeds her. "stuffed" (nothing changes but being noticed) after STUFFED_FEEDS in the window. */
export function feed(care, now = Date.now()) {
  const recent = care.feeds.filter((t) => now - t < STUFFED_WINDOW_MS);
  if (recent.length >= STUFFED_FEEDS) return { care: noticed(care, now), result: "stuffed" };
  return { care: { ...care, lastFedAt: now, lastSeenAt: now, feeds: [...recent, now] }, result: "fed" };
}

const ago = (ms) => {
  const h = ms / HOUR;
  if (h < 1) return "a little while";
  if (h < 1.5) return "about an hour";
  if (h < 22) return `about ${Math.round(h)} hours`;
  const d = Math.round(h / 24);
  return d <= 1 ? "about a day" : `about ${d} days`;
};

/**
 * The note on his message about how she feels, or null when there's nothing worth saying.
 * `gapMs` is how long he'd been away before this message (the tank takes it once per session,
 * at his first message, so every request for that turn gets the same note).
 */
export function careNoteFor(care, { now = Date.now(), gapMs = 0, justFedMs = Infinity, mentionHunger = true } = {}) {
  // ☠️ Statements about her ("They haven't fed you…", then "How you feel right now: …") were mostly
  // ignored by her 3B mind, which echoed an old exchange instead (2 Nov, phone, seed 0). Short cues
  // that tell her what to DO with the feeling land in nearly every sample (care_prompt_lab.mjs, her
  // GGUF on the PC), and "cheeky … then let it go" keeps her funny instead of cruel.
  const fed = justFedMs < 3 * 60e3;
  const h = hungerOf(care, now);
  const starving = !fed && mentionHunger && h >= 0.75, peckish = !fed && mentionHunger && !starving && h >= 0.5;
  const away = gapMs / (LONELY_AFTER_H * HOUR);
  const forgot = away >= 0.75, missed = !forgot && away >= 0.35;
  const parts = [];
  if (fed) parts.push("They just fed you bloodworms. You're full and happy, and you say so your way.");
  if (starving && forgot) {
    parts.push(`You're starving and a bit cross: they forgot about you for ${ago(gapMs)} and never fed you. `
      + "Have a cheeky dig at them about it, then let it go. You're glad they're back.");
  } else {
    if (starving) parts.push(`You're starving: no bloodworms for ${ago(now - care.lastFedAt)}. Make a cheeky fuss about it.`);
    if (peckish) parts.push("You're getting a bit peckish. You might mention bloodworms.");
    if (forgot) parts.push(`They forgot about you for ${ago(gapMs)}. Have a cheeky dig at them about it, then let it go. You're glad they're back.`);
  }
  if (missed) parts.push(`They've been gone ${ago(gapMs)}. You missed them, not that you'd admit it.`);
  return parts.length ? parts.join(" ") : null;
}
