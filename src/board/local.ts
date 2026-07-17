// Self-contained demo board — a tiny JSON-file marketplace so judges can run
// the WHOLE autopilot with zero infrastructure. The exact same Board interface
// is implemented by board/onlist.ts against the live product.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Claim } from "../triage.js";

export interface BoardItem {
  id: string;
  title: string;
  status: "have" | "selling" | "sold";
  priceUSD: number | null;
  condition: string | null;
  verifiedAt: string | null;
  note: string | null;
  claims: Claim[];
}

export interface Board {
  list(): Promise<BoardItem[]>;
  get(id: string): Promise<BoardItem | null>;
  update(id: string, patch: Partial<BoardItem>): Promise<void>;
  /** Demo board only: a live capture just proved the object — the human with
      the camera creates it. The onlist adapter deliberately has no add(). */
  add?(item: Omit<BoardItem, "id">): Promise<BoardItem>;
  label: string;
}

// Where the mutable board lives. On Function Compute the code dir is
// read-only (FC_FUNC_CODE_PATH is set there) — write to /tmp instead.
const RUNS = process.env.RUNS_DIR ?? (process.env.FC_FUNC_CODE_PATH ? "/tmp/runs" : "runs");
const STORE = `${RUNS}/board.json`;
// The seed ships with the package — resolve it from the package root, not the
// cwd, so the server finds it no matter where it was launched from.
const SEED = fileURLToPath(new URL("../../seed/items.json", import.meta.url));

export function localBoard(): Board {
  const load = (): BoardItem[] => {
    if (!existsSync(STORE)) {
      const seed = existsSync(SEED)
        ? (JSON.parse(readFileSync(SEED, "utf8")) as BoardItem[])
        : [];                                  // no seed → start empty, don't crash
      mkdirSync(RUNS, { recursive: true });
      writeFileSync(STORE, JSON.stringify(seed, null, 2));
    }
    return JSON.parse(readFileSync(STORE, "utf8")) as BoardItem[];
  };
  const save = (items: BoardItem[]) => writeFileSync(STORE, JSON.stringify(items, null, 2));

  return {
    label: `local demo board (${STORE})`,
    async list() {
      return load();
    },
    async get(id) {
      return load().find((i) => i.id === id) ?? null;
    },
    async update(id, patch) {
      const items = load();
      const item = items.find((i) => i.id === id);
      if (!item) throw new Error(`no item ${id}`);
      Object.assign(item, patch);
      save(items);
    },
    async add(item) {
      const items = load();
      const created = { ...item, id: `cap-${Date.now().toString(36)}` } as BoardItem;
      items.unshift(created);
      save(items);
      return created;
    },
  };
}
