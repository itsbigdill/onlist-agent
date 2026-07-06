// Verify 2.0 benchmark — the receipts behind "it refuses fakes".
//
// Layout:  bench/cases/<id>/meta.json  +  frame files (*.jpg|*.png, sorted)
//   meta.json: { "title": "...", "expect": "verify" | "refuse",
//                "kind": "honest" | "screen" | "print" | "catalog" | "mismatch" }
//
// Run:     bun bench/run.ts        (needs DASHSCOPE_API_KEY)
// Output:  bench/RESULTS.md (table for the README) + bench/results.json

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ledger } from "../src/ledger.js";
import { verifyFrames, verified } from "../src/verify.js";

interface Meta { title: string; expect: "verify" | "refuse"; kind: string }
interface Row extends Meta { id: string; got: "verify" | "refuse"; ok: boolean; conf: number; ms: number; reasoning: string }

const CASES_DIR = join(import.meta.dir, "cases");
const ids = readdirSync(CASES_DIR).filter((d) => statSync(join(CASES_DIR, d)).isDirectory()).sort();
if (!ids.length) throw new Error(`no cases in ${CASES_DIR} — see header for the layout`);

const rows: Row[] = [];
for (const id of ids) {
  const dir = join(CASES_DIR, id);
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as Meta;
  const frames = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()
    .map((f) => join(dir, f));
  if (frames.length < 2) { console.warn(`skip ${id}: needs ≥2 frames`); continue; }

  const t0 = performance.now();
  const v = await verifyFrames(meta.title, frames);
  const ms = Math.round(performance.now() - t0);
  const got = verified(v) ? "verify" : "refuse";
  const ok = got === meta.expect;
  rows.push({ id, ...meta, got, ok, conf: v?.confidence ?? 0, ms, reasoning: v?.reasoning ?? "no verdict" });
  console.log(`${ok ? "✓" : "✗"} ${id} [${meta.kind}] expect=${meta.expect} got=${got} conf=${v?.confidence ?? "—"} ${ms}ms`);
}

// aggregate
const kinds = [...new Set(rows.map((r) => r.kind))];
const agg = kinds.map((k) => {
  const of = rows.filter((r) => r.kind === k);
  return { kind: k, total: of.length, correct: of.filter((r) => r.ok).length };
});
const honest = rows.filter((r) => r.kind === "honest");
const fakes = rows.filter((r) => r.kind !== "honest");
const falseBlocks = honest.filter((r) => !r.ok).length;
const caught = fakes.filter((r) => r.ok).length;
const medianMs = rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)] ?? 0;

const md = `## Verify 2.0 benchmark

| kind | cases | correct |
|---|---|---|
${agg.map((a) => `| ${a.kind} | ${a.total} | ${a.correct}/${a.total} |`).join("\n")}

**Fakes caught: ${caught}/${fakes.length} · False blocks on honest passes: ${falseBlocks}/${honest.length} · Median verdict: ${(medianMs / 1000).toFixed(1)}s · Cost: $${ledger.totalUSD.toFixed(3)} for ${rows.length} verdicts**

<details><summary>Per-case verdicts</summary>

| case | kind | expected | got | conf | ms |
|---|---|---|---|---|---|
${rows.map((r) => `| ${r.id} | ${r.kind} | ${r.expect} | ${r.got} ${r.ok ? "✓" : "✗"} | ${r.conf} | ${r.ms} |`).join("\n")}

</details>
`;
writeFileSync(join(import.meta.dir, "RESULTS.md"), md);
writeFileSync(join(import.meta.dir, "results.json"), JSON.stringify(rows, null, 2));
console.log(`\nfakes caught ${caught}/${fakes.length} · false blocks ${falseBlocks}/${honest.length} · median ${(medianMs / 1000).toFixed(1)}s`);
console.log("→ bench/RESULTS.md ready for the README");
ledger.print();
