"""Read-only visual regression using the user's existing quadratic lesson.

The private preview data and media are served only by Playwright route handlers;
no lesson is published, edited or copied into the application database.
"""
import json
import sqlite3
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.build-check' / 'lesson-deck'
OUT.mkdir(parents=True, exist_ok=True)
lab_id = 'd5a4183ad0f34cae9333ff869c2079c5'
db = sqlite3.connect(f'file:{(ROOT / "backend/data/conceptlab.db").as_posix()}?mode=ro', uri=True)
db.row_factory = sqlite3.Row
row = db.execute('select id,title,subject,grade,space,language,level,spec_json from labs where id=?', (lab_id,)).fetchone()
assert row, 'The existing quadratic lesson was not found'
lab = dict(row)
lab['spec'] = json.loads(lab.pop('spec_json'))
lab.update(allow_tutor=False, sources=[], assets=[], status='draft', version=1, analysis={}, ai_mode='contributor')
lab['share_code'] = 'SLIDEQA'
media = {}
for record in db.execute('select * from sources where lab_id=? order by position', (lab_id,)):
    source = {key: record[key] for key in ['id','kind','title','status','width','height','page_count','mime']}
    source['text'] = record['text_content']
    source['urls'] = {'file': f'/__qa_source/{source["id"]}'}
    lab['sources'].append(source)
    if record['storage_key']:
        media[source['id']] = ROOT / 'backend/storage' / record['storage_key']
db.close()

reports = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in [(1906, 910), (1366, 768), (375, 812)]:
        context = browser.new_context(viewport={'width':width,'height':height})
        context.add_init_script("localStorage.setItem('cl.lang','vi')")
        page = context.new_page()
        errors=[]
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.route('**/api/share/SLIDEQA?*', lambda route: route.fulfill(json=lab))
        page.route('**/api/auth/me', lambda route: route.fulfill(json={'user':{'id':'preview-qa','name':'Preview QA','role':'teacher','locale':'vi'}, 'ai':{'configured':False}}))
        def read_lab(route):
            assert route.request.method == 'GET', 'The preview must not modify the source lesson'
            route.fulfill(json=lab)
        page.route(f'**/api/labs/{lab_id}', read_lab)
        page.route('**/__qa_source/*', lambda route: route.fulfill(path=str(media[route.request.url.rsplit('/',1)[-1]])))
        page.goto(f'http://127.0.0.1:5300/app/labs/{lab_id}/preview', wait_until='networkidle')
        deck=page.locator('.lesson-deck')
        deck.wait_for()
        deck.get_by_role('button',name='Mục lục',exact=True).click()
        page.locator('.deck-contents button').filter(has_text='Bước 8:').click()
        page.locator('.step-slide').wait_for()
        page.wait_for_function("Array.from(document.querySelectorAll('.deck-page:not([hidden]) .step-slide-visual img')).every(img => img.complete && img.naturalWidth > 0)")
        page.locator('.deck-page:not([hidden]) .step-slide-visual img').evaluate_all('(els)=>Promise.all(els.map(e=>e.decode()))')
        page.wait_for_timeout(150)
        if width >= 1000:
            for selector in ['.step-slide-visual', '.step-slide-content']:
                dimensions = page.locator('.deck-page:not([hidden]) ' + selector).evaluate('(el)=>({height:el.clientHeight, content:el.scrollHeight})')
                assert dimensions['content'] <= dimensions['height'] + 1, (selector, dimensions)
        page.screenshot(path=str(OUT/f'quadratic-step-{width}.png'))
        assert page.locator('.deck-footer').bounding_box()['y'] + page.locator('.deck-footer').bounding_box()['height'] <= height+1
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
        assert page.locator('.step-slide-visual img').evaluate_all('(els)=>els.every(e=>e.complete && e.naturalWidth>0)')
        # A short explanation and its question share a composed slide.
        page.locator('.deck-page:not([hidden]) textarea').fill('Ô Kết thúc')
        deck.get_by_role('button',name='Tiếp',exact=True).click()
        deck.get_by_role('button',name='Trước',exact=True).click()
        assert page.locator('.deck-page:not([hidden]) textarea').input_value() == 'Ô Kết thúc'
        page.screenshot(path=str(OUT/f'quadratic-question-{width}.png'))
        assert not errors, errors
        reports.append({'width':width,'height':height,'errors':errors})
        context.close()
    browser.close()
(OUT/'report.json').write_text(json.dumps(reports,indent=2), encoding='utf-8')
print(json.dumps(reports))
