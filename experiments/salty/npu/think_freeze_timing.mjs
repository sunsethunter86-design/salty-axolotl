// Send → first sound, measured in the page, for the think-freeze change (2 Nov).
// The tank used to freeze rendering from his turn until her voice started (GPU lane fix);
// on the NPU lane it no longer does. This checks her voice doesn't start later because of it.
//
//   node experiments/salty/npu/think_freeze_timing.mjs <label>     (phone muted; tank on screen)
//
// Page-side clock: performance.now() at the Send click, then a 20 ms poll of
// __vflLocal.speaking for her first sound. (framesBeforeSound counts page frames, not tank
// renders: it only shows the page wasn't stalled.)
import { execFileSync } from "node:child_process";
const SERIAL = "YOUR_DEVICE_SERIAL", PKG = "com.veridity.flow.local.meta", CDP_PORT = 9222;
const LABEL = process.argv[2] || "run";
const PROMPTS = [
  "Morning Salty, how did you sleep?",
  "What's the best thing about living in a tank?",
  "Give me one tip for a lazy Sunday.",
  "What do you reckon about pineapple on pizza?",
  "Tell me something nice in one sentence.",
];
function adb(...a) { return execFileSync("adb", ["-s", SERIAL, ...a], { encoding: "utf8" }); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function cdpEval(expression) {
  const pid = adb("shell", `pidof ${PKG}`).trim().split(/\s+/)[0];
  adb("forward", `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`);
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    const ws = new WebSocket(list.find((p) => p.type === "page").webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const result = await new Promise((resolve) => {
      ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) resolve(d.result); };
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
      setTimeout(() => resolve(null), 30000);
    });
    ws.close();
    return result?.result?.value;
  } finally { try { adb("forward", "--remove", `tcp:${CDP_PORT}`); } catch {} }
}

const rows = [];
for (const text of PROMPTS) {
  // The tank only draws with the screen on: wake it before every turn.
  adb("shell", "input keyevent KEYCODE_WAKEUP"); adb("shell", "wm dismiss-keyguard");
  await sleep(1500);
  await cdpEval(`(() => {
    const L = window.__vflLocal || {};
    const t = { sent: performance.now(), sound: null, frames: 0, framesBeforeSound: 0 };
    window.__ttf = t;
    let last = performance.now();
    (function raf() { t.frames++; if (t.sound == null) t.framesBeforeSound++; if (!t.done) requestAnimationFrame(raf); })();
    t.poll = setInterval(() => {
      if (t.sound == null && window.__vflLocal?.speaking === true) t.sound = performance.now() - t.sent;
    }, 20);
    const i = document.getElementById("textInput"), b = document.getElementById("sendTextBtn");
    i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event("input", { bubbles: true })); b.click();
    return "sent";
  })()`);
  // Wait for her to speak and then fall quiet (max 60 s).
  const deadline = Date.now() + 60000;
  let spoke = false;
  while (Date.now() < deadline) {
    await sleep(500);
    const s = await cdpEval(`JSON.stringify({ sp: window.__vflLocal?.speaking === true, th: window.__vflLocal?.thinking === true, snd: window.__ttf?.sound })`).catch(() => null);
    if (!s) continue;
    const p = JSON.parse(s);
    if (p.snd != null) spoke = true;
    if (spoke && !p.sp && !p.th) break;
  }
  const r = JSON.parse(await cdpEval(`(() => { const t = window.__ttf; t.done = true; clearInterval(t.poll);
    return JSON.stringify({ sound: t.sound, framesBeforeSound: t.framesBeforeSound }); })()`));
  rows.push({ text, ms: r.sound == null ? null : Math.round(r.sound), framesBeforeSound: r.framesBeforeSound });
  console.log(`${LABEL}\t${rows.at(-1).ms ?? "no sound"} ms\tframes before sound ${r.framesBeforeSound}\t${text}`);
  await sleep(4000);
}
const ok = rows.map((r) => r.ms).filter((v) => v != null).sort((a, b) => a - b);
console.log(`${LABEL}\tmedian ${ok[Math.floor(ok.length / 2)] ?? "n/a"} ms over ${ok.length}/${rows.length} turns`);
