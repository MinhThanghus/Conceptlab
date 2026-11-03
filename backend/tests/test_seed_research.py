"""Research lessons publish with distinct sources and accessible interactive content."""

from collections import Counter

from app.db import SessionLocal
from app.seed.demo import _seed_one, _system_user
from app.seed.research_computing import RESEARCH_COMPUTING_DEMOS
from app.seed.research_natural import RESEARCH_NATURAL_DEMOS
from app.services.validation import validate_lab


def test_research_lessons_publish_and_open(client):
    demos = RESEARCH_NATURAL_DEMOS + RESEARCH_COMPUTING_DEMOS
    assert Counter(d.subject for d in demos) == {
        subject: 2 for subject in (
            'math', 'physics', 'chemistry', 'biology', 'geography', 'environment',
            'informatics', 'computer_science', 'engineering', 'economics',
        )
    }
    assert len({d.code for d in demos}) == len(demos)
    with SessionLocal() as db:
        owner = _system_user(db)
        for demo in demos:
            assert demo.sources and 'https://' in demo.sources[0].text
            lab = _seed_one(db, owner, demo)
            assert lab.status == 'published'
            assert validate_lab(db, lab).ok

    for demo in demos:
        response = client.get(f'/api/share/{demo.code}')
        assert response.status_code == 200
        assert response.json()['language'] == 'en'
        blocks = response.json()['spec']['blocks']
        assert any(b['type'] in ('flow', 'steps', 'algorithm', 'graph') for b in blocks)
        assert any(b['type'] == 'quiz' for b in blocks)
    pendulum = client.get('/api/share/RNPHY3').json()['spec']['blocks']
    assert any(b['type'] == 'simulation' and b['model'] == 'pendulum' for b in pendulum)
    for code, scene in [('RNBYA3', 'enzyme_binding'), ('RNGYA2', 'population_grid')]:
        blocks = client.get(f'/api/share/{code}').json()['spec']['blocks']
        assert any(b['type'] == 'text' and b.get('visual3d') == scene for b in blocks)
