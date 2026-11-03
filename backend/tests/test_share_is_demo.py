"""The shared lab says whether it is a sample, so the learner deck's cover can show the sample's
capture (frontend LabCover coverSources reads ``is_demo`` before /covers/<CODE>.webp)."""

from __future__ import annotations

from tests.conftest import create_lab
from tests.test_share import STEPS, publish, set_lab


def test_shared_lab_says_whether_it_is_a_sample(teacher, client):
    c, _ = teacher
    lab = create_lab(c)
    code = publish(c, lab["id"], [STEPS])
    assert client.get(f"/api/share/{code}").json()["is_demo"] is False

    set_lab(lab["id"], is_demo=True)
    body = client.get(f"/api/share/{code}").json()
    assert body["is_demo"] is True
    # the learner copy in the lab's own language carries it too
    assert client.get(f"/api/share/{code}?lang=vi").json()["is_demo"] is True
