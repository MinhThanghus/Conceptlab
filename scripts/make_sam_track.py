"""Track the ball through the demo volleyball video with SAM 3.1 (real API call).

Runs the same pipeline as the app: the video is transcoded to the small AI proxy
(480p, 12 fps) and sent to SAM with a noun phrase. Boxes are normalized and timed.
Output: backend/app/seed/assets/volleyball_ball_track.json

    backend/.venv/Scripts/python.exe scripts/make_sam_track.py
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TMP = tempfile.mkdtemp(prefix="cl-track-")
os.environ["STORAGE_DIR"] = TMP
sys.path.insert(0, str(ROOT / "backend"))

from app import storage  # noqa: E402
from app.ai.client import CallContext, MetaAIClient  # noqa: E402
from app.services import media  # noqa: E402

ASSETS = ROOT / "backend" / "app" / "seed" / "assets"


async def main() -> None:
    key = storage.save_bytes("seedtrack", (ASSETS / "volleyball_practice.mp4").read_bytes(), "mp4")
    info = media.transcode_video(key, "seedtrack")
    proxy = storage.read_bytes(info["ai_key"])
    proxy_info = media.probe_video(str(storage.path_for(info["ai_key"])))
    client = MetaAIClient()
    try:
        result = await client.segment(
            media=proxy, mime="video/mp4", prompt="yellow ball", ctx=CallContext(feature="seed_track"), is_video=True
        )
    finally:
        await client.aclose()
    fps = proxy_info["fps"] or 12.0
    frames = []
    for index in sorted(result.frames):
        boxes = [
            [round(o.box[0] / result.width, 4), round(o.box[1] / result.height, 4), round((o.box[2] + 1) / result.width, 4), round((o.box[3] + 1) / result.height, 4)]
            for o in result.frames[index]
        ]
        frames.append({"t": round(index / fps, 3), "boxes": boxes})
    out = {"phrase": "yellow ball", "fps": fps, "frames": frames}
    (ASSETS / "volleyball_ball_track.json").write_text(json.dumps(out), encoding="utf-8")
    print("frames with ball:", len(frames), "proxy fps:", fps, "size:", result.width, result.height)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
