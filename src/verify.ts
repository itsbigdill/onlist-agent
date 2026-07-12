// Verify 2.0 — the heart of the demo. The marketplace fraud wave of 2026 is
// AI-generated listings: photos of screens, photos of prints, stolen catalog
// shots. This stage takes 2–3 frames from a LIVE capture pass and asks
// Qwen-VL to act as a physical-authenticity examiner.
//
// In production (onlist) this runs on top of ARKit parallax evidence; the
// open demo ships the semantic half, which is the part Qwen powers.

import { MODELS, chat, extractJSON, imagePart } from "./qwen.js";

export interface Verdict {
  itemName: string;              // what the object is, e.g. "Bluey kids thermos" — feeds pricing
  samePhysicalObject: boolean;   // all frames show ONE object, not lookalikes
  isRealScene: boolean;          // not a photo of a screen / print / catalog
  matchesTitle: boolean;         // the object is what the listing claims
  condition: string;             // "like new" | "good" | "worn" | ...
  defects: string[];             // visible scratches, dents, missing parts
  confidence: number;            // 0..1
  reasoning: string;             // one short paragraph for the audit log
}

const SYSTEM = `You are a physical-authenticity examiner for a second-hand marketplace.
You receive several frames captured seconds apart while the seller moved their camera
around an object, plus the listing title. Judge strictly:
- samePhysicalObject: do ALL frames show the same single physical item (consistent
  wear marks, lighting changes with viewpoint, background parallax) — AND the same
  SCENE seconds apart? The viewpoint may change; the world may not: the same
  surrounding objects in the same places, the same surface, the same device state
  (a screen that turns on, clutter that appears or vanishes, a table that changes
  contents between frames means these are two separate generations or shoots, not
  two angles of one moment — set false).
- isRealScene: is this a real object in a real space captured by a real camera?
  FALSE for: a photo of a screen, a printed picture, or a catalog/press image
  re-shot (moire, glare rectangles, pixel grids, paper texture, missing
  parallax) — AND for AI-GENERATED images that never touched a camera. AI
  tells, check every frame pair hard: background objects that change identity,
  count, or geometry between "angles" (a mug that moves or morphs), text/logos
  that smear or misspell, impossibly clean surfaces and cables, shadows or
  reflections inconsistent with a single light source, bokeh that hugs the
  subject too perfectly. Two flawless "angles" with mutually inconsistent
  backgrounds are a fabrication, not parallax.
- matchesTitle: is the object plausibly what the title claims? (If the title is the
  generic word "item", set matchesTitle true and just identify the object yourself.)
- itemName: name the object as a seller would title a listing — brand + product when
  recognizable ("Bluey stainless steel kids thermos", "Herman Miller Aeron chair").
  Be careful and specific; do not guess a model you cannot see.
- condition: a SHORT grade, 1-3 words only ("Like new", "Good", "Used, light wear").
- defects: each a SHORT phrase, max 4 words ("scuffed lid", "rim staining"). Empty list if none.
Answer with ONLY a JSON object:
{"itemName":"...","samePhysicalObject":bool,"isRealScene":bool,"matchesTitle":bool,
 "condition":"...","defects":["..."],"confidence":0..1,"reasoning":"..."}`;

export async function verifyFrames(
  title: string,
  framePaths: string[],
  round = 1,
  prior?: Prior,
): Promise<AgenticVerdict | null> {
  if (framePaths.length === 0) return null;
  const images = await Promise.all(framePaths.map(imagePart));
  return verifyAgentic(title, images, round, prior);
}

/** Same check over prepared image parts (HTTP path sends data-URLs inline). */
export async function verifyParts(
  title: string,
  images: Array<{ type: "image_url"; image_url: { url: string } }>,
  note?: string,
): Promise<Verdict | null> {
  if (images.length === 0) return null;
  const text = await chat(
    [
      ...images,
      { type: "text", text: `Listing title: "${title}". ${images.length} frames from one live capture pass.${note ? " " + note : ""}` },
    ],
    { model: MODELS.vision, system: SYSTEM, stage: "verify", maxTokens: 800, thinking: false, json: true },
  );
  const verdict = extractJSON<Verdict>(text);
  if (!verdict) return null;
  return {
    itemName: String(verdict.itemName ?? "").slice(0, 120),
    samePhysicalObject: Boolean(verdict.samePhysicalObject),
    isRealScene: Boolean(verdict.isRealScene),
    matchesTitle: Boolean(verdict.matchesTitle),
    condition: String(verdict.condition ?? "unknown"),
    defects: Array.isArray(verdict.defects) ? verdict.defects.map(String).slice(0, 8) : [],
    confidence: Math.max(0, Math.min(1, Number(verdict.confidence) || 0)),
    reasoning: String(verdict.reasoning ?? "").slice(0, 600),
  };
}

export const verified = (v: Verdict | null): boolean =>
  v != null && v.samePhysicalObject && v.isRealScene && v.matchesTitle && v.confidence >= 0.6;

// ————— Agentic layer: the examiner acts on its own uncertainty —————
//
// A single-pass verifier is a pipeline; an agent notices it is unsure and does
// something about it. When the round-1 verdict lands in the gray zone, the
// agent formulates a SPECIFIC capture request ("tilt it and shoot the
// underside") derived from its own doubt, the seller answers with one more
// frame, and round 2 decides for good. Hard evidence of fakery (a screen
// re-shoot, two different objects) is refused outright — more angles of a
// monitor won't make it a chair.

export type Decision = "verified" | "refused" | "need_more";

export interface Prior {
  reasoning: string;
  request: string;
}

export interface AgenticVerdict extends Verdict {
  decision: Decision;
  request: string | null;   // what to capture next (need_more only)
  round: number;
}

const STRONG = 0.75;   // round-1 bar: below this, ask instead of deciding
const EVIDENCE = 0.7;  // confident positive fake-evidence → refuse, don't ask

/** Pure decision policy — unit-testable without an API call. */
export function decide(v: Verdict, round: number): Decision {
  const pass = v.samePhysicalObject && v.isRealScene && v.matchesTitle;
  if (pass && v.confidence >= (round > 1 ? 0.6 : STRONG)) return "verified";
  if (round > 1) return verified(v) ? "verified" : "refused";
  if ((!v.isRealScene || !v.samePhysicalObject) && v.confidence >= EVIDENCE) return "refused";
  return "need_more";
}

export async function verifyAgentic(
  title: string,
  images: Array<{ type: "image_url"; image_url: { url: string } }>,
  round = 1,
  prior?: Prior,
): Promise<AgenticVerdict | null> {
  const note = prior
    ? `This is round 2: on the first pass the examiner was unsure (${prior.reasoning}) and asked the seller: "${prior.request}". The final frame is the seller's answer to that request — weigh it accordingly.`
    : undefined;
  const v = await verifyParts(title, images, note);
  if (!v) return null;
  const decision = decide(v, round);
  const request = decision === "need_more" ? await angleRequest(v) : null;
  return { ...v, decision, request, round };
}

const ANGLE_SYSTEM = `A marketplace authenticity examiner is unsure about a seller's live capture.
Given the examiner's verdict JSON, write ONE short imperative instruction (max 14 words)
telling the seller exactly what single extra photo would resolve the doubt — a specific
angle, distance, detail, or action. Examples: "Tilt the item and photograph its underside."
"Step two feet left so the background visibly shifts behind it." Reply with the instruction only.`;

async function angleRequest(v: Verdict): Promise<string> {
  try {
    const text = await chat(
      JSON.stringify({
        samePhysicalObject: v.samePhysicalObject,
        isRealScene: v.isRealScene,
        matchesTitle: v.matchesTitle,
        confidence: v.confidence,
        reasoning: v.reasoning,
      }),
      { model: MODELS.flash, system: ANGLE_SYSTEM, stage: "verify_retry", maxTokens: 60, thinking: false },
    );
    const line = text.trim().split("\n")[0].replace(/^["']|["']$/g, "").slice(0, 140);
    if (line.length > 8) return line;
  } catch { /* fall through to the default ask */ }
  return "Take one more photo from a different angle, stepping sideways so the background shifts.";
}
