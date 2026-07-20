---
title: The last thing that's expensive to fake is reality. So I sold it.
published: false
tags: ai, qwen, agents, showdev
cover_image:
---

Point your phone at a laptop on your desk. Now point it at a photo of that same laptop on your monitor. To you, the difference is obvious in half a second. To every "photo → listing" tool ever shipped, the two are identical — they both trust the pixels.

That blind spot is quietly eating online marketplaces. And it's the hole I built an agent to close.

This is the story of **onlist-agent**, my [Qwen Cloud hackathon](https://qwencloud-hackathon.devpost.com/) entry. One-line pitch: *photograph a thing, and it's sold.* Two photos in — a real eBay listing, screened buyers, and a payout out, hands off. But all of it hangs on a single gate, and the gate is the interesting part, so we start there.

**Live on your phone → [agent.onlist.ai](https://agent.onlist.ai) · Code → [github.com/itsbigdill/onlist-agent](https://github.com/itsbigdill/onlist-agent)**

## Provenance is the new scarcity

For a decade, one thing made a listing trustworthy: someone had to physically hold the item to photograph it. The photo *was* the proof of possession.

In 2026 that proof is worthless. Image models "photograph" anything for free. Text models write the description. The result is the fastest-growing category of marketplace fraud — not stolen cards, but listings for things that **don't exist**: AI renders, re-shot catalog pages, a picture of someone else's screen.

Every tool tried to fix this downstream, with moderation and takedowns — chasing fakes after they're posted. I wanted to fix it at the door. Because there's exactly one thing left that's still expensive to fake:

> A real object, in a real room, seen from more than one angle.

Everything in onlist-agent is built to demand that proof before it will lift a finger to sell for you.

## The gate, and the trap I walked into

My first version was the obvious one: send a frame to Qwen3.7-VL, ask "is this a genuine photo of a physical object?" It confidently said **yes** to a photo of my monitor.

Obviously. A screen showing a real photo *is* a real photo — one level of indirection down. Within a single frame there is no tell. I'd asked the wrong question.

The fix reframed the whole thing. Capture isn't one photo — it's 2–4 frames grabbed while the camera *moves*. Feed the model all of them at once and give it one job: reason **across** them.

> The viewpoint may change. The world may not.

A real object betrays its dimensionality the instant the phone moves: parallax against the background, highlights sliding across a curved surface, a shadow crawling a centimeter. A photo of a screen can't do any of that — the "scene" tracks as one rigid rectangle, and it brings moiré and a border along for free. The moment the prompt asked about consistency across frames instead of realism within one, the screen trick collapsed:

```ts
const v = await verifyFrames("Apple AirPods Max, Space Gray", frames);
// { samePhysicalObject: true, isRealScene: true, matchesTitle: true,
//   condition: "good", confidence: 0.95, decision: "verified" }
```

Aim it at a monitor now and it doesn't just say no — it shows its work:

> Not a live capture — these are photographs of a digital screen. Moiré interference across the background, a rectangular border separating the image from its surroundings, and no parallax as the camera moves. The "scene" is a 2D graphic, not a 3D object.

That paragraph is the product. A confident fake is **blocked**, not flagged.

## An agent is a pipeline that knows when it's unsure

Pass/fail is a pipeline. What made this feel like an *agent* lives in the gray zone. When confidence lands in the murky middle, it doesn't guess and it doesn't refuse — it names the exact shot that would settle it ("tilt it and photograph the underside") and re-examines with the new frame.

That branch is `decide(verdict, round)`: a pure function with unit-tested boundaries. "Unsure → ask a specific question → look again" is written down, not improvised by a prompt. A system that notices its own uncertainty and acts on it is the whole difference between automation and an agent.

## I benchmarked it against fakes from its own bloodline

A fraud filter with no numbers is a vibe. So the repo ships a labeled suite — and to make it fair, the AI fakes in it were generated with **qwen-image**: the examiner is tested against its own model family. One command, `bun run bench`, rewrites this table:

| kind | cases | correct |
|---|---|---|
| ai (qwen-image renders) | 4 | 4/4 |
| screen re-shot | 1 | 1/1 |
| catalog re-shot | 1 | 1/1 |
| object mismatch | 1 | 1/1 |
| honest live captures | 7 | 7/7 |

**7/7 fakes caught · 0/7 false blocks · median 5.4s · $0.057 for all 14 verdicts.**

The honest half is a genuine photo session — an alarm clock, sunglasses, a tumbler, a wallet, sneakers, a toy, a phone; two angles each. All seven passed the gate.

And the caveat, because leaving it out would be the real dishonesty: on the single hardest case — a toy shot top-down, then flipped to its underside — the model sits right on the margin and *sometimes* flags it. That flip is the "same object across viewpoints" test pushed to its breaking point; on a normal run it verifies at 0.95–0.98. It didn't start clean, either: two AI renders slipped through at 0.95 until the cross-frame rewrite. I'm keeping the scar tissue in the post because that's where the actual engineering happened.

## Then it does the part everyone hates

Proving reality is the hard half. The other half is the reason your closet is full of stuff you keep meaning to sell: pricing it, listing it, and living in an inbox of lowballers and scammers. Once an item is verified, the human makes exactly **one** decision — approve a price *range* — and the agent takes the rest:

- **Price** calls DashScope's `forced_search` (a switch OpenAI's API doesn't expose) to pull live comps and return a number *with its receipts*. The afternoon-costing gotcha: `enable_search: true` alone is silently ignored — you need `forced_search`.
- **List** creates a real eBay listing through the Inventory API — OAuth as the seller, taxonomy picks the category, item specifics auto-filled — and the listing id lands back in the UI. Not a mock; an id you can open.
- **Negotiate** ranks buyers, flags scam patterns, and counters lowballs with a number that can **never drop below the floor and never reveal it** — enforced in code, not entrusted to a prompt. Scam-flagged buyers get no counter at all. The closing chat is generated live by `qwen3.6-flash` under that same bounded authority.
- **Close** shows a payout — the sale minus the real marketplace fee — and a downloadable shipping label. Your next physical action is taping it to a box.

Every model call is metered: stage, model, tokens, dollars. An autopilot without a meter is a toy; the whole benchmark above cost a nickel.

## The stack, for the curious

~1,000 lines of **zero-dependency** TypeScript — plain `fetch`, no SDK — running as a single Node.js web function on **Alibaba Function Compute** behind a custom domain. Every unit of intelligence is Qwen on **Model Studio**: `qwen3.7-plus` (the VL examiner and the pricing/triage brain), `qwen3.6-flash` (angle requests and live negotiation), `qwen3.7-max` (a weekly housekeeper digest). Verifications can write an immutable evidence record to OSS — the frames plus the verdict, timestamped, for when a dispute needs a source of truth.

## Try to fool it

```bash
git clone https://github.com/itsbigdill/onlist-agent && cd onlist-agent
bun install && cp .env.example .env   # add DASHSCOPE_API_KEY
bun run bench       # reproduce the numbers
bun run demo        # full autopilot pass
```

Or just open [agent.onlist.ai](https://agent.onlist.ai) on your phone and try to slip a screenshot past the gate.

Here's the bet the whole thing is built on: the next marketplace won't treat trust as cleanup — moderation, reports, takedowns, forever one step behind the fakes. It'll prove reality **at the door**, before a listing exists, and hand the boring middle to an agent. Photograph a thing — and it's sold.
