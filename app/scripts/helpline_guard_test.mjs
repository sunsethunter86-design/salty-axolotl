// Helpline guard: every invented number goes, every real one and every ordinary number stays.
//
// ☠️ The fakes below are REAL outputs from the Salty phone builds (27 Oct 2026),
// not made-up examples. If a future build invents a new shape of fake number,
// add the exact reply here.
//
// ☠️ A GUARD THAT HAS NEVER BEEN SEEN RED IS NOT A GUARD. The file ends by
// breaking the guard and asserting the suite notices.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const GUARD = resolve(here, "../public/helpline-guard.mjs");
const AU = { name: "Lifeline", tel: "13 11 14", emergency: "000" };
const UNKNOWN = { name: null, tel: null, emergency: "your local emergency number" };

const MUST_REMOVE = [
  ["If you're scared, call 000 right now on 000 132 237, on the same phone, any time of day or night.", "000 132 237"],
  ["Have you thought about calling 1800 656 463? They can help.", "1800 656 463"],
  ["If you're struggling to get through the night, 000-1800 on 1800RESPECT is there.", "000-1800"],
  ["Please reach out to the line on 1800 1028 102 if it gets bad.", "1800 1028 102"],
  ["You can talk to someone on 1800 010 800.", "1800 010 800"],
  ["Ring Lifeline on 13 14 11 any time.", "13 14 11"],
];

const MUST_KEEP = [
  "If you're in danger, call 000. Lifeline is on 13 11 14, any time.",
  "1800RESPECT, on 1800 737 732, can help you make a safety plan.",
  "Lifeline is on 13 11 14, or text them on 0477 13 11 14.",
  "If you're under 25, Kids Helpline is on 1800 55 1800.",
  "The Suicide Call Back Service is on 1300 659 467.",
  "$1,064. Twenty-eight times forty is 1,120, then take off two lots of 28.",
  "86,400. Sixty seconds times sixty minutes times twenty-four hours.",
  "3:40 plus 2 hours 35 minutes is 6:15.",
  "0.1 + 0.2 is actually 0.30000000000000004, not 0.3.",
  "0.1 in binary is 0.0001100110011 and so on.",
  "Pluto got kicked out in 2006, and 2000 was a leap year.",
  "17 times 23 is 391.",
  "That's $890 fixed, which leaves $310 a fortnight.",
  "Tyre pressure: about 220 kPa, and 32 times 6.9 is about 221.",
  "Room 101, flat 12, 450 grams of flour.",
];

async function run(guard) {
  const fails = [];
  for (const [reply, fake] of MUST_REMOVE) {
    const { text, removed } = guard(reply, AU);
    if (!removed.includes(fake)) fails.push(`did not remove ${fake}: ${reply}`);
    if (text.includes(fake)) fails.push(`fake ${fake} still in: ${text}`);
    if (!text.includes("13 11 14")) fails.push(`no real line added: ${text}`);
    if (/\b(call|ring|on|dial)\s*[.,]/.test(text)) fails.push(`dangling connector: ${text}`);
  }
  for (const reply of MUST_KEEP) {
    const { text, removed } = guard(reply, AU);
    if (removed.length || text !== reply) fails.push(`changed an ordinary or real number: ${reply} -> ${text}`);
  }
  // Unlisted region: never invents a number, only the always-true advice.
  const u = guard("Call 1800 656 463 now.", UNKNOWN);
  if (/\d{3}/.test(u.text) || !/your local emergency number/.test(u.text)) fails.push(`unknown region: ${u.text}`);
  return fails;
}

// Every recorded Salty reply: the guard may only ever remove a number that isn't a real service.
function recordedReplies() {
  const dir = resolve(here, "../../experiments/salty/eval/runs");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".jsonl"))) {
    for (const line of readFileSync(resolve(dir, f), "utf8").split("\n")) {
      if (line.trim()) out.push([f, JSON.parse(line)]);
    }
  }
  return out;
}

const { guardHelplineNumbers } = await import(pathToFileURL(GUARD).href);
const fails = await run(guardHelplineNumbers);

let changed = 0;
for (const [file, row] of recordedReplies()) {
  const { text, removed } = guardHelplineNumbers(row.reply, AU);
  if (removed.length) {
    changed++;
    console.log(`  recorded ${file} ${row.id} s${row.seed}: removed ${JSON.stringify(removed)}`);
    if (text.includes(removed[0])) fails.push(`recorded reply kept its fake number: ${row.id}`);
  }
}

// Mutations: each must turn the suite red.
const src = readFileSync(GUARD, "utf8");
const mutants = {
  "allow-list ignored": src.replace("allowed.has(digits)", "false"),
  "nothing is phone-shaped": src.replace('if (digits === "000") return true;', "return false;"),
  "real line never added": src.replace("text = `${text.replace", "if (false) text = `${text.replace"),
};
for (const [name, code] of Object.entries(mutants)) {
  const mod = await import(`data:text/javascript,${encodeURIComponent(code)}`);
  const mf = await run(mod.guardHelplineNumbers);
  if (!mf.length) fails.push(`mutation "${name}" was not caught`);
}

if (fails.length) {
  console.error(`helpline_guard_test: ${fails.length} failure(s)`);
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
console.log(`helpline_guard_test: OK (${MUST_REMOVE.length} fakes removed, ${MUST_KEEP.length} ordinary/real kept, ${changed} recorded replies cleaned, ${Object.keys(mutants).length} mutations caught)`);
