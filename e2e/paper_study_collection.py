"""Read-only smoke test of the public research collection and its ten lessons.

Uses the live public server and blocks every non-GET/HEAD request to avoid
creating quiz attempts or writing learner data. Run: python e2e/paper_study_collection.py
"""
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:5300'
OUT = Path('.build-check/paper-study-collection')
OUT.mkdir(exist_ok=True, parents=True)
papers = json.loads(Path('shared/paper_study_batch.json').read_text(encoding='utf-8'))


def no_writes(route):
    if route.request.method not in ('GET', 'HEAD', 'OPTIONS'):
        route.fulfill(status=204, body='')
    else:
        route.continue_()


def no_overflow(page, name):
    overflow = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    assert overflow <= 1, f'{name}: horizontal overflow {overflow}px'


def select_part(page, number):
    sidebar = page.locator('.xp-outline-item').nth(number - 1)
    sidebar.wait_for(state='visible', timeout=10000)
    sidebar.click()


with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    report = {'collection': [], 'lessons': []}
    for width, height, language in [(1440, 900, 'en'), (375, 812, 'vi')]:
        ctx = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
        ctx.add_init_script(f"localStorage.setItem('cl.lang', '{language}')")
        ctx.route('**/*', no_writes)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/learn/research', wait_until='domcontentloaded')
        page.locator('.research-paper-card').last.wait_for(timeout=15000)
        cards = page.locator('.research-paper-card')
        assert cards.count() == 10
        for i in range(cards.count()):
            card = cards.nth(i)
            card.scroll_into_view_if_needed()
            img = card.locator('img')
            img.wait_for(state='visible')
            page.wait_for_function('(img) => img.complete && img.naturalWidth > 0', arg=img.element_handle(), timeout=15000)
            hrefs = card.locator('a').evaluate_all('(links) => links.map(a => a.getAttribute("href"))')
            assert any(h and h.startswith('/s/') for h in hrefs), hrefs
            assert any(h and h.startswith('https://pmc.ncbi.nlm.nih.gov/articles/') for h in hrefs), hrefs
        no_overflow(page, f'collection {width}')
        page.evaluate('window.scrollTo(0, 0)')
        page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        page.screenshot(path=str(OUT / f'collection-{language}-{width}.png'), full_page=True)
        assert not errors, errors
        report['collection'].append({'width': width, 'language': language, 'cards': cards.count(), 'images_loaded': 10})
        print('collection', language, width, 'OK', flush=True)
        ctx.close()

    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
    ctx.add_init_script("localStorage.setItem('cl.lang', 'en')")
    ctx.route('**/*', no_writes)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    for paper in papers:
        code = paper['share_code']
        before = len(errors)
        page.goto(BASE + '/s/' + code, wait_until='domcontentloaded')
        page.get_by_role('heading', name=paper['title'], exact=True).wait_for(timeout=20000)
        assert page.locator(f'a[href="{paper["fulltext_url"]}"]').count() >= 1, f'{code} missing full-text link'
        assert page.locator(f'a[href="{paper["pdf_url"]}"]').count() >= 1, f'{code} missing PDF link'
        assert page.locator('.xp-outline-item').count() == 6, f'{code}: lesson must have six parts'
        select_part(page, 2)
        page.get_by_text(paper['lesson_flow'][0]['title'], exact=True).first.wait_for(timeout=10000)
        select_part(page, 3)
        nodes = page.locator('.flow-node')
        nodes.first.wait_for(state='visible', timeout=15000)
        assert nodes.count() == 4, f'{code} flow: {nodes.count()} nodes'
        nodes.first.click()
        assert nodes.first.get_attribute('aria-pressed') == 'true'
        nodes.last.click()
        assert nodes.last.get_attribute('aria-pressed') == 'true'
        select_part(page, 4)
        scene = page.locator('.semiconductor' if paper['domain'] == 'semiconductors' else '.study-explorer')
        scene.wait_for(timeout=20000)
        if paper['domain'] != 'semiconductors':
            label = {'agriculture_field': 'A field, the root zone and water',
                     'reaction_diffusion': 'Separate transport from reaction',
                     'porous_adsorption': 'Inside a porous carbon surface'}[paper['visual_kind']]
            assert scene.get_attribute('aria-label') == label, f'{code}: wrong science model'
        no_overflow(page, f'{code} 3D')
        select_part(page, 5)
        for limit in paper['limitations']:
            page.locator('.lesson-text').get_by_text(limit, exact=False).first.wait_for(timeout=10000)
        select_part(page, 6)
        page.locator('.qz-card').first.wait_for(state='visible', timeout=15000)
        dots = page.locator('.qz-dot')
        assert dots.count() == 3, f'{code}: missing quiz questions'
        for index, question in enumerate(paper['questions']):
            dots.nth(index).click()
            assert page.locator('.qz-prompt').inner_text().strip() == question['prompt'], f'{code}: question {index + 1}'
        no_overflow(page, f'{code} quiz')
        assert len(errors) == before, f'{code}: {errors[before:]}'
        report['lessons'].append({'code': code, 'parts': 6, 'flow_nodes': 4, 'quiz_questions': 3, 'visual_kind': paper['visual_kind']})
        print(code, 'six parts / links / flow / 3D / quiz OK', flush=True)
    ctx.close()

    # Check long original full-text/PDF links at phone width; no quiz or data writes.
    ctx = browser.new_context(viewport={'width': 375, 'height': 812}, reduced_motion='reduce')
    ctx.add_init_script("localStorage.setItem('cl.lang', 'en')")
    ctx.route('**/*', no_writes)
    page = ctx.new_page()
    for paper in papers:
        page.goto(BASE + '/s/' + paper['share_code'], wait_until='domcontentloaded')
        page.get_by_role('heading', name=paper['title'], exact=True).wait_for(timeout=15000)
        assert page.locator(f'a[href="{paper["pdf_url"]}"]').is_visible()
        no_overflow(page, f'{paper["share_code"]} mobile source links')
    print('all ten mobile source pages: links visible and no horizontal overflow', flush=True)
    ctx.close()

    ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
    ctx.add_init_script("localStorage.setItem('cl.lang', 'en')")
    ctx.route('**/*', no_writes)
    page = ctx.new_page()
    page.goto(BASE + '/s/AGWATR', wait_until='domcontentloaded')
    page.get_by_role('button', name=re.compile('Reading guide:')).first.click()
    page.get_by_text('Bibliographic and reading note; this is not the full paper.', exact=False).first.wait_for(timeout=10000)
    assert page.get_by_text('Section index (not PDF page numbers):', exact=False).count() > 0
    print('source note: identifies bibliography and explains section index', flush=True)
    ctx.close()
    browser.close()

(OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
