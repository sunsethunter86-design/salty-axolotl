// Idle heat probe for the tank (2 Nov): Salty in front, screen on, nobody talking.
//
//   node experiments/salty/npu/idle_heat_probe.mjs <label> [seconds=60]
//
// Brings the .meta app to the front with am start (never monkey), waits 20 s to settle, then samples
// `top` every 5 s for the app process and its WebView renderer (the sandboxed process started with
// it), and the battery temperature at the start and end. Refuses to start above 34 °C (phone-care
// rule) or when another app is in front (it never covers what Shaun is doing).
import { execFileSync } from "node:child_process";
const SERIAL = "YOUR_DEVICE_SERIAL", PKG = "com.veridity.flow.local.meta";
const LABEL = process.argv[2] || "run", SECONDS = Number(process.argv[3] || 60);
const adb = (...a) => execFileSync("adb", ["-s", SERIAL, ...a], { encoding: "utf8" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const temp = () => Number(/temperature: (\d+)/.exec(adb("shell", "dumpsys battery"))[1]) / 10;

const t0 = temp();
if (t0 > 34) { console.log(`${LABEL}\trefused: phone at ${t0} °C (start only at 34 °C or below)`); process.exit(2); }
const front = () => adb("shell", "dumpsys activity activities").match(/topResumedActivity=.*? (\S+)\//)?.[1];
// Never cover another app unless Shaun said the phone is free (--take-front).
if (front() !== PKG && !process.argv.includes("--take-front")) {
  console.log(`${LABEL}\trefused: ${front()} is in front; open Salty first or pass --take-front`); process.exit(3);
}
adb("shell", "input keyevent KEYCODE_WAKEUP"); adb("shell", "wm dismiss-keyguard");
adb("shell", `am start -n ${PKG}/com.veridity.flow.MainActivity`);
await sleep(20000);
if (front() !== PKG) { console.log(`${LABEL}\trefused: ${front()} is in front, not Salty`); process.exit(3); }

const app = adb("shell", `pidof ${PKG}`).trim().split(/\s+/)[0];
// The renderer: the first webview sandboxed process started after the app (pids rise with start
// order). Other apps' WebViews can start later, so the sum over all of them is reported too.
const ps = adb("shell", "ps -A -o PID,NAME").split("\n").filter((l) => /sandboxed_process/.test(l)).map((l) => Number(l.trim().split(/\s+/)[0]));
const ren = String(Math.min(...ps.filter((p) => p > Number(app))));
const all = ps.map(String);
const samples = { app: [], ren: [], allWebview: [] };
for (let i = 0; i < Math.round(SECONDS / 5); i++) {
  adb("shell", "input keyevent KEYCODE_WAKEUP");
  const out = adb("shell", `top -b -n 2 -d 5 -p ${[app, ...all].join(",")} -o PID,%CPU`);
  const second = out.split(/\n\s*PID/).at(-1);
  let sum = 0;
  for (const line of second.split("\n")) {
    const [pid, cpu] = line.trim().split(/\s+/);
    if (pid === app) samples.app.push(Number(cpu));
    if (pid === ren) samples.ren.push(Number(cpu));
    if (all.includes(pid)) sum += Number(cpu);
  }
  samples.allWebview.push(sum);
}
const avg = (a) => (a.reduce((s, v) => s + v, 0) / Math.max(1, a.length)).toFixed(0);
const t1 = temp();
console.log(`${LABEL}\tapp ${avg(samples.app)}% CPU\tits webview (pid ${ren}) ${avg(samples.ren)}%\tall webviews ${avg(samples.allWebview)}%\ttemp ${t0} -> ${t1} °C over ~${SECONDS + 20} s`);
adb("shell", "input keyevent KEYCODE_SLEEP");
