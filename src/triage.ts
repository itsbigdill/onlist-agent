// Buyer triage — the inbox is where selling actually dies: ghosting, lowballs,
// scams. The agent ranks open claims and drafts replies; the HUMAN taps
// accept/decline. Money decisions never leave the loop.

import { MODELS, chat, extractJSON } from "./qwen.js";

export interface Claim {
  id: string;
  name: string;
  message: string | null;
  createdAt: string;
}

export interface TriageResult {
  ranked: Array<{
    id: string;
    score: number;          // 0..100, likelihood of a clean, fast sale
    flags: string[];        // "lowball" | "scam-pattern" | "no-show risk" | ...
    draftReply: string;     // ready to send after human review
    counterUSD: number | null; // lowball → agent's counter-offer, NEVER below the floor
  }>;
  summary: string;
}

const SYSTEM = `You triage buyer claims for a second-hand listing. Score each claim
0-100 for likelihood of a clean local sale (specific message, realistic intent,
no scam patterns like overpayment/shipping-agent/gift-card talk). Draft a short,
warm, non-committal reply for each (the seller reviews before sending; never
promise to hold an item or accept a price).

Negotiation authority: you may counter a low offer, but only within the seller's
delegated bounds. If a buyer offers below asking and is NOT a scam, set counterUSD
to a fair middle number (never below the private floor, never above asking) and
write the counter into that buyer's draftReply. NEVER state, hint at, or imply the
floor itself in any reply. Scams get no counter (counterUSD null). Buyers at or
above asking need no counter (null). Answer with ONLY JSON:
{"ranked":[{"id":"...","score":0,"flags":["..."],"draftReply":"...","counterUSD":number|null}],"summary":"..."}`;

export async function triageClaims(
  itemTitle: string,
  priceUSD: number,
  claims: Claim[],
  floorUSD?: number | null,
): Promise<TriageResult | null> {
  if (!claims.length) return { ranked: [], summary: "No open claims." };
  const floorLine = floorUSD != null && Number.isFinite(floorUSD)
    ? ` The seller's PRIVATE floor is $${Math.round(floorUSD)} — counters must respect it, replies must never reveal it.`
    : " No floor was delegated — do not make counter-offers (counterUSD null everywhere).";
  const text = await chat(
    `Listing: "${itemTitle}" at $${priceUSD}.${floorLine} Open claims:\n` +
      claims.map((c) => `- id=${c.id} from "${c.name}" at ${c.createdAt}: ${c.message ?? "(no message)"}`).join("\n"),
    { model: MODELS.balanced, system: SYSTEM, stage: "triage", maxTokens: 900, thinking: false, json: true },
  );
  const result = extractJSON<TriageResult>(text);
  if (!result || !Array.isArray(result.ranked)) return null;
  return {
    ranked: result.ranked
      .map((r) => {
        // Delegated authority is enforced in CODE, not trusted to the prompt:
        // counters exist ONLY for claims the agent itself flagged as lowballs,
        // never for scam patterns; below-floor is raised to the floor; at-or-
        // above asking is dropped as pointless.
        const flags = Array.isArray(r.flags) ? r.flags.map(String) : [];
        const isLowball = flags.some((f) => /low.?ball|low.?offer/i.test(f));
        const isScammy = flags.some((f) => /scam|fraud|overpay|shipping|check|gift.?card/i.test(f));
        let counter: number | null = Number.isFinite(Number(r.counterUSD)) ? Math.round(Number(r.counterUSD)) : null;
        if (!isLowball || isScammy) counter = null;
        if (counter != null) {
          if (floorUSD != null && Number.isFinite(floorUSD)) counter = Math.max(counter, Math.round(floorUSD));
          else counter = null;                       // no floor → no authority to counter
          if (counter != null && counter >= Math.round(priceUSD)) counter = null;  // pointless counter
        }
        return {
          id: String(r.id),
          score: Math.max(0, Math.min(100, Number(r.score) || 0)),
          flags: flags.slice(0, 4),
          draftReply: String(r.draftReply ?? "").slice(0, 400),
          counterUSD: counter,
        };
      })
      .sort((a, b) => b.score - a.score),
    summary: String(result.summary ?? "").slice(0, 300),
  };
}

// ————— The closing conversation: a live-generated negotiation thread for the
// winning buyer. The agent's lines are model-drafted under the same bounded
// authority; the buyer's lines are simulated (demo). Ends in a SHIPPED deal —
// never pickup (a prepaid label is the product's promise).
export interface DealThread { thread: Array<{ from: "buyer" | "agent"; text: string }>; closedUSD: number }

const CHAT_SYSTEM = `You simulate the FINAL negotiation between a marketplace buyer
and the seller's AI agent for a demo. Write a realistic, terse chat of 4-6 short
messages, alternating, starting from the buyer's opening message (given). The agent
is warm, professional, never desperate. Never invent facts about the item — do not
claim it is new, boxed, or under warranty; if condition comes up, use the given
condition word only. Money rules: the agent never goes below the
private floor and never reveals it; the deal closes at the asking price or between
floor and asking. The deal MUST close with payment through the marketplace checkout
and TRACKED SHIPPING (never local pickup, never cash). Last message is the buyer
confirming payment. Answer ONLY JSON:
{"thread":[{"from":"buyer","text":"..."},{"from":"agent","text":"..."}],"closedUSD":number}`;

export async function dealThread(
  itemTitle: string,
  priceUSD: number,
  floorUSD: number,
  buyerName: string,
  buyerMessage: string,
  condition?: string,
): Promise<DealThread | null> {
  const text = await chat(
    `Listing: "${itemTitle}" (condition: ${condition || "used"}) at $${priceUSD}, private floor $${floorUSD}. ` +
    `Buyer "${buyerName}" opened with: "${buyerMessage}"`,
    { model: MODELS.flash, system: CHAT_SYSTEM, stage: "deal-chat", maxTokens: 500, thinking: false, json: true },
  );
  const result = extractJSON<DealThread>(text);
  if (!result || !Array.isArray(result.thread) || !result.thread.length) return null;
  const closed = Number(result.closedUSD);
  return {
    thread: result.thread.slice(0, 6).map((m) => ({
      from: m.from === "agent" ? "agent" : "buyer",
      text: String(m.text).slice(0, 200),
    })),
    // bounds enforced in code, as always
    closedUSD: Number.isFinite(closed) ? Math.min(priceUSD, Math.max(floorUSD, Math.round(closed))) : priceUSD,
  };
}
