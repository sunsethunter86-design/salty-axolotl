// Send one long-answer typed turn through the real composer (screen on) and
// wait out the speech. Mirrors boot-gate's CDP approach.
import { execFileSync } from "node:child_process";

const SERIAL = "YOUR_DEVICE_SERIAL";
const PKG = "com.veridity.flow.local.meta";
const CDP_PORT = 9222;
const PROMPT = process.argv[2] || "Tell me a long story about a little axolotl who wanted to see the ocean, in about ten sentences.";

function adb(...args) {
  return execFileSync("adb", ["-s", SERIAL, ...args], { encoding: "utf8" });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpEval(expression) {
  const pid = adb("shell", `pidof ${PKG}`).trim().split(/\s+/)[0];
  adb("forward", `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`);
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    const page = list.find((p) => p.type === "page");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const result = await new Promise((resolve) => {
      ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) resolve(d.result); };
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate",
        params: { expression, returnByValue: true, awaitPromise: false } }));
      setTimeout(() => resolve(null), 15000);
    });
    ws.close();
    return result?.result?.value;
  } finally {
    try { adb("forward", "--remove", `tcp:${CDP_PORT}`); } catch {}
  }
}

for (let i = 0; i < 24; i++) {
  const awake = await cdpEval("(() => window.__vflLocal?.mindAwake === true)()").catch(() => false);
  if (awake) break;
  await sleep(5000);
}
const sent = await cdpEval(`(() => {
  const input = document.getElementById("textInput");
  const send = document.getElementById("sendTextBtn");
  if (!input || !send) return "composer missing";
  input.value = ${JSON.stringify(PROMPT)};
  input.dispatchEvent(new Event("input", { bubbles: true }));
  send.click();
  return "sent";
})()`);
console.log("sent:", sent);
let spoke = false;
const deadline = Date.now() + 240000;
while (Date.now() < deadline) {
  const state = await cdpEval(`(() => JSON.stringify({
    speaking: window.__vflLocal?.speaking === true,
    thinking: window.__vflLocal?.thinking === true }))()`).catch(() => null);
  if (state) {
    const p = JSON.parse(state);
    if (p.speaking) spoke = true;
    if (spoke && !p.speaking && !p.thinking) break;
  }
  await sleep(2000);
}
console.log("spoke:", spoke, "done");
