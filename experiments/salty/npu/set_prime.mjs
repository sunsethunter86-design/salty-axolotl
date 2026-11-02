// Set (or clear) the voice-first prime dial on the .meta page via CDP.
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
  const key = process.argv[3] || "vfl_voice_first_prime_ms";
  const expr = process.argv[2] === "clear"
    ? `localStorage.removeItem(${JSON.stringify(key)})`
    : `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(process.argv[2] || "900")})`;
  const result = await new Promise((resolve) => {
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) resolve(d.result); };
    ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate",
      params: { expression: `(() => { ${expr}; return localStorage.getItem(${JSON.stringify(key)}); })()`,
        returnByValue: true } }));
    setTimeout(() => resolve(null), 10000);
  });
  ws.close();
  console.log(key, "=", result?.result?.value);
} finally {
  try { adb("forward", "--remove", `tcp:${CDP_PORT}`); } catch {}
}
