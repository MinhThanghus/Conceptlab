"""Capture real screens of the sample labs for the gallery covers and the home page.

The gallery and the home page show the product, never a drawing of it: this script opens the
demo labs as a learner would and saves the part that tells each story.

    python scripts/capture_shots.py --base http://127.0.0.1:5173 [--only covers|home] [--codes TPEND6,WATER6] [--out DIR]

Covers: frontend/public/covers/<CODE>.webp, 1280x720 (16:9), WebP quality 82, one per sample
lab with a 3D view (COVERS below). Each shows the clean 3D stage: the page runs in the capture
mode (html[data-capture=stage], as /learn/3d?capture=1 does), so the scene draws the object
alone (no chips, tools, captions or status lines) in a 16:9 well with square corners. A sample
without a 3D view keeps its booklet cover. Keep LabCover.jsx DEMO_COVER_CODES equal to COVERS
(frontend/src/features/labs/demoCoverFiles.test.js checks the files against it).

Home: frontend/public/shots/*.webp (the materials switcher and the phone).

The learner view opens on the lesson deck; the script switches to the reading view ("Dạng đọc"),
whose contents list opens one part at a time. Re-run it after any visible change to a learner view.
"""

from __future__ import annotations

import argparse
import io
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend" / "public"
COVER_SIZE = (1280, 720)
READING = re.compile(r"^(Dạng đọc|Reading view)$")


@dataclass
class Cover:
    """Which part of a lab makes its cover, and how to frame it.

    block: the part's block type (the first such part that shows `stage` is used); stage: the
    element to capture inside the part; zoom/centre: a closer 16:9 crop for a model
    the stage frames small (centre as fractions of the captured element); steps: clicks that set
    the picture up (JavaScript run on the part)."""
    block: str
    stage: str
    zoom: float = 1.0
    centre: tuple[float, float] = (0.5, 0.5)
    steps: list[str] = field(default_factory=list)
    settle: int = 1800


# The view tools of a 3D court: "Focus on first player", then "Rotate field" (an eighth of a turn)
# where the first angle hides the player behind a post or a team-mate
FOCUS_PLAYER = "(part) => part.querySelector('.sports3d-actions button[aria-pressed=\"false\"]')?.click()"
ROTATE_FIELD = "(part) => part.querySelectorAll('.sports3d-actions button')[1]?.click()"

# The sample labs with a cover capture: each lab with a 3D view. The 2D labs (ATTN24, PARAB3,
# SAVE25, SWAP42) have none on purpose: at card size their charts, bars and matrices read as thin
# lines and tiny numbers, so their booklet covers (BookletCover.jsx) show instead.
COVERS: dict[str, Cover] = {
    # the pendulum bench in 3D, the bob cut out of the class photo
    "TPEND6": Cover("simulation", ".sim-stage .stage3d"),
    # the projectile's field and its arc, the launcher kept in the frame
    "JUMP45": Cover("simulation", ".sim-stage .stage3d", zoom=1.15, centre=(0.47, 0.45)),
    # the water cycle diorama
    "WATER6": Cover("text", ".stage3d", zoom=1.1),
    # the heart
    "HEART8": Cover("text", ".stage3d"),
    # the 3D courts, the camera on the first player (a whole court shrinks its players to specks)
    "VBPASS": Cover("field", ".sports3d-stage", steps=[FOCUS_PLAYER, ROTATE_FIELD]),
    "SPFTBA": Cover("field", ".sports3d-stage", steps=[FOCUS_PLAYER]),
    "SPFUTS": Cover("field", ".sports3d-stage", steps=[FOCUS_PLAYER]),
    "SPBASK": Cover("field", ".sports3d-stage", steps=[FOCUS_PLAYER, ROTATE_FIELD, ROTATE_FIELD]),
    "SPBDMT": Cover("field", ".sports3d-stage", steps=[FOCUS_PLAYER, ROTATE_FIELD]),
}

# A part in its 3D view, without the chrome around the stage: square corners, a 16:9 well as
# wide as the part (a simulation's controls column moves under it), no floating help button and
# a header that scrolls away (the capture mode hides the chips and the stage's own tools).
COVER_CSS = """
.stage3d { border-radius: 0 !important; }
.stage3d:not(.stage3d-fill) { inline-size: 100% !important; block-size: auto !important; aspect-ratio: 16 / 9 !important; max-inline-size: none !important; max-block-size: none !important; }
.ix-layout { grid-template-columns: minmax(0, 1fr) !important; }
.sim-stage[data-view='3d'] { aspect-ratio: 16 / 9 !important; block-size: auto !important; max-block-size: none !important; border-radius: 0 !important; }
.xp-fab { display: none !important; }
.site-header { position: static !important; }
"""

INIT_JS = """
try { localStorage.setItem('cl.lang', '%(lang)s') } catch (e) {}
try { sessionStorage.setItem('cl.sim.view', '3d') } catch (e) {}
// the capture mode (lib/three/kit.js captureMode): scenes draw the object alone
const markCapture = () => { if (document.documentElement) document.documentElement.dataset.capture = 'stage' }
markCapture()
document.addEventListener('readystatechange', markCapture)
document.addEventListener('DOMContentLoaded', markCapture)
try {
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 })
  Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 })
} catch (e) {}
"""

# home materials switcher: (file, lab code, part index (1-based))
HOME = [
    ("home-page", "TPEND6", 1),
    ("home-photo", "TPEND6", 2),
    ("home-video", "VBPASS", 2),
    ("home-paper", "ATTN24", 3),  # the attention weights a student can change
]
HOME_INIT_JS = "try { localStorage.setItem('cl.lang', '%(lang)s') } catch (e) {}"
# the floating help button would sit over the crop
HOME_CSS = ".xp-fab { display: none !important; }"


# ----------------------------------------------------------------------------- pictures
def crop(img: Image.Image, ratio: float, zoom: float = 1.0, centre: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    """The largest `ratio` window, 1/zoom of it, around `centre` (fractions), kept inside the picture."""
    w, h = float(img.width), float(img.height)
    if w / h > ratio:
        w = h * ratio
    else:
        h = w / ratio
    w, h = w / zoom, h / zoom
    left = min(max(centre[0] * img.width - w / 2, 0), img.width - w)
    top = min(max(centre[1] * img.height - h / 2, 0), img.height - h)
    return img.crop((round(left), round(top), round(left + w), round(top + h)))


def save_webp(img: Image.Image, path: Path, size: tuple[int, int], quality: int = 82) -> None:
    img = img.convert("RGB")
    if img.size != size:
        img = img.resize(size, Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", quality=quality, method=6)
    print(f"  {path} {size[0]}x{size[1]} {path.stat().st_size // 1024} KB")


def save_cover_webp(png: bytes, path: Path, size: tuple[int, int], anchor: str = "top") -> None:
    """The home shots' crop: fill `size`, keep the top (or the centre)."""
    img = Image.open(io.BytesIO(png)).convert("RGB")
    tw, th = size
    scale = max(tw / img.width, th / img.height)
    img = img.resize((max(tw, round(img.width * scale)), max(th, round(img.height * scale))), Image.LANCZOS)
    left = (img.width - tw) // 2
    top = 0 if anchor == "top" else (img.height - th) // 2
    save_webp(img.crop((left, top, left + tw, top + th)), path, size)


# ----------------------------------------------------------------------------- the learner view
def open_reading(page, base: str, code: str) -> None:
    """Open a lab as a learner and leave the lesson deck for the reading view."""
    page.goto(f"{base}/s/{code}", wait_until="networkidle")
    page.get_by_role("button", name=READING).first.click(timeout=30000)
    page.locator(".xp-outline-item").first.wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(600)


def open_part(page, block: str, need: str | None = None, index: int | None = None):
    """Show one part in the reading view: the `index`-th (1-based), or the first part of type
    `block` that shows `need` (a selector, such as its 3D stage) once it has loaded."""
    items = page.locator(".xp-outline-item")
    for i in range(items.count()):
        if index is not None and i + 1 != index:
            continue
        items.nth(i).click()
        page.wait_for_timeout(1200)
        if index is not None:
            part = page.locator("[data-block-id]").first
            part.scroll_into_view_if_needed()
            return part
        part = page.locator(f'[data-block-id][data-block-type="{block}"]').first
        if not part.count():
            continue
        if need:
            try:
                part.locator(need).first.wait_for(state="visible", timeout=20000)
            except Exception:
                continue
        part.scroll_into_view_if_needed()
        return part
    raise RuntimeError(f"no {block or 'such'} part" + (f" showing {need}" if need else ""))


VISUAL_JS = """(el) => {
  // moving pictures and live canvases tell a lab best: weight them over still images and charts
  const weight = { VIDEO: 3, CANVAS: 3, IFRAME: 1.5, svg: 1.2, IMG: 1 };
  let best = null, score = 0;
  for (const n of el.querySelectorAll('img, video, canvas, svg, iframe')) {
    const r = n.getBoundingClientRect();
    if (r.width < 160 || r.height < 120) continue;
    const s = r.width * r.height * (weight[n.tagName] || 1);
    if (s > score) { score = s; best = r; }
  }
  const b = el.getBoundingClientRect();
  return { best: best && { x: best.x, y: best.y, w: best.width, h: best.height }, block: { x: b.x, y: b.y, w: b.width, h: b.height } };
}"""


def visual_shot(page, block, ratio: float, pad: int = 28) -> bytes:
    """A crop of the part at `ratio` (w/h) centred on its largest picture (photo, canvas, chart),
    so a home shot shows the lab at work rather than the part's heading."""
    info = block.evaluate(VISUAL_JS)
    if info["best"]:
        page.mouse.wheel(0, info["best"]["y"] + info["best"]["h"] / 2 - page.viewport_size["height"] / 2)
        page.wait_for_timeout(800)
    info = block.evaluate(VISUAL_JS)
    vb, bb = info["best"], info["block"]
    if not vb:
        return block.screenshot()
    w, h = vb["w"] + 2 * pad, vb["h"] + 2 * pad
    if w / h < ratio:
        w = h * ratio
    else:
        h = w / ratio
    w, h = min(w, bb["w"]), min(h, bb["h"])
    if w / h > ratio:
        w = h * ratio
    else:
        h = w / ratio
    cx, cy = vb["x"] + vb["w"] / 2, vb["y"] + vb["h"] / 2
    x = min(max(cx - w / 2, bb["x"]), bb["x"] + bb["w"] - w)
    y = min(max(cy - h / 2, bb["y"]), bb["y"] + bb["h"] - h)
    vp = page.viewport_size
    x, y = max(0, x), max(0, y)
    w, h = min(w, vp["width"] - x), min(h, vp["height"] - y)
    return page.screenshot(clip={"x": x, "y": y, "width": w, "height": h})


# ----------------------------------------------------------------------------- covers
def capture_cover(page, base: str, code: str, cover: Cover, out: Path) -> None:
    open_reading(page, base, code)
    part = open_part(page, cover.block, need=cover.stage)
    page.add_style_tag(content=COVER_CSS)
    stage = part.locator(cover.stage).first
    stage.wait_for(state="visible", timeout=30000)
    stage.locator("canvas").first.wait_for(state="visible", timeout=30000)
    for js in cover.steps:
        part.evaluate(js)
        page.wait_for_timeout(400)
    stage.scroll_into_view_if_needed()
    page.wait_for_timeout(cover.settle)
    shot = Image.open(io.BytesIO(stage.screenshot(animations="disabled"))).convert("RGB")
    cut = crop(shot, COVER_SIZE[0] / COVER_SIZE[1], cover.zoom, cover.centre)
    if cut.width < COVER_SIZE[0]:
        print(f"  note: {code} is cut from {cut.width}px and scaled up")
    save_webp(cut, out / "covers" / f"{code}.webp", COVER_SIZE)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--base", default="http://127.0.0.1:5173", help="the running frontend (dev server or preview)")
    ap.add_argument("--lang", default="vi", choices=["vi", "en"])
    ap.add_argument("--only", choices=["home", "covers"], default=None)
    ap.add_argument("--codes", default="", help="comma-separated lab codes (covers only)")
    ap.add_argument("--out", default=str(PUBLIC), help="root folder for covers/ and shots/")
    args = ap.parse_args()
    out = Path(args.out)
    codes = [c.strip().upper() for c in args.codes.split(",") if c.strip()] or list(COVERS)
    failures = 0
    with sync_playwright() as pw:
        # software WebGL renders the same picture on every machine, with or without a GPU
        browser = pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        if args.only in (None, "covers"):
            print("gallery covers")
            ctx = browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=2, reduced_motion="reduce")
            ctx.add_init_script(INIT_JS % {"lang": args.lang})
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            for code in codes:
                if code not in COVERS:
                    print(f"  skip {code}: no cover capture (the booklet cover shows)")
                    continue
                try:
                    capture_cover(page, args.base, code, COVERS[code], out)
                except Exception as exc:  # keep going: one lab must not block the others
                    failures += 1
                    print(f"  FAIL {code}: {str(exc).splitlines()[0][:200]}")
            for e in errors[:10]:
                print("  page error:", e[:300])
            ctx.close()
        if args.only in (None, "home"):
            print("home shots")
            ctx = browser.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2, reduced_motion="reduce")
            ctx.add_init_script(HOME_INIT_JS % {"lang": args.lang})
            page = ctx.new_page()
            for name, code, index in HOME:
                open_reading(page, args.base, code)
                page.add_style_tag(content=HOME_CSS)
                block = open_part(page, "", index=index)
                save_cover_webp(visual_shot(page, block, 4 / 3, pad=48), out / "shots" / f"{name}.webp", (1200, 900), anchor="center")
            ctx.close()
            # the pendulum lab on a phone: the lesson deck it opens on
            phone = browser.new_context(viewport={"width": 390, "height": 750}, device_scale_factor=2, is_mobile=True, has_touch=True, reduced_motion="reduce")
            phone.add_init_script(HOME_INIT_JS % {"lang": args.lang})
            pp = phone.new_page()
            pp.goto(f"{args.base}/s/TPEND6", wait_until="networkidle")
            pp.wait_for_timeout(1500)
            save_cover_webp(pp.screenshot(), out / "shots" / "home-phone.webp", (780, 1500))
            phone.close()
        browser.close()
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
