# onlist-agent — demo video script (~2:30)

Goal: the judge sees an AUTOPILOT — one capture in, a live listing with
screened buyers out, hands-free — and then the twist that makes it
trustworthy: it refuses to fly fakes. Record the phone screen
(agent.onlist.ai) for the main flow + a short laptop cut for the receipts.

Setup before recording:
- Phone with https://agent.onlist.ai open (fresh session).
- A real object on the desk (e.g. headphones or a watch).
- A product photo opened FULL-SCREEN on your monitor (for the fool-me beat).
- Laptop tab with the GitHub README (benchmark table + architecture diagram).

---

### 0:00–0:15 — The premise
> "Everyone owns things they'd sell if it weren't such a hassle — the pricing
> research, the listing, the inbox full of scammers. This is onlist-agent:
> photograph a thing, and it's sold. Live on Alibaba Cloud."

- Phone: the landing with the camera prompt.

### 0:15–1:00 — THE AUTOPILOT (the money shot — one unbroken take)
> "Watch. Two photos — and hands off."

- Photograph the real object, two angles. Then DON'T touch the phone — let the
  timeline check itself off on camera:
  - ✓ Verified real — *name · condition*
  - ✓ Priced $XXX · floor $YYY *(live web comps)*
  - ✓ **Listed** — live on the board
  - ✓ 3 buyers screened
- Land on the listing screen.
> "The agent named it, priced it from live market comps, listed it, and
> screened the buyers — while I did nothing. Alex is real, with a reply
> already drafted. The 'certified check shipping agent' — flagged as a scam.
> Rita offered half — the agent countered at $575, never going below the
> floor it set. That bound lives in code, not in a prompt."

### 1:00–1:20 — The two human levers
- Tap **adjust price** → change the number → the listing updates.
- Tap **Accept Alex**.
> "I touch money twice: the price is mine to adjust, and no buyer gets a deal
> without my tap. Everything else — flown by the agent."

### 1:20–1:50 — Why you can trust an autopilot: the fake test
> "But an autopilot that lists things for you had better not list lies.
> Let's try to scam it."

- Point the phone at the **monitor** with the product photo. Shoot 2 angles.
- **Not real ✕ — Photo of a screen.** Open "Why?" and read one line.
> "Caught the moiré and the missing parallax. Refused to fly it. In the repo
> there's a benchmark — it also catches AI-generated listing photos, including
> fakes made with qwen-image, its own model family: six out of six."
- (2-second laptop cut: README benchmark table.)

### 1:50–2:10 — The agentic beat (if it triggers — never fake it)
- If during any capture the amber **"One more angle"** panel appears:
> "And when it's unsure, it doesn't guess — it tells me exactly which shot
> would settle it, and re-examines."
- (Provoke it deliberately if you want: two near-identical shots without
  moving the phone. If it doesn't trigger, cut this beat or show the amber
  panel screenshot from the README.)

### 2:10–2:30 — Receipts + close
- (Laptop cut: cost ledger output, architecture diagram.)
> "All of it runs on Alibaba Cloud — Qwen VL as the examiner, Function Compute
> hosting, every call metered: this whole session cost about five cents.
> Photograph a thing — and it's sold. onlist-agent. Try it:
> agent dot onlist dot ai."

---

## Shot checklist
- [ ] Landing with camera prompt
- [ ] The unbroken autopilot take: 2 photos → timeline checks off → listing
- [ ] Buyers screen: scam ✕ / Rita countered at $XXX / Alex reply draft
- [ ] adjust price tap → number changes
- [ ] Accept tap
- [ ] Monitor re-shot → Not real ✕ + reasoning
- [ ] README bench table close-up (6/6)
- [ ] (bonus) "One more angle" amber panel
- [ ] Cost ledger + architecture diagram

## Tips
- The unbroken autopilot take is the whole pitch — rehearse it once so the
  cascade lands in one clean shot (~30-40s wall-clock).
- Fool-me comes AFTER the autopilot: first the magic, then the trust.
- Native screen recording, voice-over later; captions help judges with sound off.
- Total under 3:00.
