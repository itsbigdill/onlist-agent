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
  wear marks, lighting changes with viewpoint, background parallax)?
- isRealScene: is this a real object in a real space — NOT a photo of a screen,
  a printed picture, or a catalog/press image re-shot? Moire, glare rectangles,
  pixel grids, paper texture, missing parallax are giveaways.
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

export async function verifyFrames(title: string, framePaths: string[]): Promise<Verdict | null> {
  if (framePaths.length === 0) return null;
  const images = await Promise.all(framePaths.map(imagePart));
  return verifyParts(title, images);
}

/** Same check over prepared image parts (HTTP path sends data-URLs inline). */
export async function verifyParts(
  title: string,
  images: Array<{ type: "image_url"; image_url: { url: string } }>,
): Promise<Verdict | null> {
  if (images.length === 0) return null;
  const text = await chat(
    [
      ...images,
      { type: "text", text: `Listing title: "${title}". ${images.length} frames from one live capture pass.` },
    ],
    { model: MODELS.vision, system: SYSTEM, stage: "verify", maxTokens: 800, thinking: false },
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
