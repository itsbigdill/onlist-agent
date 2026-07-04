// Live adapter — the same Board interface, but talking to onlist.ai, the
// first production consumer of this agent. onlist is agent-native: accounts
// pair with an AI via "Sign in with your AI", every agent mutation is
// audit-logged, and item writes go through the public agent API.
//
// The commercial product stays closed-source; this adapter uses only its
// public, documented surface. Get a token: install onlist (TestFlight),
// Settings → Connect your AI, paste the token into ONLIST_TOKEN.

import type { Board, BoardItem } from "./local.js";

const BASE = process.env.ONLIST_BASE_URL ?? "https://www.onlist.ai";

export function onlistBoard(username: string, token: string): Board {
  const authed = (path: string, init: RequestInit = {}) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

  return {
    label: `onlist.ai/${username} (live)`,
    async list(): Promise<BoardItem[]> {
      const res = await fetch(`${BASE}/api/board/${username}`);
      if (!res.ok) throw new Error(`onlist board fetch ${res.status}`);
      const data = await res.json() as { items: Array<Record<string, unknown>> };
      return data.items
        .filter((i) => i["status"] !== "want")
        .map((i) => ({
          id: String(i["id"]),
          title: String(i["title"] ?? ""),
          status: (i["status"] as BoardItem["status"]) ?? "have",
          priceUSD: i["price"] != null ? Number(i["price"]) : null,
          condition: null,
          verifiedAt: i["verifiedAt"] != null ? String(i["verifiedAt"]) : null,
          note: i["note"] != null ? String(i["note"]) : null,
          claims: [],
        }));
    },
    async get(id) {
      return (await this.list()).find((i) => i.id === id) ?? null;
    },
    async update(id, patch) {
      // Public agent surface: status/price/note updates are allowed; solid
      // items can never be CREATED by an agent — only a human with a camera
      // makes things real. That rule is enforced server-side.
      const res = await authed(`/agent/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: patch.status,
          price: patch.priceUSD,
          note: patch.note,
        }),
      });
      if (!res.ok) throw new Error(`onlist update ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  };
}
