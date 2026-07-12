# onlist-agent — Devpost submission copy

Paste-ready text for the Devpost form. Track: **Autopilot Agent**.

---

## Name
onlist-agent

## Tagline (≤ 200 chars)
An autopilot for selling real things that refuses to list anything it can't
prove is physical. Verify → price → list → handle buyers — the agent does the
legwork, a human owns every dollar.

## Elevator pitch (the "what")
Point your phone at anything you want to sell. The agent examines the frames
and proves it's a real object in your hands — not a screenshot, not a re-shot
catalog photo, not an AI render. Then it prices it with live market comps,
lists it, screens the buyers, flags the scams, and counters the lowballs within
a floor you delegated. You confirm the price and tap accept on the buyer.
Everything else is the agent's job. **Try it live: https://agent.onlist.ai**

## Inspiration
2026 is the year marketplace trust broke: AI-generated listings — perfect
photos of items that never existed — flooded every platform. Everyone upstream
(the marketplaces, the payment rails) treats it as a moderation problem. We
think it's a listing-creation problem: if an agent refuses to *create* a
listing without proof of a physical object, the fakes never enter the market.
The agent isn't just a convenience — it's the trust layer.

## What it does
- **Verify 2.0 — the anti-fake gate.** Qwen3.7-VL examines 2–4 frames from a
  live capture pass: same physical object across viewpoints? real scene (not a
  screen/print re-shot, not an AI render)? scene continuity between frames?
  What condition, what defects? A confident fake is refused outright.
- **Acts on its own uncertainty.** In the gray zone the agent doesn't guess —
  it formulates a *specific* capture request ("tilt it and shoot the
  underside") and re-examines with the extra frame. A pipeline decides once;
  an agent notices it's unsure and does something about it.
- **Prices with receipts.** Live web search (DashScope `forced_search`) finds
  current comps; the agent proposes a number, a negotiation floor, and the
  reasoning. The human confirms or edits the number — always.
- **Handles buyers with delegated authority.** Claims are ranked, scam
  patterns flagged (overpayment, shipping-agent, gift cards), replies drafted.
  Lowballs get a counter-offer **bounded by the floor in code** — never below
  it, never revealing it, never for scam-flagged claims.
- **Works while you don't.** A weekly housekeeper pass (FC Timer → `/digest`)
  surfaces stale listings, price cuts, and unanswered buyers as one
  actionable push.
- **Leaves a paper trail.** Every verification can write an immutable evidence
  record (exact frames + verdict, timestamped) to Alibaba OSS; every model
  call is metered into a per-stage cost ledger.

## The benchmark (measured, not asserted)
The anti-fake claim ships with receipts: a labeled benchmark in the repo,
including **AI-generated listings we produced with qwen-image — the examiner
is tested against fakes from its own model family.** It didn't start perfect:
two AI renders initially passed at 0.95 confidence. Bench-driven prompt
iteration (synthetic tells, then a scene-continuity rule: *the viewpoint may
change, the world may not*) closed the gap. Current suite: **6/6 fakes caught
(4 AI renders, catalog re-shot, object mismatch), median verdict 7.4s, $0.022
per full run.** One command reproduces it.

## How we built it
~1,000 lines of zero-dependency TypeScript (plain `fetch`, no SDK) running as
a Node.js web function on **Alibaba Function Compute** behind a custom domain.
All intelligence is Qwen on **Model Studio** (DashScope intl, Singapore):
`qwen3.7-plus` VL as the authenticity examiner and pricing/triage brain,
`qwen3.6-flash` for the agent's angle requests, `qwen3.7-max` for the weekly
digest. `response_format: json_object` for structured outputs; `enable_thinking:false`
where speed beats depth (vision verdicts went 45s → ~7s); `forced_search` for
live comps (`enable_search` alone is silently ignored — a platform finding).
The evidence locker is a zero-dep OSS client (HMAC-SHA1 via node:crypto).
The decision policy (`decide()`) is a pure function with 12 unit-tested
boundary cases.

## Human-in-the-loop, by design
The agent never spends, promises, or sells. Three checkpoints are structural:
the price is confirmed by the human, buyer accept/decline is a human tap, and
counter-offers exist only inside the delegated floor — enforced in code, not
in a prompt.

## What's next
Persist verified-listing evidence as a portable "proof of physical reality"
badge other marketplaces can consume; ARKit parallax fusion (the production
onlist app already captures it); negotiation memory across a buyer's messages.

## Built with
qwen3.7-plus (VL + search) · qwen3.6-flash · qwen3.7-max · Alibaba Cloud
Model Studio (DashScope intl) · Function Compute · OSS · TypeScript/Node ·
zero runtime dependencies

## Links (fill in)
- Live demo: https://agent.onlist.ai
- Video demo: `<YouTube/Vimeo link>`
- Repo: https://github.com/itsbigdill/onlist-agent
- First production consumer: https://www.onlist.ai
