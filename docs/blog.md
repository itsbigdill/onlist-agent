---
title: I built an AI agent that sells your stuff — you just take two photos
published: false
tags: ai, qwen, agents, showdev
cover_image:
---

My AirPods Max sat in a drawer for a year. I kept meaning to sell them — but that means writing a listing, guessing a price, and then a week of "is this still available?" messages. So they just sat there.

For the [Qwen Cloud hackathon](https://qwencloud-hackathon.devpost.com/) I built an agent that does all of it. I take two photos with my phone. It checks the item is real, looks up what it sells for, lists it on eBay, talks to the buyers, and gives me a shipping label. My only decision is one tap to approve the price range.

Here's what that looks like with my actual AirPods:

1. Two photos → **"Apple AirPods Max, Space Gray — verified real"**
2. It searches the live market → **"sells for $340–385"** — I tap once
3. It creates a real eBay listing (a real listing id, via the Inventory API)
4. Buyers come in → it declines two scams, negotiates with the real one
5. **Sold at $350** → it shows my payout: **+$303.32** after the eBay fee
6. Shipping label ready — download, print, tape it on the box

**Try it on your phone: [agent.onlist.ai](https://agent.onlist.ai) · Code: [github.com/itsbigdill/onlist-agent](https://github.com/itsbigdill/onlist-agent)**

The rest of this post is the two problems that turned out to be interesting: how to know a photo is real, and how to let an AI negotiate without letting it give your stuff away.

## Problem 1: anyone can fake a product photo now

If an agent lists things for you automatically, someone will feed it fake photos. AI-generated "products", screenshots from shops, photos of a monitor. Marketplaces are already full of this — listings for things that don't exist.

So before selling anything, the agent has to answer: **is this a real object that this person actually has?**

My first try was simple: send the photo to Qwen3.7-VL and ask "is this a real photo of a physical object?" It answered *yes* to a photo of my monitor. Which is fair — a screen showing a real photo *is* a real photo. From one frame, you can't tell.

The fix: don't use one frame. The app takes two photos while you move the phone, and the model sees both at once with one instruction — check that it's the same object in the same room, seen from two angles. A real thing shifts against the background, the light moves on it. A photo of a screen stays flat — and brings moiré and a monitor edge with it.

After that change, here's the model catching my monitor trick, in its own words:

> Not a live capture — these are photographs of a digital screen. Moiré interference across the background, a rectangular border separating the image from its surroundings, and no parallax as the camera moves.

A fake doesn't get a warning label. It just doesn't get listed.

One more nice bit: when the model *isn't sure*, it doesn't guess. It asks for one specific extra shot — "tilt it and photograph the underside" — and looks again. That logic is a small pure function (`decide()`), covered by unit tests.

### Did it actually work? Numbers:

I made a test set: 7 fakes (4 AI images generated with qwen-image — so the examiner is tested against its own model family, a photo of a screen, a catalog photo, and a two-different-objects trick) and 7 real things from around my apartment, two photos each. `bun run bench` runs the whole thing:

**7/7 fakes caught · 7/7 real items passed · median verdict 5.4s · $0.057 for all 14 checks.**

Honest footnote: on the hardest real case — a toy shot from the top, then flipped upside down — the model occasionally hesitates and flags it. And my first version let two AI images through at 0.95 confidence before I switched to the two-frame approach. It's not magic; it's a benchmark and iteration.

## Problem 2: an AI negotiator that can't be talked down

Letting a model chat with buyers is easy. Letting it *negotiate* is scary — what if someone prompts it into "sure, take it for $5"?

The rule I ended up with: **money limits live in code, not in the prompt.** When I approve "sells for $340–385", the floor ($340) becomes a hard bound. The model drafts replies and counter-offers, but the number it proposes is clamped in TypeScript — it physically can't go below the floor, and the reply never reveals it. Buyers flagged as scams (overpayment, "my shipping agent will pick it up") get no counter-offer at all.

Same idea everywhere: the model suggests, the code enforces.

## What it runs on

- ~1,000 lines of zero-dependency TypeScript (plain `fetch`, no SDKs) on **Alibaba Function Compute**
- **qwen3.7-plus** — the vision examiner + pricing and buyer triage
- **qwen3.6-flash** — quick jobs: "one more angle" requests, the live buyer chat
- Pricing uses DashScope's `forced_search` so the model searches the live web for comps before naming a price. (Gotcha: `enable_search: true` alone is silently ignored — you need `forced_search`. That cost me an afternoon.)
- The eBay part is the real Inventory API in sandbox: OAuth, category from their taxonomy, publish, listing id back.
- Every model call is metered — the demo prints exactly what each stage cost.

## Try it

```bash
git clone https://github.com/itsbigdill/onlist-agent && cd onlist-agent
bun install && cp .env.example .env   # add your DASHSCOPE_API_KEY
bun run bench    # re-run the real/fake benchmark
bun run demo     # the full flow in your terminal
```

Or open [agent.onlist.ai](https://agent.onlist.ai) on your phone, photograph something on your desk — and then try to fool it with a screenshot. That's the fun part.
