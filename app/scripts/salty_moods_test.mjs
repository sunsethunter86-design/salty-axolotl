// saltyMoodFor: which move her body plays when his words land (2 Nov).
// node scripts/salty_moods_test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { saltyMoodFor } from "../public/salty-moods.mjs";

test("the demo script's lines get the move the script expects", () => {
  assert.equal(saltyMoodFor("Morning, Salty. What've you been up to?"), "wave");
  assert.equal(saltyMoodFor("My dog Biscuit nicked a sausage off the barbie this morning."), "outrage");
  assert.equal(saltyMoodFor("Night, Salty."), "sleepy");
});

test("each feeling, in his own words", () => {
  assert.equal(saltyMoodFor("Just got a parking fine. Eighty-seven dollars."), "outrage");
  assert.equal(saltyMoodFor("Can you believe they overcharged me?"), "outrage");
  assert.equal(saltyMoodFor("I've had a rough day."), "sympathy");
  assert.equal(saltyMoodFor("I'm feeling a bit flat today, cheer me up."), "sympathy");
  assert.equal(saltyMoodFor("My nan passed away last week."), "sympathy");
  assert.equal(saltyMoodFor("I got the job!"), "celebrate");
  assert.equal(saltyMoodFor("Good news, the test came back fine"), "celebrate");
  assert.equal(saltyMoodFor("Goodnight Salty"), "sleepy");
  assert.equal(saltyMoodFor("I'm off to bed"), "sleepy");
  assert.equal(saltyMoodFor("G'day mate"), "wave");
});

test("a stronger feeling wins over a greeting", () => {
  assert.equal(saltyMoodFor("Hey Salty, I got the job!"), "celebrate");
  assert.equal(saltyMoodFor("Morning. Rough night."), "sympathy");
  assert.equal(saltyMoodFor("Hi Salty, goodnight"), "sleepy");
});

test("unclear or ordinary talk plays nothing", () => {
  for (const t of ["Making toast.", "What's the best thing about living in a tank?", "Tell me a joke",
    "What do you reckon about pineapple on pizza?", "", "   ", "This morning was fine"]) {
    assert.equal(saltyMoodFor(t), null, t);
  }
  assert.equal(saltyMoodFor(undefined), null);
  assert.equal(saltyMoodFor(42), null);
});

test("a greeting only counts at the start", () => {
  assert.equal(saltyMoodFor("I said hello to the neighbour"), null);
  assert.equal(saltyMoodFor("Tell me about this morning"), null);
});

test("negated sadness is not sympathy", () => {
  assert.equal(saltyMoodFor("Not a bad day actually"), null);
  assert.equal(saltyMoodFor("It wasn't that rough"), null);
});

test("words inside other words don't trigger", () => {
  assert.equal(saltyMoodFor("I'm a stoleness expert"), null);
  assert.equal(saltyMoodFor("Hiking tomorrow"), null);
  assert.equal(saltyMoodFor("He's a fine fellow"), null);
});
