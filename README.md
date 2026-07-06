# onlist-agent.

**Autopilot for selling real things: capture → prove-it's-real → price → list → handle buyers.**
Humans confirm every money decision. Powered by Qwen on Alibaba Cloud.

The 2026 problem this attacks: marketplaces are drowning in AI-generated fake
listings — photos of screens, re-shot catalog images, items the seller never
held. This agent refuses to list anything it can't verify as a **physical
object in the seller's hands**, then does the boring parts of selling it.

## The loop

```
frames from a live capture pass
        │
        ▼
┌─ VERIFY 2.0 ─────────────┐   Qwen3.7-VL examines 2–4 frames:
│ same physical object?    │   same object across viewpoints, real scene
│ real scene, not a screen?│   (not a screen/print re-shot), condition
│ condition + defects      │   and visible defects. Fails → listing BLOCKED.
└──────────┬───────────────┘
           ▼
┌─ PRICE ──────────────────┐   Qwen3.7-Max + live web search finds comps,
│ comps → number + floor   │   proposes a price WITH the reasoning.
└──────────┬───────────────┘   Human confirms the number.
           ▼
┌─ LIST ───────────────────┐   Status flips to selling on the board.
└──────────┬───────────────┘
           ▼
┌─ TRIAGE ─────────────────┐   Claims ranked (scam patterns flagged),
│ rank claims, draft replies│  replies drafted. Human taps accept/decline.
└──────────────────────────┘
```

Every model call is metered into a **cost ledger** (`runs/ledger.json`) —
tokens and dollars per stage, printed after each run.

## Quickstart (≈3 minutes)

**With Bun** (auto-loads `.env`):

```bash
curl -fsSL https://bun.sh/install | bash   # if you don't have bun
bun install
cp .env.example .env         # paste your DASHSCOPE_API_KEY
bun run smoke                # one cheap call — verifies the key
bun run demo                 # full autopilot pass; stops at the price checkpoint [y / your price / n]
bun run demo --yes           # non-interactive (CI): auto-accepts the proposal
bun run demo macbook-pro-14 seed/frames/1.jpg seed/frames/2.jpg   # anti-fake gate on your own frames
```

**With plain Node** (18+, no Bun — same code, compiled):

```bash
npm install
npm run build                # tsc → dist/*.js
export DASHSCOPE_API_KEY=sk-...
node dist/cli.js smoke
node dist/server.js          # HTTP service on :8080
```

`bun run serve` / `node dist/server.js` starts the HTTP flavor
(`/verify`, `/price`, `/triage`, a phone-first demo page) — that's what runs on
Alibaba **Function Compute** in the deployment proof. See [deploy/alibaba.md](deploy/alibaba.md).

## Live mode — the first production consumer

[onlist](https://www.onlist.ai) — a social network about your things — is
agent-native: accounts pair with an AI ("Sign in with your AI"), agent writes
are audit-logged, and **agents can never create solid items** — only a human
with a camera makes things real. This repo's agent runs against it unchanged:

```bash
TARGET=onlist ONLIST_USER=you ONLIST_TOKEN=... bun run demo <itemId>
```

The commercial product stays closed; this agent uses only its public surface.

## Layout

```
src/qwen.ts        DashScope client (OpenAI-compatible), cost metering
src/verify.ts      Verify 2.0 — the anti-fake gate (Qwen3.7-VL)
src/price.ts       price agent (Qwen3.7-Max + enable_search)
src/triage.ts      buyer-claim ranking + reply drafts
src/agent.ts       the autopilot orchestration
src/board/local.ts self-contained demo board (JSON file)
src/board/onlist.ts live adapter to onlist.ai
src/cli.ts         smoke | demo
src/server.ts      HTTP service for the Alibaba Cloud deployment
```

## How we address the judging criteria

*(filled in with measured numbers before submission)*

- **Technical depth** — multi-frame VL authenticity examination; provider-grade
  client with tolerant JSON extraction; cost ledger; same agent against a file
  store and a production API.
- **Innovation** — every "photo→listing" tool trusts the photo. This one
  interrogates it. Proof-of-physical-reality as the gate to commerce.
- **Problem value** — AI-fake listings are the top trust problem of 2026
  marketplaces; verified-only listings attack it at the root.
- **Presentation** — 3-minute video: watch the agent catch a screen re-shot,
  then sell a real laptop end-to-end.

## License

MIT
