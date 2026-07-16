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
import { verifyAgentic, type Prior, type Verdict } from "./verify.js";
import { recordEvidence, evidenceEnabled } from "./evidence.js";
import { weeklyDigest } from "./digest.js";
import { localBoard } from "./board/local.js";

// FC_SERVER_PORT is set by Alibaba Function Compute custom runtimes; PORT for
// generic hosts; 8080 for local. Listens on 0.0.0.0 so it works in a container.
const PORT = Number(process.env.FC_SERVER_PORT ?? process.env.PORT ?? 8080);

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
  #slots { display: flex; gap: 12px; justify-content: center; margin-top: 4px; }
  #slots:empty { display: none; }
  #slots .slot { width: 66px; height: 66px; border-radius: 14px; }
  #slots .slot img { width: 100%; height: 100%; object-fit: cover; border-radius: 14px; }
  #slots .ph { border: 2px dashed rgba(31,41,55,.25); display: flex; align-items: center;
               justify-content: center; color: rgba(31,41,55,.3); font-size: 26px; font-weight: 300; }

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
  #res.mid #verdict { color: #B98A1C; }
  /* editable item name — corrects a mis-ID without a heavy form */
  .nameedit { border: 0; background: transparent; text-align: center; width: 100%;
              font: 600 18px -apple-system, system-ui; color: rgba(31,41,55,.85); margin-top: 8px; }
  .nameedit:focus { background: #F0EFEB; border-radius: 12px; outline: none; }
  .condline { font-size: 14px; color: rgba(31,41,55,.5); margin-top: 4px; }
  .chips { display: flex; gap: 7px; flex-wrap: wrap; justify-content: center; margin-top: 14px; }
  .chips span { border-radius: 999px; padding: 6px 13px; font-size: 12.5px; font-weight: 600; }
  .c-green { background: #E4F1E9; color: #2E7D5B; }
  .c-coral { background: #FBE7DF; color: #B45838; }
  .c-amber { background: #F8EFD8; color: #91711B; }
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
  .buyer { display: flex; align-items: center; gap: 11px; text-align: left;
           background: #F7F6F2; border-radius: 14px; padding: 12px 13px; margin-top: 9px; }
  .buyer.bad { opacity: .5; }
  .buyer.bad .bname { text-decoration: line-through; }
  .bic { width: 26px; height: 26px; flex: 0 0 26px; border-radius: 50%; color: #fff;
         display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; }
  .buyer.good .bic { background: #2E7D5B; }
  .buyer.mid .bic { background: #C98A2B; }
  .buyer.bad .bic { background: #C0503C; }
  .bmain { flex: 1; }
  .bmain .bname { font-weight: 700; font-size: 15px; }
  .bmain .bword { font-size: 12px; color: rgba(31,41,55,.5); }
  .bscore { font-weight: 800; font-size: 13px; color: rgba(31,41,55,.45); }
  .topreply { text-align: left; font-size: 13px; color: rgba(31,41,55,.62); background: #fff;
              border-radius: 12px; padding: 11px 13px; margin-top: 12px; }
  .topreply b { color: rgba(31,41,55,.5); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  #accept { margin-top: 12px; width: 100%; border: 0; background: #2E7D5B; color: #fff;
            border-radius: 14px; padding: 14px; font: 700 15px -apple-system, system-ui; cursor: pointer; }
  #accept:disabled { opacity: 1; background: #E4F1E9; color: #2E7D5B; }
  #doneNote { font-size: 14px; color: rgba(31,41,55,.55); margin-top: 8px; }
  /* autopilot timeline: steps check off as the agent works */
  #auto h3 { font-size: 16px; margin: 0 0 14px; color: rgba(31,41,55,.8); }
  .astep { display: flex; align-items: center; gap: 12px; text-align: left;
           background: #F7F6F2; border-radius: 14px; padding: 13px 14px; margin-top: 9px;
           opacity: .35; transition: opacity .25s; }
  .astep.on { opacity: 1; }
  .astep .tick { width: 26px; height: 26px; flex: 0 0 26px; border-radius: 50%;
                 background: #E4F1E9; color: #2E7D5B; display: flex; align-items: center;
                 justify-content: center; font-weight: 800; font-size: 14px; }
  .astep.working .tick { background: #F8EFD8; color: #C98A2B; }
  .astep .amain { flex: 1; }
  .astep .at { font-weight: 700; font-size: 14.5px; }
  .astep .ad { font-size: 12px; color: rgba(31,41,55,.5); }
  .adjust { border: 0; background: transparent; color: rgba(31,41,55,.45); cursor: pointer;
            font: 600 12px -apple-system, system-ui; text-decoration: underline; padding: 2px 4px; }

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
    <svg id="shootIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.6l1.2-1.8A2 2 0 0 1 10 3.3h4a2 2 0 0 1 1.7.9L16.9 6h1.6A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/><circle cx="12" cy="12.5" r="3.4"/></svg>
    <b id="shootLabel">Photograph your item</b>
    <div id="slots"></div>
    <small id="shootHint"></small>
  </label>

  <div id="busy"><div class="spin"></div><span id="busyLabel">Checking if it's real…</span></div>

  <div id="res" class="panel">
    <div id="verdict"></div>
    <input id="nameEdit" class="nameedit" spellcheck="false" placeholder="name the item">
    <div id="condline" class="condline"></div>
    <div id="chips" class="chips"></div>
    <details class="why" id="whyRes"><summary><span class="chev">›</span> Why?</summary><p id="why"></p></details>
    <button id="more" class="cta" hidden>Add that shot 📷</button>
    <button id="again" class="ghostbtn">Try another</button>
  </div>

  <div id="auto" class="panel">
    <h3>Autopilot engaged</h3>
    <div class="astep" id="as1"><span class="tick">✓</span><div class="amain"><div class="at">Verified real</div><div class="ad" id="as1d"></div></div></div>
    <div class="astep" id="as2"><span class="tick">…</span><div class="amain"><div class="at">Pricing from live comps</div><div class="ad" id="as2d"></div></div></div>
    <div class="astep" id="as3"><span class="tick">…</span><div class="amain"><div class="at">Listing</div><div class="ad" id="as3d"></div></div></div>
    <div class="astep" id="as4"><span class="tick">…</span><div class="amain"><div class="at">Screening buyers</div><div class="ad" id="as4d"></div></div></div>
  </div>

  <div id="manage" class="panel">
    <div class="listing">
      <div><div id="mItem"></div><span class="vbadge">✓ verified real</span></div>
      <div style="text-align:right"><div class="lp" id="mPrice"></div>
        <button id="adjust" class="adjust">adjust price</button></div>
    </div>
    <details class="why" id="whyPrice"><summary><span class="chev">›</span> How the agent priced it</summary>
      <div id="comps" class="complist"></div><p id="priceWhy"></p></details>
    <div class="sect">The agent screened your buyers</div>
    <div id="buyers"></div>
    <div id="topreply" class="topreply" hidden></div>
    <button id="accept" hidden>Accept top buyer</button>
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
var pending = null;   // agent asked for one more angle: { reasoning, request }

// Two-slot shoot UI: filled thumbnails + a dashed placeholder for what's still needed.
function renderShoot() {
  var slots = "";
  if (frames.length) {
    for (var i = 0; i < 2; i++) {
      slots += frames[i]
        ? '<div class="slot"><img src="' + frames[i] + '"></div>'
        : '<div class="slot ph">+</div>';
    }
  }
  $("slots").innerHTML = slots;
  if (frames.length === 0) {
    $("shootIcon").style.display = ""; $("shootLabel").style.display = "";
    $("shootLabel").textContent = "Photograph your item"; $("shootHint").textContent = "";
  } else if (frames.length === 1) {
    $("shootIcon").style.display = "none"; $("shootLabel").style.display = "none";
    $("shootHint").textContent = "1 more photo required";
  }
}
function chip(text, cls) { return '<span class="' + cls + '">' + text + '</span>'; }
function esc(s) { return String(s).replace(/[<>&]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]; }); }
function panel(id, label) {
  ["shoot", "res", "auto", "manage"].forEach(function (p) { $(p).style.display = "none"; });
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
    frames.push(d); renderShoot();
    if (pending ? frames.length >= 3 : frames.length >= 2) verify();
  });
};

function verify() {
  panel("busy", "Checking if it's real…");
  fetch("/verify", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "item", frames: frames, round: pending ? 2 : 1, prior: pending }),
  }).then(function (r) { return r.json(); }).then(function (v) {
    if (v.error) throw new Error(v.error);
    verdict = v;
    if (v.decision === "need_more") {
      // the agent is unsure and says exactly what shot would settle it
      pending = { reasoning: v.reasoning || "", request: v.request || "" };
      $("res").className = "panel mid";
      $("verdict").textContent = "One more angle";
      $("nameEdit").style.display = "none"; $("condline").textContent = "";
      $("chips").innerHTML = chip("Agent wants proof", "c-amber");
      $("why").textContent = v.request || "Take one more photo from a different angle.";
      $("whyRes").open = true;
      $("more").hidden = false;
      panel("res");
      return;
    }
    pending = null; $("more").hidden = true;
    var ok = v.decision ? v.decision === "verified"
           : (v.samePhysicalObject && v.isRealScene && v.matchesTitle && v.confidence >= 0.6);
    $("res").className = "panel " + (ok ? "ok" : "no");
    $("verdict").textContent = ok ? "Real ✓" : "Not real ✕";
    // item name is editable — tap to fix a mis-ID before pricing
    $("nameEdit").value = v.itemName || "";
    $("nameEdit").style.display = ok ? "block" : "none";
    $("condline").textContent = ok && v.condition ? "Condition: " + v.condition : "";
    if (ok) { runAutopilot(v); return; }
    // refused: show the honest verdict — this is the anti-fake gate doing its job
    var chips = [];
    if (v.isRealScene) chips.push(chip("Live scene", "c-green"));
    else chips.push(chip("Photo of a screen", "c-coral"));
    if (v.samePhysicalObject) chips.push(chip("One object", "c-green"));
    (v.defects || []).forEach(function (d) { chips.push(chip(esc(d), "c-coral")); });
    $("chips").innerHTML = chips.join("");
    $("why").textContent = v.reasoning || "";
    $("whyRes").open = false;
    panel("res");
  }).catch(function (e) {
    $("res").className = "panel no"; $("verdict").textContent = "Something broke";
    $("nameEdit").style.display = "none"; $("condline").textContent = "";
    $("chips").innerHTML = ""; $("why").textContent = String(e.message || e);
    panel("res");
  });
}

// ————— THE AUTOPILOT: verified → priced → listed → buyers screened, hands-free.
// The human owns the money at the end (adjust price, accept a buyer) — but the
// selling legwork flies on its own.
function step(id, state, detail) {
  var el = $(id);
  el.className = "astep " + state;
  el.querySelector(".tick").textContent = state === "working" ? "…" : "✓";
  if (detail != null) $(id + "d").textContent = detail;
}
function runAutopilot(v) {
  panel("auto");
  step("as1", "on", (v.itemName || "item") + " · " + (v.condition || ""));
  step("as2", "on working", "searching the live market…");
  fetch("/price", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: v.itemName || "item", verdict: v }),
  }).then(function (r) { return r.json(); }).then(function (p) {
    if (p.error) throw new Error(p.error);
    lastPrice = p;
    step("as2", "on", "$" + p.suggestedUSD + " · floor $" + p.floorUSD);
    step("as3", "on working", "");
    setTimeout(function () {
      step("as3", "on", "live on the board at $" + p.suggestedUSD);
      step("as4", "on working", "ranking claims, drafting replies…");
      fetch("/triage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: v.itemName || "item", priceUSD: p.suggestedUSD,
                               floorUSD: p.floorUSD, claims: DEMO_BUYERS }),
      }).then(function (r) { return r.json(); }).then(function (tg) {
        var n = (tg && tg.ranked || []).length;
        step("as4", "on", n + " buyers screened");
        setTimeout(function () { showManage(v, p, tg); }, 700);
      }).catch(function () { step("as4", "on", "screening failed — buyers arrive later");
        setTimeout(function () { showManage(v, p, null); }, 700); });
    }, 500);
  }).catch(function (e) {
    $("res").className = "panel no"; $("verdict").textContent = "Couldn't price it";
    $("nameEdit").style.display = "none"; $("condline").textContent = "";
    $("chips").innerHTML = ""; $("why").textContent = String(e.message || e);
    panel("res");
  });
}

function itemName() { return (verdict && verdict.itemName || "item").trim(); }

// Listing it flips to the manage view: the actual listing + the agent screening
// buyers. Demo buyers mirror the seeded board (a real inquiry, a scam, a lowball).
var DEMO_BUYERS = [
  { id: "b1", name: "Alex", message: "Is this still available? Can pick up today near downtown, cash." },
  { id: "b2", name: "shipping_agent_pro", message: "I buy for a client overseas, I pay extra $200 by certified check, my shipper collects." },
  { id: "b3", name: "Rita", message: "Would you take half?" }
];

// The landing screen of the autopilot run: the live listing + screened buyers.
// The human's two levers live here — adjust the price, accept a buyer.
function showManage(v, p, tg) {
  $("mItem").textContent = v.itemName || "item";
  $("mPrice").textContent = "$" + p.suggestedUSD;
  $("comps").innerHTML = (p.comps || []).slice(0, 3).map(function (c) {
    return '<div class="comprow"><span class="lbl">' + esc(c.label) + '</span><span class="amt">$' + c.priceUSD + '</span></div>';
  }).join("");
  $("priceWhy").textContent = p.rationale || "";
  $("whyPrice").open = false;
  $("adjust").onclick = function () {
    var now = prompt("Your price (the agent proposed $" + p.suggestedUSD + ", floor $" + p.floorUSD + ")",
                     String(lastPrice ? lastPrice.suggestedUSD : p.suggestedUSD));
    var n = Math.round(Number(now));
    if (Number.isFinite(n) && n > 0) {
      lastPrice = Object.assign({}, p, { suggestedUSD: n });
      $("mPrice").textContent = "$" + n;
    }
  };
  var ranked = (tg && tg.ranked) || [];
  // classify each buyer into good / lowball / scam from score + flags
  function verdictOf(b) {
    var scam = b.score <= 15 || (b.flags || []).some(function (f) { return /scam|overpay|shipping|check|fraud/i.test(f); });
    if (scam) return { cls: "bad", ic: "✕", word: "Likely scam — skip" };
    if (b.score >= 70) return { cls: "good", ic: "✓", word: "Solid — ready to meet" };
    if (b.counterUSD) return { cls: "mid", ic: "~", word: "Lowball — agent counters at $" + b.counterUSD };
    return { cls: "mid", ic: "~", word: "Lowballing" };
  }
  $("buyers").innerHTML = ranked.map(function (b) {
    var who = (DEMO_BUYERS.filter(function (d) { return d.id === b.id; })[0] || {}).name || b.id;
    var w = verdictOf(b);
    return '<div class="buyer ' + w.cls + '"><span class="bic">' + w.ic + '</span>' +
      '<div class="bmain"><div class="bname">' + esc(who) + '</div>' +
      '<div class="bword">' + w.word + '</div></div><span class="bscore">' + b.score + '</span></div>';
  }).join("");
  // only the top buyer gets a drafted reply + an accept button
  var top = ranked[0];
  if (top && top.score >= 70) {
    var who = (DEMO_BUYERS.filter(function (d) { return d.id === top.id; })[0] || {}).name || "buyer";
    $("topreply").innerHTML = "<b>Drafted reply to " + esc(who) + "</b><br>" + esc(top.draftReply || "");
    $("topreply").hidden = false;
    $("accept").hidden = false;
    $("accept").disabled = false;
    $("accept").textContent = "Accept " + who;
    $("accept").onclick = function () { this.textContent = "✓ Accepted — meeting " + who; this.disabled = true; };
  } else {
    $("topreply").hidden = true; $("accept").hidden = true;
  }
  panel("manage");
}

function reset() {
  frames = []; verdict = null; lastPrice = null; pending = null;
  $("more").hidden = true; renderShoot();
  panel("shoot");
}
$("more").onclick = function () { $("cap").click(); };
$("again").onclick = reset;
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
const verifyDataURLs = (title: string, frames: string[], round: number, prior?: Prior) =>
  verifyAgentic(title, frames.slice(0, 4).map((url) => ({ type: "image_url" as const, image_url: { url } })), round, prior);

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
      const round = Number(b.round) === 2 ? 2 : 1;
      const pr = b.prior as { reasoning?: unknown; request?: unknown } | undefined;
      const prior = round === 2 && pr
        ? { reasoning: String(pr.reasoning ?? ""), request: String(pr.request ?? "") }
        : undefined;
      const frames = Array.isArray(b.frames) ? b.frames.map(String) : [];
      const verdict = await verifyDataURLs(String(b.title ?? ""), frames, round, prior);
      if (verdict && evidenceEnabled()) {
        // immutable audit trail on OSS — fire-and-forget, never blocks the phone
        recordEvidence(verdict as unknown as Record<string, unknown>, frames)
          .then((k) => k && console.log(`evidence → oss://${process.env.OSS_BUCKET}/${k}`))
          .catch((e) => console.warn("evidence write failed:", (e as Error).message));
      }
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
        Number(b.priceUSD) || 0,
        Array.isArray(b.claims) ? b.claims as never[] : [],
        Number.isFinite(Number(b.floorUSD)) ? Number(b.floorUSD) : null,
      );
      return json(res, result ? 200 : 422, result ?? { error: "no triage" });
    }
    if (req.url === "/digest" && (req.method === "GET" || req.method === "POST")) {
      const digest = await weeklyDigest(localBoard());
      return json(res, digest ? 200 : 422, digest ?? { error: "no digest" });
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, e instanceof BodyTooLarge ? 413 : 500, { error: String((e as Error).message ?? e) });
  }
}).listen(PORT, "0.0.0.0", () => console.log(`onlist-agent listening on :${PORT}${LAN_URL ? ` → ${LAN_URL}` : ""}`));
