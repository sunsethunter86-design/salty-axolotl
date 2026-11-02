// Evaluate one expression in Salty's page over CDP: node cdp_eval.mjs "<js expression>"
import { execFileSync } from "node:child_process";
const SERIAL = process.env.SERIAL || "YOUR_DEVICE_SERIAL", PKG = "com.veridity.flow.local.meta", PORT = 9222;
const adb = (...a) => execFileSync("adb", ["-s", SERIAL, ...a], { encoding: "utf8" });
const pid = adb("shell", `pidof ${PKG}`).trim().split(/\s+/)[0];
adb("forward", `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);
try {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const ws = new WebSocket(list.find((p) => p.type === "page").webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const out = await new Promise((resolve) => {
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) resolve(d.result); };
    ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: process.argv[2], returnByValue: true, awaitPromise: true } }));
    setTimeout(() => resolve({ result: { value: "timeout" } }), 20000);
  });
  ws.close();
  console.log(typeof out?.result?.value === "string" ? out.result.value : JSON.stringify(out?.result?.value ?? out));
} finally { try { adb("forward", "--remove", `tcp:${PORT}`); } catch {} }
