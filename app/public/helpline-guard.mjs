/**
 * Helpline guard: no phone number reaches the user unless it is a real service.
 *
 * The crisis net (classifyCrisis in app.js) guards what HE says. This guards
 * what SHE says. A small quantised mind cannot be trusted with digits: the
 * Salty v6b phone build (Llama 3.2 3B, int4) told someone scared of their
 * partner to ring "1800 656 463", and told someone drinking to sleep about
 * "000-1800 on 1800RESPECT", even though every number in its training data was
 * right. The bf16 copy of the same weights never did. Quantisation loosens the
 * grip on exact digits, and no amount of training makes that safe.
 *
 * ☠️ A WRONG NUMBER IN A CRISIS IS A BETRAYAL. Someone will dial it. So a number
 * that is not on the list is removed, never "corrected" to a guess, and the
 * region's real line (from the same crisisLine() the crisis net uses) is
 * added after the reply.
 *
 * ☠️ ORDINARY NUMBERS MUST PASS UNTOUCHED. She does maths, money and times:
 * "$1,064", "86,400", "6:15", "0.30000000000000004", "2026". Only digit runs
 * shaped like a dialable phone number are candidates: exactly 000, or 6 to 10
 * digits starting 13, 1300, 1800 or 0, written with optional single spaces or
 * hyphens between groups.
 */

// Real Australian services (checked 27 Oct 2026), digits only.
const AU_SERVICES = [
  "000",          // Emergency
  "131114",       // Lifeline
  "0477131114",   // Lifeline text
  "1800737732",   // 1800RESPECT
  "1800551800",   // Kids Helpline
  "1300659467",   // Suicide Call Back Service
  "1300224636",   // Beyond Blue
  "1800858858",   // Gambling Help
  "131126",       // Poisons Information
];

const PHONE_SHAPED = /(?<![\w$.,:/])\d{1,4}(?:[ -]\d{1,4}){0,4}(?![\w]|[.,:/]\d)/g;
const CONNECTOR = /\b(?:on|call|ring|dial|text|phone|at|number)\s+$/i;

// ☠️ Up to 12 digits, not 10: a garbled number can be LONGER than any real one
// ("1800 1028 102", Salty v5a). Long unbroken runs (binary, big maths) never
// match PHONE_SHAPED at all, because its groups are at most 4 digits.
function isPhoneShaped(digits) {
  if (digits === "000") return true;
  return digits.length >= 6 && digits.length <= 12 && /^(13|0|1[38]00)/.test(digits);
}

/**
 * @param {string} reply     her reply, before it is shown or spoken
 * @param {{name: string|null, tel: string|null, emergency: string}} line
 *        crisisLine() from app.js, so both guards agree on the region's numbers
 * @returns {{text: string, removed: string[]}}
 */
export function guardHelplineNumbers(reply, line) {
  if (!reply) return { text: reply, removed: [] };
  const allowed = new Set(AU_SERVICES);
  for (const n of [line?.tel, line?.emergency]) {
    const d = String(n || "").replace(/\D/g, "");
    if (d) allowed.add(d);
  }

  const removed = [];
  let text = "";
  let last = 0;
  for (const m of reply.matchAll(PHONE_SHAPED)) {
    const digits = m[0].replace(/\D/g, "");
    if (!isPhoneShaped(digits) || allowed.has(digits)) continue;
    removed.push(m[0]);
    // Take the connector with it ("ring 1800 656 463" -> ""), so no "ring ." is left behind.
    const before = reply.slice(last, m.index).replace(CONNECTOR, "");
    text += before;
    last = m.index + m[0].length;
  }
  if (!removed.length) return { text: reply, removed };
  text += reply.slice(last);

  text = text
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .replace(/([,;:])\s*(?=[,.!?;:])/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  const tel = line?.tel ? String(line.tel) : "";
  if (!tel || !text.includes(tel)) {
    const help = tel
      ? `${line.name} is on ${tel}, and ${line.emergency} in an emergency.`
      : `In an emergency, call ${line?.emergency || "your local emergency number"}.`;
    text = `${text.replace(/[,;:]$/, ".")}${/[.!?]$/.test(text) ? "" : "."} ${help}`.trim();
  }
  return { text, removed };
}
