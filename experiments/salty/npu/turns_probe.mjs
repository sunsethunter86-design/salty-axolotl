// Typed turns through the real composer; prints her reply text and send → first sound (2 Nov).
//
//   node experiments/salty/npu/turns_probe.mjs "<message>" ["<message>" ...]
//
// Page-side clock (performance.now at Send, 20 ms poll of __vflLocal.speaking). Waits for her to
// finish each reply before the next. Phone should be muted; typed turns need ENGINE_READY + 95 s.
import { execFileSync } from "node:child_process";
const SERIAL = "YOUR_DEVICE_SERIAL", PKG = "com.veridity.flow.local.meta", CDP_PORT = 9222;
const adb = (...a) => execFileSync("adb", ["-s", SERIAL, ...a], { encoding: "utf8" });
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
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
      setTimeout(() => resolve(null), 30000);
    });
    ws.close();
    return result?.result?.value;
  } finally { try { adb("forward", "--remove", `tcp:${CDP_PORT}`); } catch {} }
}

for (const text of process.argv.slice(2)) {
  adb("shell", "input keyevent KEYCODE_WAKEUP");
  await cdpEval(`(() => {
    const t = { sent: performance.now(), sound: null };
    window.__probe = t;
    t.poll = setInterval(() => { if (t.sound == null && window.__vflLocal?.speaking === true) t.sound = performance.now() - t.sent; }, 20);
    const i = document.getElementById("textInput"), b = document.getElementById("sendTextBtn");
    i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event("input", { bubbles: true })); b.click();
    return "sent";
  })()`);
  const deadline = Date.now() + 90000;
  let spoke = false, quietSince = 0;
  while (Date.now() < deadline) {
    await sleep(500);
    const s = await cdpEval(`JSON.stringify({ sp: window.__vflLocal?.speaking === true, th: window.__vflLocal?.thinking === true, snd: window.__probe?.sound })`).catch(() => null);
    if (!s) continue;
    const p = JSON.parse(s);
    if (p.snd != null) spoke = true;
    if (spoke && !p.sp && !p.th) { if (!quietSince) quietSince = Date.now(); if (Date.now() - quietSince > 2500) break; }
    else quietSince = 0;
  }
  const r = JSON.parse(await cdpEval(`(() => { clearInterval(window.__probe.poll);
    return JSON.stringify({ sound: window.__probe.sound, reply: (document.getElementById("homeReplyBody")?.textContent || "").trim() }); })()`));
  console.log(`> ${text}\n  [${r.sound == null ? "no sound" : Math.round(r.sound) + " ms"}] ${r.reply}\n`);
  await sleep(3000);
}
