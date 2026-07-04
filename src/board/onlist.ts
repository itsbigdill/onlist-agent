// Live adapter — the same Board interface, talking to onlist.ai, the first
// production consumer of this agent. onlist is agent-native: accounts pair
// with an AI ("Sign in with your AI"), every agent mutation is audit-logged,
// and the hard law is enforced server-side: NO tool can create solid items or
// touch images — only a human with a live camera makes things real.
//
// Protocol: onlist speaks MCP (streamable HTTP, JSON-RPC). This adapter calls
// tools/call directly: list_items, update_item, get_claims.
// Token: onlist app → Settings → Connect your AI → ONLIST_TOKEN.

import type { Claim } from "../triage.js";
import type { Board, BoardItem } from "./local.js";

const BASE = process.env.ONLIST_BASE_URL ?? "https://www.onlist.ai";

interface OnlistItemDTO {
  id: string;
  title: string;
  status: string;
  price: number | null;
  note: string | null;
  verified: boolean;
  claimCount: number;
}

async function mcpCall<T>(token: string, name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const data = await res.json() as {
    result?: { content?: Array<{ text?: string }>; isError?: boolean };
    error?: { message?: string };
  };
  if (data.error) throw new Error(`onlist ${name}: ${data.error.message}`);
  const text = data.result?.content?.[0]?.text ?? "{}";
  const parsed = JSON.parse(text) as T & { error?: string };
  if (data.result?.isError) throw new Error(`onlist ${name}: ${text.slice(0, 200)}`);
  return parsed;
}

export function onlistBoard(username: string, token: string): Board {
  const toItem = (i: OnlistItemDTO, claims: Claim[]): BoardItem => ({
    id: i.id,
    title: i.title,
    status: (["have", "selling", "sold"].includes(i.status) ? i.status : "have") as BoardItem["status"],
    priceUSD: i.price,
    condition: null,
    verifiedAt: i.verified ? "verified" : null,
    note: i.note,
    claims,
  });

  return {
    label: `onlist.ai/${username} (live, via MCP)`,
    async list(): Promise<BoardItem[]> {
      const [items, claims] = await Promise.all([
        mcpCall<{ items: OnlistItemDTO[] }>(token, "list_items", {}),
        mcpCall<{ claims: Array<{ id: string; itemId: string; name: string; message: string | null; state: string; createdAt: number }> }>(
          token, "get_claims", {}),
      ]);
      return items.items
        .filter((i) => i.status !== "want")
        .map((i) => toItem(i, claims.claims
          .filter((c) => c.itemId === i.id && c.state === "open")
          .map((c) => ({
            id: c.id,
            name: c.name,
            message: c.message,
            createdAt: new Date(c.createdAt * 1000).toISOString(),
          }))));
    },
    async get(id) {
      return (await this.list()).find((i) => i.id === id) ?? null;
    },
    async update(id, patch) {
      await mcpCall(token, "update_item", {
        id,
        ...(patch.status != null ? { status: patch.status } : {}),
        ...(patch.priceUSD != null ? { price: patch.priceUSD } : {}),
        ...(patch.note != null ? { note: patch.note } : {}),
      });
    },
  };
}
