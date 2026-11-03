"""Render the demo labs' source pictures from code (img2threejs method).

Every picture is built in headless Chromium by a page in this folder: procedural Three.js
scenes (primitives, bevelled boxes, tube networks, generated canvas textures, seeded noise)
and HTML/CSS typesetting with real fonts. Python only drives the browser, saves the pixels and
measures what the lessons cite: the boxes of quoted lines on a textbook page and the screen
regions of a diagram's parts (each 3D or SVG part rendered alone as a mask, then traced).

    python scripts/render/render.py page-pendulum page-volleyball photo water heart video
    python scripts/render/render.py all [--cpu] [--preview DIR]

Outputs go to backend/app/seed/assets (pictures, *_regions.json) and a render manifest with
viewport, scale, renderer and output hashes to the preview folder. Files are served to the page
from this repository through a Playwright route (no server, no port). Needs Python Playwright,
Pillow, numpy and opencv-python; the GPU path uses ANGLE/D3D11 when present (--cpu forces
SwiftShader, slower, same scenes).
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import mimetypes
import sys
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "backend" / "app" / "seed" / "assets"
ORIGIN = "http://render.local"
SERVED = ("scripts/render/", "frontend/node_modules/", "frontend/src/lib/three/")
TYPES = {".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".html": "text/html",
         ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".json": "application/json",
         ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"}


# ----------------------------------------------------------------------------- browser
def serve(route) -> None:
    path = unquote(urlparse(route.request.url).path).lstrip("/")
    target = (ROOT / path).resolve()
    allowed = any(path.startswith(p) for p in SERVED) and ROOT in target.parents and target.is_file()
    if not allowed:
        route.fulfill(status=404, body=f"not served: {path}")
        return
    ctype = TYPES.get(target.suffix.lower()) or mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    route.fulfill(status=200, body=target.read_bytes(), headers={"content-type": ctype, "cache-control": "no-store"})


class Browser:
    def __init__(self, pw, gpu: bool) -> None:
        args = ["--use-angle=d3d11", "--use-gl=angle", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] if gpu else [
            "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
        self.browser = pw.chromium.launch(args=args)

    def open(self, url: str, width: int, height: int, scale: float = 1):
        ctx = self.browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=scale)
        ctx.route(f"{ORIGIN}/**", serve)
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{ORIGIN}/{url}")
        try:
            page.wait_for_function("window.__job && window.__job.state !== 'loading'", timeout=180_000)
        except Exception:
            raise SystemExit(f"{url}: page never became ready. Errors: {errors[:6]}")
        state = page.evaluate("window.__job.state")
        if state != "ready":
            raise SystemExit(f"{url}: {page.evaluate('window.__job.error')} {errors[:6]}")
        return ctx, page, errors

    def close(self) -> None:
        self.browser.close()


def run_job(page, opts: dict | None = None) -> dict:
    return page.evaluate("async (o) => await window.__job.run(o)", opts or {})


def decode(data_url: str) -> Image.Image:
    head, b64 = data_url.split(",", 1)
    return Image.open(io.BytesIO(base64.b64decode(b64)))


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


# ----------------------------------------------------------------------------- regions
def mask_region(mask: Image.Image, *, close: int = 0, pad: int = 6, simplify: float = 2.0, min_area: int = 60,
                hull: bool = False) -> dict:
    """Binary mask (white = part) → padded bbox (0..1) and an SVG outline in 0..1000 units."""
    g = np.array(mask.convert("L"))
    h, w = g.shape
    binary = (g > 127).astype(np.uint8) * 255
    if close:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close * 2 + 1, close * 2 + 1))
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    if pad:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (pad * 2 + 1, pad * 2 + 1))
        binary = cv2.dilate(binary, kernel)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    contours = [c for c in contours if cv2.contourArea(c) >= min_area]
    if not contours:
        raise ValueError("empty mask")
    if hull:
        contours = [cv2.convexHull(np.vstack(contours))]
    xs, ys, xe, ye = w, h, 0, 0
    parts = []
    for c in contours:
        x, y, cw, ch = cv2.boundingRect(c)
        xs, ys, xe, ye = min(xs, x), min(ys, y), max(xe, x + cw), max(ye, y + ch)
        poly = cv2.approxPolyDP(c, simplify, True).reshape(-1, 2)
        if len(poly) < 3:
            continue
        pts = [f"{px * 1000 / w:.1f} {py * 1000 / h:.1f}" for px, py in poly]
        parts.append("M" + "L".join(pts) + "Z")
    bbox = [round(xs / w, 4), round(ys / h, 4), round(xe / w, 4), round(ye / h, 4)]
    return {"bbox": bbox, "mask_path": "".join(parts), "area": round(float(sum(cv2.contourArea(c) for c in contours)) / (w * h), 4)}


def overlay(base: Image.Image, regions: dict[str, dict], out: Path) -> None:
    """Debug sheet: every region outline over the picture (for a human to check the alignment)."""
    img = np.array(base.convert("RGB"))[:, :, ::-1].copy()
    h, w = img.shape[:2]
    colors = [(40, 90, 230), (30, 160, 60), (220, 60, 40), (200, 120, 0), (150, 40, 190), (0, 150, 170), (90, 90, 90),
              (230, 40, 160), (60, 60, 200), (0, 120, 80)]
    for i, (name, reg) in enumerate(regions.items()):
        col = colors[i % len(colors)]
        x0, y0, x1, y1 = reg["bbox"]
        cv2.rectangle(img, (int(x0 * w), int(y0 * h)), (int(x1 * w), int(y1 * h)), col, 1)
        for seg in reg.get("mask_path", "").split("Z"):
            if not seg.strip():
                continue
            pts = [p.strip() for p in seg.lstrip("M").split("L")]
            arr = np.array([[float(a) * w / 1000, float(b) * h / 1000] for a, b in (p.split() for p in pts)], np.int32)
            cv2.polylines(img, [arr], True, col, 2)
        cv2.putText(img, name, (int(x0 * w) + 4, int(y0 * h) + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, col, 2)
    out.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out), img)


# ----------------------------------------------------------------------------- jobs
def save_png(img: Image.Image, path: Path) -> None:
    img.save(path, optimize=True)


def downsample(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    return img.convert("RGB").resize(size, Image.Resampling.LANCZOS)


CONTENT = ROOT / "backend" / "app" / "seed" / "content.py"
# The quotes content.py cites from each page. Kept here verbatim and checked against content.py
# on every run, so a page can never be rendered for a quote the lesson does not cite.
QUOTES = {
    "page-pendulum": {
        "struct": "Con lắc đơn gồm một vật nhỏ khối lượng m treo vào đầu một sợi dây không dãn, khối lượng không đáng kể, có chiều dài L.",
        "small": "Kéo vật lệch khỏi vị trí cân bằng một góc nhỏ (dưới 10°) rồi thả nhẹ.",
        "formula": "T = 2π √(L/g)   (12.1)",
        "vars": "T là chu kỳ dao động (s); L là chiều dài dây (m); g là gia tốc trọng trường (m/s²). Ở gần mặt đất lấy g = 9,81 m/s².",
        "notes": "Chu kỳ không phụ thuộc vào khối lượng m của vật. Khi góc lệch nhỏ, chu kỳ gần như không phụ thuộc biên độ.",
        "example": "Với g = 9,81 m/s²: L = 1 m thì T ≈ 2,01 s; L = 0,25 m thì T ≈ 1,00 s.",
        "question": "Nếu tăng chiều dài dây lên 4 lần thì chu kỳ dao động thay đổi thế nào?",
    },
    "page-volleyball": {
        "intro": "Động tác gồm bốn giai đoạn liên tiếp",
        "s1": "Hai chân rộng bằng vai, khuỵu gối, trọng tâm dồn ra trước, hai tay đưa ra trước, mắt quan sát hướng bóng bay đến.",
        "s2": "Hai bàn tay úp chồng lên nhau, hai ngón cái song song, duỗi thẳng khuỷu tay để tạo mặt phẳng ở hai cẳng tay.",
        "s3": "Bóng chạm phần cẳng tay phía trên cổ tay. Duỗi chân đẩy người lên, tay không vung quá vai.",
        "s4": "Theo đà đưa người ra trước, hướng bóng tới mục tiêu, nhanh chóng trở về tư thế chuẩn bị.",
        **{f"panel{i}": f"Hình 5 — H{i}" for i in range(1, 5)},
        "safety": "An toàn: khởi động kỹ cổ tay, khớp gối; tập trên sân bằng phẳng; không đệm bóng bằng bàn tay hay đầu ngón tay.",
    },
}


def check_quotes(name: str) -> dict[str, str]:
    source = CONTENT.read_text(encoding="utf-8")
    quotes = QUOTES[name]
    for key, quote in quotes.items():
        probe = 'f"Hình 5 — H{i + 1}"' if key.startswith("panel") else f'"{quote}"'
        if probe not in source:
            raise SystemExit(f"{name}: quote {key!r} is not cited verbatim in content.py: {quote}")
    return quotes


def job_page(b: Browser, name: str, file: str, preview: Path, manifest: dict) -> None:
    """A typeset textbook page: screenshot at 2x, Lanczos down to 1240 x 1754, quote boxes from the DOM."""
    W, H, S = 1240, 1754, 2
    quotes = check_quotes(name)
    ctx, page, errors = b.open(f"scripts/render/{name}.html", W, H, S)
    result = run_job(page, {"quotes": quotes})
    shot = Image.open(io.BytesIO(page.screenshot(full_page=False, type="png")))
    img = downsample(shot, (W, H))
    out = ASSETS / file
    save_png(img, out)
    quotes = result["quotes"]
    regions = {k: {"bbox": v} for k, v in quotes.items()}
    overlay(img, regions, preview / f"{name}-quotes.png")
    (preview / f"{name}-quotes.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    manifest[name] = {"out": str(out.relative_to(ROOT)), "sha": sha(out), "viewport": [W, H], "scale": S,
                      "quotes": quotes, "missing": result.get("missing", []), "console_errors": errors}
    for k, v in quotes.items():
        print(f"  {k:10s} {v}")
    if result.get("missing"):
        print("  MISSING QUOTES:", result["missing"])
    ctx.close()


def job_photo(b: Browser, preview: Path, manifest: dict) -> None:
    W, H = 1200, 900
    ctx, page, errors = b.open("scripts/render/stage.html?job=photo", W, H, 1)
    result = run_job(page, {"width": W, "height": H, "scale": 2})
    img = downsample(decode(result["image"]), (W, H))
    img = film(img, seed=12)
    out = ASSETS / "pendulum_classroom_photo.jpg"
    img.save(out, quality=90, optimize=True, progressive=True, subsampling=0)
    img.save(preview / "photo.png")
    manifest["photo"] = {"out": str(out.relative_to(ROOT)), "sha": sha(out), "size": [W, H], "scale": 2,
                         "bob": result.get("bob"), "camera": result.get("camera"), "console_errors": errors}
    print("  bob on screen:", result.get("bob"))
    ctx.close()


def film(img: Image.Image, seed: int) -> Image.Image:
    """What a phone camera adds to a clean render: its tone curve, a soft vignette, a little sensor noise."""
    rng = np.random.default_rng(seed)
    a = np.asarray(img).astype(np.float32) / 255.0
    h, w = a.shape[:2]
    a = a + 0.10 * (a - 0.5) * (1 - np.abs(2 * a - 1))  # gentle S-curve: deeper darks, livelier mids
    luma = a.mean(axis=2, keepdims=True)
    a = luma + (a - luma) * 1.06  # phones push saturation a touch
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    a = a * (1 - 0.12 * np.clip(r - 0.3, 0, None) ** 1.5)[:, :, None]
    a = a * 255 + rng.normal(0, 2.0, (h, w, 1)).astype(np.float32)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def job_diagram(b: Browser, job: str, file: str, size: tuple[int, int], specs: dict, preview: Path, manifest: dict) -> None:
    """A 3D or SVG diagram: beauty image + one mask per part → regions JSON next to the picture."""
    W, H = size
    ctx, page, errors = b.open(f"scripts/render/stage.html?job={job}", W, H, 1)
    result = run_job(page, {"width": W, "height": H, "scale": 2})
    img = downsample(decode(result["image"]), (W, H))
    out = ASSETS / file
    save_png(img, out)
    regions = {}
    for name, data_url in result["masks"].items():
        mask = decode(data_url).convert("L").resize((W, H), Image.Resampling.BILINEAR)
        mask.save(preview / f"{job}-mask-{name}.png")
        regions[name] = mask_region(mask, **specs.get(name, {}))
    overlay(img, regions, preview / f"{job}-regions.png")
    data = {"image": file, "width": W, "height": H, "method": result.get("method", ""), "parts": regions}
    reg_file = ASSETS / file.replace(".png", "_regions.json")
    reg_file.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    manifest[job] = {"out": str(out.relative_to(ROOT)), "sha": sha(out), "regions": str(reg_file.relative_to(ROOT)),
                     "size": [W, H], "scale": 2, "camera": result.get("camera"), "console_errors": errors,
                     "bboxes": {k: v["bbox"] for k, v in regions.items()}}
    for k, v in regions.items():
        print(f"  {k:12s} bbox {v['bbox']}  path {len(v['mask_path'])} chars")
    ctx.close()


WATER_SPECS = {
    "sun": {"pad": 6},
    "evaporation": {"close": 26, "pad": 8, "hull": True},
    "condensation": {"close": 10, "pad": 8},
    "rain": {"close": 24, "pad": 6},
    "runoff": {"close": 6, "pad": 7},
    "infiltration": {"close": 8, "pad": 4},
}
HEART_SPECS = {name: {"pad": 5, "close": 3} for name in ("lungs", "organs", "ra", "la", "rv", "lv", "pa", "pv", "ao", "vc")}
HEART_SPECS.update({"pulmonary": {"pad": 4, "close": 30, "hull": True}, "systemic": {"pad": 4, "close": 30, "hull": True}})


def main() -> None:
    from playwright.sync_api import sync_playwright

    p = argparse.ArgumentParser()
    p.add_argument("jobs", nargs="+")
    p.add_argument("--cpu", action="store_true")
    p.add_argument("--preview", default=str(ROOT / ".build-check" / "demo-assets" / "render"))
    a = p.parse_args()
    jobs = ["page-pendulum", "page-volleyball", "photo", "water", "heart"] if a.jobs == ["all"] else a.jobs
    preview = Path(a.preview)
    preview.mkdir(parents=True, exist_ok=True)
    manifest_path = preview / "render-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    with sync_playwright() as pw:
        b = Browser(pw, gpu=not a.cpu)
        manifest["_browser"] = {"version": b.browser.version, "gpu": not a.cpu, "when": time.strftime("%Y-%m-%d %H:%M")}
        for job in jobs:
            print(f"[{job}]")
            started = time.perf_counter()
            if job == "page-pendulum":
                job_page(b, job, "pendulum_textbook_page.png", preview, manifest)
            elif job == "page-volleyball":
                job_page(b, job, "volleyball_textbook_page.png", preview, manifest)
            elif job == "photo":
                job_photo(b, preview, manifest)
            elif job == "water":
                job_diagram(b, "water", "water_cycle.png", (1200, 800), WATER_SPECS, preview, manifest)
            elif job == "heart":
                job_diagram(b, "heart", "circulatory_diagram.png", (1200, 1000), HEART_SPECS, preview, manifest)
            elif job == "video":
                from video import job_video  # noqa: PLC0415  (stretch job, own module)

                job_video(b, preview, manifest)
            else:
                raise SystemExit(f"unknown job {job}")
            print(f"  done in {time.perf_counter() - started:.1f}s")
        b.close()
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()
