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
  }>;
  summary: string;
}

const SYSTEM = `You triage buyer claims for a second-hand listing. Score each claim
0-100 for likelihood of a clean local sale (specific message, realistic intent,
no scam patterns like overpayment/shipping-agent/gift-card talk). Draft a short,
warm, non-committal reply for each (the seller reviews before sending; never
promise to hold an item or accept a price). Answer with ONLY JSON:
{"ranked":[{"id":"...","score":0,"flags":["..."],"draftReply":"..."}],"summary":"..."}`;

export async function triageClaims(
  itemTitle: string,
  priceUSD: number,
  claims: Claim[],
): Promise<TriageResult | null> {
  if (!claims.length) return { ranked: [], summary: "No open claims." };
  const text = await chat(
    `Listing: "${itemTitle}" at $${priceUSD}. Open claims:\n` +
      claims.map((c) => `- id=${c.id} from "${c.name}" at ${c.createdAt}: ${c.message ?? "(no message)"}`).join("\n"),
    { model: MODELS.text, system: SYSTEM, stage: "triage", maxTokens: 900 },
  );
  const result = extractJSON<TriageResult>(text);
  if (!result || !Array.isArray(result.ranked)) return null;
  return {
    ranked: result.ranked
      .map((r) => ({
        id: String(r.id),
        score: Math.max(0, Math.min(100, Number(r.score) || 0)),
        flags: Array.isArray(r.flags) ? r.flags.map(String).slice(0, 4) : [],
        draftReply: String(r.draftReply ?? "").slice(0, 400),
      }))
      .sort((a, b) => b.score - a.score),
    summary: String(result.summary ?? "").slice(0, 300),
  };
}
