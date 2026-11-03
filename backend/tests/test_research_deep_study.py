"""Editorial integrity and schema checks for the reviewed research batch."""
from collections import Counter
from urllib.parse import urlparse

from app.schemas.spec import LabSpec
from app.seed.demo import Ctx
from app.seed.research_deep_study import DEEP_STUDY_DEMOS, _DEVICE_VIEW, _RECORDS


def test_batch_has_distinct_primary_sources_and_balanced_domains():
    assert Counter(r["domain"] for r in _RECORDS) == {
        "agriculture": 3, "physical_chemistry": 2, "semiconductors": 5,
    }
    for field in ("share_code", "doi", "fulltext_url"):
        assert len({r[field] for r in _RECORDS}) == 10
    for r in _RECORDS:
        assert urlparse(r["fulltext_url"]).netloc == "pmc.ncbi.nlm.nih.gov"
        assert r["license"] and len(r["key_claims"]) >= 3
        assert len(r["lesson_flow"]) >= 4 and len(r["questions"]) >= 3
        assert all(c["source_section"] in r["source_sections"] for c in r["key_claims"])
        assert len({q["answer_index"] for q in r["questions"]}) >= 2
        assert all(0 <= q["answer_index"] < len(q["options"]) for q in r["questions"])


def test_every_demo_builds_a_valid_referenced_english_lesson():
    assert len(DEEP_STUDY_DEMOS) == 10
    for demo, record in zip(DEEP_STUDY_DEMOS, _RECORDS, strict=True):
        context = Ctx()
        context.src["paper"] = "source-1"
        raw, _ = demo.build(context)
        spec = LabSpec.model_validate(raw)
        assert demo.language == "en" and demo.code == record["share_code"]
        assert record["fulltext_url"] in demo.sources[0].text
        blocks = {block.id: block for block in spec.blocks}
        assert blocks["visual3d"].visual3d == record["visual_kind"]
        if demo.code in _DEVICE_VIEW:
            assert (blocks["visual3d"].visual_mode, blocks["visual3d"].visual_geometry) == _DEVICE_VIEW[demo.code]
        if record["domain"] == "agriculture":
            assert demo.subject == "agriculture"
        assert len(blocks["steps"].steps) >= 4
        assert len(blocks["quiz"].questions) >= 3
        for step in blocks["steps"].steps:
            assert step.source_refs and "Source section:" in step.body
        for question in blocks["quiz"].questions:
            assert question.source_refs and question.explanation
