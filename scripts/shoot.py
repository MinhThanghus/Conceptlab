"""Screenshot ConceptLab routes for a visual review (Playwright, Chromium).

    python scripts/shoot.py <out_dir> <base> [route ...] [--lang vi|en] [--width 1440] [--height 900]
                            [--full] [--login email:password] [--wait 2.5]

Example: python scripts/shoot.py .build-check/shots http://127.0.0.1:5190 / /gallery /s/TPEND6 --width 375
In Git Bash, prefix with MSYS_NO_PATHCONV=1 so "/" routes are not rewritten into Windows paths.
"""
import argparse
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

p = argparse.ArgumentParser()
p.add_argument("out")
p.add_argument("base")
p.add_argument("routes", nargs="*")
p.add_argument("--lang", default="vi")
p.add_argument("--width", type=int, default=1440)
p.add_argument("--height", type=int, default=900)
p.add_argument("--full", action="store_true")
p.add_argument("--login", default="")
p.add_argument("--wait", type=float, default=2.5)
a = p.parse_args()

out = Path(a.out)
out.mkdir(parents=True, exist_ok=True)
routes = a.routes or ["/"]

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={"width": a.width, "height": a.height}, locale="vi-VN" if a.lang == "vi" else "en-US")
    ctx.add_init_script(f"try{{localStorage.setItem('cl.lang','{a.lang}')}}catch(e){{}}")
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    if a.login:
        email, pw_ = a.login.split(":", 1)
        page.goto(a.base + "/login")
        page.wait_for_load_state("networkidle")
        page.fill("input[type=email]", email)
        page.fill("input[type=password]", pw_)
        page.keyboard.press("Enter")
        page.wait_for_timeout(2500)
    # A signed-in account's saved language wins over localStorage: switch it with the header's
    # VI/EN control for the shots, and put it back at the end so the account is left as found.
    original_lang = None
    if a.login:
        current = page.locator("[role=radiogroup] button[role=radio][aria-checked=true][lang]").first
        if current.count():
            original_lang = current.get_attribute("lang")
            if original_lang != a.lang:
                page.locator(f"[role=radiogroup] button[role=radio][lang={a.lang}]").first.click()
                page.wait_for_timeout(800)
    for r in routes:
        name = r.strip("/").replace("/", "_").replace("?", "_").replace("=", "-") or "home"
        page.goto(a.base + r)
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        time.sleep(a.wait)
        f = out / f"{name}-{a.lang}-{a.width}.png"
        page.screenshot(path=str(f), full_page=a.full)
        print(f)
    if original_lang and original_lang != a.lang:
        page.locator(f"[role=radiogroup] button[role=radio][lang={original_lang}]").first.click()
        page.wait_for_timeout(800)
    if errors:
        print("console errors:", *errors[:10], sep="\n  ", file=sys.stderr)
    browser.close()
