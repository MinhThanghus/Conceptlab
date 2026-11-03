"""Exercise public engineering views without touching a database.

Run: python e2e/engineering_3d_visual.py --base http://127.0.0.1:5300
"""
from __future__ import annotations

import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '.build-check' / 'engineering-3d-visual'
def render(browser, base, kind, width, height, fallback=False):
    context = browser.new_context(viewport={'width': width, 'height': height})
    context.add_init_script("localStorage.setItem('cl.lang', 'en')")
    if fallback:
        context.add_init_script("""(() => { const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
            if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) return null;
            return original.call(this, kind, ...args);
          }; })();""")
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    page.goto(f'{base}/learn/3d?model={kind}', wait_until='networkidle')
    stage = page.locator('.engineering3d-stage')
    if fallback:
        page.locator('.engineering3d-fallback svg').wait_for(state='visible')
        assert page.get_by_text('A 2D diagram is shown', exact=False).is_visible()
    else:
        canvas = page.locator('.engineering3d-host canvas')
        canvas.wait_for(state='visible', timeout=20000)
        renderer = canvas.evaluate("""canvas => { const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
          const ext=gl && gl.getExtension('WEBGL_debug_renderer_info'); return gl && (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); }""")
        assert renderer, 'No WebGL renderer'
        initial = stage.screenshot(path=str(OUT / f'{kind}-{width}-initial.png'), animations='disabled')
        if kind == 'quadrotor':
            page.get_by_label('Tilt angle', exact=False).focus()
            page.keyboard.press('End')
        else:
            page.get_by_role('checkbox', name='Show illustrative crack').check()
            page.get_by_label('Separate layers', exact=False).focus()
            page.keyboard.press('End')
        page.wait_for_timeout(200)
        changed = stage.screenshot(path=str(OUT / f'{kind}-{width}-changed.png'), animations='disabled')
        assert initial != changed, f'Changing {kind} parameters did not change the rendered scene'
        page.get_by_role('button', name='Rotate right').click()
        page.wait_for_timeout(200)
        rotated = stage.screenshot(path=str(OUT / f'{kind}-{width}-rotated.png'), animations='disabled')
        assert changed != rotated, f'Rotating {kind} did not change the rendered scene'
        print(kind, width, renderer)
    dims = page.evaluate('() => ({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth})')
    assert dims['s'] <= dims['w'] + 1, f'Horizontal overflow: {dims}'
    assert not errors, f'Browser errors: {errors}'
    if fallback:
        stage.screenshot(path=str(OUT / f'{kind}-{width}-fallback.png'), animations='disabled')
    context.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:5300')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        try:
            for kind in ('quadrotor', 'solar_cell'):
                render(browser, args.base, kind, 1440, 900)
                render(browser, args.base, kind, 375, 812)
                render(browser, args.base, kind, 375, 812, fallback=True)
        finally:
            browser.close()


if __name__ == '__main__':
    main()
