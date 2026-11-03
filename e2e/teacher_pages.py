"""Screenshot the teacher-side lab pages (studio steps) for a lab cloned from a demo.

    python e2e/teacher_pages.py --base http://127.0.0.1:5190 --demo TPEND6 --lang vi
"""

from __future__ import annotations

import argparse
import secrets
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent / "output" / "teacher"
STEPS = ["sources", "analyze", "review", "build", "preview", "publish", "results"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:5190")
    ap.add_argument("--demo", default="TPEND6")
    ap.add_argument("--lang", default="vi")
    ap.add_argument("--width", type=int, default=1366)
    ap.add_argument("--steps", nargs="*", default=STEPS)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": args.width, "height": 900})
        ctx.add_init_script(f"try {{ localStorage.setItem('cl.lang', '{args.lang}') }} catch (e) {{}}")
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {str(e)[:200]}"))
        page.goto(args.base + "/", wait_until="networkidle")
        email = f"teacher-{secrets.token_hex(3)}@example.com"
        me = page.evaluate(
            """async ([email]) => {
              const r = await fetch('/api/auth/register', {method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({email, password: 'pw-' + Math.random().toString(36).slice(2) + 'Xy9', name: 'Thầy Minh', role: 'teacher', locale: 'vi'})})
              return r.json()
            }""",
            [email],
        )
        csrf = me["csrf_token"]
        lab = page.evaluate(
            """async ([code, csrf]) => {
              const r = await fetch(`/api/share/${code}/clone`, {method: 'POST', headers: {'X-CSRF-Token': csrf}})
              return r.json()
            }""",
            [args.demo, csrf],
        )
        lab_id = lab["id"]
        print("lab", lab_id, lab.get("title"))
        for step in args.steps:
            page.goto(f"{args.base}/app/labs/{lab_id}/{step}", wait_until="networkidle")
            page.wait_for_timeout(1800)
            page.screenshot(path=str(OUT / f"{args.lang}_{args.demo}_{step}.png"), full_page=True)
            print("shot", step)
        for e in errors:
            print("  console:", e)
        browser.close()


if __name__ == "__main__":
    main()
