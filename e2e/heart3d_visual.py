"""Exercise the public HEART8 visual in Chromium with 3D and 2D fallback.

Run: python e2e/heart3d_visual.py --base http://127.0.0.1:5300
Screenshots are written to .build-check/heart3d-visual; no account is required.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / '.build-check' / 'heart3d-visual'


def run_case(browser, base: str, width: int, height: int, language: str, fallback: bool = False):
    context = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=1)
    context.add_init_script(f"localStorage.setItem('cl.lang', '{language}')")
    if fallback:
        context.add_init_script("""(() => {
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
                if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') return null;
                return original.call(this, kind, ...args);
            };
        })();""")
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.goto(f'{base}/s/HEART8', wait_until='networkidle')
    outline = page.locator('.xp-outline-toggle')
    if outline.is_visible() and outline.get_attribute('aria-expanded') != 'true':
        outline.click()
    page.locator('.xp-outline-item').nth(3).click()
    block = page.locator('[data-block-id="b4"]')
    block.wait_for(state='visible')
    stage = block.locator('.anatomical-heart-stage')
    if fallback:
        block.locator('.anatomical-heart-placeholder').wait_for(state='visible')
        block.locator('.circulation3d-switch button').nth(1).click()
        stage = block.locator('.circulation3d-stage')
        block.locator('.circulation3d-fallback svg').wait_for(state='visible')
        mode = 'fallback'
        renderer = '2D fallback'
    else:
        canvas = stage.locator('canvas')
        canvas.wait_for(state='visible', timeout=12000)
        mode = 'webgl'
        renderer = canvas.evaluate("""canvas => {
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          if (!gl) return null;
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        }""")
        assert renderer, 'Canvas did not expose a WebGL renderer'
    choice = (block.locator('.circulation3d-controls button[aria-pressed]').nth(2) if fallback
              else block.locator('.anatomical-heart-parts button[aria-pressed]').nth(1))
    choice.click()
    assert choice.get_attribute('aria-pressed') == 'true'
    assert (block.locator('.circulation3d-detail').inner_text().strip() if fallback
            else block.locator('.anatomical-heart-description').inner_text().strip())
    if not fallback:
        cavity_image = stage.screenshot(path=str(OUT / f'heart8-{language}-{width}-cavities.png'), animations='disabled')
        vessel_button = block.locator('.anatomical-heart-parts button').nth(2)
        vessel_button.click()
        assert vessel_button.get_attribute('aria-pressed') == 'true'
        vessel_image = stage.screenshot(path=str(OUT / f'heart8-{language}-{width}-vessels.png'), animations='disabled')
        assert cavity_image != vessel_image, 'Switching between cavities and vessels did not change the scene'
        block.locator('.anatomical-heart-parts button').first.click()
    layout = page.evaluate("""() => ({width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth})""")
    assert layout['scroll'] <= layout['width'] + 1, f'Horizontal overflow: {layout}'
    assert not errors, f'JavaScript errors: {errors}'
    path = OUT / f'heart8-{language}-{width}-{mode}.png'
    block.screenshot(path=str(path), animations='disabled')
    stage_path = OUT / f'heart8-{language}-{width}-{mode}-stage.png'
    initial = stage.screenshot(path=str(stage_path), animations='disabled')
    if not fallback:
        block.locator('.anatomical-heart-controls button').nth(1).click()
        rotated_path = OUT / f'heart8-{language}-{width}-{mode}-rotated.png'
        rotated = stage.screenshot(path=str(rotated_path), animations='disabled')
        assert initial != rotated, 'Rotating the 3D model did not change the rendered scene'
    assert not errors, f'JavaScript errors: {errors}'
    print(f'{language} {width}px {mode}: {renderer}; screenshots: {path}, {stage_path}')
    context.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:5300')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        try:
            run_case(browser, args.base, 1440, 900, 'vi')
            run_case(browser, args.base, 375, 812, 'vi')
            run_case(browser, args.base, 1440, 900, 'en')
            run_case(browser, args.base, 375, 812, 'vi', fallback=True)
        finally:
            browser.close()


if __name__ == '__main__':
    main()
