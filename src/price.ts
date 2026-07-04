// Price agent — what a careful human seller does: search current comps,
// discount for condition, name a number AND the reasoning behind it.
// Uses DashScope's enable_search so Qwen pulls live market data itself.

import { MODELS, chat, extractJSON } from "./qwen.js";
import type { Verdict } from "./verify.js";

export interface PriceCall {
  suggestedUSD: number;
  floorUSD: number;          // "don't go below" for negotiations
  comps: Array<{ label: string; priceUSD: number }>;
  rationale: string;
}

const SYSTEM = `You are a pricing analyst for second-hand goods in the United States.
Given an item title and its verified condition report, search the current market and
propose a fair asking price. Be realistic: used items sell at a discount; condition
drives the number. Answer with ONLY a JSON object:
{"suggestedUSD":number,"floorUSD":number,
 "comps":[{"label":"...","priceUSD":number}],"rationale":"..."}`;

export async function priceItem(title: string, verdict: Verdict | null): Promise<PriceCall | null> {
  const condition = verdict
    ? `Verified condition: ${verdict.condition}. Visible defects: ${verdict.defects.join(", ") || "none"}.`
    : "Condition unverified.";
  const text = await chat(
    `Item: "${title}". ${condition} Find comparable current listings/sold prices and propose pricing.`,
    { model: MODELS.text, system: SYSTEM, enableSearch: true, stage: "price", maxTokens: 900 },
  );
  const call = extractJSON<PriceCall>(text);
  if (!call || !Number.isFinite(Number(call.suggestedUSD))) return null;
  return {
    suggestedUSD: Math.round(Number(call.suggestedUSD)),
    floorUSD: Math.round(Number(call.floorUSD) || Number(call.suggestedUSD) * 0.8),
    comps: Array.isArray(call.comps)
      ? call.comps.slice(0, 6).map((c) => ({ label: String(c.label), priceUSD: Number(c.priceUSD) || 0 }))
      : [],
    rationale: String(call.rationale ?? "").slice(0, 600),
  };
}
