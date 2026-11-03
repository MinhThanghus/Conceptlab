import json

from app.db import SessionLocal
from app.models import Lab
from app.services import share_translation
from tests.conftest import create_lab
from tests.test_ai_offline import fake_ai, graph_block
from tests.test_pendulum_en import example as pendulum_example
from tests.test_share import QUIZ, STEPS, publish


def test_shared_translation_uses_snapshot_redacts_answers_and_translates_quiz(teacher, client, fake_ai):
    share_translation._CACHE.clear()
    owner, _ = teacher
    lab = create_lab(owner, title='Con lắc')
    code = publish(owner, lab['id'], [STEPS, QUIZ])
    with SessionLocal() as db:
        row = db.get(Lab, lab['id'])
        draft = dict(row.spec_json)
        draft['summary'] = 'PRIVATE DRAFT SECRET'
        row.spec_json = draft
        db.commit()

    calls = []
    def translation(payload):
        items = json.loads(payload['messages'][1]['content'].split('ITEMS (JSON):\n', 1)[1])
        calls.extend(item['text'] for item in items)
        return {'items': [{'id': item['id'], 'text': 'EN ' + item['text']} for item in items], 'glossary': []}
    fake_ai.json_outputs['translate'] = translation

    response = client.post(f'/api/share/{code}/translate', json={'target': 'en'})
    assert response.status_code == 200, response.text
    out = response.json()
    assert out['title'] == 'EN Con lắc'
    assert out['language'] == 'vi' and out['translated_language'] == 'en'
    assert out['translation_kind'] == 'machine'
    assert all('PRIVATE DRAFT SECRET' not in item for item in calls)
    quiz = next(block for block in out['spec']['blocks'] if block['type'] == 'quiz')
    assert 'answer_index' not in quiz['questions'][0] and 'explanation' not in quiz['questions'][0]
    assert all(not {'answer_order', 'answer_value', 'tolerance', 'option_feedback'} & set(q) for q in quiz['questions'])
    assert all(q['id'] != 'q6' for q in quiz['questions'])
    assert fake_ai.last('translate')['payload']['model'] == 'muse-spark-1.3'
    assert 'Write every user-facing text in English' in fake_ai.last('translate')['payload']['messages'][0]['content']
    previous_calls = len(calls)
    assert client.post(f'/api/share/{code}/translate', json={'target': 'en'}).status_code == 200
    assert len(calls) == previous_calls

    answer = client.post(f'/api/share/{code}/quiz-attempts?lang=en', json={
        'block_id': 'qz', 'answers': [{'question_id': 'q1', 'answer': 0}]
    })
    assert answer.status_code == 201, answer.text
    assert answer.json()['results'][0]['correct'] is True
    assert answer.json()['results'][0]['explanation'].startswith('EN ')
    assert owner.get(f'/api/labs/{lab["id"]}').json()['spec']['summary'] == 'PRIVATE DRAFT SECRET'


def test_incomplete_translation_and_missing_cache_do_not_claim_success(teacher, client, fake_ai):
    share_translation._CACHE.clear()
    owner, _ = teacher
    lab = create_lab(owner, title='Con lắc')
    code = publish(owner, lab['id'], [QUIZ])
    fake_ai.json_outputs['translate'] = lambda payload: {'items': [], 'glossary': []}
    assert client.post(f'/api/share/{code}/translate', json={'target': 'en'}).status_code == 502
    answer = client.post(f'/api/share/{code}/quiz-attempts?lang=en', json={
        'block_id': 'qz', 'answers': [{'question_id': 'q1', 'answer': 0}]
    })
    assert answer.status_code == 409
    assert client.post('/api/share/NOPE99/translate', json={'target': 'en'}).status_code == 404


def test_shared_learning_requests_use_translation_and_target_language(teacher, client, fake_ai):
    share_translation._CACHE.clear()
    owner, _ = teacher
    lab = create_lab(owner, title='Con lắc')
    code = publish(owner, lab['id'], [graph_block()])
    fake_ai.json_outputs['translate'] = lambda payload: {
        'items': [{'id': item['id'], 'text': 'EN ' + item['text']} for item in
                  json.loads(payload['messages'][1]['content'].split('ITEMS (JSON):\n', 1)[1])],
        'glossary': [],
    }
    assert client.post(f'/api/share/{code}/translate', json={'target': 'en'}).status_code == 200
    r = client.post(f'/api/share/{code}/ai/explain-change?lang=en', json={'block_id': 'g1', 'before': {}, 'after': {}})
    assert r.status_code == 200, r.text
    prompt = fake_ai.last('chat')['payload']['messages'][1]['content']
    assert 'English' in prompt and 'EN ' in prompt
    fake_ai.json_outputs['prediction_feedback'] = {'feedback': 'The period grows.', 'verdict': 'correct'}
    r = client.post(f'/api/share/{code}/ai/prediction-feedback?lang=en', json={'block_id': 'g1', 'prediction': 'EN Tăng', 'observed': {}})
    assert r.status_code == 200, r.text
    assert r.json()['correct'] is True
    assert 'English' in fake_ai.last('prediction_feedback')['payload']['messages'][1]['content']


def test_machine_translation_is_kept_on_disk_across_a_restart(teacher, client, fake_ai):
    share_translation._CACHE.clear()
    owner, _ = teacher
    lab = create_lab(owner, title='Con lắc')
    code = publish(owner, lab['id'], [STEPS, QUIZ])
    calls = []

    def translation(payload):
        items = json.loads(payload['messages'][1]['content'].split('ITEMS (JSON):\n', 1)[1])
        calls.append(len(items))
        return {'items': [{'id': item['id'], 'text': 'EN ' + item['text']} for item in items], 'glossary': []}
    fake_ai.json_outputs['translate'] = translation

    first = client.post(f'/api/share/{code}/translate', json={'target': 'en'})
    assert first.status_code == 200, first.text
    model_runs = len(calls)
    assert model_runs > 0
    stored = list((share_translation._disk_path('en:x').parent).glob('*.en.json'))
    assert stored, 'the machine translation is written under STORAGE_DIR/translations'

    share_translation._CACHE.clear()  # what a backend restart does to the memory cache
    shown = client.get(f'/api/share/{code}?lang=en')
    assert shown.status_code == 200
    assert shown.json()['translated_language'] == 'en' and shown.json()['title'] == 'EN Con lắc'
    quiz = next(block for block in shown.json()['spec']['blocks'] if block['type'] == 'quiz')
    assert all(not {'answer_index', 'answer_order', 'answer_value', 'explanation', 'option_feedback'} & set(q)
               for q in quiz['questions'])
    share_translation._CACHE.clear()
    again = client.post(f'/api/share/{code}/translate', json={'target': 'en'})
    assert again.status_code == 200 and again.json()['title'] == 'EN Con lắc'
    assert len(calls) == model_runs, 'no second model run after a restart'

    answer = client.post(f'/api/share/{code}/quiz-attempts?lang=en', json={
        'block_id': 'qz', 'answers': [{'question_id': 'q1', 'answer': 0}]
    })
    assert answer.status_code == 201, answer.text
    assert answer.json()['results'][0]['explanation'].startswith('EN ')


def test_concurrent_translations_of_one_snapshot_share_one_model_run(teacher, client, fake_ai, monkeypatch):
    import asyncio

    from app.security import Actor

    share_translation._CACHE.clear()
    owner, _ = teacher
    lab = create_lab(owner, title='Con lắc')
    code = publish(owner, lab['id'], [STEPS])
    runs = []

    async def slow_translate(original, lab_row, actor, target):
        runs.append(target)
        await asyncio.sleep(0.05)
        result = original.model_copy(deep=True)
        result.title = 'EN ' + result.title
        return result
    monkeypatch.setattr(share_translation, '_machine_translate', slow_translate)
    monkeypatch.setattr(share_translation, '_disk_save', lambda key, value: None)
    monkeypatch.setattr(share_translation, '_disk_load', lambda key: None)

    async def both():
        sessions = [SessionLocal(), SessionLocal()]
        try:
            labs = [db.get(Lab, lab['id']) for db in sessions]
            learners = [Actor(user=None, session=None, viewer_key=f'learner{i}', ip='127.0.0.1') for i in range(2)]
            return await asyncio.gather(*(share_translation.translated_shared(db, row, who, 'en')
                                          for db, row, who in zip(sessions, labs, learners)))
        finally:
            for db in sessions:
                db.close()

    first, second = asyncio.run(both())
    assert runs == ['en'], 'two learners opening the lesson together trigger one translation'
    assert first.title == second.title == 'EN Con lắc'
    assert first.translated_language == second.translated_language == 'en'
    assert share_translation._INFLIGHT == {}
    assert code


def test_reviewed_demo_cache_reconstructs_after_restart(client):
    from app.db import SessionLocal
    from app.seed.content import DEMOS
    from app.seed.demo import _seed_one, _system_user

    share_translation._CACHE.clear()
    with SessionLocal() as db:
        demo = next(item for item in DEMOS if item.code == 'TPEND6')
        lab = _seed_one(db, _system_user(db), demo)
        recovered = share_translation.cached(db, lab, 'en')
        assert recovered is not None and recovered.translation_kind == 'reviewed'
        assert recovered.spec['blocks'][3]['questions'][0]['explanation'].startswith('According to formula')
