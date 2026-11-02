// Multi-turn soak through the real composer: continuity, memory, maths
// baseline, a long reply, and a mid-speech stop.
import { execFileSync } from "node:child_process";
const SERIAL = "YOUR_DEVICE_SERIAL", PKG = "com.veridity.flow.local.meta", CDP_PORT = 9222;
function adb(...a) { return execFileSync("adb", ["-s", SERIAL, ...a], { encoding: "utf8" }); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function cdpEval(expression, awaitPromise = false) {
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
        params: { expression, returnByValue: true, awaitPromise } }));
      setTimeout(() => resolve(null), 30000);
    });
    ws.close();
    return result?.result?.value;
  } finally { try { adb("forward", "--remove", `tcp:${CDP_PORT}`); } catch {} }
}
async function awaitIdle(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let spoke = false;
  while (Date.now() < deadline) {
    const s = await cdpEval(`(() => JSON.stringify({sp: window.__vflLocal?.speaking === true, th: window.__vflLocal?.thinking === true}))()`).catch(() => null);
    if (s) { const p = JSON.parse(s); if (p.sp) spoke = true; if (spoke && !p.sp && !p.th) return true; if (!spoke && !p.sp && !p.th) {
      // not started yet; keep waiting a bit
    } }
    await sleep(1500);
  }
  return false;
}
const TURNS = [
  "Hey Salty, my dog is called Biscuit and he stole a sausage this morning.",
  "What is 391 + 1?",
  "And what is 17 times 6?",
  "It is 4:45 pm now. What time will it be in 90 minutes?",
  "What is my dog called, and what did he steal?",
  "Tell me a story about Biscuit and the sausage in about eight sentences.",
  "Thanks! One more: what is 15% of 200?",
  "You are doing great. What did we talk about today, in one sentence?",
];
for (let i = 0; i < 24; i++) {
  if (await cdpEval("(() => window.__vflLocal?.mindAwake === true)()").catch(() => false)) break;
  await sleep(5000);
}
for (const t of TURNS) {
  const t0 = Date.now();
  await cdpEval(`(() => { const i = document.getElementById("textInput"); const b = document.getElementById("sendTextBtn"); i.value = ${JSON.stringify(t)}; i.dispatchEvent(new Event("input", {bubbles:true})); b.click(); return "sent"; })()`);
  const done = await awaitIdle(240000);
  console.log(`TURN ${Math.round((Date.now()-t0)/1000)}s done=${done} :: ${t}`);
}
// Interruption test: send a long one, stop mid-speech.
await cdpEval(`(() => { const i = document.getElementById("textInput"); const b = document.getElementById("sendTextBtn"); i.value = "Tell me the longest story you can about a voyage to the moon, at least twenty sentences."; i.dispatchEvent(new Event("input", {bubbles:true})); b.click(); return "sent"; })()`);
let speakingSeen = false;
for (let i = 0; i < 40; i++) {
  const s = await cdpEval(`(() => window.__vflLocal?.speaking === true)()`).catch(() => false);
  if (s === true) { speakingSeen = true; break; }
  await sleep(1000);
}
console.log("interrupt: speaking seen =", speakingSeen);
if (speakingSeen) {
  await sleep(3000);
  const stopped = await cdpEval(`(() => { const btns = [...document.querySelectorAll("button")]; const stop = btns.find(b => /stop/i.test(b.textContent || "") && b.offsetParent); if (stop) { stop.click(); return "stop clicked"; } return "no stop button"; })()`);
  console.log("interrupt:", stopped);
  await sleep(6000);
  const after = await cdpEval(`(() => JSON.stringify({sp: window.__vflLocal?.speaking === true, th: window.__vflLocal?.thinking === true }))()`);
  console.log("interrupt: state after stop =", after);
  // Recovery turn.
  await cdpEval(`(() => { const i = document.getElementById("textInput"); const b = document.getElementById("sendTextBtn"); i.value = "Still there? Just say yes and tell me you are okay."; i.dispatchEvent(new Event("input", {bubbles:true})); b.click(); return "sent"; })()`);
  console.log("interrupt: recovery turn done =", await awaitIdle(180000));
}
console.log("SOAK DONE");
