"""Review the semiconductor component with real Chromium WebGL or its 2D fallback.

Run: python e2e/semiconductor_3d_visual.py --base http://127.0.0.1:5300
By default a unique, self-removing Vite harness is used; pass --public-route once
the catalog route is available. No lesson or learner data is changed.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import uuid

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '.build-check' / 'semiconductor-3d-visual'
HTML = '''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:12px;font:16px system-ui"><div id="root" style="max-width:950px;margin:auto"></div>
<script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client';
import {I18nProvider} from '/src/i18n/index.jsx';
import SemiconductorExplorer from '/src/features/semiconductors/SemiconductorExplorer.jsx';
createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(SemiconductorExplorer)));
</script></body></html>'''


def render(browser, url, width, height, lang='en', fallback=False):
    context = browser.new_context(viewport={'width': width, 'height': height})
    context.add_init_script(f"localStorage.setItem('cl.lang', '{lang}')")
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
    page.goto(url, wait_until='networkidle')
    component = page.locator('.semiconductor')
    component.wait_for(state='visible')
    stage = component.locator('.semiconductor-stage')
    modes = component.locator('.semiconductor-modes button')
    if fallback:
        component.locator('.semiconductor-fallback svg').wait_for(state='visible')
    else:
        canvas = component.locator('.semiconductor-host canvas')
        canvas.wait_for(state='visible', timeout=20000)
        renderer = canvas.evaluate("""canvas => { const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
          const ext=gl && gl.getExtension('WEBGL_debug_renderer_info'); return gl && (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); }""")
        assert renderer, 'No WebGL renderer'
        print(f'{width}px {lang}: {renderer}')
    before = stage.screenshot(path=str(OUT / f'device-{width}-{lang}-off{"-fallback" if fallback else ""}.png'), animations='disabled')
    component.get_by_role('group', name='Gate signal' if lang == 'en' else 'Tín hiệu cổng').locator('button').nth(1).click()
    page.wait_for_timeout(180)
    after = stage.screenshot(path=str(OUT / f'device-{width}-{lang}-on{"-fallback" if fallback else ""}.png'), animations='disabled')
    assert before != after, 'Gate control did not change the device diagram'

    geometries = component.get_by_role('group', name='Device geometry' if lang == 'en' else 'Cấu trúc thiết bị').locator('button')
    geometries.nth(1).click()
    page.wait_for_timeout(180)
    sheets = stage.screenshot(path=str(OUT / f'nanosheet-{width}-{lang}{"-fallback" if fallback else ""}.png'), animations='disabled')
    geometries.nth(2).click()
    page.wait_for_timeout(180)
    wire = stage.screenshot(path=str(OUT / f'nanowire-{width}-{lang}{"-fallback" if fallback else ""}.png'), animations='disabled')
    assert sheets != wire, 'Geometry selection did not change the scene'
    modes.nth(1).click()
    if not fallback:
        component.locator('.semiconductor-host canvas').wait_for(state='visible', timeout=20000)
    prediction = component.locator('.semiconductor-predict .semiconductor-input').nth(1)
    prediction.locator('button').nth(1).click()
    prediction.locator('button').nth(2).click()
    result = component.locator('.semiconductor-predict [role=status]').inner_text()
    assert ('Correct' in result if lang == 'en' else 'Đúng' in result), result
    p_high = stage.screenshot(path=str(OUT / f'cmos-{width}-{lang}-input0{"-fallback" if fallback else ""}.png'), animations='disabled')
    component.locator('.semiconductor-predict .semiconductor-input').first.locator('button').nth(1).click()
    prediction.locator('button').first.click()
    prediction.locator('button').nth(2).click()
    page.wait_for_timeout(180)
    n_high = stage.screenshot(path=str(OUT / f'cmos-{width}-{lang}-input1{"-fallback" if fallback else ""}.png'), animations='disabled')
    assert p_high != n_high, 'Complementary conducting paths did not change'

    modes.nth(2).click()
    if not fallback:
        component.locator('.semiconductor-host canvas').wait_for(state='visible', timeout=20000)
    initial = stage.screenshot(path=str(OUT / f'stack-{width}-{lang}-initial{"-fallback" if fallback else ""}.png'), animations='disabled')
    component.locator('.semiconductor-slider input').focus()
    page.keyboard.press('End')
    page.wait_for_timeout(180)
    expanded = stage.screenshot(path=str(OUT / f'stack-{width}-{lang}-expanded{"-fallback" if fallback else ""}.png'), animations='disabled')
    assert initial != expanded, 'The layer separation control did not change the model'
    if not fallback:
        component.locator('.semiconductor-view-controls button').nth(1).click()
        page.wait_for_timeout(180)
        rotated = stage.screenshot(path=str(OUT / f'stack-{width}-{lang}-rotated.png'), animations='disabled')
        assert rotated != expanded, 'Rotation did not change the rendered scene'
    modes.nth(3).click()
    if not fallback:
        component.locator('.semiconductor-host canvas').wait_for(state='visible', timeout=20000)
    memory = component.get_by_role('group', name='Memory operations' if lang == 'en' else 'Thao tác bộ nhớ')
    memory.locator('button').nth(0).click()
    page.wait_for_timeout(180)
    low = stage.screenshot(path=str(OUT / f'memristor-{width}-{lang}-low{"-fallback" if fallback else ""}.png'), animations='disabled')
    memory.locator('button').nth(1).click()
    assert ('Low resistance' if lang == 'en' else 'Điện trở thấp') in component.locator('.semiconductor-explain').inner_text()
    memory.locator('button').nth(2).click()
    page.wait_for_timeout(180)
    high = stage.screenshot(path=str(OUT / f'memristor-{width}-{lang}-high{"-fallback" if fallback else ""}.png'), animations='disabled')
    assert low != high, 'SET and RESET did not change the memory diagram'
    memory.locator('button').nth(1).click()
    assert ('High resistance' if lang == 'en' else 'Điện trở cao') in component.locator('.semiconductor-explain').inner_text()
    dims = page.evaluate('() => ({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth})')
    assert dims['s'] <= dims['w'] + 1, f'Horizontal overflow: {dims}'
    assert not errors, f'Browser errors: {errors}'
    context.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:5300')
    parser.add_argument('--public-route', action='store_true')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    name = f'__semiconductor_visual_{uuid.uuid4().hex}.html'
    path = ROOT / 'frontend' / name
    if args.public_route:
        url = f'{args.base}/learn/3d?model=semiconductor_chip'
    else:
        path.write_text(HTML, encoding='utf-8')
        url = f'{args.base}/{name}'
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            try:
                render(browser, url, 1440, 900)
                render(browser, url, 375, 812)
                render(browser, url, 375, 812, 'vi')
                render(browser, url, 375, 812, 'en', fallback=True)
            finally:
                browser.close()
    finally:
        if not args.public_route and path.is_file() and path.read_text(encoding='utf-8') == HTML:
            path.unlink()


if __name__ == '__main__':
    main()
