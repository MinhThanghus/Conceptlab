"""The AI cover prompt (ai/cover_prompt.py): house style, media presets, the lesson's facts.

Pure tests: the builder reads plain lab-like objects, so no database or AI client is needed.
The API side (style validation, stored meta, publishing a new cover) is in test_ai_offline.py.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import get_args

import pytest

from app.ai import cover_prompt as cp
from app.ai.prompts import SUBJECT_NAMES, subject_name
from app.schemas.api import CoverStyle


def make_lab(**fields) -> SimpleNamespace:
    base = {
        "title": "Con lắc đơn",
        "topic": "Dao động của con lắc",
        "subject": "physics",
        "grade": "10",
        "space": "school2lab",
        "spec_json": {},
        "analysis_json": {},
    }
    base.update(fields)
    return SimpleNamespace(**base)


def obj(i: int, *, confirmed: bool = False, description: str = "", sam: str = "", name: str = "") -> dict:
    return {"id": f"o{i}", "name": name or f"vật {i}", "description": description, "sam_phrase": sam, "confirmed": confirmed}


def blocks_of(prompt: str) -> list[str]:
    return prompt.split("\n\n")


# ============================================================================ presets and styles
def test_presets_match_the_api_literal():
    assert set(get_args(CoverStyle)) == {"auto", *cp.PRESETS}
    assert cp.STYLES == ("clay", "papercut", "riso", "specimen", "cyanotype")


@pytest.mark.parametrize(
    ("subject", "space", "expected"),
    [
        ("physics", "school2lab", "clay"),
        ("engineering", "school2lab", "clay"),
        ("other", "school2lab", "clay"),
        ("chemistry", "school2lab", "specimen"),
        ("pe", "school2lab", "specimen"),
        ("biology", "school2lab", "papercut"),
        ("agriculture", "paper2explorer", "papercut"),
        ("geography", "school2lab", "papercut"),
        ("environment", "school2lab", "papercut"),
        ("math", "school2lab", "riso"),
        ("informatics", "school2lab", "riso"),
        ("computer_science", "paper2explorer", "riso"),
        ("economics", "paper2explorer", "riso"),
        # research papers in physics, chemistry and engineering are sun prints
        ("physics", "paper2explorer", "cyanotype"),
        ("chemistry", "paper2explorer", "cyanotype"),
        ("engineering", "paper2explorer", "cyanotype"),
    ],
)
def test_auto_picks_the_medium_from_the_subject(subject, space, expected):
    prompt, style = cp.build_cover_prompt(make_lab(subject=subject, space=space, grade="university" if space == "paper2explorer" else "8"))
    assert style == expected
    assert cp.PRESETS[expected] in prompt


@pytest.mark.parametrize("style", cp.STYLES)
def test_an_explicit_style_wins_over_the_subject(style):
    prompt, resolved = cp.build_cover_prompt(make_lab(subject="math"), style)
    assert resolved == style
    assert cp.PRESETS[style] in prompt
    assert sum(text in prompt for text in cp.PRESETS.values()) == 1  # one medium only


def test_unknown_or_missing_style_falls_back_to_auto():
    assert cp.build_cover_prompt(make_lab(subject="biology"), None)[1] == "papercut"
    assert cp.build_cover_prompt(make_lab(subject="biology"), "watercolour")[1] == "papercut"
    assert cp.build_cover_prompt(make_lab(subject="nonsense"), "auto")[1] == "clay"


# ============================================================================ blocks and their order
def test_blocks_come_in_the_house_order_with_the_teacher_idea_before_the_negative():
    idea = "quả bóng đỏ treo trên dây\n\n  trên giá gỗ"
    prompt, style = cp.build_cover_prompt(make_lab(), "clay", idea)
    parts = blocks_of(prompt)
    assert parts[0].startswith("Cover picture for a grade 10 physics lesson")
    assert parts[2] == cp.PRESETS["clay"]
    assert parts[3] == cp.LEVEL["upper"]
    assert parts[4] == cp.COMPOSITION
    assert parts[5] == cp.HOUSE
    assert parts[6] == "Teacher's idea, followed within these rules: quả bóng đỏ treo trên dây trên giá gỗ"
    assert parts[7].startswith("No text:") and parts[7] == parts[-1]
    assert prompt.index("quả bóng đỏ") < prompt.index("No text")


def test_topic_is_kept_verbatim_as_context_that_is_never_lettered():
    prompt, _ = cp.build_cover_prompt(make_lab(topic="Dao động   của\ncon lắc"))
    first = blocks_of(prompt)[0]
    assert "Dao động của con lắc" in first
    assert "never lettered in the image" in first
    assert '"' not in first  # a quoted title invites the model to letter it


def test_topic_falls_back_to_the_analysis_topic_then_the_title():
    analysed = make_lab(topic=None, analysis_json={"result": {"topic": "Chu kỳ con lắc"}})
    assert "Chu kỳ con lắc" in blocks_of(cp.build_cover_prompt(analysed)[0])[0]
    bare = make_lab(topic="  ", analysis_json={})
    assert "Con lắc đơn" in blocks_of(cp.build_cover_prompt(bare)[0])[0]


def test_house_block_is_identical_on_every_cover_and_uses_the_hum_inks():
    covers = [
        cp.build_cover_prompt(make_lab(subject=subject, grade=grade), style)[0]
        for subject, grade, style in (("physics", "6", "auto"), ("math", "12", "riso"), ("biology", "university", "cyanotype"))
    ]
    assert all(cp.HOUSE in prompt for prompt in covers)
    for hex_value in ("#F7F5EC", "#F7D21A", "#0064BF", "#70E093", "#FF5E63", "#AE7D52", "#D9AC69", "#12161C"):
        assert hex_value in cp.HOUSE
    assert "upper left" in cp.HOUSE and "teal" not in cp.HOUSE.lower()


def test_negative_block_forbids_text_people_and_stock_looks():
    prompt, _ = cp.build_cover_prompt(make_lab())
    negative = blocks_of(prompt)[-1]
    assert negative.startswith("No text")
    for word in ("letters", "numbers", "equations", "labels", "watermarks", "logos", "flags", "people", "faces", "hands",
                 "maps with borders", "readable screens", "gradients", "glow", "neon", "lens flare", "bokeh", "vignette",
                 "dark backgrounds", "clip-art", "plastic CGI", "stock-photo", "clutter", "sparkles", "confetti", "frames"):
        assert word in negative, word
    # the cyanotype's deep blue field is its medium, not a forbidden dark background
    cyan = blocks_of(cp.build_cover_prompt(make_lab(), "cyanotype")[0])[-1]
    assert "dark backgrounds" not in cyan and "black or night backgrounds" in cyan


@pytest.mark.parametrize(("grade", "band"), [("6", "lower"), ("9", "lower"), ("10", "upper"), ("12", "upper"), ("university", "university")])
def test_level_block_follows_the_grade_band(grade, band):
    prompt, _ = cp.build_cover_prompt(make_lab(grade=grade))
    assert cp.LEVEL[band] in prompt
    assert sum(text in prompt for text in cp.LEVEL.values()) == 1


def test_composition_keeps_the_hero_inside_every_crop():
    assert "3:2" in cp.COMPOSITION and "50-65%" in cp.COMPOSITION
    assert "middle 60% of the width" in cp.COMPOSITION and "top 80% of the height" in cp.COMPOSITION


# ============================================================================ hero
def test_simulation_model_gets_its_fixed_scene_first():
    lab = make_lab(spec_json={"blocks": [
        {"type": "algorithm", "algorithm": "bubble_sort"},
        {"type": "simulation", "model": "projectile"},
    ]}, analysis_json={"result": {"objects": [obj(1, sam="red ball", description="quả bóng")]}})
    hero = blocks_of(cp.build_cover_prompt(lab)[0])[1]
    assert hero.startswith("Show " + cp.SIM_SCENES["projectile"])
    assert "red ball" not in hero  # a fixed scene is the hero; the objects are not added to it


@pytest.mark.parametrize(
    ("block", "scene"),
    [
        ({"type": "text", "visual3d": "water_cycle"}, cp.VISUAL_SCENES["water_cycle"]),
        ({"type": "field", "sport": "volleyball"}, cp.SPORT_SCENES["volleyball"]),
        ({"type": "algorithm", "algorithm": "merge_sort"}, cp.ALGORITHM_SCENES["merge_sort"]),
        ({"type": "algorithm", "algorithm": "attention"}, cp.ALGORITHM_SCENES["attention"]),
        ({"type": "simulation", "model": "compound_interest"}, cp.SIM_SCENES["compound_interest"]),
    ],
)
def test_known_models_get_a_fixed_crafted_scene(block, scene):
    prompt, _ = cp.build_cover_prompt(make_lab(spec_json={"blocks": [{"type": "text", "body": "x"}, block]}))
    assert f"Show {scene}." in prompt


def test_scene_tables_cover_every_known_model_and_never_show_people():
    from app.schemas.spec import AlgorithmKind, SimModel, Sport, Visual3D

    assert set(cp.SIM_SCENES) == set(get_args(SimModel))
    assert set(cp.VISUAL_SCENES) == set(get_args(Visual3D))
    assert set(cp.SPORT_SCENES) == set(get_args(Sport))
    assert set(cp.ALGORITHM_SCENES) == set(get_args(AlgorithmKind))
    assert all("no players" in scene for scene in cp.SPORT_SCENES.values())


def test_objects_confirmed_first_with_their_descriptions():
    lab = make_lab(grade="8", analysis_json={"result": {"objects": [
        obj(1, sam="wooden stand", description="giá đỡ bằng gỗ"),
        obj(2, sam="red ball", description="quả bóng đỏ treo trên dây", confirmed=True),
        obj(3, name="sợi dây", description=""),
        obj(4, sam="ruler", description="thước đo chiều dài"),
    ]}})
    hero = blocks_of(cp.build_cover_prompt(lab)[0])[1]
    assert hero.startswith("Show red ball (quả bóng đỏ treo trên dây); wooden stand (giá đỡ bằng gỗ); sợi dây.")
    assert "ruler" not in hero  # grades 6-9: three objects at most


def test_upper_secondary_shows_up_to_four_objects_and_clips_descriptions():
    long_text = "mô tả rất dài " * 40
    lab = make_lab(grade="11", analysis_json={"result": {"objects": [obj(i, sam=f"part {i}", description=long_text) for i in range(6)]}})
    hero = blocks_of(cp.build_cover_prompt(lab)[0])[1]
    assert [f"part {i}" in hero for i in range(6)] == [True] * 4 + [False] * 2
    assert "…" in hero and long_text.strip() not in hero


def test_glossary_adds_up_to_six_english_terms_without_repeating_objects():
    glossary = [{"id": f"g{i}", "vi": f"từ {i}", "en": term} for i, term in enumerate(
        ["red ball", "period", "amplitude", "Period", "gravity", "frequency", "string length", "damping", "phase"])]
    lab = make_lab(spec_json={"glossary": glossary}, analysis_json={"result": {"objects": [obj(1, sam="red ball", description="quả bóng")]}})
    hero = blocks_of(cp.build_cover_prompt(lab)[0])[1]
    assert "Key ideas, as context only: period, amplitude, gravity, frequency, string length, damping." in hero
    assert "phase" not in hero


def test_paper2explorer_facts_become_a_physical_metaphor():
    paper = {
        "title": "Attention Is All You Need",
        "summary": "The Transformer relies entirely on attention. It drops recurrence and convolutions.",
        "figures": [
            {"id": "f1", "caption": "The Transformer model architecture."},
            {"id": "f2", "caption": "", "description": "Scaled dot-product attention."},
            {"id": "f3", "caption": "Multi-head attention."},
        ],
        "methods": [{"id": "m1", "title": "Scaled dot-product attention"}, {"id": "m2", "title": "Positional encoding"}],
    }
    lab = make_lab(space="paper2explorer", subject="computer_science", grade="university", topic=None,
                   title="Scaled Dot-Product Attention", analysis_json={"paper": paper})
    prompt, style = cp.build_cover_prompt(lab)
    hero = blocks_of(prompt)[1]
    assert style == "riso"
    assert hero.startswith(cp.PAPER_HERO)
    assert "Paper: Attention Is All You Need." in hero
    assert "The Transformer relies entirely on attention." in hero and "convolutions" not in hero  # first sentence only
    assert "Figures: The Transformer model architecture; Scaled dot-product attention." in hero  # two captions
    assert "Multi-head attention" not in hero
    assert "Methods: Scaled dot-product attention, Positional encoding." in hero


def test_a_research_paper_with_a_known_model_keeps_the_scene_and_its_context():
    lab = make_lab(space="paper2explorer", subject="computer_science", grade="university",
                   spec_json={"blocks": [{"type": "algorithm", "algorithm": "attention"}]},
                   analysis_json={"paper": {"title": "Attention Is All You Need", "summary": "Attention is enough. More text.",
                                            "methods": [{"id": "m", "title": "Multi-head"}]}})
    hero = blocks_of(cp.build_cover_prompt(lab)[0])[1]
    assert hero.startswith("Show " + cp.ALGORITHM_SCENES["attention"])
    assert "Attention Is All You Need" in hero and "Attention is enough." in hero
    assert "Methods" not in hero


def test_a_new_lab_with_nothing_analysed_still_gets_a_hero():
    prompt, style = cp.build_cover_prompt(make_lab(topic=None, spec_json={}, analysis_json={}), "auto", None)
    assert style == "clay" and cp.GENERIC_HERO in prompt and "Con lắc đơn" in prompt


@pytest.mark.parametrize("bad", [None, [], "x", {"result": {"objects": "nope"}}, {"blocks": 3}])
def test_broken_stored_json_is_read_defensively(bad):
    prompt, _ = cp.build_cover_prompt(make_lab(spec_json=bad, analysis_json=bad))
    assert prompt.endswith(blocks_of(prompt)[-1]) and "No text" in prompt


def test_an_analysis_that_no_longer_validates_keeps_its_valid_part():
    analysis = {"status": "weird", "result": {"objects": [obj(1, sam="beaker", description="cốc thủy tinh")]}, "paper": {"title": "x" * 999}}
    hero = blocks_of(cp.build_cover_prompt(make_lab(subject="chemistry", analysis_json=analysis))[0])[1]
    assert hero.startswith("Show beaker (cốc thủy tinh).")


# ============================================================================ subject names and length
def test_agriculture_has_its_own_subject_name():
    assert SUBJECT_NAMES["agriculture"] == ("Nông nghiệp", "Agriculture")
    assert subject_name("agriculture") == "Agriculture (Nông nghiệp)"
    prompt, style = cp.build_cover_prompt(make_lab(subject="agriculture", grade="university", space="paper2explorer"))
    assert prompt.startswith("Cover picture for a university agriculture lesson") and style == "papercut"


def test_other_subject_is_not_named():
    assert cp.build_cover_prompt(make_lab(subject="other", grade="7"))[0].startswith("Cover picture for a grade 7 lesson titled")


def worst_lab(**fields) -> SimpleNamespace:
    """Every fact at its schema maximum."""
    long = "từ ngữ dài " * 200
    facts = dict(
        topic=("Chủ đề rất dài " * 20)[:200],
        title="T" * 160,
        subject="environment",
        grade="12",
        spec_json={"glossary": [{"id": f"g{i}", "vi": "x", "en": f"term number {i} " * 10} for i in range(120)]},
        analysis_json={
            "result": {"objects": [obj(i, sam=f"object phrase {i} " * 10, description=long[:2000], confirmed=i % 2 == 0) for i in range(40)]},
            "paper": {"title": long[:200], "summary": long, "figures": [{"id": f"f{i}", "caption": long[:2000]} for i in range(60)],
                      "methods": [{"id": f"m{i}", "title": long[:200]} for i in range(30)]},
        },
    )
    facts.update(fields)
    return make_lab(**facts)


@pytest.mark.parametrize("style", ["auto", *cp.STYLES])
@pytest.mark.parametrize("space", ["school2lab", "paper2explorer"])
def test_prompt_stays_within_the_cap_and_keeps_every_rule(style, space):
    idea = ("Ý tưởng của cô giáo cho bức tranh. " * 30)[:600]
    prompt, resolved = cp.build_cover_prompt(worst_lab(space=space), style, idea)
    assert len(prompt) <= cp.MAX_PROMPT_CHARS
    parts = blocks_of(prompt)
    assert cp.PRESETS[resolved] in parts and cp.HOUSE in parts and cp.COMPOSITION in parts
    assert parts[-1].startswith("No text") and parts[-2].startswith("Teacher's idea")
    assert "  " not in prompt


def test_facts_give_way_before_a_short_teacher_idea():
    idea = "Một chiếc lá xanh lớn đón nắng từ góc trên bên trái, vài giọt nước đọng trên mặt lá, nền giấy kem ấm áp và thật yên tĩnh."
    prompt, _ = cp.build_cover_prompt(worst_lab(), "auto", idea)
    assert len(prompt) <= cp.MAX_PROMPT_CHARS
    assert f"Teacher's idea, followed within these rules: {idea}" in prompt


def test_the_studio_idea_limit_always_fits_whole():
    """The studio caps the teacher's idea at 250 characters: it is never shortened, even when
    every other fact is at its maximum (the facts and the topic give way instead)."""
    idea = ("Một quả bóng đỏ treo trên sợi dây mảnh, nền giấy kem. " * 10)[:250]
    for style in cp.STYLES:
        for space in ("school2lab", "paper2explorer"):
            prompt, _ = cp.build_cover_prompt(worst_lab(space=space, grade="12"), style, idea)
            assert len(prompt) <= cp.MAX_PROMPT_CHARS
            assert idea.strip() in prompt


def test_a_typical_lesson_keeps_all_of_its_facts():
    lab = make_lab(spec_json={"blocks": [{"type": "simulation", "model": "pendulum"}],
                              "glossary": [{"id": "g1", "vi": "chu kỳ", "en": "period"}, {"id": "g2", "vi": "biên độ", "en": "amplitude"}]})
    prompt, _ = cp.build_cover_prompt(lab, "auto", "quả bóng đỏ treo trên dây")
    assert cp.SIM_SCENES["pendulum"] in prompt and "period, amplitude" in prompt and "quả bóng đỏ treo trên dây" in prompt
    assert len(prompt) <= cp.MAX_PROMPT_CHARS
