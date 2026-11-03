from app.db import SessionLocal
from app.models import Lab
from app.seed.content import DEMOS
from app.seed.demo import _seed_one, _system_user
from app.services import share_translation


def test_heart_reviewed_translation_is_immediate_and_grades_in_english(client, monkeypatch):
    share_translation._CACHE.clear()
    with SessionLocal() as db:
        _seed_one(db, _system_user(db), next(d for d in DEMOS if d.code == 'HEART8'))

    async def no_ai(*args, **kwargs):
        raise AssertionError('The reviewed heart lesson must not call AI')
    monkeypatch.setattr(share_translation, '_machine_translate', no_ai)
    response = client.post('/api/share/HEART8/translate', json={'target': 'en'})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['translation_kind'] == 'reviewed'
    assert data['title'] == 'The human circulatory system'
    assert data['spec']['blocks'][0]['hotspots'][0]['label'] == 'Lungs'
    assert data['spec']['blocks'][2]['questions'][1]['options'] == ['True', 'False']
    assert 'answer_index' not in data['spec']['blocks'][2]['questions'][0]
    assert 'explanation' not in data['spec']['blocks'][2]['questions'][0]
    share_translation._CACHE.clear()
    answer = client.post('/api/share/HEART8/quiz-attempts?lang=en', json={
        'block_id': 'b3', 'answers': [{'question_id': 'q1', 'answer': 3}]
    })
    assert answer.status_code == 201, answer.text
    assert answer.json()['results'][0]['correct'] is True
    assert answer.json()['results'][0]['explanation'].startswith('The left ventricle')


def test_changed_heart_content_never_gets_the_reviewed_translation(client):
    share_translation._CACHE.clear()
    with SessionLocal() as db:
        lab = _seed_one(db, _system_user(db), next(d for d in DEMOS if d.code == 'HEART8'))
        lab.published_spec_json = {**lab.published_spec_json, 'spec': {
            **lab.published_spec_json['spec'], 'summary': 'Changed by the author.'
        }}
        db.commit()
        assert share_translation.cached(db, lab, 'en') is None


def test_changed_diagram_geometry_or_source_never_gets_reviewed_translation(client):
    from copy import deepcopy
    from app import storage

    share_translation._CACHE.clear()
    with SessionLocal() as db:
        lab = _seed_one(db, _system_user(db), next(d for d in DEMOS if d.code == 'HEART8'))
        original = deepcopy(lab.published_spec_json)
        changed = deepcopy(original)
        changed['spec']['blocks'][0]['hotspots'][0]['bbox'] = [0, 0, .1, .1]
        lab.published_spec_json = changed
        db.commit()
        assert share_translation.cached(db, lab, 'en') is None
        lab.published_spec_json = original
        lab.sources[0].storage_key = storage.save_bytes(lab.id, b'changed source', 'png')
        db.commit()
        assert share_translation.cached(db, lab, 'en') is None


def test_cached_reviewed_heart_is_rechecked_after_image_bytes_change(client, monkeypatch):
    from app import storage
    from types import SimpleNamespace

    share_translation._CACHE.clear()
    with SessionLocal() as db:
        lab = _seed_one(db, _system_user(db), next(d for d in DEMOS if d.code == 'HEART8'))
        assert share_translation.cached(db, lab, 'en') is not None
        # The public metadata and cache key stay unchanged; only the storage target differs.
        lab.sources[0].storage_key = storage.save_bytes(lab.id, b'different image', 'png')
        db.commit()
    monkeypatch.setattr(share_translation, 'get_ai', lambda: SimpleNamespace(settings=SimpleNamespace(ai_configured=False)))
    assert client.post('/api/share/HEART8/translate', json={'target': 'en'}).status_code == 503
    with SessionLocal() as db:
        lab = db.query(Lab).filter(Lab.share_code == 'HEART8').one()
        assert share_translation.cached(db, lab, 'en') is None
