"""Read-only browser integration check for the final grouped learner deck."""
import json
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

out = Path('.build-check/deck-integration')
out.mkdir(parents=True, exist_ok=True)
lab = json.load(urlopen('http://127.0.0.1:5300/api/share/CHNWRE?lang=en'))
flow = next(block for block in lab['spec']['blocks'] if block['type'] == 'flow')
nodes = flow['nodes']

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    try:
        for width in (1440, 375):
            page = browser.new_page(viewport={'width': width, 'height': 900 if width == 1440 else 812})
            page.add_init_script("localStorage.setItem('cl.lang','en'); localStorage.setItem('cl.explorer.view',JSON.stringify('all'))")
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
            page.goto('http://127.0.0.1:5300/s/CHNWRE', wait_until='networkidle')
            if not page.locator('.lesson-deck').count():
                page.get_by_role('button', name='View as slides').click()
            deck = page.locator('.lesson-deck')
            assert deck.locator('.deck-paper').get_attribute('data-deck-kind') == 'intro'
            sources = deck.locator('.xp-lesson-sources')
            assert sources.count() == 1 and sources.locator('button').count() == len(lab['sources'])
            sources.locator('button').first.click()
            page.locator('.xp-side-close').click()

            def choose(*terms):
                deck.get_by_role('button', name='Contents').click()
                button = page.get_by_role('dialog').locator('.deck-contents button')
                for term in terms:
                    button = button.filter(has_text=term)
                button.click()

            choose('Step 1:', nodes[0]['label'])
            answer = deck.get_by_role('textbox', name='Your answer')
            answer.fill('Prediction kept in memory')
            deck.get_by_role('button', name='Previous').click()
            deck.get_by_role('button', name='Next').click()
            assert answer.input_value() == 'Prediction kept in memory'
            choose(nodes[0]['label'], nodes[1]['label'])
            group = deck.locator('.flow-group')
            group.wait_for(state='visible')
            assert group.locator('.flow-group-nodes li').count() == 4
            for node in nodes:
                assert node['description'] in group.inner_text(), node['id']
            buttons = group.locator('.flow-group-nodes button')
            buttons.nth(1).click()
            assert buttons.nth(1).get_attribute('aria-pressed') == 'true'
            assert group.locator('.src-refs').count() == 0
            assert deck.locator('.xp-lesson-sources:visible').count() == 0
            deck.screenshot(path=str(out / f'group-{width}-en.png'))
            dims = page.evaluate('() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]')
            assert dims[1] <= dims[0] + 1, (width, dims)
            assert not errors, (width, errors)
            print('PASS deck', width, 'en', flush=True)
            page.close()
    finally:
        browser.close()
