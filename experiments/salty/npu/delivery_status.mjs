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
  const expr = `(async () => {
    const d = window.Capacitor?.Plugins?.ModelDelivery;
    if (!d) return "no plugin";
    try { return JSON.stringify(await d.status()); } catch (e) { return "ERR " + e.message; }
  })()`;
  const result = await new Promise((resolve) => {
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) resolve(d.result); };
    ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate",
      params: { expression: expr, returnByValue: true, awaitPromise: true } }));
    setTimeout(() => resolve(null), 20000);
  });
  ws.close();
  console.log(result?.result?.value || JSON.stringify(result));
} finally {
  try { adb("forward", "--remove", `tcp:${CDP_PORT}`); } catch {}
}
