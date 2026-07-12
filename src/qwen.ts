// Qwen via DashScope (OpenAI-compatible mode). No SDK — plain fetch, so the
// whole demo runs on stock Bun/Node with zero heavy deps.
//
// Every call is metered into the run ledger (tokens + $) — the same habit that
// keeps this agent production-honest: you can't autopilot a business on
// untracked spend.

import { ledger } from "./ledger.js";

const BASE = process.env.DASHSCOPE_BASE_URL
  ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export const MODELS = {
  text: process.env.QWEN_TEXT_MODEL ?? "qwen3.7-max",        // reserved for depth-critical stages
  balanced: process.env.QWEN_BALANCED_MODEL ?? "qwen3.7-plus", // 5x cheaper; default workhorse
  vision: process.env.QWEN_VISION_MODEL ?? "qwen3.7-plus",
  flash: process.env.QWEN_FLASH_MODEL ?? "qwen3.6-flash",
};

// USD per 1M tokens (input/output) — calibrate against the Model Studio
// console after the first runs; ballpark defaults keep the ledger honest-ish.
const PRICES: Record<string, { in: number; out: number }> = {
  [MODELS.text]: { in: 1.6, out: 6.4 },
  [MODELS.vision]: { in: 1.0, out: 4.0 },
  [MODELS.flash]: { in: 0.15, out: 0.6 },
};

export type ChatContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

export interface ChatOptions {
  model?: string;
  system?: string;
  /** DashScope extension: let the model search the web before answering. */
  enableSearch?: boolean;
  /** false → enable_thinking:false. Cuts vision verdicts from ~45s to ~7s;
      keep thinking ON where depth beats speed (pricing with web search). */
  thinking?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Ask DashScope for a guaranteed JSON object (response_format). Keep
      extractJSON as the belt to this suspender. */
  json?: boolean;
  /** Ledger label, e.g. "verify" | "price" | "triage". */
  stage: string;
}

export async function chat(user: ChatContent, opts: ChatOptions): Promise<string> {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error("DASHSCOPE_API_KEY is not set (see .env.example)");
  const model = opts.model ?? MODELS.text;

  const messages: unknown[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: user });

  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1200,
      // enable_search alone is only a permission the model rarely uses;
      // forced_search actually triggers the web call (verified July 5).
      ...(opts.enableSearch ? { enable_search: true, search_options: { forced_search: true } } : {}),
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      ...(opts.thinking === false ? { enable_thinking: false } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`qwen ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const price = PRICES[model] ?? { in: 0, out: 0 };
  ledger.record({
    stage: opts.stage,
    model,
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
    usd:
      ((data.usage?.prompt_tokens ?? 0) * price.in +
        (data.usage?.completion_tokens ?? 0) * price.out) / 1_000_000,
  });
  return data.choices?.[0]?.message?.content ?? "";
}

/** Tolerant JSON extraction — models love wrapping JSON in prose/fences. */
export function extractJSON<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/** Local image file → data URL for vision content parts. */
export async function imagePart(path: string): Promise<{ type: "image_url"; image_url: { url: string } }> {
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(path);
  const ext = path.toLowerCase().endsWith(".png") ? "png" : "jpeg";
  return { type: "image_url", image_url: { url: `data:image/${ext};base64,${bytes.toString("base64")}` } };
}
