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
import { triageClaims, dealThread } from "./triage.js";
import { verifyAgentic, type Prior, type Verdict } from "./verify.js";
import { recordEvidence, evidenceEnabled } from "./evidence.js";
import { publishToEbay, ebayEnabled } from "./ebay.js";
import { createLabel, upsEnabled } from "./ups.js";
import { mkdirSync, writeFileSync, readFileSync as readFileSyncFs, existsSync as existsSyncFs } from "node:fs";
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
         max-width: 480px; margin: 0 auto; padding: 32px 18px; min-height: 100vh; }
  /* Qwen-style frost gradient blobs behind the glass */
  body::before, body::after { content: ""; position: fixed; z-index: -1; border-radius: 50%;
         filter: blur(70px); opacity: .5; pointer-events: none; }
  body::before { width: 380px; height: 380px; top: -90px; right: -110px;
         background: radial-gradient(circle at 35% 35%, #8B7CF8, #C084FC 60%, transparent 75%); }
  body::after { width: 420px; height: 420px; bottom: -140px; left: -130px;
         background: radial-gradient(circle at 60% 40%, #7DAEF8, #A78BFA 55%, transparent 75%); }
  .wordmark { display: inline-block; font-size: 24px; font-weight: 800; letter-spacing: -0.01em;
              margin-bottom: 22px; line-height: 1.15; }
  .wordmark small { display: block; font-size: 10.5px; font-weight: 300; text-align: justify;
                    text-align-last: justify; color: rgba(31,41,55,.4); margin-top: -2px; }
  .dot { color: #DD7A51; }
  .tiny { font-size: 12px; color: rgba(31,41,55,.45); word-break: break-all; }

  /* desktop: a swinging price tag with the QR */
  #qr { display: none; flex-direction: column; gap: 30px; align-items: center; text-align: center;
        padding-top: 6px; }
  .tagwrap { position: relative; padding-top: 64px;
             transform-origin: 50% 0; animation: swing 7s ease-in-out infinite alternate; }
  @keyframes swing { from { transform: rotate(-2deg); } to { transform: rotate(2deg); } }
  .tagwrap::before { content: ""; position: absolute; top: 0; left: 50%; width: 2.5px; height: 78px;
             transform: translateX(-50%);
             background: linear-gradient(rgba(31,41,55,.0), rgba(31,41,55,.35)); }
  .tag { position: relative; background: rgba(255,255,255,.78);
         -webkit-backdrop-filter: blur(26px) saturate(1.6); backdrop-filter: blur(26px) saturate(1.6);
         border: 1px solid rgba(255,255,255,.85); border-radius: 26px;
         padding: 56px 44px 34px; box-shadow: 0 30px 70px rgba(80,70,160,.18); }
  .taghole { position: absolute; top: 18px; left: 50%; transform: translateX(-50%);
             width: 16px; height: 16px; border-radius: 50%;
             background: #EFEDE8; border: 4.5px solid rgba(31,41,55,.16);
             box-shadow: inset 0 1px 2px rgba(31,41,55,.18); }
  #qr img { border-radius: 14px; display: block; }
  .tagtitle { margin-top: 26px; padding-top: 22px; border-top: 1.5px dashed rgba(31,41,55,.10);
              font-size: 30px; font-weight: 900; letter-spacing: .12em; color: #1F2937; }
  /* powered-by: quiet label, logos row under it */
  .powered { display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .powered .plabel { font-size: 11.5px; font-weight: 600; letter-spacing: .04em;
             color: rgba(31,41,55,.38); text-transform: uppercase; }
  .powered .plogos { display: flex; align-items: center; gap: 22px; }
  .powered .brand { display: inline-flex; align-items: center; gap: 6px; font-weight: 700;
             font-size: 14.5px; color: rgba(31,41,55,.78); }
  .powered svg { width: 16px; height: 16px; }
  .powered svg.qwenlogo { width: auto; height: 16px; opacity: .85; }

  /* phone: one shoot zone */
  #app { display: none; }
  #shoot { display: flex; flex-direction: column; align-items: center; justify-content: center;
           gap: 26px; width: 100%; min-height: 66vh; cursor: pointer; padding: 10px 0; }
  #shoot:active .vf { transform: scale(.97); }
  /* the scanner viewfinder */
  .vf { position: relative; width: 236px; height: 236px; border-radius: 26px;
        display: flex; align-items: center; justify-content: center;
        background: rgba(124,58,237,.05); overflow: hidden; transition: transform .15s; }
  .vf .cor { position: absolute; width: 30px; height: 30px; border: 3px solid #7C3AED; }
  .vf .c1 { top: 10px; left: 10px; border-right: 0; border-bottom: 0; border-radius: 10px 0 0 0; }
  .vf .c2 { top: 10px; right: 10px; border-left: 0; border-bottom: 0; border-radius: 0 10px 0 0; }
  .vf .c3 { bottom: 10px; left: 10px; border-right: 0; border-top: 0; border-radius: 0 0 0 10px; }
  .vf .c4 { bottom: 10px; right: 10px; border-left: 0; border-top: 0; border-radius: 0 0 10px 0; }
  .scanline { position: absolute; left: 14%; right: 14%; height: 3px; border-radius: 3px;
              background: linear-gradient(90deg, transparent, #8B5CF6 30%, #C084FC 70%, transparent);
              box-shadow: 0 0 14px 3px rgba(139,92,246,.45);
              animation: scan 2.4s ease-in-out infinite alternate; }
  @keyframes scan { from { top: 14%; } to { top: 84%; } }
  #shoot svg { width: 44px; height: 44px; color: #7C3AED; opacity: .85; }
  #shoot b { font-size: 21px; font-weight: 800; letter-spacing: -0.01em;
             background: linear-gradient(95deg, #4F46E5, #9333EA 60%, #DD7A51);
             -webkit-background-clip: text; background-clip: text; color: transparent; }
  #shoot small { font-size: 15px; font-weight: 600; color: rgba(31,41,55,.45); letter-spacing: .01em; }
  #slots { display: flex; gap: 10px; justify-content: center; }
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

  .panel { display: none; text-align: center; border-radius: 28px; padding: 30px 22px;
           background: rgba(255,255,255,.62);
           -webkit-backdrop-filter: blur(26px) saturate(1.6); backdrop-filter: blur(26px) saturate(1.6);
           border: 1px solid rgba(255,255,255,.75);
           box-shadow: 0 18px 44px rgba(80,70,160,.12); }
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
  .cta { width: 100%; margin-top: 20px; border: 0; color: #fff;
         background: linear-gradient(120deg, #4F46E5, #7C3AED 55%, #A855F7);
         border-radius: 18px; padding: 19px; font: 800 18px -apple-system, system-ui; cursor: pointer;
         box-shadow: 0 12px 28px rgba(99,60,237,.35); }
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
             text-align: left; background: rgba(255,255,255,.55); border-radius: 18px; padding: 15px 16px; }
  .listing .lp { font-size: 22px; font-weight: 800; }
  .vbadge { font-size: 11px; font-weight: 700; color: #2E7D5B; background: #E4F1E9;
            border-radius: 999px; padding: 3px 9px; display: inline-block; margin-top: 4px; }
  .sect { text-align: left; font-size: 13px; font-weight: 700; color: rgba(31,41,55,.5);
          margin: 22px 0 8px; }
  .buyer { display: flex; align-items: center; gap: 11px; text-align: left;
           background: rgba(255,255,255,.55); border-radius: 14px; padding: 12px 13px; margin-top: 9px; }
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
  #doneNote { font-size: 14px; color: rgba(31,41,55,.55); margin-top: 8px; }
  /* autopilot timeline: steps check off as the agent works */
  #auto h3 { font-size: 16px; margin: 0 0 14px; color: rgba(31,41,55,.8); }
  .astep { display: flex; align-items: center; gap: 12px; text-align: left;
           background: rgba(255,255,255,.55); border-radius: 14px; padding: 13px 14px; margin-top: 9px;
           opacity: .35; transition: opacity .25s; }
  .astep.on { opacity: 1; }
  .astep .tick { width: 26px; height: 26px; flex: 0 0 26px; border-radius: 50%;
                 background: #E4F1E9; color: #2E7D5B; display: flex; align-items: center;
                 justify-content: center; font-weight: 800; font-size: 14px; }
  .astep.working .tick { background: #F8EFD8; color: #C98A2B; }
  .astep .amain { flex: 1; }
  .astep .at { font-weight: 700; font-size: 14.5px; }
  .astep .ad { font-size: 12px; color: rgba(31,41,55,.5); }
  /* the flight: every step is a big pill that stays on screen */
  #auto.panel { background: transparent; border: 0; box-shadow: none;
                -webkit-backdrop-filter: none; backdrop-filter: none; padding: 6px 0; }
  .fpill { display: flex; align-items: center; gap: 14px; text-align: left;
           background: rgba(255,255,255,.66); border: 1px solid rgba(255,255,255,.8);
           -webkit-backdrop-filter: blur(24px) saturate(1.5); backdrop-filter: blur(24px) saturate(1.5);
           border-radius: 24px; padding: 19px 19px; margin-top: 14px;
           box-shadow: 0 14px 34px rgba(80,70,160,.10);
           opacity: 0; transform: translateY(12px); transition: opacity .45s, transform .45s; }
  .fpill.in { opacity: 1; transform: none; }
  .fmain { flex: 1; min-width: 0; }
  .fbig { font-size: 17.5px; font-weight: 800; }
  .fsub { font-size: 13px; color: rgba(31,41,55,.5); margin-top: 1px; }
  .okball, .waitball { width: 34px; height: 34px; flex: 0 0 34px; border-radius: 50%;
           display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; }
  .okball { background: #DFF2E6; color: #1F9D5B; }
  .waitball { background: #F3EFFB; color: #7C3AED; }
  .waitball .spin { width: 16px; height: 16px; border-width: 2.5px; margin: 0; }
  .ebayw { font-weight: 800; font-size: 24px; letter-spacing: -0.02em; }
  .ebayw i { font-style: normal; }
  .ebayw i:nth-child(1) { color: #E53238; } .ebayw i:nth-child(2) { color: #0064D2; }
  .ebayw i:nth-child(3) { color: #F5AF02; } .ebayw i:nth-child(4) { color: #86B817; }
  .ebayid { font-size: 17px; font-weight: 800; color: #1F2937; margin-left: 6px; }
  .gopill { margin-left: 2px; color: #1F2937; font-weight: 800; font-size: 24px;
            text-decoration: none; line-height: 1; }
  .cgrid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px; margin-top: 12px; }
  .cgrid div { text-align: center; }
  .cgrid b { display: block; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
  .cgrid span { font-size: 10px; font-weight: 600; color: rgba(31,41,55,.45);
                text-transform: uppercase; letter-spacing: .02em; white-space: nowrap; }
  .negline { display: flex; align-items: center; gap: 9px; margin-top: 9px; font-size: 14.5px;
             opacity: 0; transform: translateX(-6px); transition: .35s; }
  .negline.in { opacity: 1; transform: none; }
  .negline .nic { width: 22px; height: 22px; flex: 0 0 22px; border-radius: 50%; font-size: 12px;
                  font-weight: 800; display: flex; align-items: center; justify-content: center; }
  .negline.ok .nic { background: #DFF2E6; color: #1F9D5B; }
  .negline.no .nic { background: #FBE7DF; color: #C0503C; }
  .negline.mid .nic { background: #F8EFD8; color: #C98A2B; }
  .negline .nw { color: rgba(31,41,55,.75); }
  .soldbig { font-size: 26px; font-weight: 800; margin-top: 12px; letter-spacing: -0.02em; }
  .dava { width: 40px; height: 40px; flex: 0 0 40px; border-radius: 50%; background: #1F9D5B;
          color: #fff; font-weight: 800; font-size: 18px; display: flex; align-items: center;
          justify-content: center; }
  .chat { margin-top: 12px; }
  .bub { max-width: 88%; width: fit-content; padding: 10px 14px; border-radius: 17px;
         font-size: 14px; line-height: 1.4; margin-top: 8px; color: #1F2937; }
  .bub.them { background: rgba(31,41,55,.07); border-bottom-left-radius: 5px; }
  .bub.me { background: linear-gradient(120deg, rgba(79,70,229,.14), rgba(168,85,247,.14));
            margin-left: auto; border-bottom-right-radius: 5px; }
  .lblbtns { display: flex; gap: 9px; margin-top: 12px; }
  .lblbtns button { flex: 1; border: 0; border-radius: 14px; padding: 13px;
           font: 800 14.5px -apple-system, system-ui; cursor: pointer; }
  .lblbtns .dl { background: linear-gradient(120deg, #4F46E5, #7C3AED); color: #fff;
           box-shadow: 0 8px 20px rgba(99,60,237,.3); }
  .lblbtns .pr { background: rgba(255,255,255,.85); color: #1F2937;
           border: 1px solid rgba(31,41,55,.12); }
  /* the offer: the one human decision — no wrapper, just the thing and the number */
  #offer.panel { background: transparent; border: 0; box-shadow: none;
                 -webkit-backdrop-filter: none; backdrop-filter: none; padding: 14px 0; }
  .range { font-size: 58px; font-weight: 800; letter-spacing: -0.03em; margin: 10px 0 4px;
           background: linear-gradient(95deg, #4F46E5, #9333EA 55%, #DD7A51);
           -webkit-background-clip: text; background-clip: text; color: transparent; }
  /* captured frames as a fanned sticker stack — the thing you're selling, front and center */
  .stickfan { display: flex; justify-content: center; align-items: center; margin: 2px 0 12px; }
  .stickfan:empty { display: none; }
  .stick { width: 108px; height: 108px; object-fit: cover; border-radius: 24px;
           border: 4px solid #fff; box-shadow: 0 12px 26px rgba(80,70,160,.25); }
  .stick.s0 { transform: rotate(-8deg) translateX(12px); }
  .stick.s1 { transform: rotate(3deg) translateY(-6px); position: relative; z-index: 2;
              width: 126px; height: 126px; }
  .stick.s2 { transform: rotate(9deg) translateX(-12px); }
  /* the prize: a ready-to-print shipping label lands in your email */
  .shiplabel { text-align: left; background: #fff; border: 2px dashed rgba(31,41,55,.25);
               border-radius: 14px; padding: 14px 16px; margin-top: 14px;
               font-family: ui-monospace, Menlo, monospace; }
  .shiplabel .to { font-size: 11px; color: rgba(31,41,55,.45); text-transform: uppercase;
                   letter-spacing: .06em; }
  .shiplabel .addr { font-size: 13.5px; font-weight: 700; line-height: 1.5; margin-top: 3px; }
  .barcode { height: 42px; margin-top: 12px; border-radius: 4px;
             background: repeating-linear-gradient(90deg, #1F2937 0 2px, transparent 2px 5px,
               #1F2937 5px 9px, transparent 9px 11px, #1F2937 11px 12px, transparent 12px 16px); }
  .labelnote { font-size: 13px; color: rgba(31,41,55,.55); margin-top: 12px; }
  .demonote { font-size: 11px; color: rgba(31,41,55,.35); margin-top: 10px; }

  .foot { display: block; text-align: center; font-size: 12px; color: rgba(31,41,55,.38);
          margin-top: 22px; }
  .foot a { color: inherit; }
</style>
<body>
<div class="wordmark">onlist<span class="dot">.</span><small>autopilot agent</small></div>

<div id="qr">
  <div class="tagwrap">
    <div class="tag">
      <span class="taghole"></span>
      <img id="qrimg" width="280" height="280" alt="QR">
      <div class="tagtitle">SCAN TO SELL</div>
    </div>
  </div>
  <div class="powered"><span class="plabel">powered by</span><span class="plogos"><span class="brand"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="none" version="1.1" class="qwenlogo" viewBox="0 0 158.21998596191406 28"><defs><clipPath id="master_svg0_946_6229"><rect x="0" y="0" width="158.21998596191406" height="28" rx="0"/></clipPath><linearGradient x1="-0.9481848478317261" y1="-1.0932124853134155" x2="1.2920932966595775" y2="0.9056619458761981" id="master_svg1_946_6426"><stop offset="0.9999999776482582%" stop-color="#4F21FF" stop-opacity="1"/><stop offset="100%" stop-color="#D75BFE" stop-opacity="1"/></linearGradient><linearGradient x1="-0.9481848478317261" y1="-1.0932124853134155" x2="1.2920932966595775" y2="0.9056619458761981" id="master_svg2_946_6426"><stop offset="0.9999999776482582%" stop-color="#4F21FF" stop-opacity="1"/><stop offset="100%" stop-color="#D75BFE" stop-opacity="1"/></linearGradient><linearGradient x1="-0.4445544481277466" y1="-0.7161673903465271" x2="2.0653050363844505" y2="1.2333233893948266" id="master_svg3_946_6427"><stop offset="0.9999999776482582%" stop-color="#4F21FF" stop-opacity="1"/><stop offset="100%" stop-color="#D75BFE" stop-opacity="1"/></linearGradient><linearGradient x1="-0.1267876774072647" y1="0.11370647698640823" x2="1.3619049148773466" y2="2.9007068948182337" id="master_svg4_946_6428"><stop offset="0.9999999776482582%" stop-color="#4F21FF" stop-opacity="1"/><stop offset="100%" stop-color="#D75BFE" stop-opacity="1"/></linearGradient><linearGradient x1="0.0003300330135971308" y1="-0.09006842970848083" x2="2.2407911445375164" y2="1.9089711373151497" id="master_svg5_946_6429"><stop offset="0.9999999776482582%" stop-color="#4F21FF" stop-opacity="1"/><stop offset="100%" stop-color="#D75BFE" stop-opacity="1"/></linearGradient><linearGradient x1="-0.5033003091812134" y1="-0.7915869951248169" x2="2.006353504238442" y2="1.1577432698795929" id="master_svg6_946_6430"><stop offset="0.9999999776482582%" stop-color="#4F21FF" stop-opacity="1"/><stop offset="100%" stop-color="#D75BFE" stop-opacity="1"/></linearGradient><linearGradient x1="-2.1199119091033936" y1="-0.8480752110481262" x2="-0.630756720821898" y2="1.9393814279975978" id="master_svg7_946_6431"><stop offset="0.9999999776482582%" stop-color="#4F21FF" stop-opacity="1"/><stop offset="100%" stop-color="#D75BFE" stop-opacity="1"/></linearGradient></defs><g clip-path="url(#master_svg0_946_6229)"><path d="M66.77294359179687,9.588069031851562L64.56643759179687,9.588069031851562C64.38113459179688,9.588069031851562,64.21985059179687,9.709890067851562,64.16666159179687,9.886617007851562L61.85206059179687,17.64027694785156L59.393333591796875,9.871174217851562C59.338426591796875,9.697879577851563,59.17714259179687,9.579489551251562,58.995268791796875,9.579489551251562L57.14907549179688,9.579489551251562C56.96720169179687,9.579489551251562,56.805917291796874,9.697878917851563,56.751010391796875,9.869458047851563L54.273407491796874,17.643710147851564L51.955371591796876,9.876322027851563C51.902182291796876,9.699595737851563,51.739180091796875,9.577774047851562,51.555594491796874,9.577774047851562L49.34908926179688,9.577774047851562C49.14833937579687,9.577774047851562,49.004213526796875,9.771658657851562,49.06426727179687,9.963827107851563L52.81499009179687,22.09275804785156C52.868179091796875,22.267770047851563,53.03118129179688,22.38616004785156,53.21305469179688,22.38616004785156L55.05410099179687,22.38616004785156C55.23597429179688,22.38616004785156,55.39725919179688,22.267770047851563,55.45216559179688,22.09275804785156L58.06874749179688,13.735138447851561L60.649299591796876,22.091043047851564C60.702487591796874,22.266055047851562,60.86549059179688,22.38616004785156,61.04736459179688,22.38616004785156L62.90899859179687,22.38616004785156C63.09258959179687,22.38616004785156,63.25387459179687,22.266055047851562,63.307063591796876,22.09275804785156L67.05606859179687,9.970691737851563C67.11612359179688,9.778523277851562,66.97199659179688,9.584638679351562,66.77124559179687,9.584638679351562L66.77294359179687,9.588069031851562Z" fill="#000000" fill-opacity="1" style="mix-blend-mode:passthrough"/><path d="M87.32983539179688,9.284317016601562C85.98122599179688,9.284317016601562,84.77501969179687,9.800769926601562,83.85535809179687,10.651802916601563L83.85535809179687,9.936318276601563C83.85535809179687,9.740718156601563,83.69579079179688,9.581149486601563,83.50018789179687,9.581149486601563L81.58536416179687,9.581149486601563C81.38976143179687,9.581149486601563,81.23019409179688,9.740718156601563,81.23019409179688,9.936318276601563L81.23019409179688,22.036077016601563C81.23019409179688,22.231677016601562,81.38976143179687,22.39124701660156,81.58536416179687,22.39124701660156L83.50018789179687,22.39124701660156C83.69579079179688,22.39124701660156,83.85535809179687,22.231680016601562,83.85535809179687,22.036077016601563L83.85535809179687,14.894954216601562C83.85535809179687,13.000720516601563,85.15421339179687,11.882025016601563,86.82024529179688,11.882025016601563C88.48627189179687,11.882025016601563,89.78513809179688,12.961257916601562,89.78513809179688,14.894954216601562L89.78513809179688,22.036077016601563C89.78513809179688,22.231677016601562,89.94470499179687,22.39124701660156,90.14030839179688,22.39124701660156L92.05512609179688,22.39124701660156C92.25072909179687,22.39124701660156,92.41029609179688,22.231680016601562,92.41029609179688,22.036077016601563L92.41029609179688,14.445415016601562C92.41029609179688,11.329537416601562,90.32560539179687,9.286030556401563,87.32984069179687,9.286030556401563L87.32983539179688,9.284317016601562Z" fill="#000000" fill-opacity="1" style="mix-blend-mode:passthrough"/><path d="M46.67586584179688,19.383360547851563C47.942121841796876,17.791106547851562,48.661037841796876,15.744167547851562,48.549512841796876,13.527363747851563C48.32646184179687,9.112632547851563,44.738740841796876,5.523196517851562,40.32229324179687,5.300143764851563C35.16462464179688,5.039343397851562,30.930050251796875,9.275632647851562,31.190851276796874,14.431586247851563C31.413904681796875,18.846317547851562,35.00162504179688,22.435754547851563,39.418070841796876,22.658805547851564C41.31916684179687,22.754890547851563,43.093294841796876,22.24015254785156,44.565444841796875,21.293035547851563L45.45251084179687,22.180101547851564C45.58634284179688,22.31393254785156,45.766498841796874,22.387712547851564,45.955236841796875,22.387712547851564L48.90468184179687,22.387712547851564C49.19293384179687,22.387712547851564,49.337058841796875,22.039407547851564,49.132880841796876,21.836944547851562L46.679299841796876,19.383361547851564L46.67586584179688,19.383360547851563ZM44.644368841796876,17.35186254785156L42.158186841796876,14.865681647851563C42.02435484179688,14.731849647851563,41.844195841796875,14.658071547851563,41.655460841796874,14.658071547851563L38.70601554179687,14.658071547851563C38.417763741796875,14.658071547851563,38.273635341796876,15.006376247851563,38.477814641796876,15.208840347851563L42.47904184179687,19.210065547851563C41.693208841796874,19.602981547851563,40.80614474179687,19.826033547851562,39.867607141796874,19.826033547851562C36.63848634179688,19.826033547851562,34.02190444179688,17.207735547851563,34.02190444179688,13.980332347851563C34.02190444179688,10.752929247851561,36.64020104179687,8.134631147851563,39.867607141796874,8.134631147851563C43.09501284179687,8.134631147851563,45.713308841796874,10.752929247851561,45.713308841796874,13.980332347851563C45.713308841796874,15.236291847851563,45.315244841796876,16.39959854785156,44.64093984179688,17.35186254785156L44.644368841796876,17.35186254785156Z" fill="#000000" fill-opacity="1" style="mix-blend-mode:passthrough"/><path d="M73.65845962929687,9.294555838951563C70.12049842929687,9.208766266851562,67.05780982929687,11.981485797851562,66.81588261929687,15.512584697851562C66.54650210929688,19.42287379785156,69.64007372929687,22.67772779785156,73.49202732929687,22.67772779785156C76.11375622929688,22.67772779785156,78.38203302929688,21.169547797851564,79.48013902929688,18.973335297851563C79.58823402929687,18.757145897851565,79.43209602929687,18.503209097851563,79.19188702929688,18.503209097851563L77.02655902929688,18.503209097851563C76.83267302929687,18.503209097851563,76.65594672929687,18.59243009785156,76.52554512929687,18.736556997851565C75.77574542929688,19.568714797851563,74.69479372929688,20.121200797851564,73.49202732929687,20.121200797851564C71.58406832929687,20.121200797851564,69.94033722929687,18.788031597851564,69.47021202929687,17.013902197851564L79.64314102929687,17.013902197851564C79.82158502929687,17.013902197851564,79.97600502929687,16.88350149785156,79.99487602929688,16.706775197851563C80.02232902929687,16.46999649785156,80.03605302929688,16.229785397851565,80.03605302929688,15.984427497851563C80.03605302929688,12.343517797851563,77.27191502929688,9.382062218851562,73.65502452929688,9.292840990021563L73.65845962929687,9.294555838951563ZM69.55428932929688,14.663267097851563C70.06216212929688,13.161949897851562,71.40562962929687,12.060411897851562,73.00646062929687,11.876822497851563C75.03281022929687,11.641758397851563,76.68340012929687,12.894286597851563,77.23932102929687,14.663267097851563L69.55257722929687,14.663267097851563L69.55428932929688,14.663267097851563Z" fill="#000000" fill-opacity="1" style="mix-blend-mode:passthrough"/><path d="M104.65153502929688,8.136486322851562C106.76539102929688,8.136486322851562,108.61672702929687,9.260329722851562,109.64277602929687,10.941804922851563C109.75944902929687,11.133974122851562,109.97564102929688,11.243784922851562,110.20040902929688,11.243784922851562L112.44294902929687,11.243784922851562C112.67287102929687,11.243784922851562,112.82556702929688,11.012153122851561,112.74149502929687,10.797679422851562C111.42720402929687,7.4587493228515624,108.10714102929687,5.128704342851562,104.26377482929688,5.2951363101515625C99.86620092929688,5.485589252851563,96.24588533929688,9.033845922851562,95.97306989529687,13.426271422851563C95.65907713929687,18.480992422851564,99.66373872929688,22.677818422851562,104.64982792929688,22.677818422851562C108.32676802929687,22.677818422851562,111.46838102929688,20.39410042285156,112.73978802929688,17.16841242285156C112.82386002929687,16.953938422851564,112.67287102929687,16.720590422851565,112.44296102929687,16.720590422851565L110.17468902929687,16.720590422851565C109.95163802929687,16.720590422851565,109.75260102929687,16.844127422851564,109.63592802929688,17.03286442285156C108.49149802929688,18.899644422851562,106.32959502929688,20.07496342285156,103.92062712929688,19.78327742285156C101.26801012929687,19.462424422851562,99.13871762929688,17.309106422851563,98.84188892929687,14.654777522851562C98.44725922929688,11.125394822851563,101.19938472929688,8.134770122851563,104.64983842929688,8.134770122851563L104.65153502929688,8.136486322851562Z" fill="#000000" fill-opacity="1" style="mix-blend-mode:passthrough"/><rect x="114.01242065429688" y="5.2999420166015625" width="2.6251609325408936" height="17.08928108215332" rx="0.35516878962516785" fill="#000000" fill-opacity="1" style="mix-blend-mode:passthrough"/><path d="M124.52310756679688,9.292617797851562C120.82729646679688,9.292617797851562,117.82980346679688,12.288388697851563,117.82980346679688,15.985919497851562C117.82980346679688,19.683450797851563,120.82557896679687,22.679219797851562,124.52310756679688,22.679219797851562C128.22063546679686,22.679219797851562,131.21641146679687,19.683449797851562,131.21641146679687,15.985919497851562C131.21641146679687,12.288389897851562,128.22063546679686,9.292617797851562,124.52310756679688,9.292617797851562ZM124.52310756679688,20.13813579785156C122.22909496679688,20.13813579785156,120.37089016679687,18.278217297851562,120.37089016679687,15.985919497851562C120.37089016679687,13.693622097851563,122.23081256679687,11.833704997851562,124.52310756679688,11.833704997851562C126.81540206679688,11.833704997851562,128.67532446679687,13.693622097851563,128.67532446679687,15.985919497851562C128.67532446679687,18.278217297851562,126.81540206679688,20.138133797851562,124.52310756679688,20.13813579785156Z" fill="#000000" fill-opacity="1" style="mix-blend-mode:passthrough"/><path d="M157.86277690429688,5.2999420166015625L155.94795790429689,5.2999420166015625C155.75235590429688,5.2999420166015625,155.59278790429687,5.459510666601562,155.59278790429687,5.655110776601562L155.59278790429687,11.052990416601563C154.59419630429687,9.960031516601562,153.1889629042969,9.290872616601563,151.44400600429688,9.290872616601563C147.74819490429687,9.290872616601563,144.75070190429688,12.286644916601563,144.75070190429688,15.984175016601563C144.75070190429688,19.681704016601564,147.74647740429688,22.677477016601564,151.44400600429688,22.677477016601564C153.1889629042969,22.677477016601564,154.59419630429687,22.010035016601563,155.59278790429687,20.915359016601563L155.59278790429687,22.034056016601564C155.59278790429687,22.22965401660156,155.75235590429688,22.38922501660156,155.94795790429689,22.38922501660156L157.86277690429688,22.38922501660156C158.0583789042969,22.38922501660156,158.21794690429687,22.22965801660156,158.21794690429687,22.034056016601564L158.21794690429687,5.655110776601562C158.21794690429687,5.459510666601562,158.0583789042969,5.2999420166015625,157.86277690429688,5.2999420166015625ZM151.4457126042969,20.13810601660156C149.15170050429688,20.13810601660156,147.29349540429686,18.27818801660156,147.29349540429686,15.985890016601562C147.29349540429686,13.693593016601563,149.15341810429686,11.833675816601563,151.4457126042969,11.833675816601563C153.7380075042969,11.833675816601563,155.53958790429687,13.640403716601563,155.59449490429688,15.886375016601562L155.59449490429688,16.085408016601562C155.54130590429688,18.33309501660156,153.7071247042969,20.138107016601563,151.4457126042969,20.13810601660156Z" fill="#000000" fill-opacity="1" style="mix-blend-mode:passthrough"/><path d="M143.20454015429686,9.572403608624033L141.28972245429688,9.572403608624033C141.09411905429687,9.572403608624033,140.93455215429688,9.731972264101563,140.93455215429688,9.927572374101562L140.93455215429688,17.06869505410156C140.93455215429688,18.96292875410156,139.63569645429686,20.081623954101563,137.96965935429688,20.081623954101563C136.30362225429687,20.081623954101563,135.00476695429688,19.00239185410156,135.00476695429688,17.06869505410156L135.00476695429688,9.927571714101562C135.00476695429688,9.731971604101563,134.84519955429687,9.572402954101562,134.6495966542969,9.572402954101562L132.7347782242969,9.572402954101562C132.53917549429687,9.572402954101562,132.37960815429688,9.731971604101563,132.37960815429688,9.927571714101562L132.37960815429688,17.518232854101562C132.37960815429688,20.63410995410156,134.46429895429688,22.677617954101564,137.46006395429688,22.677617954101564C138.80867335429687,22.677617954101564,140.01487965429686,22.161165954101563,140.93454165429688,21.310131954101564L140.93454165429688,22.02561695410156C140.93454165429688,22.221216954101564,141.09410855429687,22.380786954101563,141.28971195429688,22.380786954101563L143.2045301542969,22.380786954101563C143.40013315429687,22.380786954101563,143.55970015429688,22.221219954101564,143.55970015429688,22.02561695410156L143.55970015429688,9.927572374101562C143.55970015429688,9.731972264101563,143.40013315429687,9.572403608624033,143.20454015429686,9.572403608624033Z" fill="#000000" fill-opacity="1" style="mix-blend-mode:passthrough"/><path d="M26.6309241875,16.0924969L22.8630451875,13.9168732C22.9556965875,13.7573047,23.0071711875,13.5719988,23.0071711875,13.381546L23.0071711875,12.2165234C23.0071711875,11.8339014,22.8029913875,11.48044878,22.4718446875,11.28827965L21.4629597875,10.7066265C21.131812087500002,10.514458053,20.7234541875,10.514458053,20.3923065875,10.7066265L17.3038820575,12.4893336C16.9727342875,12.6815028,16.7685546875,13.0349553,16.7685546875,13.4175775L16.7685546875,14.5826001C16.7685546875,14.9652219,16.9727342875,15.3186746,17.3038820575,15.5108423L24.5513858875,19.695657699999998C24.8825320875,19.8878269,25.2908916875,19.8878269,25.622040787499998,19.695657699999998L26.630927087499998,19.114004100000002C26.962073687500002,18.9218349,27.1662526875,18.5683823,27.1662526875,18.1857605L27.1662526875,17.0207381C27.1662526875,16.6381159,26.962073687500002,16.2846632,26.6309241875,16.0924969Z" fill="url(#master_svg1_946_6426)" fill-opacity="1" style="mix-blend-mode:passthrough"/><path d="M26.6309241875,16.0924969L22.8630451875,13.9168732C22.9556965875,13.7573047,23.0071711875,13.5719988,23.0071711875,13.381546L23.0071711875,12.2165234C23.0071711875,11.8339014,22.8029913875,11.48044878,22.4718446875,11.28827965L21.4629597875,10.7066265C21.131812087500002,10.514458053,20.7234541875,10.514458053,20.3923065875,10.7066265L17.3038820575,12.4893336C16.9727342875,12.6815028,16.7685546875,13.0349553,16.7685546875,13.4175775L16.7685546875,14.5826001C16.7685546875,14.9652219,16.9727342875,15.3186746,17.3038820575,15.5108423L24.5513858875,19.695657699999998C24.8825320875,19.8878269,25.2908916875,19.8878269,25.622040787499998,19.695657699999998L26.630927087499998,19.114004100000002C26.962073687500002,18.9218349,27.1662526875,18.5683823,27.1662526875,18.1857605L27.1662526875,17.0207381C27.1662526875,16.6381159,26.962073687500002,16.2846632,26.6309241875,16.0924969Z" fill="url(#master_svg2_946_6426)" fill-opacity="1" style="mix-blend-mode:passthrough"/><path d="M21.919310125,3.745450405L18.151432525,5.921074375C18.058779725,5.761505875,17.924948225,5.624242575,17.758516025,5.528158075L16.749631425,4.9465048750000005C16.418483525,4.754335975,16.010125625,4.754335975,15.678977825,4.9465048750000005L14.670092995,5.528158075C14.338945225,5.720326375,14.134765625,6.073779775,14.134765625,6.4564010750000005L14.134765625,10.021816274999999C14.134765625,10.404437975,14.338945225,10.757891175000001,14.670092995,10.950059375L15.678977825,11.531713475C16.010125625,11.723882675,16.418483525,11.723882675,16.749631425,11.531713475L23.997133225,7.346898075C24.328280624999998,7.154729575,24.532460625,6.801276475,24.532460625,6.418654875L24.532460625,5.253632275C24.532460625,4.871010875,24.328280624999998,4.517557565,23.997133225,4.325389085L22.988247825000002,3.743735895C22.657100725,3.551567096,22.248742125,3.551567096,21.917593925,3.743735895L21.919310125,3.745450405Z" fill="url(#master_svg3_946_6427)" fill-opacity="1" style="mix-blend-mode:passthrough"/><path d="M8.87250785,1.6540229L8.87250785,6.00527C8.68720195,6.00527,8.50189685,6.0533118,8.33718095,6.1493964L7.3282954700000005,6.7310495C6.99714769,6.9232178,6.79296875,7.2766714,6.79296875,7.6592927L6.79296875,8.8243151C6.79296875,9.2069368,6.99714769,9.5603895,7.3282954700000005,9.7525578L10.416719950000001,11.535266C10.74786785,11.727435,11.15622565,11.727435,11.48737335,11.535266L12.49625825,10.953613C12.82740595,10.761444,13.03158565,10.407991,13.03158565,10.02537L13.03158565,1.6540229C13.03158565,1.2714014,12.82740595,0.91794837,12.49625825,0.72577977L11.48737335,0.14412647C11.15622565,-0.048042152,10.74786715,-0.048042152,10.416719950000001,0.14412647L9.40783455,0.72577977C9.07668665,0.91794837,8.87250785,1.2714014,8.87250785,1.6540229Z" fill="url(#master_svg4_946_6428)" fill-opacity="1" style="mix-blend-mode:passthrough"/><path d="M0.5353269,11.90744475L4.3032045,14.08306835C4.2105517,14.24263665,4.1590781,14.42794275,4.1590781,14.61839535L4.1590781,15.78341815C4.1590781,16.16604045,4.3632574,16.519493150000002,4.6944046,16.71166135L5.70329,17.29331495C6.0344381,17.485484149999998,6.4427967,17.485484149999998,6.7739434,17.29331495L9.8623676,15.51060775C10.193516,15.31843855,10.397695,14.96498635,10.397695,14.582364049999999L10.397695,13.41734175C10.397695,13.03471945,10.193516,12.681266749999999,9.8623676,12.48909905L2.614866,8.30428275C2.2837181,8.112114303,1.87536,8.112114303,1.5442122,8.30428275L0.5353269,8.8859359C0.20417918,9.07810438,0,9.43155765,0,9.81417905L0,10.979201549999999C0,11.36182285,0.20417918,11.71527555,0.5353269,11.90744475Z" fill="url(#master_svg5_946_6429)" fill-opacity="1" style="mix-blend-mode:passthrough"/><path d="M5.2469384625,24.252655025L9.0148162625,22.077032525C9.1074690625,22.236599925,9.241300562500001,22.373863725,9.4077324625,22.469947825L10.4166183625,23.051600925C10.7477655625,23.243768725,11.1561241625,23.243768725,11.4872722625,23.051600925L12.4961566625,22.469947825C12.8273050625,22.277780025,13.0314850625,21.924325924999998,13.0314850625,21.541704225L13.0314850625,17.976289725C13.0314850625,17.593667625,12.8273050625,17.240215065,12.4961566625,17.048045935L11.4872722625,16.466392785C11.1561241625,16.274223678,10.7477655625,16.274223678,10.4166188625,16.466392785L3.1691159625000003,20.651207925C2.8379681725,20.843377125,2.6337890625,21.196829325,2.6337890625,21.579451525L2.6337890625,22.744473024999998C2.6337890625,23.127093325,2.8379681725,23.480546025,3.1691159625000003,23.672716625L4.1780013625,24.254369725C4.5091491625,24.446537925,4.9175073625,24.446537925,5.2486553625,24.254369725L5.2469384625,24.252655025Z" fill="url(#master_svg6_946_6430)" fill-opacity="1" style="mix-blend-mode:passthrough"/><path d="M18.295796850000002,26.346169781249998L18.295796850000002,21.99492268125C18.48110245,21.99492268125,18.66640805,21.94688078125,18.83112385,21.85079718125L19.84000875,21.26914358125C20.17115685,21.07697488125,20.37533615,20.72352218125,20.37533615,20.34089998125L20.37533615,19.17587758125C20.37533615,18.79325558125,20.17115685,18.43980288125,19.84000875,18.24763508125L16.75158455,16.46492794125C16.42043665,16.27275883425,16.01207875,16.27275883425,15.68093095,16.46492794125L14.67204612,17.04658109125C14.34089835,17.23875022125,14.13671875,17.59220278125,14.13671875,17.97482488125L14.13671875,26.34445478125C14.13671875,26.72707578125,14.34089835,27.080527781249998,14.67204612,27.27269878125L15.68093095,27.85435178125C16.01207875,28.04651878125,16.42043665,28.04651878125,16.75158455,27.85435178125L17.76046915,27.27269878125C18.09161715,27.080530781249998,18.295796850000002,26.72707878125,18.295796850000002,26.34445478125L18.295796850000002,26.346169781249998Z" fill="url(#master_svg7_946_6431)" fill-opacity="1" style="mix-blend-mode:passthrough"/></g></svg></span>
    <span class="brand"><svg viewBox="0 0 24 24" fill="none"><path d="M8.6 4.5H4.9A2.9 2.9 0 0 0 2 7.4v9.2a2.9 2.9 0 0 0 2.9 2.9h3.7l-1.5-2.3-3-.9 3-.9V8.6l-3-.9 3-.9zM15.4 4.5h3.7A2.9 2.9 0 0 1 22 7.4v9.2a2.9 2.9 0 0 1-2.9 2.9h-3.7l1.5-2.3 3-.9-3-.9V8.6l3-.9-3-.9z" fill="#FF6A00"/><rect x="9" y="11.1" width="6" height="1.8" rx=".9" fill="#FF6A00"/></svg>Alibaba Cloud</span></span>
  </div>
</div>

<div id="app">
  <label id="shoot">
    <input id="cap" type="file" accept="image/*" capture="environment" hidden>
    <div class="vf">
      <span class="cor c1"></span><span class="cor c2"></span><span class="cor c3"></span><span class="cor c4"></span>
      <svg id="shootIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.6l1.2-1.8A2 2 0 0 1 10 3.3h4a2 2 0 0 1 1.7.9L16.9 6h1.6A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/><circle cx="12" cy="12.5" r="3.4"/></svg>
      <div id="slots"></div>
    </div>
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

  <div id="offer" class="panel">
    <div class="stickfan" id="offPhotos"></div>
    <div id="offItem" style="font-size:16px;font-weight:700;color:rgba(31,41,55,.8)"></div>
    <div class="range" id="offRange"></div>
    <div class="chips" id="offChips"></div>
    <details class="why" id="whyOffer"><summary><span class="chev">›</span> How it sized the market</summary>
      <div id="offComps" class="complist"></div><p id="offWhy"></p></details>
    <button id="sellgo" class="cta">Sell it for me →</button>
    <button id="again4" class="ghostbtn">Try another</button>
  </div>

  <div id="auto" class="panel">
    <div id="flight"></div>
    <div class="demonote" id="fdemo" hidden>demo: buyers &amp; sale are simulated — the eBay listing is real</div>
    <button id="again3" class="ghostbtn" hidden>Done</button>
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
var lastListing = null; // /list result: { board, ebay: {listingId, url} | null }

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
    $("shootIcon").style.display = "";
    $("shootHint").textContent = "";
  } else if (frames.length === 1) {
    $("shootIcon").style.display = "none";
    $("shootHint").textContent = "one more angle";
  }
}
function chip(text, cls) { return '<span class="' + cls + '">' + text + '</span>'; }
function esc(s) { return String(s).replace(/[<>&]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]; }); }
function panel(id, label) {
  ["shoot", "res", "offer", "auto"].forEach(function (p) { $(p).style.display = "none"; });
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
// The human authorizes a sale RANGE once; the agent flies the rest —
// list, negotiate inside the range, close. Next human touch: the shipping label.
// One flight, every step stays on screen as a big pill.
function addPill(html) {
  var el = document.createElement("div");
  el.className = "fpill"; el.innerHTML = html;
  $("flight").appendChild(el);
  setTimeout(function () { el.className = "fpill in"; }, 30);
  return el;
}
function ball(ok) {
  return ok ? '<div class="okball">✓</div>' : '<div class="waitball"><div class="spin"></div></div>';
}
function countUp(el, to, ms) {
  var steps = Math.max(1, Math.round(ms / 60)), i = 0;
  var iv = setInterval(function () {
    i++;
    el.textContent = Math.round(to * i / steps);
    if (i >= steps) clearInterval(iv);
  }, 60);
}
// ————— Step 1 of the human's ONE decision: the offer. The agent sizes the
// market and shows the sale RANGE it wants authority over. One tap delegates it.
function runAutopilot(v) {
  panel("busy", "Sizing the market…");
  fetch("/price", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: v.itemName || "item", verdict: v }),
  }).then(function (r) { return r.json(); }).then(function (p) {
    if (p.error) throw new Error(p.error);
    lastPrice = p;
    $("offItem").textContent = v.itemName || "item";
    $("offPhotos").innerHTML = frames.slice(0, 3).map(function (f, i) {
      return '<img class="stick s' + i + '" src="' + f + '" alt="">';
    }).join("");
    $("offChips").innerHTML = '<span class="c-green">✓ verified real</span>' +
      (v.condition ? '<span class="c-amber">' + esc(v.condition) + "</span>" : "");
    $("offRange").textContent = "$" + p.floorUSD + "–" + p.suggestedUSD;
    $("offComps").innerHTML = (p.comps || []).slice(0, 3).map(function (c) {
      return '<div class="comprow"><span class="lbl">' + esc(c.label) + '</span><span class="amt">$' + c.priceUSD + '</span></div>';
    }).join("");
    $("offWhy").textContent = p.rationale || "";
    $("whyOffer").open = false;
    $("sellgo").onclick = function () { engage(v, p); };
    panel("offer");
  }).catch(function (e) {
    $("res").className = "panel no"; $("verdict").textContent = "Couldn't price it";
    $("nameEdit").style.display = "none"; $("condline").textContent = "";
    $("chips").innerHTML = ""; $("why").textContent = String(e.message || e);
    panel("res");
  });
}

// ————— The delegated flight: list → handle buyers → close the sale — all
// inside the authorized range. The human's next touch is sticking a label on a box.
function engage(v, p) {
  panel("auto");
  $("flight").innerHTML = ""; $("fdemo").hidden = true; $("again3").hidden = true;
  var pub = addPill(ball(false) +
    '<div class="fmain"><div class="fbig">Publishing…</div><div class="fsub">creating the listing</div></div>');
  fetch("/list", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: v.itemName || "item", condition: v.condition || "used",
                           priceUSD: p.suggestedUSD, frame: frames[0] || null }),
  }).then(function (r) { return r.json(); }).then(function (li) {
    lastListing = li;
    if (li.ebay) {
      pub.innerHTML =
        '<div class="fmain"><span class="ebayw"><i>e</i><i>b</i><i>a</i><i>y</i></span>' +
        '<span class="ebayid">#' + li.ebay.listingId + '</span></div>' +
        ball(true) +
        '<a class="gopill" href="' + li.ebay.url + '" target="_blank">→</a>';
    } else {
      pub.innerHTML = ball(true) +
        '<div class="fmain"><div class="fbig">Listed — $' + p.suggestedUSD + '</div>' +
        '<div class="fsub">live on the board</div></div>';
    }
    flyBuyers(v, p);
  }).catch(function () {
    pub.innerHTML = ball(true) +
      '<div class="fmain"><div class="fbig">Listed — $' + p.suggestedUSD + '</div><div class="fsub">live on the board</div></div>';
    flyBuyers(v, p);
  });
}

function isScamB(b) {
  return b.score <= 15 || (b.flags || []).some(function (f) { return /scam|overpay|shipping|check|fraud/i.test(f); });
}
function nameOfB(b) {
  return (DEMO_BUYERS.filter(function (d) { return d.id === b.id; })[0] || {}).name || b.id;
}

function flyBuyers(v, p) {
  var bp = addPill(ball(false) +
    '<div class="fmain"><div class="fbig">Finding buyers…</div>' +
    '<div class="cgrid"><div><b id="cAll">0</b><span>inquiries</span></div>' +
    '<div><b id="cSpam">0</b><span>spam ✕</span></div>' +
    '<div><b id="cLow">0</b><span>countered</span></div>' +
    '<div><b id="cOk">0</b><span>in range</span></div></div></div>');
  fetch("/triage", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: v.itemName || "item", priceUSD: p.suggestedUSD,
                           floorUSD: p.floorUSD, claims: DEMO_BUYERS }),
  }).then(function (r) { return r.json(); }).then(function (tg) {
    var ranked = (tg && tg.ranked) || [];
    var nSpam = ranked.filter(isScamB).length;
    var nLow = ranked.filter(function (b) { return !isScamB(b) && b.counterUSD; }).length;
    var nOk = ranked.filter(function (b) { return b.score >= 70; }).length;
    countUp(bp.querySelector("#cAll"), ranked.length, 900);
    setTimeout(function () { countUp(bp.querySelector("#cSpam"), nSpam, 600); }, 500);
    setTimeout(function () { countUp(bp.querySelector("#cLow"), nLow, 600); }, 900);
    setTimeout(function () { countUp(bp.querySelector("#cOk"), nOk, 600); }, 1300);
    setTimeout(function () {
      bp.querySelector(".waitball").outerHTML = ball(true);
      bp.querySelector(".fbig").textContent = ranked.length + " buyers screened";
      flyDeal(v, p, tg, ranked);
    }, 2000);
  }).catch(function () {
    bp.innerHTML = ball(true) +
      '<div class="fmain"><div class="fbig">Buyers arrive later</div><div class="fsub">screening hiccup — the agent keeps watching</div></div>';
    flyShip(v, p, null, false);
  });
}

function flyDeal(v, p, tg, ranked) {
  var dp = addPill(ball(false) +
    '<div class="fmain"><div class="fbig">Negotiating…</div><div id="negs"></div></div>');
  var negs = dp.querySelector("#negs");
  var lines = ranked.slice().reverse().map(function (b) {
    if (isScamB(b)) return { cls: "no", ic: "✕", w: esc(nameOfB(b)) + " — declined (scam)" };
    if (b.counterUSD) return { cls: "mid", ic: "~", w: esc(nameOfB(b)) + " → countered $" + b.counterUSD };
    if (b.score >= 70) return { cls: "ok", ic: "✓", w: esc(nameOfB(b)) + " — accepted $" + p.suggestedUSD };
    return { cls: "mid", ic: "~", w: esc(nameOfB(b)) + " — negotiating" };
  });
  lines.forEach(function (l, i) {
    setTimeout(function () {
      var el = document.createElement("div");
      el.className = "negline " + l.cls;
      el.innerHTML = '<span class="nic">' + l.ic + '</span><span class="nw">' + l.w + '</span>';
      negs.appendChild(el);
      setTimeout(function () { el.className += " in"; }, 30);
    }, 600 * (i + 1));
  });
  var top = ranked[0];
  var sellable = top && top.score >= 70;
  setTimeout(function () {
    dp.querySelector(".waitball").outerHTML = ball(true);
    dp.querySelector(".fbig").textContent = ranked.length + " offers";
    flyClose(v, p, tg, ranked, sellable);
  }, 600 * (lines.length + 1) + 500);
}

// The deal itself: the buyer, the number, and the conversation that closed it.
function flyClose(v, p, tg, ranked, sellable) {
  if (!sellable) {
    addPill(ball(true) +
      '<div class="fmain"><div class="fbig">Live — negotiating inside your range</div></div>');
    flyShip(v, p, tg, false);
    return;
  }
  var top = ranked[0];
  var who = nameOfB(top);
  var buyer = DEMO_BUYERS.filter(function (d) { return d.id === top.id; })[0] || {};
  var cp = addPill(
    '<div class="dava">' + esc(who.charAt(0).toUpperCase()) + '</div>' +
    '<div class="fmain"><div class="fbig">' + esc(who) + '</div>' +
    '<div class="fsub">closing the deal…</div>' +
    '<div class="chat"></div></div>' + ball(false));
  var chatBox = cp.querySelector(".chat");
  function bubble(from, text) {
    var el = document.createElement("div");
    el.className = "bub " + (from === "agent" ? "me" : "them");
    el.textContent = text;
    chatBox.appendChild(el);
  }
  function finish(closedUSD) {
    cp.querySelector(".waitball").outerHTML = ball(true);
    cp.querySelector(".fsub").textContent = "paid via checkout · tracked shipping";
    var sb = document.createElement("div");
    sb.className = "soldbig";
    sb.textContent = "SOLD · $" + closedUSD;
    cp.querySelector(".fmain").insertBefore(sb, chatBox);
    flyShip(v, p, tg, true);
  }
  fetch("/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: v.itemName || "item", priceUSD: p.suggestedUSD,
                           floorUSD: p.floorUSD, buyerName: who, buyerMessage: buyer.message || "",
                           condition: v.condition || "used" }),
  }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    var thread = (d && d.thread) || [
      { from: "buyer", text: buyer.message || "Is this still available?" },
      { from: "agent", text: (top.draftReply || "It is available — happy to ship it tracked.").slice(0, 200) },
      { from: "buyer", text: "Paid through checkout — $" + p.suggestedUSD + " 👍" },
    ];
    var closed = (d && d.closedUSD) || p.suggestedUSD;
    thread.forEach(function (m, i) {
      setTimeout(function () { bubble(m.from, m.text); }, 700 * i);
    });
    setTimeout(function () { finish(closed); }, 700 * thread.length + 300);
  }).catch(function () {
    bubble("buyer", buyer.message || "Is this still available?");
    bubble("agent", (top.draftReply || "It is available — happy to ship it tracked.").slice(0, 200));
    setTimeout(function () { finish(p.suggestedUSD); }, 800);
  });
}

function flyShip(v, p, tg, sellable) {
  if (sellable) {
    var top = ((tg && tg.ranked) || [])[0] || {};
    var who = nameOfB(top);
    var addr = who + " M., 2847 Juniper Lane, Orlando, FL 32803";
    var sp = addPill(ball(true) +
      '<div class="fmain"><div class="fbig">Shipping label ready</div>' +
      '<div class="shiplabel"><div class="to">Prepaid · ship to</div>' +
      '<div class="addr" id="shipTo"></div><div class="barcode"></div></div>' +
      '<div class="lblbtns"><button class="dl" id="lblDl">⬇ Download</button>' +
      '<button class="pr" id="lblPr">🖨 Print</button></div></div>');
    sp.querySelector("#shipTo").innerHTML = esc(who) + " M.<br>2847 Juniper Lane<br>Orlando, FL 32803";
    function realLabel(doPrint) {
      fetch("/label", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toName: who + " M.", title: v.itemName || "item" }),
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (l) {
        if (l && l.gifB64) {
          var url = "data:image/gif;base64," + l.gifB64;
          sp.querySelector(".fbig").textContent = "UPS " + l.tracking;
          if (doPrint) {
            var w2 = window.open("");
            if (w2) w2.document.write('<img src="' + url + '" style="width:100%" onload="print()">');
          } else {
            var a = document.createElement("a");
            a.href = url; a.download = "ups-label.gif"; a.click();
          }
        } else {
          labelPng(addr, v, p, doPrint);
        }
      }).catch(function () { labelPng(addr, v, p, doPrint); });
    }
    sp.querySelector("#lblDl").onclick = function (e) { e.stopPropagation(); realLabel(false); };
    sp.querySelector("#lblPr").onclick = function (e) { e.stopPropagation(); realLabel(true); };
  } else {
    addPill(ball(true) +
      '<div class="fmain"><div class="fbig">Label on sale</div>' +
      '<div class="fsub">the moment it sells, the prepaid label lands in your email</div></div>');
  }
  $("fdemo").hidden = false;
  $("again3").hidden = false;
}

// Render the label as a real PNG: Download saves it, Print opens the dialog.
function labelPng(addr, v, p, doPrint) {
  var c = document.createElement("canvas"); c.width = 1000; c.height = 620;
  var g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, 1000, 620);
  g.strokeStyle = "#111827"; g.lineWidth = 6; g.strokeRect(20, 20, 960, 580);
  g.fillStyle = "#111827";
  g.font = "800 40px -apple-system, system-ui";
  g.fillText("PREPAID SHIPPING LABEL", 60, 105);
  g.fillStyle = "#6B7280"; g.font = "600 24px -apple-system, system-ui";
  g.fillText("USPS PRIORITY - onlist autopilot", 60, 145);
  g.fillStyle = "#111827"; g.font = "700 32px ui-monospace, Menlo, monospace";
  addr.split(", ").forEach(function (line, i) { g.fillText(line, 60, 235 + i * 46); });
  g.font = "600 26px -apple-system, system-ui";
  g.fillText((v.itemName || "item") + " - $" + p.suggestedUSD, 60, 430);
  var x = 60;
  while (x < 940) {
    var w = 4 + Math.floor(Math.random() * 12);
    g.fillRect(x, 468, w, 104);
    x += w + 4 + Math.floor(Math.random() * 10);
  }
  var url = c.toDataURL("image/png");
  if (doPrint) {
    var w2 = window.open("");
    if (w2) w2.document.write('<img src="' + url + '" style="width:100%" onload="print()">');
  } else {
    var a = document.createElement("a");
    a.href = url; a.download = "shipping-label.png"; a.click();
  }
}

function itemName() { return (verdict && verdict.itemName || "item").trim(); }

// Listing it flips to the manage view: the actual listing + the agent screening
// buyers. Demo buyers mirror the seeded board (a real inquiry, a scam, a lowball).
var DEMO_BUYERS = [
  { id: "b1", name: "Alex", message: "Is this still available? I can pay full price through checkout today — can you ship it tracked?" },
  { id: "b2", name: "shipping_agent_pro", message: "I buy for a client overseas, I pay extra $200 by certified check, my shipper collects." },
  { id: "b3", name: "Rita", message: "Would you take half?" }
];


function reset() {
  frames = []; verdict = null; lastPrice = null; pending = null; lastListing = null;
  $("more").hidden = true;
  $("flight").innerHTML = "";
  renderShoot();
  panel("shoot");
}
$("more").onclick = function () { $("cap").click(); };
$("again").onclick = reset;
$("again3").onclick = reset;
$("again4").onclick = reset;

// Default to the phone app; show the QR ONLY on a real desktop (hover + fine pointer).
var LAN = ${JSON.stringify(LAN_URL)};
var isDesktop = matchMedia("(hover: hover) and (pointer: fine)").matches && !("ontouchstart" in window);
if (isDesktop) {
  var local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  var target = (local && LAN) ? LAN : location.href;
  $("qr").style.display = "flex";
  document.querySelector(".foot").style.display = "none"; // the tag has its own powered-by badges
  $("qrimg").src = "https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=" + encodeURIComponent(target);
} else {
  $("app").style.display = "block";
  // fire the camera immediately — one less tap; browsers that demand a
  // gesture just fall back to the full-screen tap zone
  setTimeout(function () { try { $("cap").click(); } catch (e) {} }, 400);
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
    if (req.method === "POST" && req.url === "/list") {
      const b = await readBody(req);
      const title = String(b.title ?? "item").slice(0, 120);
      const condition = String(b.condition ?? "used");
      const priceUSD = Math.max(1, Math.round(Number(b.priceUSD) || 1));
      const description = String(b.description ??
        `${title}\n\nCondition: ${condition}. Single owner, sold through the onlist autopilot agent.\n\n` +
        `Authenticity: this listing was created from a live camera capture verified as a REAL physical object ` +
        `by an AI examiner (multi-angle scene-continuity check — no screenshots, no re-shot catalog photos, no AI renders).\n\n` +
        `Ships within 2 business days, USPS Priority, tracked.`);
      // the first verified frame becomes the listing photo: save it and serve it
      // publicly (eBay fetches images by URL)
      let imageUrl = "https://raw.githubusercontent.com/itsbigdill/onlist-agent/main/bench/cases/catalog-iphone/1.jpg";
      const frame = typeof b.frame === "string" ? b.frame.match(/^data:image\/(\w+);base64,(.+)$/) : null;
      const RUNS = process.env.RUNS_DIR ?? (process.env.FC_FUNC_CODE_PATH ? "/tmp/runs" : "runs");
      if (frame) {
        const fname = `f-${Date.now().toString(36)}.${frame[1] === "png" ? "png" : "jpg"}`;
        mkdirSync(`${RUNS}/frames`, { recursive: true });
        writeFileSync(`${RUNS}/frames/${fname}`, Buffer.from(frame[2], "base64"));
        const host = String(req.headers.host ?? "");
        // eBay fetches images by URL — a LAN/localhost address can never work,
        // keep the public fallback there (prod domain is public, uses the frame)
        const isPrivate = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
        const base = process.env.PUBLIC_BASE_URL ?? (isPrivate || !host ? "" : `https://${host}`);
        if (base) imageUrl = `${base}/frame/${fname}`;
      }
      // the demo board records the listing regardless of eBay
      const board = localBoard();
      const item = board.add
        ? await board.add({ title, status: "selling", priceUSD, condition,
                            verifiedAt: new Date().toISOString(), note: null, claims: [] })
        : null;
      if (!ebayEnabled()) {
        return json(res, 200, { board: item?.id ?? null, ebay: null });
      }
      try {
        const listing = await publishToEbay({ title, description, condition, priceUSD, imageUrl });
        if (item) await board.update(item.id, { note: `ebay:${listing.listingId}` });
        return json(res, 200, { board: item?.id ?? null, ebay: listing });
      } catch (e) {
        // eBay hiccup must not kill the flight — the board listing stands
        return json(res, 200, { board: item?.id ?? null, ebay: null,
                                ebayError: String((e as Error).message).slice(0, 200) });
      }
    }
    if (req.method === "POST" && req.url === "/chat") {
      const b = await readBody(req);
      const thread = await dealThread(
        String(b.title ?? "item"), Number(b.priceUSD) || 0, Number(b.floorUSD) || 0,
        String(b.buyerName ?? "Buyer"), String(b.buyerMessage ?? "Is this available?"),
        String(b.condition ?? "used"));
      if (!thread) return json(res, 502, { error: "chat generation failed" });
      return json(res, 200, thread);
    }
    if (req.method === "POST" && req.url === "/label") {
      const b = await readBody(req);
      if (!upsEnabled()) return json(res, 501, { error: "UPS sandbox not configured" });
      try {
        const label = await createLabel({ toName: String(b.toName ?? "Buyer"), title: String(b.title ?? "item") });
        return json(res, 200, label);
      } catch (e) {
        return json(res, 502, { error: String((e as Error).message).slice(0, 200) });
      }
    }
    if (req.method === "GET" && req.url && req.url.startsWith("/frame/")) {
      const name = req.url.slice("/frame/".length).replace(/[^A-Za-z0-9.-]/g, "");
      const RUNS = process.env.RUNS_DIR ?? (process.env.FC_FUNC_CODE_PATH ? "/tmp/runs" : "runs");
      const path = `${RUNS}/frames/${name}`;
      if (!existsSyncFs(path)) return json(res, 404, { error: "no frame" });
      res.writeHead(200, { "Content-Type": name.endsWith(".png") ? "image/png" : "image/jpeg" });
      res.end(readFileSyncFs(path));
      return;
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
