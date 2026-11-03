"""The sports lessons can be published and opened without external services."""

from app.db import SessionLocal
from app.seed.demo import _seed_one, _system_user
from app.seed.sports import SPORT_DEMOS
from app.services.validation import validate_lab


def test_sports_lessons_are_published_and_listed(client):
    with SessionLocal() as db:
        owner = _system_user(db)
        for demo in SPORT_DEMOS:
            lab = _seed_one(db, owner, demo)
            assert lab.status == "published"
            assert validate_lab(db, lab).ok

    gallery = client.get("/api/public/labs", params={"subject": "pe"})
    assert gallery.status_code == 200
    assert {item["share_code"] for item in gallery.json()["items"]} >= {d.code for d in SPORT_DEMOS}
    for demo in SPORT_DEMOS:
        response = client.get(f"/api/share/{demo.code}")
        assert response.status_code == 200
        blocks = response.json()["spec"]["blocks"]
        assert any(block["type"] == "field" for block in blocks)
    basketball = client.get("/api/share/SPBASK").json()
    assert any(block["type"] == "simulation" for block in basketball["spec"]["blocks"])
