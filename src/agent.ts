// The autopilot: capture → prove-it's-real → price → list → handle buyers.
// A human sits at every money decision; the agent does the legwork.

import { priceItem, type PriceCall } from "./price.js";
import { triageClaims } from "./triage.js";
import { verifyFrames, verified, type Verdict } from "./verify.js";
import type { Board, BoardItem } from "./board/local.js";

export interface AutopilotReport {
  item: BoardItem;
  verdict: Verdict | null;
  verified: boolean;
  price: Awaited<ReturnType<typeof priceItem>>;
  listedAtUSD: number | null;
  triage: Awaited<ReturnType<typeof triageClaims>>;
  actions: string[];        // audit trail of what the agent did / proposes
}

export interface AutopilotOptions {
  /** Human checkpoint: receives the proposed price, returns the confirmed
      number (possibly edited) or null to keep the item unlisted. Absent =
      auto-accept (HTTP service, --yes runs). */
  confirmPrice?: (price: PriceCall) => Promise<number | null>;
}

/** One full pass over a single item. Frames are optional (no camera in CI). */
export async function autopilot(
  board: Board,
  itemId: string,
  framePaths: string[],
  opts: AutopilotOptions = {},
): Promise<AutopilotReport> {
  const item = await board.get(itemId);
  if (!item) throw new Error(`no item ${itemId} on ${board.label}`);
  const actions: string[] = [];

  // 1. Prove it's real (Verify 2.0) — the anti-fake gate.
  let verdict: Verdict | null = null;
  if (framePaths.length) {
    verdict = await verifyFrames(item.title, framePaths);
    if (verified(verdict)) {
      await board.update(item.id, {
        verifiedAt: new Date().toISOString(),
        condition: verdict!.condition,
      });
      actions.push(`verified live: ${verdict!.condition} (confidence ${verdict!.confidence})`);
    } else {
      actions.push(`VERIFICATION FAILED: ${verdict?.reasoning ?? "no verdict"} — listing blocked`);
      return { item, verdict, verified: false, price: null, listedAtUSD: null, triage: null, actions };
    }
  } else {
    actions.push("no frames supplied — skipping verification (demo mode)");
  }

  // 2. Price with live market comps.
  const price = await priceItem(item.title, verdict);
  if (price) {
    actions.push(`price proposed: $${price.suggestedUSD} (floor $${price.floorUSD}) — awaiting human confirm`);
  }

  // 3. List — the human owns the number. The agent proposes; confirmPrice
  //    (the CLI prompt) confirms, edits, or declines it.
  let listedAtUSD: number | null = null;
  if (price) {
    listedAtUSD = opts.confirmPrice ? await opts.confirmPrice(price) : price.suggestedUSD;
    if (listedAtUSD == null) {
      actions.push(`price $${price.suggestedUSD} declined by human — item stays unlisted`);
    } else {
      await board.update(item.id, { status: "selling", priceUSD: listedAtUSD });
      actions.push(listedAtUSD === price.suggestedUSD
        ? `listed at $${listedAtUSD} (human confirmed)`
        : `listed at $${listedAtUSD} (human adjusted from $${price.suggestedUSD})`);
    }
  }

  // 4. Handle buyers: rank claims, draft replies. Accept/decline stays human.
  const triage = await triageClaims(
    item.title, listedAtUSD ?? price?.suggestedUSD ?? item.priceUSD ?? 0, item.claims);
  if (triage && triage.ranked.length) {
    actions.push(`${triage.ranked.length} claims triaged; top: ${triage.ranked[0].id} (${triage.ranked[0].score})`);
  }

  return { item, verdict, verified: verified(verdict), price, listedAtUSD, triage, actions };
}
