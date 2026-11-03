"""Browser smoke test for ConceptLab AI (Playwright, Python).

Visits every public route and every demo lab in Vietnamese AND English, at phone and
desktop sizes, and fails on: console errors, failed API requests (5xx), untranslated
keys (rendered as ⟦key⟧ or collected in window.__CL_I18N_MISSING__), horizontal page
overflow. Screenshots go to e2e/output/.

    python e2e/smoke.py --base http://localhost:5173
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent / "output"
DEMO_CODES = ["TPEND6", "VBPASS", "ATTN24", "PARAB3", "HEART8", "WATER6", "SWAP42", "SAVE25", "JUMP45"]
PUBLIC_ROUTES = ["/", "/gallery", "/gallery?space=school2lab", "/gallery?space=paper2explorer", "/join", "/guide", "/login", "/register", "/this-page-does-not-exist"]
VIEWPORTS = {"mobile": {"width": 375, "height": 812}, "desktop": {"width": 1366, "height": 900}}
IGNORED_CONSOLE = [re.compile(p) for p in [r"Download the React DevTools", r"\[vite\]", r"favicon"]]


def slug(path: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "_", path).strip("_") or "home"


def check_page(page, url: str, label: str, problems: list[str]) -> None:
    console_errors: list[str] = []
    failed: list[str] = []

    def on_console(msg):
        if msg.type == "error" and not any(p.search(msg.text) for p in IGNORED_CONSOLE):
            console_errors.append(msg.text[:300])

    def on_response(resp):
        if "/api/" in resp.url and resp.status >= 500:
            failed.append(f"{resp.status} {resp.url}")

    page.on("console", on_console)
    page.on("response", on_response)
    page.goto(url, wait_until="networkidle")
    page.wait_for_timeout(600)
    text = page.inner_text("body")
    if "⟦" in text:
        keys = sorted(set(re.findall(r"⟦([^⟧]+)⟧", text)))
        problems.append(f"[{label}] untranslated keys: {keys[:12]}")
    missing = page.evaluate("() => window.__CL_I18N_MISSING__ || []")
    if missing:
        problems.append(f"[{label}] i18n missing at runtime: {missing[:12]}")
    overflow = page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
    if overflow > 2:
        problems.append(f"[{label}] horizontal overflow {overflow}px")
    for err in console_errors:
        problems.append(f"[{label}] console error: {err}")
    for err in failed:
        problems.append(f"[{label}] server error: {err}")
    page.remove_listener("console", on_console)
    page.remove_listener("response", on_response)


def run(base: str, only_public: bool) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    problems: list[str] = []
    started = time.time()
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for lang in ("vi", "en"):
            for vp_name, vp in VIEWPORTS.items():
                context = browser.new_context(viewport=vp, locale="vi-VN" if lang == "vi" else "en-US")
                context.add_init_script(f"try {{ localStorage.setItem('cl.lang', '{lang}') }} catch (e) {{}}")
                page = context.new_page()
                routes = PUBLIC_ROUTES + ([] if only_public else [f"/s/{code}" for code in DEMO_CODES])
                for route in routes:
                    label = f"{lang}/{vp_name}{route}"
                    try:
                        check_page(page, base + route, label, problems)
                        page.screenshot(path=str(OUT / f"{lang}_{vp_name}_{slug(route)}.png"), full_page=vp_name == "desktop")
                    except Exception as exc:  # keep going, report everything
                        problems.append(f"[{label}] exception: {exc}")
                context.close()
        browser.close()
    report = {"base": base, "seconds": round(time.time() - started, 1), "problems": problems}
    (OUT / "smoke_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"checked in {report['seconds']}s — {len(problems)} problem(s)")
    for p in problems:
        print(" -", p)
    return 1 if problems else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:5173")
    parser.add_argument("--only-public", action="store_true")
    args = parser.parse_args()
    sys.exit(run(args.base.rstrip("/"), args.only_public))
