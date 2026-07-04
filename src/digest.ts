// The housekeeper digest — the agent that works while you don't. Scans the
// board for stale situations and writes one short, actionable push per week:
// unverified listings (trust decays), items sitting unsold too long (price
// cut?), unanswered claims (buyers walk). In onlist production this rides the
// existing APNs pipeline; the demo prints the push.

import { MODELS, chat, extractJSON } from "./qwen.js";
import type { Board } from "./board/local.js";

export interface Digest {
  pushTitle: string;         // ≤40 chars — an APNs headline
  pushBody: string;          // ≤120 chars
  recommendations: Array<{ itemId: string; action: string; why: string }>;
}

const SYSTEM = `You are a weekly housekeeping agent for a person's selling board.
Given the board state, produce ONE short push notification and per-item
recommendations. Be concrete: name prices and actions ("cut to $X", "re-verify",
"reply to Alex"), never vague advice. Answer with ONLY JSON:
{"pushTitle":"...","pushBody":"...",
 "recommendations":[{"itemId":"...","action":"...","why":"..."}]}`;

export async function weeklyDigest(board: Board): Promise<Digest | null> {
  const items = await board.list();
  const lines = items.map((i) => {
    const claims = i.claims.length ? ` openClaims=${i.claims.length}` : "";
    return `- ${i.id}: "${i.title}" status=${i.status} price=${i.priceUSD ?? "—"} verified=${i.verifiedAt ? "yes" : "NO"}${claims}`;
  });
  const text = await chat(
    `Board today:\n${lines.join("\n")}\n\nWrite this week's digest.`,
    { model: MODELS.text, system: SYSTEM, stage: "digest", maxTokens: 700 },
  );
  const digest = extractJSON<Digest>(text);
  if (!digest) return null;
  return {
    pushTitle: String(digest.pushTitle ?? "").slice(0, 60),
    pushBody: String(digest.pushBody ?? "").slice(0, 160),
    recommendations: Array.isArray(digest.recommendations)
      ? digest.recommendations.slice(0, 10).map((r) => ({
          itemId: String(r.itemId),
          action: String(r.action).slice(0, 120),
          why: String(r.why).slice(0, 160),
        }))
      : [],
  };
}
