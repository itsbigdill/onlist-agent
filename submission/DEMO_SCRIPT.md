# onlist-agent — demo video script (~2:30)

Goal: in under three minutes a judge sees the one thing nobody else has — an
agent that REFUSES to list what it can't prove is physical — plus the agentic
loop, the delegated negotiation, and the receipts. Record the phone screen
(agent.onlist.ai) for the main flow + a short laptop cut for the bench README.

Setup before recording:
- Phone with https://agent.onlist.ai open (fresh session).
- A real object on the desk (e.g. headphones or a watch).
- A product photo of some gadget opened FULL-SCREEN on your monitor.
- Laptop browser tab with the GitHub README benchmark section.

---

### 0:00–0:20 — The problem, then the hook
> "In 2026 marketplaces are drowning in fake listings — AI-generated photos of
> things that don't exist. Everyone treats it as a moderation problem. We built
> the opposite: a selling agent that refuses to create a listing unless it can
> prove there's a real object in your hands. This is onlist-agent, live on
> Alibaba Cloud."

- Show the phone: agent.onlist.ai landing with the camera prompt.

### 0:20–0:50 — The fool-me test FIRST (the wow)
> "Let's try to scam it."

- Point the phone at the **monitor** showing a product photo. Shoot 2 angles
  of the screen.
- The agent: **Not real ✕ — Photo of a screen**. Open "Why?" and read one line
  of the reasoning aloud.
> "It caught the moiré and the missing parallax. No listing. And in the repo
> there's a benchmark where it catches AI-generated listing photos too —
> including fakes made with qwen-image, its own model family."

- (2-second cut to the laptop: README benchmark table, "fakes caught 6/6".)

### 0:50–1:30 — The honest flow + the agentic ask
> "Now the real thing."

- Photograph the real object, 2 angles. Verified ✓: name, condition, defect
  chips.
- If the agent returns **"One more angle"** (amber panel) — PERFECT, show it:
> "When it's unsure it doesn't guess — it tells me exactly which shot would
> settle it, and re-examines."
  (You can provoke it deliberately: shoot 2 nearly identical angles without
  moving — the parallax doubt often triggers the ask.)
- Tap **Sell it for me** → price appears with comps.
> "It searched the live market, found comparables, proposed a price AND a
> floor for negotiations. I own the number — I can edit it — the agent never
> lists without me."

### 1:30–2:05 — Buyers: scam flagged, lowball countered
- Tap **List it** → the buyer screen.
> "Three buyers. The agent ranked them: Alex is real — drafted a warm reply.
> The 'shipping agent with a certified check' — flagged as a scam, score 5,
> no reply. And Rita offered half price — the agent countered at $575,
> because I delegated a floor of $520. That bound lives in code, not in a
> prompt: it can never go below the floor and never reveals it."

- Tap **Accept** on the top buyer.

### 2:05–2:30 — Receipts + close
- (Laptop cut: repo — cost ledger output, architecture diagram, one glance at
  `decide()` in verify.ts.)
> "Everything runs on Alibaba Cloud — Qwen VL is the examiner, Function
> Compute hosts it, every call is metered into a cost ledger: this whole
> session cost about five cents. An agent that does the legwork, acts on its
> own doubt, negotiates within bounds I set — and a human owns every dollar.
> onlist-agent. Try it: agent point onlist point ai."

---

## Shot checklist
- [ ] Landing on the phone (camera prompt)
- [ ] Screen re-shot → Not real ✕ + reasoning
- [ ] README bench table close-up (6/6)
- [ ] Real object → Verified ✓ (chips, condition)
- [ ] "One more angle" amber panel (provoke with two static shots if needed)
- [ ] Price + floor + comps; edit the number once to show ownership
- [ ] Buyer triage: scam ✕ / lowball countered at $XXX / top buyer reply
- [ ] Accept tap
- [ ] Cost ledger + architecture diagram + decide() glimpse

## Tips
- Do the fool-me FIRST — it's the memorable beat; don't bury it.
- Keep the phone screen recording native (iOS screen record), voice over later.
- If "One more angle" doesn't trigger naturally, don't fake it — cut the line
  and mention it over the amber-panel screenshot from the README instead.
- Total under 3:00; judges are not required to watch past that.
