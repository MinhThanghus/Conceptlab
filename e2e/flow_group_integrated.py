"""Read-only visual, locale and completeness QA for the grouped research flow."""
import json
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

out = Path('.build-check/flow-group-integrated')
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    try:
        for width, height, lang in [(1690, 900, 'en'), (1366, 768, 'en'), (1366, 768, 'vi'), (375, 812, 'en'), (375, 812, 'vi')]:
            lab = json.load(urlopen(f'http://127.0.0.1:5300/api/share/CHMSTE?lang={lang}'))
            flow = next(block for block in lab['spec']['blocks'] if block['type'] == 'flow')
            nodes = flow['nodes']
            page = browser.new_page(viewport={'width': width, 'height': height})
            page.add_init_script(f"localStorage.setItem('cl.lang','{lang}')")
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
            page.goto('http://127.0.0.1:5300/s/CHMSTE', wait_until='networkidle')
            if not page.locator('.lesson-deck').count():
                page.get_by_role('button', name='View as slides' if lang == 'en' else 'Xem dạng trình chiếu').click()
            deck = page.locator('.lesson-deck')
            deck.get_by_role('button', name='Contents' if lang == 'en' else 'Mục lục').click()
            page.get_by_role('dialog').locator('.deck-contents button').filter(has_text=nodes[0]['label']).filter(has_text=nodes[1]['label']).click()
            group = deck.locator('.flow-group')
            group.wait_for(state='visible')
            page.wait_for_timeout(200)
            assert group.locator('.flow-group-nodes li').count() == 4
            for node in nodes:
                assert node['description'] in group.inner_text(), (lang, node['id'])
            image = group.locator('.flow-group-topic img')
            assert image.count() == 1 and image.evaluate('(x)=>x.complete && x.naturalWidth>0')
            metrics = group.evaluate('(e)=>({client:e.clientHeight,scroll:e.scrollHeight})')
            if width > 700:
                assert metrics['scroll'] <= metrics['client'] + 2, (width, lang, metrics)
            deck.screenshot(path=str(out / f'CHMSTE-{width}-{lang}.png'))
            if width <= 700:
                group.locator('.flow-group-nodes li').last.scroll_into_view_if_needed()
                assert group.locator('.flow-group-nodes li').last.is_visible()
            group.locator('.flow-group-nodes button').nth(2).click()
            assert group.locator('.flow-group-nodes button').nth(2).get_attribute('aria-pressed') == 'true'
            dim = page.evaluate('() => [document.documentElement.clientWidth,document.documentElement.scrollWidth]')
            assert dim[1] <= dim[0] + 1, (width, lang, dim)
            assert not errors, (width, lang, errors)
            print('PASS flow group', width, lang, metrics, flush=True)
            page.close()
    finally:
        browser.close()
