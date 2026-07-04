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
<body style="font:16px/1.5 system-ui;max-width:640px;margin:40px auto;padding:0 16px">
<h1>onlist-agent<span style="color:#DD7A51">.</span></h1>
<p>Autopilot for selling real things: <b>capture → prove-it's-real → price → list → handle buyers</b>.
Humans confirm every money decision.</p>
<p>Endpoints: <code>POST /verify</code> · <code>POST /price</code> · <code>POST /triage</code> · <code>GET /health</code></p>
<p>Powered by Qwen on Alibaba Cloud (${MODELS.text}, ${MODELS.vision}).
First production consumer: <a href="https://www.onlist.ai">onlist.ai</a>.</p>`;

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
