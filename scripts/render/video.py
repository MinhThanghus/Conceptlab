"""The practice clip job for render.py: frames from video.js, H.264 with ffmpeg, plus the ball's
true screen position per frame (to check the SAM 3.1 track against)."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import imageio_ffmpeg

from render import ASSETS, ROOT, decode, run_job, sha


def job_video(b, preview: Path, manifest: dict) -> None:
    W, H = 960, 540
    ctx, page, errors = b.open("scripts/render/stage.html?job=video", W, H, 1)
    tmp = Path(tempfile.mkdtemp(prefix="cl-clip-"))
    balls = []
    try:
        start, total = 0, None
        while total is None or start < total:
            res = run_job(page, {"width": W, "height": H, "scale": 1.5, "from": start, "count": 24})
            total = res["total"]
            for i, url in enumerate(res["frames"]):
                img = decode(url).convert("RGB").resize((W, H))
                img.save(tmp / f"f{start + i:04d}.png")
            balls += res["balls"]
            start += len(res["frames"])
            print(f"  frames {start}/{total}")
        out = ASSETS / "volleyball_practice.mp4"
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-framerate", str(res["fps"]), "-i", str(tmp / "f%04d.png"),
                        "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)], check=True)
        shutil.copy(tmp / "f0048.png", preview / "video-contact-frame.png")
        shutil.copy(tmp / "f0012.png", preview / "video-ready-frame.png")
        shutil.copy(tmp / "f0072.png", preview / "video-pass-frame.png")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    (preview / "video-ball-truth.json").write_text(json.dumps(balls), encoding="utf-8")
    manifest["video"] = {"out": str(out.relative_to(ROOT)), "sha": sha(out), "size": [W, H], "fps": res["fps"], "frames": total, "console_errors": errors}
    ctx.close()
