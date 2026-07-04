// CLI entry — three verbs:
//   bun run smoke                 → key + models sanity check (one cheap call)
//   bun run digest                → weekly housekeeper pass over the board
//   bun run demo [itemId] [frames…] → full autopilot pass on the demo board
//   TARGET=onlist ONLIST_USER=you ONLIST_TOKEN=… bun run demo <itemId>
//                                 → same agent against the live product

import { autopilot } from "./agent.js";
import { localBoard } from "./board/local.js";
import { onlistBoard } from "./board/onlist.js";
import { weeklyDigest } from "./digest.js";
import { ledger } from "./ledger.js";
import { MODELS, chat } from "./qwen.js";

const cmd = process.argv[2] ?? "demo";

function pickBoard() {
  if (process.env.TARGET === "onlist") {
    const user = process.env.ONLIST_USER;
    const token = process.env.ONLIST_TOKEN;
    if (!user || !token) throw new Error("TARGET=onlist needs ONLIST_USER and ONLIST_TOKEN");
    return onlistBoard(user, token);
  }
  return localBoard();
}

async function main() {
  if (cmd === "smoke") {
    const reply = await chat("Reply with exactly: onlist-agent ready", {
      model: MODELS.flash,
      stage: "smoke",
      maxTokens: 24,
    });
    console.log("qwen says:", reply.trim());
    ledger.print();
    return;
  }

  if (cmd === "demo") {
    const board = pickBoard();
    const items = await board.list();
    console.log(`board: ${board.label} — ${items.length} items`);
    const itemId = process.argv[3] ?? items.find((i) => i.status === "have")?.id ?? items[0]?.id;
    if (!itemId) throw new Error("board is empty");
    const frames = process.argv.slice(4);

    console.log(`\nautopilot → item ${itemId}${frames.length ? ` with ${frames.length} frames` : " (no frames)"}\n`);
    const report = await autopilot(board, itemId, frames);

    console.log(`item: ${report.item.title}`);
    if (report.verdict) {
      console.log(`verify: same-object=${report.verdict.samePhysicalObject} real-scene=${report.verdict.isRealScene}` +
        ` matches-title=${report.verdict.matchesTitle} confidence=${report.verdict.confidence}`);
      console.log(`        ${report.verdict.reasoning}`);
    }
    if (report.price) {
      console.log(`price:  $${report.price.suggestedUSD} (floor $${report.price.floorUSD})`);
      for (const c of report.price.comps) console.log(`        comp: ${c.label} — $${c.priceUSD}`);
      console.log(`        ${report.price.rationale}`);
    }
    if (report.triage?.ranked.length) {
      console.log("claims:");
      for (const r of report.triage.ranked) {
        console.log(`  [${String(r.score).padStart(3)}] ${r.id} ${r.flags.length ? `(${r.flags.join(", ")})` : ""}`);
        console.log(`        draft: ${r.draftReply}`);
      }
    }
    console.log("\nactions:");
    for (const a of report.actions) console.log("  •", a);
    ledger.print();
    ledger.save();
    return;
  }

  if (cmd === "digest") {
    const board = pickBoard();
    const digest = await weeklyDigest(board);
    if (!digest) throw new Error("no digest produced");
    console.log(`push: ${digest.pushTitle}`);
    console.log(`      ${digest.pushBody}\n`);
    for (const r of digest.recommendations) {
      console.log(`  • ${r.itemId}: ${r.action}`);
      console.log(`    ${r.why}`);
    }
    ledger.print();
    ledger.save();
    return;
  }

  throw new Error(`unknown command "${cmd}" — use smoke | demo | digest`);
}

main().catch((e) => {
  console.error("error:", e.message ?? e);
  process.exit(1);
});
