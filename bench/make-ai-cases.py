#!/usr/bin/env python3
"""Generate the 'ai' bench class: fully AI-generated listing photos.

The 2026 marketplace fraud wave isn't just re-shot screens — it's listings whose
photos never touched a camera. This script uses qwen-image-2.0-pro to create
deliberately convincing "seller photos" (casual framing, home lighting, two
angles of the same imaginary item) and files them as bench cases the verifier
is expected to REFUSE. Yes: we test whether the examiner catches fakes made by
its own model family.

Usage:  python3 bench/make-ai-cases.py     (reads DASHSCOPE_API_KEY from .env)
Cost:   ~$0.04/image → ~$0.32 for the default 4 cases × 2 frames.
"""

import base64
import json
import os
import pathlib
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
for line in (ROOT / ".env").read_text().splitlines():
    if line.startswith("DASHSCOPE_API_KEY="):
        os.environ.setdefault("DASHSCOPE_API_KEY", line.split("=", 1)[1].strip())

URL = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
MODEL = "qwen-image-2.0-pro"
GAP = 12  # seconds between calls — qwen-image QPM quota is tight

CASES = [
    ("ai-macbook",  "MacBook Pro 14",
     "casual smartphone photo of a MacBook Pro 14 inch laptop sitting on a wooden kitchen table at home, natural window light, slightly messy background"),
    ("ai-sneakers", "Nike Air Jordan 1",
     "casual smartphone photo of a pair of Nike Air Jordan 1 sneakers on an apartment floor, natural light, everyday clutter in the background"),
    ("ai-watch",    "Seiko dive watch",
     "casual smartphone photo of a Seiko dive watch lying on a bedside table, warm lamp light, home setting"),
    ("ai-airpods",  "AirPods Pro",
     "casual smartphone photo of Apple AirPods Pro with the case open on a desk next to a coffee mug, daylight from a window"),
]
ANGLES = ["shot from a high three-quarter angle", "shot from a low angle from the other side, background visibly different"]


def gen(prompt: str, out: pathlib.Path) -> None:
    body = json.dumps({
        "model": MODEL,
        "input": {"messages": [{"role": "user", "content": [{"text": prompt}]}]},
        "parameters": {"size": "1104*832", "n": 1},
    }).encode()
    req = urllib.request.Request(URL, body, {
        "Authorization": f"Bearer {os.environ['DASHSCOPE_API_KEY']}",
        "Content-Type": "application/json",
    })
    data = json.load(urllib.request.urlopen(req, timeout=120))
    parts = data["output"]["choices"][0]["message"]["content"]
    image_url = next(c["image"] for c in parts if "image" in c)
    out.write_bytes(urllib.request.urlopen(image_url, timeout=120).read())
    print(f"  wrote {out} ({out.stat().st_size // 1024}K)")


def main() -> None:
    for cid, title, base in CASES:
        d = ROOT / "bench/cases" / cid
        d.mkdir(parents=True, exist_ok=True)
        (d / "meta.json").write_text(json.dumps(
            {"title": title, "expect": "refuse", "kind": "ai"}, indent=2))
        for i, angle in enumerate(ANGLES, 1):
            out = d / f"{i}.jpg"
            if out.exists():
                print(f"  skip {out} (exists)")
                continue
            gen(f"{base}, {angle}", out)
            time.sleep(GAP)
        print(f"case {cid} done")


if __name__ == "__main__":
    main()
