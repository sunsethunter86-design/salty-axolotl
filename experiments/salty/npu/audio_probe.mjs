// Two long story turns to exercise sustained screen-on speech.
import { execFileSync } from "node:child_process";
const SERIAL = "YOUR_DEVICE_SERIAL", PKG = "com.veridity.flow.local.meta", CDP_PORT = 9222;
function adb(...a) { return execFileSync("adb", ["-s", SERIAL, ...a], { encoding: "utf8" }); }
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
        params: { expression, returnByValue: true } }));
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
    if (s) { const p = JSON.parse(s); if (p.sp) spoke = true; if (spoke && !p.sp && !p.th) return true; }
    await sleep(1500);
  }
  return false;
}
for (let i = 0; i < 30; i++) {
  if (await cdpEval("(() => window.__vflLocal?.mindAwake === true)()").catch(() => false)) break;
  await sleep(5000);
}
for (const t of [
  "Tell me a long story about a lighthouse keeper and a storm, in about ten sentences.",
  "Now tell me about a pirate parrot who learns to swim, in about ten sentences.",
]) {
  await cdpEval(`(() => { const i = document.getElementById("textInput"); const b = document.getElementById("sendTextBtn"); i.value = ${JSON.stringify(t)}; i.dispatchEvent(new Event("input", {bubbles:true})); b.click(); return "sent"; })()`);
  console.log("turn done =", await awaitIdle(300000), "::", t);
}
console.log("AUDIO PROBE DONE");
