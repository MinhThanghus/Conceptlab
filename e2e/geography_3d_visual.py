"""Render the Earth and water-cycle lessons using Chromium WebGL (SwiftShader).

Run: python e2e/geography_3d_visual.py --base http://127.0.0.1:5300
This reads the public lesson only and saves screenshots under .build-check.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / '.build-check' / 'geography-3d-visual'


def render(browser, base, width, height, fallback=False):
    context = browser.new_context(viewport={'width': width, 'height': height})
    context.add_init_script("localStorage.setItem('cl.lang', 'vi')")
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
    page.goto(f'{base}/learn/geography', wait_until='networkidle')
    water = page.locator('.water-cycle')
    water.wait_for(state='visible')
    if fallback:
        water.locator('.water-cycle-fallback svg').wait_for(state='visible')
        water.locator('.water-cycle-options button').nth(4).click()
        assert 'nước ngầm' in water.locator('.water-cycle-detail').inner_text()
        water.screenshot(path=str(OUT / f'water-{width}-fallback.png'), animations='disabled')
    else:
        globe = page.locator('.geo-globe')
        canvas = globe.locator('canvas')
        canvas.wait_for(state='visible')
        page.wait_for_load_state('networkidle')
        renderer = canvas.evaluate("""canvas => { const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
          const ext=gl && gl.getExtension('WEBGL_debug_renderer_info');
          return gl && (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); }""")
        assert renderer, 'No WebGL renderer'
        noon = globe.screenshot(path=str(OUT / f'earth-{width}-noon.png'), animations='disabled')
        page.locator('#geo-hour').focus()
        page.keyboard.press('Home')
        page.wait_for_timeout(200)
        midnight = globe.screenshot(path=str(OUT / f'earth-{width}-midnight.png'), animations='disabled')
        assert noon != midnight, 'Changing local solar time did not change the globe'
        page.locator('#geo-hour').focus()
        page.keyboard.press('End')
        page.locator('#geo-location').select_option('london')
        page.wait_for_timeout(200)
        globe.screenshot(path=str(OUT / f'earth-{width}-london.png'), animations='disabled')
        wcanvas = water.locator('.water-cycle-host canvas')
        wcanvas.wait_for(state='visible')
        rain = water.locator('.water-cycle-options button').nth(2)
        rain.click()
        assert rain.get_attribute('aria-pressed') == 'true'
        stage = water.locator('.water-cycle-stage')
        initial = stage.screenshot(path=str(OUT / f'water-{width}-rain.png'), animations='disabled')
        water.locator('.water-cycle-controls button').nth(1).click()
        page.wait_for_timeout(200)
        rotated = stage.screenshot(path=str(OUT / f'water-{width}-rotated.png'), animations='disabled')
        assert initial != rotated, 'Rotating the water-cycle model did not change the image'
        print(f'{width}px: WebGL renderer {renderer}')
    dimensions = page.evaluate("() => ({width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth})")
    assert dimensions['scroll'] <= dimensions['width'] + 1, f'Horizontal overflow: {dimensions}'
    assert not errors, f'Browser errors: {errors}'
    context.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:5300')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        try:
            render(browser, args.base, 1440, 900)
            render(browser, args.base, 375, 812)
            render(browser, args.base, 375, 812, fallback=True)
        finally:
            browser.close()


if __name__ == '__main__':
    main()
