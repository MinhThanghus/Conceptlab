"""Check illustrated reading steps, consolidated sources and prepared locales."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

OUT = Path('.build-check/flow-reading')
OUT.mkdir(parents=True, exist_ok=True)
reports = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, lang in [(1440, 'vi'), (375, 'vi'), (1440, 'en'), (375, 'en')]:
        context = browser.new_context(viewport={'width': width, 'height': 900})
        context.add_init_script(f"localStorage.setItem('cl.lang', '{lang}')")
        page = context.new_page()
        errors, translate_calls = [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: translate_calls.append(r.url) if r.method == 'POST' and '/translate' in r.url else None)
        page.goto('http://127.0.0.1:5300/s/CHNWRE', wait_until='networkidle')
        page.locator('.xp-lesson-sources').wait_for()
        assert page.locator('.xp-lesson-sources').count() == 1
        # Learners now start in the slide layout; this regression exercises the
        # optional continuous reading view and its existing interactions.
        page.get_by_role('button', name='Reading view' if lang == 'en' else 'Dạng đọc', exact=True).click()
        # Show every part, avoiding coupling to translated table-of-contents titles.
        options = page.locator('.xp-options-toggle')
        if options.is_visible() and options.get_attribute('aria-expanded') == 'false':
            options.click()
        page.get_by_role('radio', name='All parts' if lang == 'en' else 'Tất cả', exact=True).click()
        flow = page.locator('[data-block-type="flow"]')
        flow.wait_for()
        assert flow.locator('.flow-illustration').count() == 1
        for i in range(4):
            flow.locator('.flow-step-button').nth(i).click()
            assert flow.locator('.flow-step-button[aria-pressed="true"]').count() == 1
            assert flow.locator('.flow-illustration').count() == 1
            assert flow.locator('.src-refs,.blk-sources').count() == 0
            if i == 1:
                flow.screenshot(path=str(OUT / f'flow-{width}-{lang}.png'))
        assert page.locator('.blk .src-refs,.blk .blk-sources').count() == 0
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        assert not translate_calls, translate_calls
        assert not errors, errors
        reports.append({'width': width, 'language': lang, 'translation_posts': len(translate_calls), 'errors': errors})
        context.close()
    browser.close()
(OUT / 'report.json').write_text(json.dumps(reports, indent=2), encoding='utf-8')
print(json.dumps(reports))
