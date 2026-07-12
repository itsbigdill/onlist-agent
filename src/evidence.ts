// Evidence locker — every verification writes an immutable audit record to
// Alibaba OSS: the exact frames the seller submitted plus the full verdict.
// For an anti-fraud product this is the part disputes are settled with:
// "here is what the camera saw and what the examiner said, timestamped".
//
// Zero-dep OSS client: PutObject with header signing (HMAC-SHA1, node:crypto).
// Disabled gracefully when the env isn't set — the demo runs fine without it.
//
// Env: OSS_BUCKET, OSS_ENDPOINT (default Singapore), ALIBABA_ACCESS_KEY_ID,
//      ALIBABA_ACCESS_KEY_SECRET

import { createHmac } from "node:crypto";

const ENDPOINT = process.env.OSS_ENDPOINT ?? "oss-ap-southeast-1.aliyuncs.com";

export const evidenceEnabled = (): boolean =>
  Boolean(process.env.OSS_BUCKET && process.env.ALIBABA_ACCESS_KEY_ID && process.env.ALIBABA_ACCESS_KEY_SECRET);

async function putObject(key: string, body: Uint8Array | string, contentType: string): Promise<void> {
  const bucket = process.env.OSS_BUCKET!;
  const akId = process.env.ALIBABA_ACCESS_KEY_ID!;
  const akSecret = process.env.ALIBABA_ACCESS_KEY_SECRET!;
  const date = new Date().toUTCString();
  const resource = `/${bucket}/${key}`;
  const stringToSign = `PUT\n\n${contentType}\n${date}\n${resource}`;
  const signature = createHmac("sha1", akSecret).update(stringToSign).digest("base64");
  const res = await fetch(`https://${bucket}.${ENDPOINT}/${key}`, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      Date: date,
      Authorization: `OSS ${akId}:${signature}`,
    },
    body: body as BodyInit,
  });
  if (!res.ok) throw new Error(`OSS PUT ${key} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Persist one verification: verdict JSON + the exact frames (data URLs). */
export async function recordEvidence(
  verdict: Record<string, unknown>,
  frameDataURLs: string[],
): Promise<string | null> {
  if (!evidenceEnabled()) return null;
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  const prefix = `evidence/${id}`;
  await putObject(`${prefix}/verdict.json`,
    JSON.stringify({ ...verdict, recordedAt: new Date().toISOString() }, null, 2),
    "application/json");
  for (let i = 0; i < Math.min(frameDataURLs.length, 4); i++) {
    const m = frameDataURLs[i].match(/^data:image\/(\w+);base64,(.+)$/);
    if (!m) continue;
    await putObject(`${prefix}/frame-${i + 1}.${m[1] === "png" ? "png" : "jpg"}`,
      new Uint8Array(Buffer.from(m[2], "base64")), `image/${m[1]}`);
  }
  return prefix;
}
