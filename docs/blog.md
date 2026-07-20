---
title: I built an agent that photographs your junk and sells it for you — and refuses to list fakes
published: false
tags: ai, qwen, agents, showdev
cover_image:
---

Selling your old stuff online is a pain. You price it, write the listing, take the photos — then you live in your inbox: the same three questions, the lowballers, the "I'll send my shipping agent" scammers. So most of our stuff just sits in a drawer.

For the [Global AI Hackathon with Qwen Cloud](https://qwencloud-hackathon.devpost.com/) I built **onlist-agent**: you take two photos, and it does the rest. It proves the item is real, prices it against the live market, lists it *for real* on eBay, screens the buyers, negotiates inside a range you set, closes the deal, and hands you a shipping label. You never open a browser.

**Try it on your phone: [agent.onlist.ai](https://agent.onlist.ai) · Code: [github.com/itsbigdill/onlist-agent](https://github.com/itsbigdill/onlist-agent)**

It's ~1,000 lines of zero-dependency TypeScript on Alibaba Function Compute, and every unit of intelligence is a Qwen model on Model Studio. Here's the part I'm proud of.

## The gate: it refuses to sell a fake

In 2026 the fastest-growing marketplace fraud isn't stolen cards — it's listings for things that don't exist. AI-generated photos, re-shot catalog images, a picture of a monitor showing someone else's laptop. Text models made writing a listing free; image models made "photographing" it free too. The only thing still expensive to fake is **physical reality**.

So an autopilot that lists things *for* you has to be the trust layer too. Before anything else, `Verify 2.0` runs. The capture pass gives it 2–4 frames shot seconds apart while the camera moves. Qwen3.7-VL sees all frames at once, plus the title, and answers like an examiner:

- Do **all** frames show the same single physical object — wear marks consistent, lighting shifting with viewpoint, background parallax?
- Is it a **real scene** — not a screen, not a print, not a catalog re-shot? (moiré, glare rectangles, pixel grids, paper texture give it away)
- Does it match the claimed title, and what's the condition?

```ts
const v = await verifyFrames("Apple AirPods Max, Space Gray", frames);
// { samePhysicalObject: true, isRealScene: true, matchesTitle: true,
//   condition: "good", defects: [], confidence: 0.95, decision: "verified" }
```

A confident fake is **blocked**, not warned. Point it at a product photo on your monitor and it comes back:

> Not a live capture of a physical object — photographs of a digital screen. Evidence: moiré interference on the background, a rectangular border separating the image from its surroundings, and no parallax as the camera moves. The "scene" is a 2D graphic, not a 3D item.

## It acts on its own uncertainty

The interesting agentic bit: in the gray zone it doesn't guess. If confidence is low, it doesn't refuse *or* pass — it formulates a **specific** capture request ("tilt it and shoot the underside") and re-examines with the extra frame. A pipeline decides once; an agent notices it's unsure and does something about it. The decision policy (`decide()`) is a pure function with unit-tested boundaries, so "unsure → ask" is code, not vibes.

## Receipts, not vibes: the benchmark

I didn't want to just *claim* the gate works, so there's a labeled benchmark in the repo — including **AI-generated listings I made with qwen-image**, so the examiner is tested against fakes from its own model family. It didn't start perfect: two renders passed at 0.95 confidence until I stopped asking per-frame questions and started asking about parallax and lighting **across** frames — *the viewpoint may change, the world may not*.

Current suite, reproducible with `bun run bench`:

| kind | cases | correct |
|---|---|---|
| ai (qwen-image renders) | 4 | 4/4 |
| screen re-shot | 1 | 1/1 |
| catalog re-shot | 1 | 1/1 |
| object mismatch | 1 | 1/1 |
| honest live captures | 7 | 7/7 |

**7/7 fakes caught · 0/7 false blocks on real items · median 5.4s · $0.057 for 14 verdicts.**

The honest half is a real photo session — seven everyday objects (an alarm clock, sunglasses, a tumbler, a wallet, sneakers, a toy, a phone), two angles each. The gate let all seven through. On the single hardest one — a toy shot top-down, then flipped to its underside — the VL model sits right at the margin and occasionally flags it; that flip is *exactly* the "same object across viewpoints" test, and it verifies at 0.95–0.98 on a normal run. I left that in the writeup because pretending it's 100% bulletproof would be the lie.

## Pricing with a switch OpenAI doesn't have

DashScope's chat API is OpenAI-compatible, but it has `forced_search` — the model searches the live web before answering. The price agent uses it to pull real comps and returns a number *with its receipts*:

```json
{ "suggestedUSD": 385, "floorUSD": 340,
  "comps": [{ "label": "eBay sold, same model, good", "priceUSD": 370 }],
  "rationale": "..." }
```

One platform gotcha worth knowing: `enable_search: true` alone was silently ignored; you need `forced_search`. Cost me an afternoon.

## The one human decision, then full autopilot

The seller makes exactly one money decision: authorizing the price *range* the agent proposed. Everything after that tap is bounded by it. Buyers get ranked, scam patterns flagged, replies drafted; lowballs get a counter-offer that can **never go below the floor and never reveal it** — enforced in code, not in a prompt. Scam-flagged buyers get no counter at all.

Then it lists for real. One tap creates an actual eBay listing through the Inventory API (OAuth as the seller, taxonomy picks the category, required item specifics auto-filled) and the listing id comes back into the UI — an id you can open, not a mock. The closing conversation is generated live by `qwen3.6-flash` under the same bounded authority, and it always closes through checkout with tracked shipping. The seller watches a payout counter (sale minus the real marketplace fee) and downloads a shipping label. Next touch: a box.

## Cost ledger, because autopilot without a meter is a toy

Every call is metered — stage, model, tokens, dollars. A full pass over one item is a few cents; the 14-verdict benchmark above cost $0.057. Verification is the cheapest fraud filter this market has ever had.

## The models

- `qwen3.7-plus` (VL) — the authenticity examiner and the pricing/triage brain
- `qwen3.6-flash` — the agent's "one more angle" requests and the live negotiation
- `qwen3.7-max` — the weekly housekeeper digest
- All on Model Studio (DashScope intl), served from a single Node.js web function on Function Compute behind a custom domain, with an optional immutable evidence locker on OSS.

## Try it

```bash
git clone https://github.com/itsbigdill/onlist-agent && cd onlist-agent
bun install && cp .env.example .env   # add DASHSCOPE_API_KEY
bun run demo        # full autopilot pass
bun run bench       # reproduce the numbers above
```

Or just point your phone at [agent.onlist.ai](https://agent.onlist.ai) and try to fool it.

The bet behind onlist: the next marketplace won't have trust bolted on as moderation after the fact. It'll have a camera at the door that proves reality *before* anything gets listed — and an agent that does the boring middle for you once it's through.
