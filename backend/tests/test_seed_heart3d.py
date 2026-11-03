from app.db import SessionLocal
from app.seed.content import DEMOS
from app.seed.demo import _seed_one, _system_user
from app.services.validation import validate_lab


def test_circulation_demo_publishes_three_dimensional_explorer(client):
    demo = next(d for d in DEMOS if d.code == 'HEART8')
    with SessionLocal() as db:
        lab = _seed_one(db, _system_user(db), demo)
        assert validate_lab(db, lab).ok
    response = client.get('/api/share/HEART8')
    assert response.status_code == 200
    blocks = response.json()['spec']['blocks']
    assert [b['id'] for b in blocks] == ['b1', 'b2', 'b3', 'b4']
    assert blocks[-1]['visual3d'] == 'circulation'
