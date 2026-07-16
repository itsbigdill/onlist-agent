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

### 0:15–1:10 — THE AUTOPILOT (the money shot — one unbroken take)
> "Watch. Two photos."

- Photograph the real object, two angles. The agent examines it and comes back
  with the OFFER screen:
> "It verified the thing is real, sized the live market, and made me an offer:
> this sells for $520 to $650. That range is the whole contract — my one
> decision."
- Tap **Sell it for me →** and DON'T touch the phone. The timeline checks
  itself off on camera:
  - ✓ Listed — live at $650
  - ✓ 3 buyers handled · 1 countered in-range
  - ✓ **SOLD to Alex for $650**
- The sold screen appears with the shipping label.
> "While I did nothing: it listed, declined the 'certified check' scammer FOR
> me, countered the lowballer at $575 — never below my range, which is
> enforced in code, not in a prompt — and closed with the real buyer. And the
> prepaid shipping label? Already in my email. My next touch is a box."

### 1:10–1:20 — Underline the delegation
- Point at the label on screen.
> "One decision — the range. Everything after that tap was the agent's job,
> inside bounds that are written down."

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
- [ ] The unbroken take: 2 photos → OFFER ($X–Y) → tap → timeline → SOLD
- [ ] The shipping-label card + "emailed to you" note
- [ ] Buyers recap: scam declined / Rita countered at $XXX / deal closed
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
