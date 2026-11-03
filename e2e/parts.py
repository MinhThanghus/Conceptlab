"""Screenshot every part (block) of the demo labs as a learner sees it.

    python e2e/parts.py --base http://127.0.0.1:5190 --lang vi --codes VBPASS ATTN24
Outputs e2e/output/parts/<lang>_<code>_<n>_<type>.png and prints console errors.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent / "output" / "parts"
ALL = ["TPEND6", "VBPASS", "ATTN24", "PARAB3", "HEART8", "WATER6", "SWAP42", "SAVE25", "JUMP45"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:5190")
    ap.add_argument("--lang", default="vi")
    ap.add_argument("--width", type=int, default=1366)
    ap.add_argument("--codes", nargs="*", default=ALL)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": args.width, "height": 900})
        ctx.add_init_script(f"try {{ localStorage.setItem('cl.lang', '{args.lang}') }} catch (e) {{}}")
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(f"{m.type}: {m.text[:200]}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {str(e)[:200]}"))
        for code in args.codes:
            page.goto(f"{args.base}/s/{code}", wait_until="networkidle")
            page.wait_for_timeout(800)
            items = page.locator(".xp-outline-item")
            count = items.count()
            for i in range(count):
                items.nth(i).click()
                page.wait_for_timeout(1500)
                stage = page.locator("[data-block-id]").first
                btype = stage.get_attribute("data-block-type") if stage.count() else "none"
                target = stage if stage.count() else page
                target.screenshot(path=str(OUT / f"{args.lang}_{code}_{i + 1}_{btype}.png"))
            print(f"{code}: {count} parts")
        for e in errors:
            print("  ", e)
        browser.close()


if __name__ == "__main__":
    main()
