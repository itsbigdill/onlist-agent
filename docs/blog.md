---
title: A photo of a photo looks real to your eyes. I taught a Qwen model to catch it.
published: false
tags: ai, qwen, agents, showdev
cover_image:
---

Here are two images of the same pair of AirPods. One is the real thing on my desk. The other is a photo of my monitor showing a product page. You can tell them apart in half a second. Until recently, a vision model couldn't — and that gap is the single most valuable thing in an online marketplace in 2026.

This is a build log for **onlist-agent**, my entry for the [Qwen Cloud hackathon](https://qwencloud-hackathon.devpost.com/). The pitch is simple: photograph a thing, and it's sold. Two photos in, a real eBay listing and a screened-buyer sale out — hands off. But the whole thing rests on one gate that has to work, so let's start there.

**Live: [agent.onlist.ai](https://agent.onlist.ai) · Code: [github.com/itsbigdill/onlist-agent](https://github.com/itsbigdill/onlist-agent)**

## The problem: "photographing" a thing is now free

For a decade, the thing that made a marketplace listing *trustworthy* was that someone had to physically hold the item to photograph it. That's gone. Image models "photograph" anything for free. Text models write the description. So the fastest-growing fraud isn't stolen cards — it's listings for things that don't exist: AI renders, re-shot catalog images, a picture of a screen.

The only thing still expensive to fake is **physical reality**: a real object, in a real room, seen from more than one angle. So I built the agent around proving exactly that before it does anything else.

## First attempt: ask the model "is this real?" (it failed)

The naive version sends one frame and asks Qwen3.7-VL whether it's a genuine photo of a physical object. It confidently said *yes* to a photo of my monitor when the screen filled the frame. Of course it did — a screen showing a real photo **is** a real photo, one level down. Per-frame, there's no tell.

The fix was to stop looking at frames one at a time. The capture pass grabs 2–4 frames while the camera moves, and the model gets them **all at once** with one job: reason across them.

> The viewpoint may change. The world may not.

A real object shifts against its background — parallax, changing highlights, a shadow crawling as the phone moves. A photo of a screen is a flat plane: the "scene" slides as one rigid rectangle, and you get moiré and a border. Once the prompt asked about consistency *across* frames instead of realism *within* one, the screen trick died:

```ts
const v = await verifyFrames("Apple AirPods Max, Space Gray", frames);
// { samePhysicalObject: true, isRealScene: true, matchesTitle: true,
//   condition: "good", confidence: 0.95, decision: "verified" }
```

Point it at a monitor now and it explains itself:

> Not a live capture — photographs of a digital screen. Moiré interference on the background, a rectangular border separating the image from its surroundings, and no parallax as the camera moves. The "scene" is a 2D graphic, not a 3D object.

That reasoning is the product. A confident fake is **blocked**, not warned.

## The agentic part: it acts on its own doubt

Binary pass/fail is a pipeline, not an agent. The interesting behavior is in the gray zone: when confidence is low, it doesn't guess and it doesn't refuse — it asks for a **specific** shot ("tilt it and photograph the underside") and re-examines with the extra frame. `decide(verdict, round)` is a pure function with unit-tested boundaries, so "unsure → ask" is code, not a vibe. A model that notices it's uncertain and does something about it is the difference that made this feel like an agent.

## Receipts: I benchmarked it against fakes from its own family

Claiming a fraud filter works is worthless without numbers, so there's a labeled suite in the repo — including **AI fakes I generated with qwen-image**, so the examiner is tested against its own model family. Reproduce it with `bun run bench`:

| kind | cases | correct |
|---|---|---|
| ai (qwen-image renders) | 4 | 4/4 |
| screen re-shot | 1 | 1/1 |
| catalog re-shot | 1 | 1/1 |
| object mismatch | 1 | 1/1 |
| honest live captures | 7 | 7/7 |

**7/7 fakes caught · 0/7 false blocks · median 5.4s · $0.057 for 14 verdicts.**

The honest half is a real photo session — an alarm clock, sunglasses, a tumbler, a wallet, sneakers, a toy, a phone; two angles each. All passed. And the honest caveat, because pretending it's bulletproof would be the actual lie: on the hardest case — a toy shot top-down, then flipped to its underside — the model sits on the margin and *occasionally* flags it. That flip is precisely the "same object across viewpoints" test taken to its limit; on a normal run it verifies at 0.95–0.98.

## Everything after the gate is the boring middle, automated

Once an item is proven real, the seller makes exactly **one** decision — approving a price *range* — and the rest is delegated:

- **Price** uses DashScope's `forced_search` (a switch OpenAI's API doesn't have) to pull live comps and return a number *with its receipts*. Gotcha that cost me an afternoon: `enable_search: true` alone is silently ignored; you need `forced_search`.
- **List** creates a real eBay listing via the Inventory API — OAuth as the seller, taxonomy picks the category, item specifics auto-filled — and the listing id comes back into the UI. Not a mock; an id you can open.
- **Negotiate** ranks buyers, flags scam patterns, and counters lowballs with a number that can **never go below the floor and never reveal it** — enforced in code, not in a prompt. The closing chat is generated live by `qwen3.6-flash` under that same bounded authority.
- **Close** shows a payout (sale minus the real marketplace fee) and a downloadable shipping label. Next human touch: a box.

Every call is metered — stage, model, tokens, dollars — because an autopilot without a meter is a toy. The whole 14-verdict benchmark cost five cents.

## Stack

~1,000 lines of zero-dependency TypeScript (plain `fetch`, no SDK) as one Node.js web function on **Alibaba Function Compute** behind a custom domain. Intelligence is all Qwen on **Model Studio**: `qwen3.7-plus` (VL examiner + pricing/triage brain), `qwen3.6-flash` (angle requests + negotiation), `qwen3.7-max` (weekly digest). Optional immutable evidence locker on OSS.

## Try to fool it

```bash
git clone https://github.com/itsbigdill/onlist-agent && cd onlist-agent
bun install && cp .env.example .env   # add DASHSCOPE_API_KEY
bun run bench       # reproduce the numbers
bun run demo        # full autopilot pass
```

Or just point your phone at [agent.onlist.ai](https://agent.onlist.ai) and try to slip a screenshot past it. The bet: the next marketplace won't bolt trust on as moderation after the fact — it'll prove reality at the door, before anything gets listed, and let an agent handle the rest.
