// salty-memory.mjs: what she keeps about him between conversations (2 Nov).
// node scripts/salty_memory_test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  factsFromWords, captureFromWords, memoryPromptLine, loadSaltyMemory, saveSaltyMemory, forgetSaltyMemory,
  forgetSaltyNote, recallNoteFor, SALTY_MEMORY_MAX_FACTS, SALTY_MEMORY_MAX_MOMENTS,
} from "../public/salty-memory.mjs";

test("asked about something she doesn't know, she is told she doesn't know (the 'Muffin' bug)", () => {
  const { mem } = captureFromWords({ facts: [], moments: [] }, "My dog Biscuit nicked a sausage off the barbie.", { mood: "outrage", now: 1 });
  assert.match(recallNoteFor(mem, "What's my cat called?"), /never told you anything about a cat.*don't make anything up/);
  assert.equal(recallNoteFor(mem, "What's my dog called?"), "You remember: Their dog is called Biscuit.");
  assert.match(recallNoteFor(mem, "Do you know my name?"), /never told you their name/);
  assert.match(recallNoteFor(mem, "Hey Salty, what do you remember about me?"), /^You remember only this: Their dog is called Biscuit\. they told you "My dog Biscuit/);
  assert.match(recallNoteFor({ facts: [], moments: [] }, "What do you know about me?"), /don't remember anything/);
  // Not a question about him: no note.
  assert.equal(recallNoteFor(mem, "My cat is a menace"), null);
  assert.equal(recallNoteFor(mem, "What's the best thing about living in a tank?"), null);
  assert.equal(recallNoteFor(null, "What's my cat called?"), null);
});

const texts = (s) => factsFromWords(s).map((f) => f.text);
const fresh = () => ({ facts: [], moments: [] });
const NOV2 = Date.parse("2026-11-02T10:00:00+10:30");

test("the demo line: Biscuit is remembered, and the moment is quoted", () => {
  const { mem, added } = captureFromWords(fresh(), "My dog Biscuit nicked a sausage off the barbie this morning.", { mood: "outrage", now: NOV2 });
  assert.deepEqual(mem.facts.map((f) => f.text), ["Their dog is called Biscuit."]);
  assert.deepEqual(mem.moments.map((m) => m.text), ["My dog Biscuit nicked a sausage off the barbie this morning."]);
  assert.equal(added.length, 2);
  const line = memoryPromptLine(mem);
  assert.match(line, /Their dog is called Biscuit\./);
  assert.match(line, /they told you: "My dog Biscuit nicked a sausage/);
  assert.match(line, /Anything else about them, you don't know\./);
});

test("names, pets, people, home, work and tastes", () => {
  assert.deepEqual(texts("My name is Shaun"), ["Their name is Shaun."]);
  assert.deepEqual(texts("my cat is called mittens"), ["Their cat is called Mittens."]);
  assert.deepEqual(texts("My wife Amy says hi"), ["Their wife is called Amy."]);
  assert.deepEqual(texts("I live in Kingston SE"), ["They live in Kingston."]);
  assert.deepEqual(texts("I work as a gardener, mostly lawns"), ["They work as a gardener."]);
  assert.deepEqual(texts("I love fishing and footy"), ["They love fishing."]);
  assert.deepEqual(texts("I can't stand pineapple on pizza."), ["They can't stand pineapple on pizza."]);
});

test("words that only look like names are not kept", () => {
  assert.deepEqual(texts("my dog biscuit nicked a sausage"), [], "lowercase without 'called' is too easy to misread");
  assert.deepEqual(texts("My dog is a menace"), []);
  assert.deepEqual(texts("My dog just ate my shoe"), []);
  assert.deepEqual(texts("I like it"), []);
  assert.deepEqual(texts("I love that you said that"), []);
  assert.deepEqual(texts("i live in a van"), []);
});

test("ordinary chat keeps nothing", () => {
  for (const t of ["Making toast.", "What's the best thing about living in a tank?", "Tell me a joke", ""]) {
    const { mem, added } = captureFromWords(fresh(), t, { mood: null, now: NOV2 });
    assert.deepEqual(added, [], t);
    assert.equal(memoryPromptLine(mem), "");
  }
});

test("moments only from turns that moved her, and never a crisis", () => {
  assert.equal(captureFromWords(fresh(), "Tell me a joke about fish", { mood: null }).mem.moments.length, 0);
  assert.equal(captureFromWords(fresh(), "I got the job!", { mood: "celebrate" }).mem.moments.length, 1);
  assert.equal(captureFromWords(fresh(), "Morning Salty", { mood: "wave" }).mem.moments.length, 0);
  const crisis = captureFromWords(fresh(), "Rough day, I want to kill myself. My dog Rex is all I have.", { mood: "sympathy" });
  assert.deepEqual(crisis.added, []);
  assert.deepEqual(crisis.mem, fresh());
});

test("a newer fact replaces the old one; repeats add nothing", () => {
  let { mem } = captureFromWords(fresh(), "My dog Biscuit is mad", { now: 1 });
  ({ mem } = captureFromWords(mem, "My dog Biscuit is mad", { now: 2 }));
  assert.equal(mem.facts.length, 1);
  ({ mem } = captureFromWords(mem, "Actually my dog is called Rex now", { now: 3 }));
  assert.deepEqual(mem.facts.map((f) => f.text), ["Their dog is called Rex."]);
});

test("it stays small", () => {
  let mem = fresh();
  const things = "apples pears plums figs kiwis limes mangoes melons dates grapes lemons olives".split(" ");
  things.forEach((t, i) => { mem = captureFromWords(mem, `I love ${t}`, { now: i }).mem; });
  assert.equal(mem.facts.length, SALTY_MEMORY_MAX_FACTS);
  for (let i = 0; i < 9; i++) mem = captureFromWords(mem, `Can you believe it, round ${i} of this`, { mood: "outrage", now: i }).mem;
  assert.equal(mem.moments.length, SALTY_MEMORY_MAX_MOMENTS);
});

test("storage round-trip, forgetting one note, forgetting everything", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  assert.deepEqual(loadSaltyMemory(storage), fresh());
  const { mem } = captureFromWords(fresh(), "My dog Biscuit nicked a sausage.", { mood: "outrage", now: NOV2 });
  assert.equal(saveSaltyMemory(mem, storage), true);
  assert.deepEqual(loadSaltyMemory(storage), mem);
  const fewer = forgetSaltyNote(mem, "pet:dog");
  assert.equal(fewer.facts.length, 0);
  assert.equal(fewer.moments.length, 1);
  assert.deepEqual(forgetSaltyMemory(storage), fresh());
  assert.deepEqual(loadSaltyMemory(storage), fresh());
  // Broken or missing storage never throws.
  assert.deepEqual(loadSaltyMemory({ getItem: () => "{nope" }), fresh());
  assert.deepEqual(loadSaltyMemory(null), fresh());
});
