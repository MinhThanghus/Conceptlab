import json
import math
from copy import deepcopy

import pytest

from app.schemas.api import SharedLabOut
from app.seed.pendulum_en import PendulumTranslationUnavailable, TEXT, _template, translate_pendulum, translate_pendulum_explanation
from app.services.translate import extract_strings


def example():
    return SharedLabOut.model_validate({
        "id": "lab", "share_code": "TPEND6", "space": "school2lab",
        "title": "Con lắc đơn — chu kỳ dao động", "topic": "Bài 12. Con lắc đơn",
        "subject": "physics", "grade": "10", "language": "vi", "level": "simple",
        "allow_tutor": True, "owner": {"id": "owner", "name": "Demo"},
        "spec": _template(), "sources": [], "assets": [],
    })


def test_reviewed_translation_preserves_original_quiz_structure_and_quotes():
    original = example()
    before = deepcopy(original.spec)
    translated = translate_pendulum(original)
    assert translated.title == "The simple pendulum and its period"
    assert translated.spec["blocks"][0]["steps"][0]["title"] == "A simple pendulum: a small bob on an inextensible string"
    assert translated.spec["blocks"][1]["active"]["options"][1] == "T doubles"
    assert translated.spec["blocks"][3]["questions"][0]["options"][1] == "String length L and gravitational acceleration g"
    assert translated.spec["blocks"][3]["questions"][0]["answer_index"] == before["blocks"][3]["questions"][0]["answer_index"]
    assert translated.spec["blocks"][0]["steps"][0]["source_refs"] == before["blocks"][0]["steps"][0]["source_refs"]
    assert original.spec == before
    paths = {path for path, _, _ in extract_strings(before)}
    assert not paths - set(TEXT) - {("blocks", 2, "x_label"), ("blocks", 2, "y_label")}


def test_changed_lesson_is_not_mislabeled_as_reviewed_translation():
    lab = example()
    lab.spec["blocks"][1]["active"]["question"] = "A teacher's new question"
    with pytest.raises(PendulumTranslationUnavailable):
        translate_pendulum(lab)
    lab = example()
    lab.spec["blocks"].append({"id": "extra", "type": "text", "title": "New section", "body": "Extra content"})
    with pytest.raises(PendulumTranslationUnavailable):
        translate_pendulum(lab)


def test_quiz_feedback_translation_only_for_known_explanation():
    explanation = _template()["blocks"][3]["questions"][0]["explanation"]
    assert translate_pendulum_explanation(explanation).startswith("According to formula")
    assert translate_pendulum_explanation("Teacher's own explanation") == "Teacher's own explanation"


def test_numeric_question_is_not_answered_on_the_page_or_the_slides():
    """The textbook example gives T for L = 0,25 m, so the numeric question asks about another length."""
    spec = _template()
    question = spec["blocks"][3]["questions"][1]
    assert question["id"] == "q6"  # replaced q2: a new id, so stored attempts never point at the new text
    assert question["answer_value"] == pytest.approx(2 * math.pi * math.sqrt(0.40 / 9.81), rel=1e-3)
    others = deepcopy(spec)
    del others["blocks"][3]["questions"][1]
    shown = json.dumps(others, ensure_ascii=False)  # summary, slides, page quotes and the other questions
    assert "0,40" not in shown and "1,27" not in shown
    assert not any(value in question[key] for value in ("1,27", "1.27", "0,25", "1,00") for key in ("prompt", "context", "hint"))
    assert all("0,25" not in ref["quote"] for ref in question["source_refs"])
    english = translate_pendulum(example()).spec["blocks"][3]["questions"][1]
    assert english["id"] == "q6" and "L = 0.40 m" in english["prompt"] and r"T \approx 1.27$ s" in english["explanation"]
    assert translate_pendulum_explanation(question["explanation"]) == english["explanation"]
