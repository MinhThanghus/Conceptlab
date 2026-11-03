"""Read-only browser checks for the visual catalogue and upgraded public demos.

Requires a running dev stack; uses Chromium software WebGL. No login or lab writes.
"""
import argparse
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.build-check' / 'guided-visuals-final'
CATALOG = json.loads((ROOT / 'shared' / 'visual_catalog.json').read_text(encoding='utf-8'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:5300')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    report = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for width, language in [(1440, 'en'), (375, 'vi')]:
            context = browser.new_context(viewport={'width': width, 'height': 900}, device_scale_factor=1)
            context.add_init_script(f"localStorage.setItem('cl.lang', '{language}')")
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(args.base + '/learn/3d', wait_until='networkidle')
            page.locator('.visual-model-card').last.wait_for()
            assert page.locator('.visual-model-card').count() == len(CATALOG)
            assert page.locator('.visual-model-card img').evaluate_all('(imgs) => imgs.every(i => i.complete && i.naturalWidth > 0)')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            page.screenshot(path=str(OUT / f'catalog-{width}-{language}.png'), full_page=True)
            report.append({'page': 'catalog', 'width': width, 'language': language, 'images': len(CATALOG), 'ok': True})
            for code in ['WATER6', 'RNBYA2', 'RNDFFA', 'RNUAVA', 'RNSPVA']:
                # Research demos are authored in English. Avoid paid translation in a
                # read-only smoke test; check Vietnamese with the native WATER6 demo.
                if language == 'vi' and code != 'WATER6':
                    continue
                response = context.request.get(args.base + '/api/share/' + code)
                assert response.status == 200, code
                spec = response.json()['spec']
                idx = next(i for i, block in enumerate(spec['blocks']) if block['id'] == 'guided_visual')
                page.goto(args.base + '/s/' + code, wait_until='networkidle')
                toggle = page.locator('.xp-outline-toggle')
                if toggle.is_visible() and toggle.get_attribute('aria-expanded') != 'true':
                    toggle.click()
                page.locator('.xp-outline-item').nth(idx).click()
                block = page.locator('[data-block-id="guided_visual"]')
                block.locator('canvas').first.wait_for(state='visible', timeout=20000)
                block.scroll_into_view_if_needed()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), code
                assert not errors, errors
                block.screenshot(path=str(OUT / f'{code}-{width}-{language}.png'))
                report.append({'page': code, 'width': width, 'language': language, 'kind': spec['blocks'][idx]['visual3d'], 'webgl': True, 'ok': True})
            context.close()
        browser.close()
    (OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'{len(report)} public catalogue/demo checks passed; screenshots in {OUT}')


if __name__ == '__main__':
    main()
