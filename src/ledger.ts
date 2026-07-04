// Cost ledger — every model call lands here. Printed at the end of each run
// and persisted to runs/ledger.json. Judges see numbers, not adjectives.

import { mkdirSync, writeFileSync } from "node:fs";

export interface LedgerRow {
  stage: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  usd: number;
}

class Ledger {
  rows: LedgerRow[] = [];

  record(row: LedgerRow) {
    this.rows.push(row);
  }

  get totalUSD(): number {
    return this.rows.reduce((s, r) => s + r.usd, 0);
  }

  print() {
    if (!this.rows.length) return;
    console.log("\n── cost ledger ──────────────────────────────");
    for (const r of this.rows) {
      console.log(
        `  ${r.stage.padEnd(10)} ${r.model.padEnd(16)} in:${String(r.tokensIn).padStart(6)}  out:${String(r.tokensOut).padStart(5)}  $${r.usd.toFixed(4)}`,
      );
    }
    console.log(`  total ${" ".repeat(37)}$${this.totalUSD.toFixed(4)}`);
  }

  save(dir = "runs") {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/ledger.json`, JSON.stringify({ rows: this.rows, totalUSD: this.totalUSD }, null, 2));
  }
}

export const ledger = new Ledger();
