// Thin HTTP wrapper — this is what gets deployed to Alibaba Cloud for the
// proof-of-deployment recording. Same agent, three endpoints + a one-page UI.
//
//   POST /verify  { title, frames: [dataURL…] }        → Verdict
//   POST /price   { title, verdict? }                  → PriceCall
//   POST /triage  { title, priceUSD, claims: [...] }   → TriageResult
//   GET  /        → minimal demo page
//   GET  /health  → { ok, models }

import { createServer } from "node:http";
import { networkInterfaces } from "node:os";

import { MODELS } from "./qwen.js";
import { priceItem } from "./price.js";
import { triageClaims } from "./triage.js";
import { verifyParts, type Verdict } from "./verify.js";

const PORT = Number(process.env.PORT ?? 8080);

// LAN address for the QR: a phone scanning a QR that encodes "localhost"
// would try to connect to itself. Always advertise a reachable host.
const lanIP = Object.values(networkInterfaces()).flat()
  .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
const LAN_URL = lanIP ? `http://${lanIP}:${PORT}/` : null;

const PAGE = `<!doctype html><meta charset="utf-8"><title>onlist-agent</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body { font: 16px/1.5 -apple-system, system-ui; background: #F0EFEB; color: #1F2937;
         max-width: 480px; margin: 0 auto; padding: 32px 18px; }
  .wordmark { font-size: 22px; font-weight: 800; letter-spacing: -0.01em; margin-bottom: 22px; }
  .dot { color: #DD7A51; }
  .tiny { font-size: 12px; color: rgba(31,41,55,.45); word-break: break-all; }

  /* desktop: QR only */
  #qr { display: none; flex-direction: column; gap: 18px; align-items: center; text-align: center;
        background: #fff; border-radius: 28px; padding: 44px 24px;
        box-shadow: 0 18px 44px rgba(31,41,55,.10); }
  #qr img { border-radius: 16px; }
  #qr b { font-size: 18px; }

  /* phone: one shoot zone */
  #app { display: none; }
  #shoot { display: flex; flex-direction: column; align-items: center; justify-content: center;
           gap: 8px; width: 100%; min-height: 240px; cursor: pointer;
           background: #fff; border: 2px dashed rgba(31,41,55,.18); border-radius: 28px;
           box-shadow: 0 18px 44px rgba(31,41,55,.08); transition: border-color .2s; }
  #shoot:active { border-color: #DD7A51; }
  #shoot svg { width: 40px; height: 40px; color: #DD7A51; }
  #shoot b { font-size: 18px; }
  #shoot small { color: rgba(31,41,55,.5); }
  #tray { display: flex; gap: 8px; justify-content: center; margin-top: 14px; }
  #tray img { width: 60px; height: 60px; object-fit: cover; border-radius: 12px; }

  #busy { display: none; text-align: center; padding: 60px 0; }
  .spin { width: 34px; height: 34px; border: 3px solid rgba(31,41,55,.15);
          border-top-color: #DD7A51; border-radius: 50%; margin: 0 auto 14px;
          animation: sp 0.8s linear infinite; }
  @keyframes sp { to { transform: rotate(360deg); } }

  .panel { display: none; text-align: center; background: #fff; border-radius: 28px; padding: 30px 22px;
           box-shadow: 0 18px 44px rgba(31,41,55,.10); }
  #verdict { font-size: 26px; font-weight: 800; }
  #res.ok #verdict { color: #2E7D5B; }
  #res.no #verdict { color: #DD7A51; }
  /* editable item name — corrects a mis-ID without a heavy form */
  .nameedit { border: 0; background: transparent; text-align: center; width: 100%;
              font: 600 18px -apple-system, system-ui; color: rgba(31,41,55,.85); margin-top: 8px; }
  .nameedit:focus { background: #F0EFEB; border-radius: 12px; outline: none; }
  .condline { font-size: 14px; color: rgba(31,41,55,.5); margin-top: 4px; }
  .chips { display: flex; gap: 7px; flex-wrap: wrap; justify-content: center; margin-top: 14px; }
  .chips span { border-radius: 999px; padding: 6px 13px; font-size: 12.5px; font-weight: 600; }
  .c-green { background: #E4F1E9; color: #2E7D5B; }
  .c-coral { background: #FBE7DF; color: #B45838; }
  .why { margin-top: 18px; }
  .why summary { list-style: none; cursor: pointer; font-size: 13px; font-weight: 700;
                 color: rgba(31,41,55,.5); display: inline-flex; align-items: center; gap: 5px; }
  .why summary::-webkit-details-marker { display: none; }
  .why summary .chev { transition: transform .2s; }
  .why[open] summary .chev { transform: rotate(90deg); }
  .why p { font-size: 13px; line-height: 1.5; color: rgba(31,41,55,.55); margin: 10px 0 0; }
  .cta { width: 100%; margin-top: 20px; border: 0; background: #1F2937; color: #fff;
         border-radius: 18px; padding: 19px; font: 800 18px -apple-system, system-ui; cursor: pointer;
         box-shadow: 0 12px 28px rgba(31,41,55,.22); }
  .cta:disabled { opacity: .45; box-shadow: none; }
  .ghostbtn { margin-top: 14px; border: 0; background: transparent; color: rgba(31,41,55,.5);
              font: 700 14px -apple-system, system-ui; cursor: pointer; }
  #priceBig { font-size: 44px; font-weight: 800; letter-spacing: -0.02em; margin-top: 4px; }
  #priceSub { font-size: 14px; color: rgba(31,41,55,.5); margin-top: 2px; }
  #itemName, #mItem { font-size: 15px; font-weight: 600; color: rgba(31,41,55,.7); }
  /* comps: clean minimal list, not pills */
  .complist { text-align: left; margin-top: 18px; }
  .comprow { display: flex; justify-content: space-between; gap: 12px; padding: 12px 2px;
             border-bottom: 1px solid rgba(31,41,55,.08); font-size: 14px; }
  .comprow:last-child { border-bottom: 0; }
  .comprow .lbl { color: rgba(31,41,55,.6); }
  .comprow .amt { font-weight: 700; white-space: nowrap; }
  /* listing + buyers (manage panel) */
  .listing { display: flex; justify-content: space-between; align-items: center; gap: 12px;
             text-align: left; background: #F7F6F2; border-radius: 18px; padding: 15px 16px; }
  .listing .lp { font-size: 22px; font-weight: 800; }
  .vbadge { font-size: 11px; font-weight: 700; color: #2E7D5B; background: #E4F1E9;
            border-radius: 999px; padding: 3px 9px; display: inline-block; margin-top: 4px; }
  .sect { text-align: left; font-size: 13px; font-weight: 700; color: rgba(31,41,55,.5);
          margin: 22px 0 8px; }
  .buyer { text-align: left; border: 1px solid rgba(31,41,55,.1); border-radius: 16px;
           padding: 13px 14px; margin-top: 10px; }
  .buyer.top { border-color: #2E7D5B; background: #FbFdFb; }
  .buyer .bhead { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .buyer .bname { font-weight: 700; }
  .buyer .score { font-weight: 800; font-size: 13px; }
  .buyer .reply { font-size: 13px; color: rgba(31,41,55,.6); margin-top: 8px;
                  background: #F0EFEB; border-radius: 12px; padding: 9px 11px; }
  .buyer .accept { margin-top: 10px; width: 100%; border: 0; background: #2E7D5B; color: #fff;
                   border-radius: 12px; padding: 11px; font: 700 14px -apple-system, system-ui; cursor: pointer; }
  #doneNote { font-size: 14px; color: rgba(31,41,55,.55); margin-top: 8px; }

  .foot { display: block; text-align: center; font-size: 12px; color: rgba(31,41,55,.38);
          margin-top: 22px; }
  .foot a { color: inherit; }
</style>
<body>
<div class="wordmark">onlist-agent<span class="dot">.</span></div>

<div id="qr">
  <img id="qrimg" width="240" height="240" alt="QR">
  <div><b>Scan with your phone</b><div id="qrurl" class="tiny"></div></div>
</div>

<div id="app">
  <label id="shoot">
    <input id="cap" type="file" accept="image/*" capture="environment" hidden>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.6l1.2-1.8A2 2 0 0 1 10 3.3h4a2 2 0 0 1 1.7.9L16.9 6h1.6A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/><circle cx="12" cy="12.5" r="3.4"/></svg>
    <b id="shootLabel">Photograph your item</b>
    <small id="shootHint">two angles — tap to start</small>
    <div id="tray"></div>
  </label>

  <div id="busy"><div class="spin"></div><span id="busyLabel">Checking if it's real…</span></div>

  <div id="res" class="panel">
    <div id="verdict"></div>
    <input id="nameEdit" class="nameedit" spellcheck="false" placeholder="name the item">
    <div id="condline" class="condline"></div>
    <div id="chips" class="chips"></div>
    <details class="why" id="whyRes"><summary><span class="chev">›</span> Why?</summary><p id="why"></p></details>
    <button id="sell" class="cta" hidden>Sell it for me →</button>
    <button id="again" class="ghostbtn">Try another</button>
  </div>

  <div id="price" class="panel">
    <div id="itemName"></div>
    <div id="priceBig"></div>
    <div id="priceSub"></div>
    <div id="comps" class="complist"></div>
    <details class="why" id="whyPrice"><summary><span class="chev">›</span> How it got there</summary><p id="priceWhy"></p></details>
    <button id="list" class="cta">List it</button>
    <button id="again2" class="ghostbtn">Start over</button>
  </div>

  <div id="manage" class="panel">
    <div class="listing">
      <div><div id="mItem"></div><span class="vbadge">✓ verified real</span></div>
      <div class="lp" id="mPrice"></div>
    </div>
    <div class="sect">The agent is screening buyers</div>
    <div id="buyers"></div>
    <button id="again3" class="ghostbtn" style="margin-top:16px">Done</button>
  </div>
</div>

<div class="foot"><a href="https://www.qwencloud.com">Powered by Qwen on Alibaba Cloud</a></div>
<script>
var $ = function (id) { return document.getElementById(id); };
var frames = [];

// ≤1024px JPEG in the browser: kills 7MB HEICs and formats the API may refuse.
function shrink(file) {
  return new Promise(function (ok) {
    var img = new Image();
    img.onload = function () {
      var s = Math.min(1, 1024 / Math.max(img.width, img.height));
      var c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = function () { URL.revokeObjectURL(img.src); ok(null); };
    img.src = URL.createObjectURL(file);
  });
}

var verdict = null;
var lastPrice = null;

function renderTray() {
  $("tray").innerHTML = frames.map(function (d) { return '<img src="' + d + '">'; }).join("");
}
function chip(text, cls) { return '<span class="' + cls + '">' + text + '</span>'; }
function esc(s) { return String(s).replace(/[<>&]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]; }); }
function panel(id, label) {
  ["shoot", "res", "price", "manage"].forEach(function (p) { $(p).style.display = "none"; });
  $("busy").style.display = id === "busy" ? "block" : "none";
  if (id === "busy") { $("busyLabel").textContent = label; return; }
  $(id).style.display = id === "shoot" ? "flex" : "block";
}

// Each tap of the shoot zone opens the native camera for one photo.
// Two photos in → the check fires by itself. No verify button.
$("cap").onchange = function () {
  var f = this.files[0]; this.value = "";
  if (!f) return;
  shrink(f).then(function (d) {
    if (!d) return;
    frames.push(d); renderTray();
    if (frames.length === 1) {
      $("shootLabel").textContent = "One more angle";
      $("shootHint").textContent = "tap again from a different side";
    } else {
      verify();
    }
  });
};

function verify() {
  panel("busy", "Checking if it's real…");
  fetch("/verify", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "item", frames: frames }),
  }).then(function (r) { return r.json(); }).then(function (v) {
    if (v.error) throw new Error(v.error);
    verdict = v;
    var ok = v.samePhysicalObject && v.isRealScene && v.matchesTitle && v.confidence >= 0.6;
    $("res").className = "panel " + (ok ? "ok" : "no");
    $("verdict").textContent = ok ? "Real ✓" : "Not real ✕";
    // item name is editable — tap to fix a mis-ID before pricing
    $("nameEdit").value = v.itemName || "";
    $("nameEdit").style.display = ok ? "block" : "none";
    $("condline").textContent = ok && v.condition ? "Condition: " + v.condition : "";
    // short chips only: green = passed checks, coral = defects (each ≤4 words from the model)
    var chips = [];
    if (v.isRealScene) chips.push(chip("Live scene", "c-green"));
    else chips.push(chip("Photo of a screen", "c-coral"));
    if (v.samePhysicalObject) chips.push(chip("One object", "c-green"));
    (v.defects || []).forEach(function (d) { chips.push(chip(esc(d), "c-coral")); });
    $("chips").innerHTML = chips.join("");
    $("why").textContent = v.reasoning || "";
    $("whyRes").open = false;
    $("sell").hidden = !ok;
    panel("res");
  }).catch(function (e) {
    $("res").className = "panel no"; $("verdict").textContent = "Something broke";
    $("nameEdit").style.display = "none"; $("condline").textContent = "";
    $("chips").innerHTML = ""; $("why").textContent = String(e.message || e);
    $("sell").hidden = true; panel("res");
  });
}

function itemName() { return ($("nameEdit").value || verdict.itemName || "item").trim(); }

$("sell").onclick = function () {
  panel("busy", "Finding what it's worth…");
  fetch("/price", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: itemName(), verdict: verdict }),
  }).then(function (r) { return r.json(); }).then(function (p) {
    if (p.error) throw new Error(p.error);
    lastPrice = p;
    $("itemName").textContent = itemName();
    $("priceBig").textContent = "$" + p.suggestedUSD;
    $("priceSub").textContent = "won't go below $" + p.floorUSD;
    $("comps").innerHTML = (p.comps || []).slice(0, 3).map(function (c) {
      return '<div class="comprow"><span class="lbl">' + esc(c.label) + '</span><span class="amt">$' + c.priceUSD + '</span></div>';
    }).join("");
    $("priceWhy").textContent = p.rationale || "";
    $("whyPrice").open = false;
    $("list").textContent = "List it for $" + p.suggestedUSD;
    panel("price");
  }).catch(function (e) {
    $("res").className = "panel no"; $("verdict").textContent = "Couldn't price it";
    $("nameEdit").style.display = "none"; $("condline").textContent = "";
    $("chips").innerHTML = ""; $("why").textContent = String(e.message || e);
    $("sell").hidden = true; panel("res");
  });
};

// Listing it flips to the manage view: the actual listing + the agent screening
// buyers. Demo buyers mirror the seeded board (a real inquiry, a scam, a lowball).
var DEMO_BUYERS = [
  { id: "b1", name: "Alex", message: "Is this still available? Can pick up today near downtown, cash." },
  { id: "b2", name: "shipping_agent_pro", message: "I buy for a client overseas, I pay extra $200 by certified check, my shipper collects." },
  { id: "b3", name: "Rita", message: "Would you take half?" }
];

$("list").onclick = function () {
  $("mItem").textContent = itemName();
  $("mPrice").textContent = "$" + (lastPrice ? lastPrice.suggestedUSD : "");
  $("buyers").innerHTML = "";
  panel("busy", "The agent is screening buyers…");
  fetch("/triage", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: itemName(), priceUSD: lastPrice ? lastPrice.suggestedUSD : 0, claims: DEMO_BUYERS }),
  }).then(function (r) { return r.json(); }).then(function (t) {
    var ranked = (t && t.ranked) || [];
    $("buyers").innerHTML = ranked.map(function (b, i) {
      var who = (DEMO_BUYERS.filter(function (d) { return d.id === b.id; })[0] || {}).name || b.id;
      var flags = (b.flags || []).map(function (f) { return chip(esc(f), "c-coral"); }).join("");
      var acc = i === 0 ? '<button class="accept">Accept top buyer</button>' : "";
      return '<div class="buyer' + (i === 0 ? " top" : "") + '">' +
        '<div class="bhead"><span class="bname">' + esc(who) + '</span><span class="score">' + b.score + '/100</span></div>' +
        '<div class="chips" style="justify-content:flex-start;margin-top:8px">' + flags + '</div>' +
        '<div class="reply">' + esc(b.draftReply || "") + '</div>' + acc + '</div>';
    }).join("");
    var top = (ranked[0] && (DEMO_BUYERS.filter(function (d) { return d.id === ranked[0].id; })[0] || {}).name) || "buyer";
    var accBtn = $("buyers").querySelector(".accept");
    if (accBtn) accBtn.onclick = function () { this.textContent = "✓ Accepted — meeting " + top; this.disabled = true; };
    panel("manage");
  }).catch(function () {
    $("buyers").innerHTML = '<div class="reply">Buyer screening runs in the app.</div>';
    panel("manage");
  });
};

function reset() {
  frames = []; verdict = null; lastPrice = null; renderTray();
  $("shootLabel").textContent = "Photograph your item";
  $("shootHint").textContent = "two angles — tap to start";
  panel("shoot");
}
$("again").onclick = reset;
$("again2").onclick = reset;
$("again3").onclick = reset;

// Default to the phone app; show the QR ONLY on a real desktop (hover + fine pointer).
var LAN = ${JSON.stringify(LAN_URL)};
var isDesktop = matchMedia("(hover: hover) and (pointer: fine)").matches && !("ontouchstart" in window);
if (isDesktop) {
  var local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  var target = (local && LAN) ? LAN : location.href;
  $("qr").style.display = "flex";
  $("qrimg").src = "https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=" + encodeURIComponent(target);
  $("qrurl").textContent = target;
} else {
  $("app").style.display = "block";
}
</script>`;

// Verify over data-URLs (the CLI path reads files; HTTP takes them inline).
const verifyDataURLs = (title: string, frames: string[]) =>
  verifyParts(title, frames.slice(0, 4).map((url) => ({ type: "image_url" as const, image_url: { url } })));

const MAX_BODY = 15 * 1024 * 1024; // 4 downscaled frames fit comfortably

async function readBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new BodyTooLarge();
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

class BodyTooLarge extends Error {
  constructor() { super("body too large (15MB cap) — downscale your frames"); }
}

const json = (res: import("node:http").ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  try {
    const path = (req.url ?? "/").split("?")[0];  // ignore query so /?v=2 cache-busts
    if (req.method === "GET" && path === "/") {
      // no-store: the demo page iterates fast; a phone must never show a stale build
      res.writeHead(200, {
        "Content-Type": "text/html",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
      });
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
    json(res, e instanceof BodyTooLarge ? 413 : 500, { error: String((e as Error).message ?? e) });
  }
}).listen(PORT, () => console.log(`onlist-agent listening on :${PORT}${LAN_URL ? ` → ${LAN_URL}` : ""}`));
