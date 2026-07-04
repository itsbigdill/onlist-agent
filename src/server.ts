// Thin HTTP wrapper — this is what gets deployed to Alibaba Cloud for the
// proof-of-deployment recording. Same agent, three endpoints + a one-page UI.
//
//   POST /verify  { title, frames: [dataURL…] }        → Verdict
//   POST /price   { title, verdict? }                  → PriceCall
//   POST /triage  { title, priceUSD, claims: [...] }   → TriageResult
//   GET  /        → minimal demo page
//   GET  /health  → { ok, models }

import { createServer } from "node:http";
import { MODELS } from "./qwen.js";
import { priceItem } from "./price.js";
import { triageClaims } from "./triage.js";
import { verifyParts, type Verdict } from "./verify.js";

const PORT = Number(process.env.PORT ?? 8080);

const PAGE = `<!doctype html><meta charset="utf-8"><title>onlist-agent</title>
<body style="font:16px/1.55 system-ui;background:#F0EFEB;color:#1F2937;max-width:680px;margin:0 auto;padding:40px 20px">
<h1 style="letter-spacing:-.01em">onlist-agent<span style="color:#DD7A51">.</span></h1>
<p>Autopilot for selling real things: <b>capture → prove-it's-real → price → list → handle buyers</b>.
Humans confirm every money decision. Powered by Qwen on Alibaba Cloud
(${MODELS.vision} for vision, ${MODELS.text} + live web search).</p>

<div style="background:#fff;border-radius:24px;padding:20px 22px;box-shadow:0 16px 42px rgba(31,41,55,.12)">
  <h3 style="margin:0 0 10px">Verify 2.0 — try to fool it</h3>
  <p style="font-size:14px;color:#6b7280;margin:0 0 12px">Pick 2–4 frames of one object
  (or photos of a photo — watch it refuse). Nothing is stored.</p>
  <input id="t" placeholder="listing title" style="width:100%;border:0;background:#F0EFEB;border-radius:14px;padding:12px 14px;font:inherit;margin-bottom:10px">
  <input id="f" type="file" accept="image/*" multiple style="margin-bottom:12px">
  <br><button id="go" style="border:0;background:#fff;box-shadow:0 10px 26px rgba(31,41,55,.14);border-radius:999px;padding:12px 26px;font:600 16px system-ui;cursor:pointer">Verify</button>
  <pre id="out" style="white-space:pre-wrap;background:#F0EFEB;border-radius:14px;padding:14px;font-size:13px;display:none"></pre>
</div>

<p style="font-size:14px;color:#6b7280">Endpoints: <code>POST /verify</code> · <code>POST /price</code> ·
<code>POST /triage</code> · <code>GET /health</code> ·
First production consumer: <a href="https://www.onlist.ai" style="color:inherit">onlist.ai</a></p>

<script>
const read = (file) => new Promise((ok) => {
  const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(file);
});
document.getElementById("go").onclick = async () => {
  const out = document.getElementById("out");
  out.style.display = "block";
  out.textContent = "examining…";
  const frames = await Promise.all([...document.getElementById("f").files].slice(0, 4).map(read));
  const res = await fetch("/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: document.getElementById("t").value || "item", frames }),
  });
  const v = await res.json();
  out.textContent = v.error ? v.error :
    (v.samePhysicalObject && v.isRealScene && v.matchesTitle
      ? "✓ VERIFIED — " : "⛔ REFUSED — ") + JSON.stringify(v, null, 2);
};
</script>`;

// Verify over data-URLs (the CLI path reads files; HTTP takes them inline).
const verifyDataURLs = (title: string, frames: string[]) =>
  verifyParts(title, frames.slice(0, 4).map((url) => ({ type: "image_url" as const, image_url: { url } })));

async function readBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

const json = (res: import("node:http").ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(PAGE);
    }
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { ok: true, models: MODELS });
    }
    if (req.method === "POST" && req.url === "/verify") {
      const b = await readBody(req);
      const verdict = await verifyDataURLs(String(b.title ?? ""), Array.isArray(b.frames) ? b.frames.map(String) : []);
      return json(res, verdict ? 200 : 422, verdict ?? { error: "no verdict" });
    }
    if (req.method === "POST" && req.url === "/price") {
      const b = await readBody(req);
      const call = await priceItem(String(b.title ?? ""), (b.verdict as Verdict | undefined) ?? null);
      return json(res, call ? 200 : 422, call ?? { error: "no price" });
    }
    if (req.method === "POST" && req.url === "/triage") {
      const b = await readBody(req);
      const result = await triageClaims(
        String(b.title ?? ""),
        Number(b.priceUSD ?? 0),
        Array.isArray(b.claims) ? (b.claims as never[]) : [],
      );
      return json(res, result ? 200 : 422, result ?? { error: "no triage" });
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: String((e as Error).message ?? e) });
  }
}).listen(PORT, () => console.log(`onlist-agent listening on :${PORT}`));
