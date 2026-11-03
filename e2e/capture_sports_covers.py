"""Real-Chromium check of the four sports labs' 3D courts (and VBPASS), on a desk and a phone.

    python e2e/capture_sports_covers.py [--base http://127.0.0.1:5173] [--out .build-check/sports-qa] [CODES ...]

For each lab at 1440 and 375px wide: open it as a learner, leave the lesson deck for the reading
view, open the field part, wait for the 3D court, press Focus on first player (the button then
offers Show whole court), Rotate field and Reset view, and check that the page never scrolls
sideways and logs no error. Saves a picture of each stage and report.json under --out.

The gallery covers of these labs are made by scripts/capture_shots.py (1280x720 WebP).
"""

import argparse
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
ap.add_argument("codes", nargs="*", default=["SPFTBA", "SPFUTS", "SPBASK", "SPBDMT", "VBPASS"])
ap.add_argument("--base", default="http://127.0.0.1:5173")
ap.add_argument("--out", default=str(ROOT / ".build-check" / "sports-qa"))
args = ap.parse_args()
output = Path(args.out)
output.mkdir(parents=True, exist_ok=True)
report = []
failed = False

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    for code in args.codes:
        for width in [1440, 375]:
            ctx = browser.new_context(viewport={"width": width, "height": 900})
            ctx.add_init_script("localStorage.setItem('cl.lang','en')")
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda err: errors.append(str(err)))
            row = {"code": code, "width": width}
            try:
                page.goto(f"{args.base}/s/{code}", wait_until="domcontentloaded", timeout=60000)
                # the learner view opens on the lesson deck; its reading view lists the parts
                page.get_by_role("button", name="Reading view").first.click(timeout=60000)
                items = page.locator(".xp-outline-item")
                items.first.wait_for(state="attached", timeout=30000)
                for i in range(items.count()):
                    toggle = page.locator(".xp-outline-toggle")
                    if not items.nth(i).is_visible() and toggle.count() and toggle.first.is_visible():
                        toggle.first.click()  # a phone keeps the contents folded
                    items.nth(i).click()
                    page.wait_for_timeout(800)
                    if page.locator('[data-block-type="field"]').count():
                        break
                scene = page.locator(".sports3d")
                scene.locator("canvas").wait_for(timeout=60000)
                focus = scene.get_by_role("button", name="Focus on first player")
                focus.click()
                page.wait_for_timeout(500)
                assert scene.get_by_role("button", name="Show whole court").get_attribute("aria-pressed") == "true"
                scene.get_by_role("button", name="Rotate field").click()
                page.wait_for_timeout(250)
                scene.get_by_role("button", name="Reset view").click()
                page.wait_for_timeout(250)
                stage = scene.locator(".sports3d-stage")
                stage.scroll_into_view_if_needed()
                page.wait_for_timeout(300)
                overflow = page.evaluate("document.documentElement.scrollWidth") > width
                assert not overflow, "the page scrolls sideways"
                assert not errors, errors
                stage.screenshot(path=str(output / f"{code}-{width}.png"))
                row.update(canvas=True, focus_rotate_reset=True, errors=errors, horizontal_overflow=overflow)
                print(code, width, "OK", flush=True)
            except Exception as exc:  # report every lab, then fail
                failed = True
                row.update(error=re.sub(r"\s+", " ", str(exc))[:300], errors=errors)
                print(code, width, "FAIL", row["error"], flush=True)
            report.append(row)
            ctx.close()
    browser.close()

(output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
raise SystemExit(1 if failed else 0)
