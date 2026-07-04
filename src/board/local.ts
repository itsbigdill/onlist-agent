// Self-contained demo board — a tiny JSON-file marketplace so judges can run
// the WHOLE autopilot with zero infrastructure. The exact same Board interface
// is implemented by board/onlist.ts against the live product.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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
  label: string;
}

const STORE = "runs/board.json";

export function localBoard(): Board {
  const load = (): BoardItem[] => {
    if (!existsSync(STORE)) {
      const seed = JSON.parse(readFileSync("seed/items.json", "utf8")) as BoardItem[];
      mkdirSync("runs", { recursive: true });
      writeFileSync(STORE, JSON.stringify(seed, null, 2));
    }
    return JSON.parse(readFileSync(STORE, "utf8")) as BoardItem[];
  };
  const save = (items: BoardItem[]) => writeFileSync(STORE, JSON.stringify(items, null, 2));

  return {
    label: "local demo board (runs/board.json)",
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
  };
}
