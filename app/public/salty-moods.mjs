// Salty hackathon: which move her body plays when his words land (2 Nov). Kept apart from
// salty-mind.mjs, which app.js shares and whose voice state must stay one module instance, so a
// new export here can never break the tank's import of an older cached salty-mind.mjs.

/**
 * Her body reacts to what he just said. Her rig has outrage, sympathy, celebrate and sleepy
 * moves that nothing ever played; the tank plays the one this returns the moment his words land,
 * while she thinks, so she reacts before she answers. Plain rules on HIS words only, never a guess
 * by her model: a wrong move on camera is worse than none, so anything unclear returns null.
 * Order is priority: a goodnight or good news wins over a greeting in the same sentence.
 */
const MOOD_CUES = [
  ["sleepy", /\b(good ?night|nighty|night,? salty|night night|(going|off|heading) to (bed|sleep)|bed ?time|so sleepy|yawn)/i],
  ["celebrate", /\b(got the (job|gig|house)|i (won|passed|got engaged|got promoted|got in)|promoted|good news|great news|nailed it|(we|i) did it|it'?s my birthday|woo+|yay+|hooray)\b/i],
  ["sympathy", /\b((rough|bad|awful|terrible|crap|shit|shocking|horrible) (day|week|night)|feeling (a (bit|little) |pretty |so |really )?(flat|down|sad|low|crap|shit|rubbish)|i'?m (so |really |a bit )?(sad|down|lonely|stressed|upset|gutted|struggling|not ok(ay)?)|passed away|died|broke up|heart ?broken|crying)\b/i],
  ["outrage", /\b((parking|speeding) (fine|ticket)|got (a )?fined|ripped (me )?off|rip ?off|scam(med)?|overcharged|stole|stolen|nicked|pinched|robbed|can you believe|ridiculous|outrageous|unbelievable)\b/i],
  ["wave", /^\W*(hi|hey|hello|hiya|g'?day|morning|good morning|howdy|oi)\b/i],
];
// "Not a bad day", "wasn't that rough": the words are there, the feeling isn't.
const NEGATED_SAD = /\b(not|no|wasn'?t|isn'?t|never) (that |a |so |too )?(rough|bad|awful|terrible|sad|down|flat|low)\b/i;

export function saltyMoodFor(text) {
  if (typeof text !== "string") return null;
  const t = text.slice(0, 300);
  for (const [mood, cue] of MOOD_CUES) {
    if (mood === "sympathy" && NEGATED_SAD.test(t)) continue;
    if (cue.test(t)) return mood;
  }
  return null;
}
