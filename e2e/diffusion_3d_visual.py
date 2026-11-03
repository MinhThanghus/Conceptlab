"""Check the public DDPM teaching view on Chromium WebGL and the 2D fallback."""
from __future__ import annotations

import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '.build-check' / 'diffusion-3d-visual'


def render(browser, base, width, height, fallback=False):
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
    page.goto(f'{base}/learn/3d?model=diffusion_process', wait_until='networkidle')
    component = page.locator('.diffusion-explorer')
    component.wait_for(state='visible')
    if fallback:
        assert page.get_by_text('WebGL is unavailable', exact=False).is_visible()
        component.locator('.diffusion-panels').screenshot(path=str(OUT / f'ddpm-{width}-fallback.png'))
    else:
        canvas = component.locator('.vision-relief canvas')
        canvas.wait_for(state='visible', timeout=20000)
        renderer = canvas.evaluate("""canvas => { const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
          const ext=gl && gl.getExtension('WEBGL_debug_renderer_info'); return gl && (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); }""")
        assert renderer, 'No WebGL renderer'
        component.locator('.diffusion-panels').screenshot(path=str(OUT / f'ddpm-{width}-panels.png'))
        stage = component.locator('.vision-relief')
        initial = stage.screenshot(path=str(OUT / f'ddpm-{width}-initial.png'), animations='disabled')
        slider = page.get_by_label('Cumulative signal', exact=False)
        slider.focus()
        page.keyboard.press('End')
        page.wait_for_timeout(200)
        original = stage.screenshot(path=str(OUT / f'ddpm-{width}-original.png'), animations='disabled')
        assert initial != original, 'Changing ᾱ did not change the displayed 3D field'
        rows = component.locator('.diffusion-values > div')
        assert rows.nth(0).locator('strong').inner_text() == rows.nth(2).locator('strong').inner_text(), 'ᾱ=1 should return x₀'
        slider.focus()
        page.keyboard.press('Home')
        page.wait_for_timeout(200)
        noisy = stage.screenshot(path=str(OUT / f'ddpm-{width}-noise.png'), animations='disabled')
        assert original != noisy, 'ᾱ endpoints rendered identically'
        assert rows.nth(1).locator('strong').inner_text() == rows.nth(2).locator('strong').inner_text(), 'ᾱ=0 should return ε'
        page.get_by_role('button', name='Draw new noise').click()
        page.wait_for_timeout(200)
        changed = stage.screenshot(path=str(OUT / f'ddpm-{width}-new-noise.png'), animations='disabled')
        assert changed != noisy, 'Changing the noise seed did not change the 3D field'
        print(width, renderer)
    dimensions = page.evaluate('() => ({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth})')
    assert dimensions['s'] <= dimensions['w'] + 1, f'Horizontal overflow: {dimensions}'
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
