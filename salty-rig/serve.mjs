// Tiny static server for previewing the viewer page locally, plus POST /shot?name=x (body: a PNG data
// URL from the page's own canvas) saved to shots/x.png, so checks don't depend on the pane's size.
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const types = { ".html": "text/html", ".glb": "model/gltf-binary", ".png": "image/png", ".js": "text/javascript" };
http.createServer((q, r) => {
  const url = new URL(q.url, "http://x");
  if (q.method === "POST" && url.pathname === "/shot") {
    let body = ""; q.on("data", c => body += c); q.on("end", () => {
      const name = (url.searchParams.get("name") || "shot").replace(/[^\w-]/g, "");
      fs.writeFileSync(path.join(root, "shots", name + ".png"), Buffer.from(body.split(",")[1] || "", "base64"));
      r.writeHead(200); r.end("ok");
    });
    return;
  }
  const p = path.join(root, decodeURIComponent(url.pathname).replace(/^\/$/, "/csp-test.html"));
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); r.end(b); });
}).listen(process.env.PORT || 8766, () => console.log("viewer up"));
