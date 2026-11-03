import pytest

from app.db import SessionLocal
from app.seed.content import DEMOS
from app.seed.demo import _seed_one, _system_user
from app.services import share_translation


@pytest.mark.parametrize('code', ['PARAB3', 'SWAP42', 'WATER6', 'SAVE25', 'JUMP45', 'SPFTBA', 'SPFUTS', 'SPBASK', 'SPBDMT', 'VBPASS'])
def test_reviewed_demos_translate_without_ai_and_redact_answers(code, client, monkeypatch):
    share_translation._CACHE.clear()
    with SessionLocal() as db:
        _seed_one(db, _system_user(db), next(d for d in DEMOS if d.code == code))

    async def no_ai(*args, **kwargs):
        raise AssertionError('A reviewed demo must not call AI')
    monkeypatch.setattr(share_translation, '_machine_translate', no_ai)
    result = client.post(f'/api/share/{code}/translate', json={'target': 'en'})
    assert result.status_code == 200, result.text
    data = result.json()
    assert data['translation_kind'] == 'reviewed'
    quiz = next(b for b in data['spec']['blocks'] if b['type'] == 'quiz')
    assert all('answer_index' not in q and 'explanation' not in q and 'option_feedback' not in q for q in quiz['questions'])
    assert all(q['options'] == ['True', 'False'] for q in quiz['questions'] if q['kind'] == 'truefalse')


def test_edited_demo_source_is_not_replaced_by_prepared_translation(client):
    share_translation._CACHE.clear()
    with SessionLocal() as db:
        lab = _seed_one(db, _system_user(db), next(d for d in DEMOS if d.code == 'SWAP42'))
        lab.sources[0].text_content = 'Edited source'
        db.commit()
        assert share_translation.cached(db, lab, 'en') is None
