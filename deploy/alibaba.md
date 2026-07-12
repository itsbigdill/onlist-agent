# Deploy to Alibaba Cloud — Function Compute (for the proof-of-deployment recording)

The agent's HTTP service runs on **Alibaba Function Compute (FC)**: serverless,
HTTPS out of the box (so the live-camera demo works), generous free tier. It uses
**Qwen on Alibaba Cloud** for every model call, so one region keeps latency low.

Runs on plain **Node.js** — no Bun, no Docker needed for FC.

## 0. Build the Node bundle (local, once)

```bash
npm install            # dev-only: typescript + @types/node
npm run build          # tsc → dist/*.js  (pure ESM, Node 18+)
```

`dist/` is what FC runs (`node dist/server.js`).

## 1. Create the function (FC console)

Function Compute → **Create Function** → **Web Function**:

- Runtime: **Node.js 20**
- Code: upload the project (or the `dist/` + `package.json`) as a zip, OR point FC
  at the public repo. Startup command: `node dist/server.js`
- **Listen port: 9000** (the server reads `FC_SERVER_PORT`, which FC sets to 9000)
- Instance: smallest (0.35 vCPU / 512 MB is plenty)
- Timeout: 120 s (pricing + web search can take ~10 s; headroom is safe)

## 2. Environment variable

Function → Configuration → Environment Variables:

```
DASHSCOPE_API_KEY = sk-...        # your Qwen Cloud key
```

(Optional: `QWEN_TEXT_MODEL`, `QWEN_VISION_MODEL` to override models.)

## 3. Enable the HTTPS URL

Function → Triggers → the built-in **HTTP trigger** → note the public
`https://<...>.fcapp.run` URL. Auth: anonymous (it's a public demo).

## 4. Multi-service touch — OSS for audit artifacts (optional, recommended)

Create an **OSS bucket** (`onlist-agent-audit`) and set `AUDIT_OSS_BUCKET` — the
agent writes each run's ledger + verdict there. Two Alibaba services (FC + OSS)
on the diagram reads as real architecture, not a single API call.

## Proof-of-deployment recording (hackathon requirement, ~90 s, one take)

1. FC console: the function **running**, its HTTPS URL visible.
2. In a browser: open the HTTPS URL → the demo page loads; hit `/health` → JSON
   with the Qwen model ids.
3. `curl -X POST https://<url>/price -H 'Content-Type: application/json' -d '{"title":"Shure MV7 microphone"}'`
   → a real Qwen-powered price with live web-search comps.
4. Editor: `src/qwen.ts` visible — the DashScope base URL + Qwen model calls.

## Alternative: ECS (if you prefer a VM)

```bash
curl -fsSL https://bun.sh/install | bash && source ~/.bashrc
git clone https://github.com/itsbigdill/onlist-agent && cd onlist-agent
bun install && export DASHSCOPE_API_KEY=sk-...
nohup bun src/server.ts > agent.log 2>&1 &   # http://<ecs-ip>:8080
```

HTTP only (fine for the proof); for the live-camera pass you'd add a domain + TLS.

## Evidence locker (OSS) — optional but recommended

Every verification can write an immutable audit record (frames + verdict JSON)
to OSS: `evidence/<timestamp-id>/`. Enable by setting on the function:

- `OSS_BUCKET` — a bucket in the same region (e.g. `onlist-evidence`)
- `OSS_ENDPOINT` — default `oss-ap-southeast-1.aliyuncs.com`
- `ALIBABA_ACCESS_KEY_ID` / `ALIBABA_ACCESS_KEY_SECRET` — a RAM user with
  `AliyunOSSFullAccess` (or a bucket-scoped policy)

Unset → the feature is silently off; the demo runs unchanged.

## Weekly housekeeper on a schedule

`GET/POST /digest` runs the housekeeping agent over the board and returns the
push + per-item recommendations. Point any scheduler at it — an FC Timer
trigger, or an external cron — weekly. The agent acts without being asked;
the human still owns every action it recommends.
