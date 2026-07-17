# onlist-agent — Devpost submission copy

Paste-ready text for the Devpost form. Track: **Autopilot Agent**.

---

## Name
onlist-agent

## Tagline (≤ 200 chars)
Photograph a thing — and it's sold. The agent quotes the range it'll sell for;
one tap delegates listing, negotiation and closing. Your shipping label arrives
by email. It also refuses to fly fakes.

## Elevator pitch (the "what")
Point your phone at anything you want to sell. The agent proves it's real,
sizes the live market, and makes you an offer: *"this sells for $520–650."*
One tap — your only decision — delegates the rest: it creates a **real eBay
listing** (Sandbox, via the Inventory API — you get the listing id back),
screens the buyers, declines the scams, counters the lowballs strictly inside
your authorized range, and closes the deal. The prepaid shipping label lands in
your email; your next touch is sticking it on a box. Under the hood there's a
gate that makes the autopilot trustworthy: it refuses to list anything it
can't prove is a real physical object — no screenshots, no re-shot catalog
photos, no AI renders. **Try it live: https://agent.onlist.ai**

## Inspiration
Everyone owns things they'd sell "if it weren't such a hassle" — the pricing
research, the listing, the inbox of scammers and hagglers. That middle is
exactly what agents are for: delegate the legwork, keep the human on the
money. And 2026 added a twist that shaped the design: AI-generated fake
listings flooded every marketplace, so an autopilot that lists things FOR you
must also be the trust layer — it refuses to create a listing without proof
of a real physical object in your hands.

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
- **Lists for real.** One tap creates an actual eBay Sandbox listing through
  the Inventory API: OAuth as the seller, taxonomy suggests the category,
  required item specifics are auto-filled, and the listing id comes back into
  the UI. Not a mock — an id you can open.
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

## Delegation with bounds, by design
The human makes exactly ONE money decision: authorizing the sale range the
agent proposed. Everything the agent does after that tap is bounded by it —
counter-offers can never go below the floor and never reveal it (enforced in
code, not in a prompt), scam-flagged buyers get no counter at all, and the
deal closes only inside the range. Trust the autopilot because its authority
is written down.

## What's next
Persist verified-listing evidence as a portable "proof of physical reality"
badge other marketplaces can consume; ARKit parallax fusion (the production
onlist app already captures it); negotiation memory across a buyer's messages.

## Built with
qwen3.7-plus (VL + search) · qwen3.6-flash · qwen3.7-max · Alibaba Cloud
Model Studio (DashScope intl) · Function Compute · OSS · TypeScript/Node ·
eBay Sandbox (Inventory + Account + Taxonomy APIs) ·
zero runtime dependencies

## Links (fill in)
- Live demo: https://agent.onlist.ai
- Video demo: `<YouTube/Vimeo link>`
- Repo: https://github.com/itsbigdill/onlist-agent
- First production consumer: https://www.onlist.ai
