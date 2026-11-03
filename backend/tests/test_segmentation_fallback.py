"""SAM noun-phrase fallback: when the translated phrase matches nothing, Muse looks at the
picture and proposes concrete phrases that SAM tries in order (offline, fake Meta API)."""

from __future__ import annotations

from tests.conftest import create_lab
from tests.test_ai_offline import fake_ai, fixture_bytes, upload  # noqa: F401  (fixture re-export)

BALL = "<0f>0<|box;x1=681;y1=529;x2=769;y2=617;w=1200;h=900|><|mask;x=0;y=0;data=89,89,~abc|>"


def test_phrase_miss_falls_back_to_visual_phrases(teacher, fake_ai):  # noqa: F811
    c, _ = teacher
    lab = create_lab(c)
    photo = upload(c, lab["id"], fixture_bytes("pendulum_photo.jpg"), "photo.jpg")
    fake_ai.json_outputs["sam_phrase"] = {"phrase": "red weight"}
    fake_ai.json_outputs["sam_visual_phrases"] = {"phrases": ["red weight", "red ball", "metal stand"]}
    fake_ai.sam = lambda payload: BALL if payload["input"][0]["content"][0]["text"] == "red ball" else ""

    r = c.post(f"/api/labs/{lab['id']}/ai/segment", json={"source_id": photo["id"], "phrase": "quả nặng màu đỏ"})

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["phrase_used"] == "red ball" and body["objects"][0]["box"] == [681, 529, 769, 617]
    prompts = [call["prompt"] for call in fake_ai.by("sam")]
    assert prompts == ["red weight", "red ball"]  # duplicate of the literal phrase is skipped
    visual = fake_ai.last("sam_visual_phrases")["payload"]["messages"][0]["content"]
    assert any(part.get("type") == "image_url" for part in visual)  # Muse sees the picture


def test_phrase_hit_does_not_call_the_fallback(teacher, fake_ai):  # noqa: F811
    c, _ = teacher
    lab = create_lab(c)
    photo = upload(c, lab["id"], fixture_bytes("pendulum_photo.jpg"), "photo.jpg")
    fake_ai.sam = BALL
    r = c.post(f"/api/labs/{lab['id']}/ai/segment", json={"source_id": photo["id"], "phrase": "red ball"})
    assert r.status_code == 200 and r.json()["phrase_used"] == "red ball"
    assert not fake_ai.by("sam_visual_phrases")


def test_nothing_found_returns_an_honest_empty_result(teacher, fake_ai):  # noqa: F811
    c, _ = teacher
    lab = create_lab(c)
    photo = upload(c, lab["id"], fixture_bytes("pendulum_photo.jpg"), "photo.jpg")
    fake_ai.json_outputs["sam_phrase"] = {"phrase": "unicorn"}
    fake_ai.json_outputs["sam_visual_phrases"] = {"phrases": ["white horse"]}
    fake_ai.sam = ""
    r = c.post(f"/api/labs/{lab['id']}/ai/segment", json={"source_id": photo["id"], "phrase": "kỳ lân"})
    assert r.status_code == 200
    body = r.json()
    assert body["objects"] == [] and body["phrase_used"] == "unicorn"
