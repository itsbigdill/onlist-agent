# I taught my marketplace to tell real objects from photos of photos — with Qwen3.7-VL

*(draft — numbers to be filled from real runs before publishing on dev.to)*

## The problem nobody upstream will fix

In 2026 the fastest-growing category of marketplace fraud isn't stolen cards —
it's listings for things that don't exist. Generated photos, re-shot catalog
images, pictures of a monitor showing someone else's laptop. Text models made
writing the listing free; image models made "photographing" it free too. The
only thing left that's expensive to fake is **physical reality**.

I'm building [onlist](https://www.onlist.ai), a social network about your
things, with one hard law: *solid items are live-captured only — only humans
with cameras make things real.* For the Qwen hackathon I built the agent that
enforces that law end-to-end and then does everything else a seller hates
doing: **onlist-agent** — capture → prove-it's-real → price → list → handle
buyers.

## Verify 2.0: the interrogation

The capture pass gives us 2–4 frames shot seconds apart while the camera moves.
Qwen3.7-VL gets all frames at once plus the listing title, and answers as an
examiner:

- do ALL frames show the same single physical object (wear marks consistent,
  lighting shifts with viewpoint, background parallax)?
- is it a real scene — not a screen, not a print, not a catalog re-shot?
  (moire, glare rectangles, pixel grids, paper texture are giveaways)
- does the object match the claimed title? what's the visible condition?

```ts
const verdict = await verifyFrames("MacBook Pro 14\" M3, Space Black", frames);
// { samePhysicalObject: true, isRealScene: true, matchesTitle: true,
//   condition: "good", defects: ["light scratch on lid"], confidence: 0.87 }
```

Fail → the listing is **blocked**, not warned. In the production app this sits
on top of ARKit parallax evidence; the semantic half you see here is what Qwen
does, and it's the half that catches the screen-photo trick.

*(insert: two screenshots — real pass verdict vs screen-photo verdict)*

## What failed along the way

*(the honest section — judges and readers love this)*

- First prompts scored a photo-of-a-photo as real when the monitor filled the
  whole frame. Fix: ask about parallax and lighting ACROSS frames, not per-frame.
- …

## Pricing with `enable_search`

DashScope has a switch OpenAI doesn't: `enable_search: true` lets qwen3.7-max
search the live web before answering. The price agent uses it to pull comps and
returns a number WITH its receipts:

```json
{ "suggestedUSD": 1180, "floorUSD": 1050,
  "comps": [{"label": "eBay sold, same spec, good", "priceUSD": 1150}],
  "rationale": "..." }
```

## The buyer inbox is where selling dies

The triage stage ranks open claims 0–100 and flags the classics — overpayment
scams, "my shipping agent will collect", lowballs — then drafts a reply for
each. The human taps accept. In our seed data the "shipping_agent_pro" claim
scores single digits with a `scam-pattern` flag; Alex with cash and a pickup
time scores 90+.

## Cost ledger, because autopilot without a meter is a toy

Every call is metered: stage, model, tokens, dollars. A full autopilot pass
over one item costs **$0.0X** *(real number after calibration)* — verification
is the cheapest fraud filter this market has seen.

## Try it

MIT, self-contained, no infrastructure:

```bash
git clone https://github.com/<you>/onlist-agent && cd onlist-agent
bun install && cp .env.example .env   # add DASHSCOPE_API_KEY
bun run demo
```

The same agent runs unchanged against the live product over MCP — because
onlist was agent-native before it had users. That's the bet: the next
marketplace won't have an API bolted on; it will BE an API with a camera
attached to the only part that must stay human.
