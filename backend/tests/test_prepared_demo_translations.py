"""Cold-cache coverage and safety for the distributed bilingual demo pack."""
import copy

from app.db import SessionLocal
from app import storage
from app.models import Lab, User
from app.seed.content import DEMOS
from app.seed.demo import DEMO_EMAIL, _seed_one, _system_user
from app.seed.prepared_translations import load_pack
from app.services import share_translation
from sqlalchemy import select


def _cold_cache():
    share_translation._CACHE.clear()
    share_translation._PACK_KEYS.clear()
    load_pack.cache_clear()


def test_all_system_demos_translate_cold_without_ai_and_protect_edits(client, monkeypatch):
    """Seed a fresh DB so IDs/order differ from the pack build database."""
    def forbidden(*_args, **_kwargs):
        raise AssertionError('prepared demo requested live AI')

    async def forbidden_translation(*_args, **_kwargs):
        raise AssertionError('prepared demo requested live AI')

    monkeypatch.setattr(share_translation, 'get_ai', forbidden)
    monkeypatch.setattr(share_translation, 'ai_rate_limit', forbidden)
    monkeypatch.setattr(share_translation, '_machine_translate', forbidden_translation)
    with SessionLocal() as db:
        user = _system_user(db)
        assert user.email == DEMO_EMAIL and user.is_system
        for demo in DEMOS:
            _seed_one(db, user, demo)

    assert len(DEMOS) >= 43
    for demo in DEMOS:
        target = 'vi' if demo.language == 'en' else 'en'
        _cold_cache()
        original = client.get(f'/api/share/{demo.code}').json()
        response = client.get(f'/api/share/{demo.code}', params={'lang': target})
        assert response.status_code == 200, (demo.code, response.text)
        translated = response.json()
        assert translated['translated_language'] == target, demo.code
        assert translated['translation_kind'] in ('reviewed', 'machine')
        assert translated['language'] == demo.language
        assert [(s['id'], s['kind'], s['text']) for s in translated['sources']] == [
            (s['id'], s['kind'], s['text']) for s in original['sources']]
        assert [(b['id'], b['type']) for b in translated['spec']['blocks']] == [
            (b['id'], b['type']) for b in original['spec']['blocks']]
        for block in original['spec']['blocks'] + translated['spec']['blocks']:
            if block['type'] == 'quiz':
                assert all('answer_index' not in question and 'explanation' not in question
                           and 'option_feedback' not in question and 'answer_order' not in question
                           for question in block['questions'])
        # POST is also immediate with a genuinely cold cache, including quiz explanations internally.
        _cold_cache()
        post = client.post(f'/api/share/{demo.code}/translate', json={'target': target})
        assert post.status_code == 200 and post.json()['translated_language'] == target, (demo.code, post.text)

    _cold_cache()
    gallery = client.get('/api/public/labs', params={'lang': 'vi', 'page_size': 60}).json()
    assert len(gallery['items']) == len(DEMOS)
    assert all(row['display_language'] == 'vi' and row['display_title'] for row in gallery['items'])
    assert all(row['language'] in ('vi', 'en') for row in gallery['items'])
    featured = client.get('/api/public/featured', params={'lang': 'en'}).json()
    assert featured and all(row['display_language'] == 'en' and row['display_title'] for row in featured)

    # Editing a published snapshot is never silently served a stale prepared lesson.
    with SessionLocal() as db:
        lab = db.scalar(select(Lab).where(Lab.share_code == 'CHNWRE'))
        changed = copy.deepcopy(lab.published_spec_json)
        changed['spec']['summary'] += ' Teacher edit.'
        lab.published_spec_json = changed
        db.commit()
    _cold_cache()
    edited = client.get('/api/share/CHNWRE', params={'lang': 'vi'}).json()
    assert edited['translated_language'] is None
    assert edited['spec']['summary'].endswith(' Teacher edit.')
    rows = client.get('/api/public/labs', params={'lang': 'vi', 'page_size': 60}).json()['items']
    changed_card = next(row for row in rows if row['share_code'] == 'CHNWRE')
    assert changed_card['display_language'] is None

    # A reviewed Vietnamese demo must also reject a changed non-text control.
    with SessionLocal() as db:
        lab = db.scalar(select(Lab).where(Lab.share_code == 'TPEND6'))
        changed = copy.deepcopy(lab.published_spec_json)
        changed['spec']['blocks'][1]['params'][0]['value'] = 1.25
        lab.published_spec_json = changed
        db.commit()
    _cold_cache()
    assert client.get('/api/share/TPEND6', params={'lang': 'en'}).json()['translated_language'] is None

    # A file can change without a source metadata change; even a warm cache is
    # revalidated against its bytes before the prepared version is served.
    _cold_cache()
    assert client.get('/api/share/ATTN24', params={'lang': 'vi'}).json()['translated_language'] == 'vi'
    with SessionLocal() as db:
        lab = db.scalar(select(Lab).where(Lab.share_code == 'ATTN24'))
        pdf = next(source for source in lab.sources if source.kind == 'pdf')
        path = storage.path_for(pdf.storage_key)
        path.write_bytes(path.read_bytes() + b'\n% source changed\n')
    assert client.get('/api/share/ATTN24', params={'lang': 'vi'}).json()['translated_language'] is None

    # An account no longer marked as system-owned must not get the prepared pack either.
    with SessionLocal() as db:
        owner = db.scalar(select(User).where(User.email == DEMO_EMAIL))
        owner.is_system = False
        db.commit()
    _cold_cache()
    assert client.get('/api/share/AGWATR', params={'lang': 'vi'}).json()['translated_language'] is None
