"""Research notes publish as navigable lessons without depending on a live publisher."""

from app.db import SessionLocal
from app.seed.demo import _seed_one, _system_user
from app.seed.research_computing import RESEARCH_COMPUTING_DEMOS
from app.services.validation import validate_lab


def test_research_papers_publish_and_open(client):
    with SessionLocal() as db:
        owner = _system_user(db)
        for demo in RESEARCH_COMPUTING_DEMOS:
            lab = _seed_one(db, owner, demo)
            assert lab.status == "published"
            assert validate_lab(db, lab).ok

    for demo in RESEARCH_COMPUTING_DEMOS:
        gallery = client.get("/api/public/labs", params={"subject": demo.subject})
        assert gallery.status_code == 200
        assert demo.code in {item["share_code"] for item in gallery.json()["items"]}
        response = client.get(f"/api/share/{demo.code}")
        assert response.status_code == 200
        assert {b["type"] for b in response.json()["spec"]["blocks"]} >= {"flow", "quiz"}
