// salty-care.mjs: her hunger, her loneliness, feeding, and what her mind is told (2 Nov).
// node scripts/salty_care_test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  newCare, loadCare, saveCare, feed, noticed, hungerOf, lonelyOf, moodOf, restFaceOf, careNoteFor,
  shouldGreet, greetingCue, isGreetingCue, HUNGRY_AFTER_H, LONELY_AFTER_H, STUFFED_FEEDS,
} from "../public/salty-care.mjs";

test("she speaks first only after a real absence, and not twice in half an hour", () => {
  const now = Date.parse("2026-11-03T09:00:00+10:30");
  assert.equal(shouldGreet({ gapMs: 3 * 3600e3, now }), true);
  assert.equal(shouldGreet({ gapMs: 20 * 60e3, now }), false, "a quick app switch is not a return");
  assert.equal(shouldGreet({ gapMs: 3 * 3600e3, now, lastGreetAt: now - 10 * 60e3 }), false);
  assert.equal(shouldGreet({ gapMs: 3 * 3600e3, now, lastGreetAt: now - 40 * 60e3 }), true);
  assert.equal(isGreetingCue(greetingCue()), true);
  assert.equal(isGreetingCue(greetingCue({ remembersSomething: true })), true);
  assert.match(greetingCue({ remembersSomething: true }), /ask how it went/);
  assert.equal(isGreetingCue("Hey Salty"), false);
  assert.equal(isGreetingCue("(Worked out for you: 2 + 2 = 4.)"), false);
});

const H = 3600e3, T0 = Date.parse("2026-11-02T09:00:00+10:30");

test("day one: fed, seen, nothing to say", () => {
  const c = newCare(T0);
  assert.deepEqual(moodOf(c, T0), { hunger: "full", lonely: "content" });
  assert.equal(restFaceOf(c, T0), "neutral");
  assert.equal(careNoteFor(c, { now: T0 }), null);
});

test("she gets hungry in real time, and says so", () => {
  const c = newCare(T0);
  assert.equal(moodOf(c, T0 + 4 * H).hunger, "peckish");
  assert.equal(moodOf(c, T0 + HUNGRY_AFTER_H * H).hunger, "starving");
  assert.equal(restFaceOf(noticed(c, T0 + 9 * H), T0 + 9 * H), "hungry");
  assert.equal(careNoteFor(c, { now: T0 + 9 * H }), "You're starving: no bloodworms for about 9 hours. Make a cheeky fuss about it.");
  assert.match(careNoteFor(c, { now: T0 + 5.5 * H }), /a bit peckish/);
  assert.equal(careNoteFor(c, { now: T0 + 9 * H, mentionHunger: false }), null, "the tank rations how often she mentions it");
  assert.equal(hungerOf(c, T0 + 100 * H), 1);
});

test("ignored, she sulks; the note uses how long he'd been away", () => {
  const c = newCare(T0);
  const later = T0 + 20 * H;
  assert.equal(moodOf(c, later).lonely, "sulking");
  assert.equal(restFaceOf(c, later), "sulk", "sulking wins over hunger");
  assert.equal(careNoteFor(c, { now: later, gapMs: 20 * H }), "You're starving and a bit cross: they forgot about you for about 20 hours "
    + "and never fed you. Have a cheeky dig at them about it, then let it go. You're glad they're back.");
  assert.equal(careNoteFor(noticed(c, later - H), { now: later, gapMs: 20 * H, mentionHunger: false }),
    "They forgot about you for about 20 hours. Have a cheeky dig at them about it, then let it go. You're glad they're back.");
  assert.equal(careNoteFor(newCare(T0), { now: T0, gapMs: 8 * H }), "They've been gone about 8 hours. You missed them, not that you'd admit it.");
  assert.equal(careNoteFor(newCare(T0), { now: T0, gapMs: 2 * H }), null, "a short break is nothing");
  assert.match(careNoteFor(c, { now: T0 + 3 * 24 * H, gapMs: 3 * 24 * H }), /about 3 days/);
  assert.equal(lonelyOf(c, T0 + LONELY_AFTER_H * 2 * H), 1);
});

test("talking to her or feeding her is attention", () => {
  const c = noticed(newCare(T0), T0 + 20 * H);
  assert.equal(moodOf(c, T0 + 20 * H).lonely, "content");
});

test("feeding fills her up; the note says she's happy", () => {
  let c = newCare(T0);
  const r = feed(c, T0 + 9 * H);
  assert.equal(r.result, "fed");
  assert.equal(moodOf(r.care, T0 + 9 * H).hunger, "full");
  assert.equal(careNoteFor(r.care, { now: T0 + 9 * H + 60e3, justFedMs: 60e3 }), "They just fed you bloodworms. You're full and happy, and you say so your way.");
});

test("three feeds in an hour and she's stuffed", () => {
  let c = newCare(T0), r;
  for (let i = 0; i < STUFFED_FEEDS; i++) { r = feed(c, T0 + i * 60e3); assert.equal(r.result, "fed"); c = r.care; }
  r = feed(c, T0 + 5 * 60e3);
  assert.equal(r.result, "stuffed");
  assert.equal(r.care.feeds.length, STUFFED_FEEDS, "a refused feed is not a feed");
  assert.equal(feed(c, T0 + 2 * H).result, "fed", "an hour later she'll eat again");
});

test("storage round-trip; broken or missing storage starts her fresh", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  const c = feed(newCare(T0), T0 + H).care;
  assert.equal(saveCare(c, storage), true);
  assert.deepEqual(loadCare(storage, T0 + 2 * H), c);
  assert.deepEqual(loadCare({ getItem: () => "{nope" }, T0), newCare(T0));
  assert.deepEqual(loadCare(null, T0), newCare(T0));
});
