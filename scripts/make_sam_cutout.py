"""Cut the pendulum bob out of the demo classroom photo with SAM 3.1 (real API call).

The mask is decoded with Meta's official @meta-sam/parser (Node, from frontend/node_modules),
then composed into a transparent PNG with Pillow. Output:
backend/app/seed/assets/pendulum_bob_cutout.png and pendulum_bob_sam.json.

    backend/.venv/Scripts/python.exe scripts/make_sam_cutout.py
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from PIL import Image  # noqa: E402

from app.ai.client import CallContext, MetaAIClient  # noqa: E402

ASSETS = ROOT / "backend" / "app" / "seed" / "assets"
PHOTO = ASSETS / "pendulum_classroom_photo.jpg"

DECODE_JS = r"""
import { decodeMaskToRaster } from '@meta-sam/parser'
let input = ''
process.stdin.on('data', (c) => (input += c))
process.stdin.on('end', () => {
  const mask = JSON.parse(input)
  const raster = decodeMaskToRaster(mask)
  process.stdout.write(JSON.stringify(Array.from(raster)))
})
"""


async def main() -> None:
    client = MetaAIClient()
    try:
        result = await client.segment(
            media=PHOTO.read_bytes(), mime="image/jpeg", prompt="red ball", ctx=CallContext(feature="seed_cutout")
        )
    finally:
        await client.aclose()
    objects = result.objects
    if not objects:
        raise SystemExit("SAM found no red ball")
    obj = objects[0]
    print("SAM box", obj.box, "image", result.width, result.height, "mask", obj.mask["width"], obj.mask["height"])
    script = ROOT / "frontend" / "node_modules" / ".cl-decode-mask.mjs"
    script.write_text(DECODE_JS, encoding="utf-8")
    try:
        proc = subprocess.run(
            ["node", str(script)], input=json.dumps(obj.mask).encode(), capture_output=True, cwd=ROOT / "frontend", check=True
        )
    finally:
        script.unlink(missing_ok=True)
    raster = json.loads(proc.stdout)
    x1, y1, x2, y2 = obj.box
    w, h = obj.mask["width"], obj.mask["height"]
    assert len(raster) == w * h, (len(raster), w, h)
    photo = Image.open(PHOTO).convert("RGBA")
    crop = photo.crop((x1, y1, x1 + w, y1 + h))
    alpha = Image.new("L", (w, h))
    alpha.putdata([255 if v else 0 for v in raster])
    crop.putalpha(alpha)
    crop.save(ASSETS / "pendulum_bob_cutout.png")
    (ASSETS / "pendulum_bob_sam.json").write_text(
        json.dumps({"prompt": "red ball", "box": obj.box, "image_width": result.width, "image_height": result.height, "mask": obj.mask}),
        encoding="utf-8",
    )
    print("coverage", round(sum(raster) / len(raster), 3), "->", ASSETS / "pendulum_bob_cutout.png")


if __name__ == "__main__":
    asyncio.run(main())
