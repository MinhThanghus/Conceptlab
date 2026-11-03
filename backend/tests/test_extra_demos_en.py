from copy import deepcopy

import pytest

from app.db import SessionLocal
from app.seed.content import DEMOS
from app.seed.demo import _seed_one, _system_user
from app.seed.extra_demos_en import ExtraTranslationUnavailable, TRANSLATIONS, translate_extra_demo
from app.services.share import shared_lab


@pytest.mark.parametrize('code', ['PARAB3', 'SWAP42', 'WATER6', 'SAVE25', 'JUMP45', 'SPFTBA', 'SPFUTS', 'SPBASK', 'SPBDMT'])
def test_reviewed_translation_preserves_original_and_quiz(client, code):
    demo = next(d for d in DEMOS if d.code == code)
    with SessionLocal() as db:
        lab = _seed_one(db, _system_user(db), demo)
        original = shared_lab(db, lab)
        before = deepcopy(original.spec)
        translated = translate_extra_demo(original)
        assert original.spec == before
        assert translated.title == TRANSLATIONS[code]['title']
        assert translated.spec['summary'] == TRANSLATIONS[code]['text'][0]
        for old, new in zip(before['blocks'], translated.spec['blocks']):
            assert old['source_refs'] == new['source_refs']
            for old_q, new_q in zip(old.get('questions', []), new.get('questions', [])):
                assert old_q['answer_index'] == new_q['answer_index']
                assert old_q['answer_order'] == new_q['answer_order']
                assert old_q['answer_value'] == new_q['answer_value']
                if old_q['kind'] == 'truefalse':
                    assert new_q['options'] == ['True', 'False']
        if code == 'SAVE25':
            assert translated.spec['blocks'][0]['params'][0]['unit'] == 'thousand VND'


def test_reviewed_translation_rejects_edits_to_content_and_source(client):
    demo = next(d for d in DEMOS if d.code == 'PARAB3')
    with SessionLocal() as db:
        lab = _seed_one(db, _system_user(db), demo)
        original = shared_lab(db, lab)
        for alter in (
            lambda out: out.spec['blocks'][0]['params'][0].update(value=9),
            lambda out: out.spec['blocks'][2]['questions'][0].update(answer_index=0),
            lambda out: setattr(out.sources[0], 'text', 'A changed source'),
            lambda out: setattr(out, 'title', 'Changed title'),
        ):
            edited = original.model_copy(deep=True)
            alter(edited)
            with pytest.raises(ExtraTranslationUnavailable):
                translate_extra_demo(edited)
