// PC prompt lab for her care notes (2 Nov): her exact GGUF in Ollama ("salty-test", raw Llama 3 prompt),
// her trained sampler (temp 0.6, top-k 50, top-p 0.9), several seeds per variant. The phone's sampler
// is llama.cpp's; Ollama's is close enough to compare wordings, not to predict her exact words.
//   node experiments/salty/npu/care_prompt_lab.mjs
const SYSTEM = "Cutting Knowledge Date: December 2023\n\n"
  + "You are Salty, a companion who lives on this phone as an axolotl character from an adult cartoon, "
  + "and runs entirely offline. You talk like yourself.";
const MEMORY = "From earlier chats on this phone, you remember only these things they told you. Anything else about them, you don't know.\n"
  + "- Their dog is called Biscuit.\n- On Mon, 2 Nov they told you: \"My dog Biscuit nicked a sausage off the barbie this morning.\"\n"
  + "- On Mon, 2 Nov they told you: \"Just got a parking fine.\"";
// The window the phone restored after the restart (her last exchange before it).
const HISTORY = [["Just got a parking fine. Eighty-seven dollars.", "Eighty-seven dollars. A parking fine. Tell the council it came from the moon."]];
const USER = process.argv[3] || "Hey Salty, sorry I've been flat out.";

const ONLY = process.argv[2] === "cheeky";
const CHEEKY = {
  "F both, cheeky": { note: "You're starving and a bit cross: they forgot about you for about 20 hours and never fed you. Have a cheeky dig at them about it, then let it go. You're glad they're back." },
  "G hungry only": { note: "You're starving: no bloodworms for about 9 hours. Make a cheeky fuss about it." },
  "H lonely only": { note: "They forgot about you for about 20 hours. Have a cheeky dig at them about it, then let it go. You're glad they're back." },
  "I just fed": { note: "They just fed you bloodworms. You're full and happy. Thank them your way." },
  "J missed": { note: "They've been gone about 8 hours. You missed them, not that you'd admit it." },
};
const VARIANTS = ONLY ? CHEEKY : {
  "A current note": { note: "How you feel right now: starving, because they haven't fed you for about 20 hours, and you want bloodworms; and put out, because they haven't talked to you for about 20 hours, though you're glad they're back. Let it show in what you say." },
  "B short dig": { note: "You're starving and a bit cross: they forgot about you for 20 hours and never fed you. Have a dig at them about it, then let it go." },
  "C in system": { system: "Right now you're starving (no bloodworms for 20 hours) and a bit put out (they ignored you for 20 hours). It shows in how you talk to them." },
  "D both": { system: "Right now you're starving (no bloodworms for 20 hours) and a bit put out (they ignored you for 20 hours). It shows in how you talk to them.",
    note: "You're starving and a bit cross: they forgot about you for 20 hours and never fed you. Have a dig at them about it, then let it go." },
  "E no history + B": { note: "You're starving and a bit cross: they forgot about you for 20 hours and never fed you. Have a dig at them about it, then let it go.", noHistory: true },
};

const H = (role, text) => `<|start_header_id|>${role}<|end_header_id|>\n\n${text}<|eot_id|>`;
function prompt(v) {
  let p = "<|begin_of_text|>" + H("system", [SYSTEM, MEMORY, v.system].filter(Boolean).join("\n\n"));
  if (!v.noHistory) for (const [u, a] of HISTORY) p += H("user", u) + H("assistant", a);
  p += H("user", v.note ? `${USER}\n\n(${v.note})` : USER);
  return p + "<|start_header_id|>assistant<|end_header_id|>\n\n";
}

for (const [name, v] of Object.entries(VARIANTS)) {
  console.log(`== ${name}`);
  for (const seed of [0, 1, 2, 3]) {
    const r = await (await fetch("http://127.0.0.1:11434/api/generate", { method: "POST", body: JSON.stringify({
      model: "salty-test", prompt: prompt(v), raw: true, stream: false,
      options: { seed, temperature: 0.6, top_k: 50, top_p: 0.9, num_predict: 70, stop: ["<|eot_id|>"] } }) })).json();
    console.log(`  [${seed}] ${(r.response || r.error || "").trim().replace(/\s+/g, " ")}`);
  }
}
