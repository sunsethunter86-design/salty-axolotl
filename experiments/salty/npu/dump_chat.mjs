// Dump the visible conversation from the .meta page via CDP.
import { execFileSync } from "node:child_process";
const SERIAL = "YOUR_DEVICE_SERIAL", PKG = "com.veridity.flow.local.meta", CDP_PORT = 9222;
function adb(...a) { return execFileSync("adb", ["-s", SERIAL, ...a], { encoding: "utf8" }); }
const pid = adb("shell", `pidof ${PKG}`).trim().split(/\s+/)[0];
adb("forward", `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`);
try {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  const page = list.find((p) => p.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const expr = `(() => {
    const out = [];
    const cards = document.querySelectorAll(".aoede-card, .msg, .message, [class*=card]");
    const seen = new Set();
    document.querySelectorAll("body *").forEach(() => {});
    const main = document.querySelector("main") || document.body;
    return JSON.stringify({
      cards: Array.from(document.querySelectorAll(".aoede-card")).map((c, i) => i + ": " + c.innerText.slice(0, 2000)),
      bodyTail: main.innerText.slice(-12000)
    });
  })()`;
  const result = await new Promise((resolve) => {
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) resolve(d.result); };
    ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate",
      params: { expression: expr, returnByValue: true } }));
    setTimeout(() => resolve(null), 15000);
  });
  ws.close();
  console.log(result?.result?.value || "NO RESULT");
} finally {
  try { adb("forward", "--remove", `tcp:${CDP_PORT}`); } catch {}
}
