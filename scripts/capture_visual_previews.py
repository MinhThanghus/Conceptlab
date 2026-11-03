"""Capture the 3D model previews shown on the visual library and paper-study cards.

    python scripts/capture_visual_previews.py --base http://127.0.0.1:5173 [--only water_cycle,CHNWRE] [--out DIR]

Writes frontend/public/visual-previews/<id>.png (one per model of the visual library) and
frontend/public/paper-previews/<CODE>.png (one per paper-study lab; the step and flow slides of
those lessons show it too). Every picture comes from the library's capture mode,
/learn/3d?model=<id>&capture=1: the well is exactly 16:9 and shows the model alone (no tools,
labels, captions or pins; only the data tree keeps its node numbers, which are its content). A
paper preview first puts the model in the state that tells that paper's story (a topic, a
layout, a later time step). A model the stage frames small is cut closer (`zoom`), from a wider
well, so every card shows its model at about three quarters of the frame.

Each well is captured at device pixel ratio 2 (about 1950x1100 or more), cut to 16:9, scaled to
1600x900 with a Lanczos filter and saved as a PNG under about 400 KB (an octree palette keeps the
hues and the paper's grain). The script prints how much of the frame each model's silhouette
spans (coloured or dark pixels; pale parts escape it), so a model that sits small is easy to spot.
Re-run it after any visible change to a 3D model.
"""

from __future__ import annotations

import argparse
import io
import re
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend" / "public"
SIZE = (1600, 900)
MAX_BYTES = 400_000
WELL = ".visual-library-active .stage3d"

# Some scenes cap their well's size or share a row with their notes (the globe, the molecule, the
# relief and diffusion views): the capture gives every well the whole row and square corners, so
# the picture fills its card edge to edge with no frame.
CAPTURE_CSS = """
.visual-library-active .stage3d { border-radius: 0 !important; max-inline-size: none !important; max-block-size: none !important; }
.visual-library-active .stage3d:not(.stage3d-fill) { inline-size: 100% !important; block-size: auto !important; aspect-ratio: 16 / 9 !important; }
.visual-library-active .science-columns,
.visual-library-active .geo-workspace,
.visual-library-active .diffusion-content { grid-template-columns: minmax(0, 1fr) !important; }
"""
# A zoomed capture needs a wider well to keep 1600 sharp pixels after the crop.
WIDE_CSS = ".visual-library { max-inline-size: none !important; }"

# Machines report their power through these: pin a full device so every capture gets the same
# studio light (room reflections, soft shadows, a 2x canvas) whatever computer runs the script.
INIT_JS = """
try { localStorage.setItem('cl.lang', '%(lang)s') } catch (e) {}
try {
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 })
  Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 })
} catch (e) {}
"""


# ----------------------------------------------------------------------------- model states
def select(index: int, value: str):
    """Choose `value` in the n-th menu under the paper-study model."""
    def step(page):
        page.locator(".visual-library-active .study-controls select").nth(index).select_option(value)
    return step


def check(index: int = 0):
    def step(page):
        page.locator(".visual-library-active .study-controls .study-check input").nth(index).check()
    return step


def slide(index: int, value: int):
    """Set the n-th slider of the paper-study model (React listens to the native input event)."""
    def step(page):
        page.locator(".visual-library-active .study-controls input[type=range]").nth(index).evaluate(
            """(el, v) => {
                const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
                set.call(el, String(v))
                el.dispatchEvent(new Event('input', { bubbles: true }))
                el.dispatchEvent(new Event('change', { bubbles: true }))
            }""",
            value,
        )
    return step


def press(name_pattern: str, times: int = 1):
    """Press a button of the model by its visible name (Vietnamese or English). The capture mode
    hides the view tools, so the click is dispatched rather than aimed."""
    def step(page):
        button = page.locator(".visual-library-active").get_by_role("button", name=re.compile(name_pattern), include_hidden=True).first
        for _ in range(times):
            button.dispatch_event("click")
            page.wait_for_timeout(150)
    return step


ROTATE_RIGHT = r"^(Xoay phải|Rotate right)$"
ROTATE_LEFT = r"^(Xoay trái|Rotate left)$"


def target(name: str, query: str, *steps, zoom: float = 1.0, centre: tuple[float, float] = (0.5, 0.5), labels: bool = False):
    """One picture: `name` under frontend/public, the /learn/3d query, the steps that set the
    model's state, a `zoom` (crop) for a model the stage frames small, the crop's `centre`, and
    `labels` for a model whose chips are its content (the numbers of a data tree)."""
    return {"name": name, "query": query, "steps": list(steps), "zoom": zoom, "centre": centre, "labels": labels}


# A model the stage frames small is cut closer (zoom), so every card shows its model at about
# three quarters of the frame's height.
LIBRARY = {
    "circulation": {}, "enzyme_binding": {"zoom": 1.15}, "molecular_geometry": {"zoom": 1.3, "centre": (0.5, 0.45)},
    "solar_globe": {}, "water_cycle": {}, "population_grid": {},
    "image_relief": {"zoom": 1.15, "centre": (0.5, 0.575)}, "diffusion_process": {"zoom": 1.15, "centre": (0.5, 0.54)},
    # a data tree's numbers are its nodes: keep them
    "data_tree": {"labels": True, "zoom": 1.1, "centre": (0.5, 0.42)}, "quadrotor": {"zoom": 1.1, "centre": (0.5, 0.48)},
    "solar_cell": {}, "agriculture_field": {}, "reaction_diffusion": {}, "porous_adsorption": {}, "semiconductor_chip": {},
}
TARGETS = [target(f"visual-previews/{m}", f"model={m}", **opts) for m, opts in LIBRARY.items()] + [
    # Water levels and greenhouse gases: the field drained, the dry phase of alternate wetting and
    # drying (the library card shows it flooded)
    target("paper-previews/AGWATR", "model=agriculture_field", select(0, "drained")),
    # Rice establishment: seed broadcast over the field instead of transplanted rows
    target("paper-previews/AGFARM", "model=agriculture_field", select(1, "broadcast")),
    # Root-zone microorganisms and maize
    target("paper-previews/AGMAZE", "model=agriculture_field", select(2, "maize"), check(0)),
    # How chemical waves emerge: the front after some hundred steps, not the starting spike
    target("paper-previews/PCWAVS", "model=reaction_diffusion", press(r"^(Tiến thêm 20 bước tính|Advance 20 numerical steps)$", 6)),
    # CO2, water vapour and porous carbon: both molecules competing for the sites
    target("paper-previews/PCPARE", "model=porous_adsorption", slide(0, 10), slide(1, 8)),
    target("paper-previews/CHNASH", "model=semiconductor_chip&mode=device&geometry=nanosheet"),
    target("paper-previews/CHNWRE", "model=semiconductor_chip&mode=device&geometry=nanowire"),
    target("paper-previews/CHCMPS", "model=semiconductor_chip&mode=cmos"),
    # Contacts and MoS2 transistors: the planar device switched on, turned to face its contacts
    # (the library card shows it off, from the front)
    target("paper-previews/CHMSTE", "model=semiconductor_chip&mode=device&geometry=planar", press(r"^(Cổng cao|Gate high)$"), press(ROTATE_LEFT)),
    target("paper-previews/CHMEMS", "model=semiconductor_chip&mode=memristor"),
]


# ----------------------------------------------------------------------------- image helpers
def silhouette(img: Image.Image) -> dict | None:
    """The box of pixels that are clearly not paper: coloured (chroma) or dark. Pale parts and
    soft shadows escape it, so a pale model reads a little smaller than it looks."""
    small = img.convert("RGB").resize((img.width // 4, img.height // 4))
    w, h = small.size
    px = small.load()
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if max(r, g, b) - min(r, g, b) > 42 or (r * 2126 + g * 7152 + b * 722) / 10000 < 150:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    xs.sort()
    ys.sort()
    k = max(1, len(xs) // 250)  # ignore stray specks
    x0, x1, y0, y1 = xs[k], xs[-k], ys[k], ys[-k]
    return {
        "w": (x1 - x0) / w, "h": (y1 - y0) / h,
        "cx": (x0 + x1) / 2 / w, "cy": (y0 + y1) / 2 / h,
    }


def crop_16_9(img: Image.Image, zoom: float = 1.0, centre: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    """A 16:9 window, 1/zoom of the picture, around `centre` (fractions of the picture), kept
    inside it. The well already is 16:9, so with zoom 1 this only trims a stray pixel row."""
    ratio = SIZE[0] / SIZE[1]
    w, h = float(img.width), float(img.height)
    if w / h > ratio:
        w = h * ratio
    else:
        h = w / ratio
    w, h = w / zoom, h / zoom
    left = min(max(centre[0] * img.width - w / 2, 0), img.width - w)
    top = min(max(centre[1] * img.height - h / 2, 0), img.height - h)
    return img.crop((round(left), round(top), round(left + w), round(top + h)))


def encode_png(img: Image.Image) -> bytes:
    """The first PNG under MAX_BYTES: full colour when it fits (rarely: the paper's grain), else an
    octree palette, which keeps hues true (about two levels of mean error, where median cut turned
    the pear arcs orange) and the grain intact."""
    attempts = [
        lambda: img,
        lambda: img.quantize(colors=256, method=Image.Quantize.FASTOCTREE),
        lambda: img.quantize(colors=128, method=Image.Quantize.FASTOCTREE),
    ]
    best = None
    for make in attempts:
        buf = io.BytesIO()
        make().save(buf, "PNG", optimize=True)
        data = buf.getvalue()
        if best is None or len(data) < len(best):
            best = data
        if len(data) <= MAX_BYTES:
            return data
    return best


# ----------------------------------------------------------------------------- capture
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--base", default="http://127.0.0.1:5173", help="the running frontend (dev server or preview)")
    ap.add_argument("--only", default="", help="comma-separated ids or codes, e.g. water_cycle,CHNWRE")
    ap.add_argument("--out", default=str(PUBLIC), help="root folder for visual-previews/ and paper-previews/")
    ap.add_argument("--lang", default="vi", choices=["vi", "en"])
    ap.add_argument("--settle", type=int, default=1800, help="ms to wait for the stage to settle")
    args = ap.parse_args()

    only = {x.strip() for x in args.only.split(",") if x.strip()}
    out = Path(args.out)
    failures = 0
    with sync_playwright() as pw:
        # software WebGL renders the same picture on every machine, with or without a GPU
        browser = pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 800}, device_scale_factor=2,
            locale="vi-VN" if args.lang == "vi" else "en-US", reduced_motion="reduce",
        )
        ctx.add_init_script(INIT_JS % {"lang": args.lang})
        page = ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        for item in TARGETS:
            name, zoom = item["name"], item["zoom"]
            if only and name.split("/")[-1] not in only:
                continue
            path = out / f"{name}.png"
            path.parent.mkdir(parents=True, exist_ok=True)
            try:
                # a zoomed picture is cut from a wider well, so it still has 1600 sharp pixels
                wide = zoom > 1.2
                page.set_viewport_size({"width": max(1280, round(800 * zoom + 420)) if wide else 1280, "height": 800})
                # chips that carry the content are drawn before the capture mode starts, so they stay
                query = item["query"] if item["labels"] else f"{item['query']}&capture=1"
                page.goto(f"{args.base}/learn/3d?{query}", wait_until="domcontentloaded")
                well = page.locator(WELL).first
                well.wait_for(state="visible", timeout=30000)
                well.locator("canvas").first.wait_for(state="visible", timeout=30000)
                page.wait_for_timeout(400)
                if item["labels"]:
                    page.evaluate("document.documentElement.dataset.capture = 'stage'")
                page.add_style_tag(content=CAPTURE_CSS + (WIDE_CSS if wide else ""))
                for step in item["steps"]:
                    step(page)
                    page.wait_for_timeout(300)
                well.scroll_into_view_if_needed()
                page.wait_for_timeout(args.settle)
                shot = Image.open(io.BytesIO(well.screenshot(animations="disabled"))).convert("RGB")
                cut = crop_16_9(shot, zoom, item["centre"])
                img = cut.resize(SIZE, Image.LANCZOS)
                data = encode_png(img)
                path.write_bytes(data)
                fill = silhouette(img)
                where = (f"spans {fill['w']:.0%} x {fill['h']:.0%}, centre {fill['cx']:.2f},{fill['cy']:.2f}"
                         if fill else "no silhouette found")
                soft = "  (upscaled: widen the well)" if cut.width < SIZE[0] else ""
                print(f"ok   {name:34s} {cut.width}x{cut.height} -> {SIZE[0]}x{SIZE[1]} {len(data) // 1024:4d} KB  {where}{soft}")
            except Exception as exc:  # keep going: one broken model must not block the others
                failures += 1
                print(f"FAIL {name}: {str(exc).splitlines()[0][:200]}")
        browser.close()
    for e in errors[:10]:
        print("page error:", e[:300])
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
