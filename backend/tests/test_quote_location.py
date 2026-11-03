"""Regression: a PDF prefix match is not an exact quotation."""
import pymupdf
import pytest

from app.ai.outputs import AICite
from app.db import SessionLocal
from app.models import Source
from app.seed.demo import Ctx
from app.services import media
from app.services.analysis import Material, resolve_cite, snapshot_source
from tests.conftest import create_lab

PREFIX = "A wave moves through the"
FULL = PREFIX + " water carrying energy."
FABRICATED = PREFIX + " crystalline cloud of impossible claims."
MISSING = "Unrelated words never present in either page."


@pytest.fixture
def uploaded_pdf(teacher):
    client, _ = teacher
    lab = create_lab(client)
    doc = pymupdf.open()
    first = doc.new_page()
    first.insert_text((72, 72), PREFIX + " air in this preliminary example.")
    second = doc.new_page()
    second.insert_text((72, 72), FULL)
    content = doc.tobytes()
    doc.close()
    result = client.post(
        f"/api/labs/{lab['id']}/sources",
        files={"file": ("citation-test.pdf", content, "application/pdf")},
    )
    assert result.status_code == 201, result.text
    source_id = result.json()["id"]
    with SessionLocal() as db:
        info = snapshot_source(db.get(Source, source_id))
    return client, info


def test_pdf_search_prioritizes_complete_match_and_marks_prefix_approximate(uploaded_pdf):
    _, info = uploaded_pdf
    partial = media.locate_quote(info.storage_key, FABRICATED, page_hint=1)
    assert partial["located"] == "approximate"
    assert partial["matched_quote"] == PREFIX
    assert partial["page"] == 1 and partial["bbox"] and partial["rects"]

    # Page 1 has a matching prefix, but the complete quote on page 2 wins.
    complete = media.locate_quote(info.storage_key, FULL, page_hint=1)
    assert complete["located"] == "exact"
    assert complete["matched_quote"] == FULL and complete["page"] == 2
    assert media.locate_quote(info.storage_key, MISSING, page_hint=1) is None


def test_source_locate_api_reports_partial_exact_and_missing(uploaded_pdf):
    client, info = uploaded_pdf
    endpoint = f"/api/sources/{info.id}/locate"
    def locate(quote):
        response = client.post(endpoint, json={"quote": quote, "page": 1})
        assert response.status_code == 200, response.text
        return response.json()

    partial, complete, missing = map(locate, (FABRICATED, FULL, MISSING))
    assert partial["located"] == "approximate" and partial["page"] == 1 and partial["bbox"]
    assert complete["located"] == "exact" and complete["page"] == 2 and complete["bbox"]
    assert missing["located"] == "none" and missing["bbox"] is None and missing["page"] is None


def test_ai_and_seed_citations_preserve_confidence_across_page_search(uploaded_pdf):
    _, info = uploaded_pdf
    material = Material(n=1, info=info, page_map=[1, 2], has_text_layer=True)
    def cite(quote):
        return resolve_cite(AICite(source=1, page_index=1, page_label="1", quote=quote,
                                   box=None, time=None), [material])

    partial, complete, missing = map(cite, (FABRICATED, FULL, MISSING))
    assert partial.located == "approximate" and partial.page == 1 and partial.bbox
    assert partial.quote == PREFIX and "impossible claims" not in partial.quote
    assert complete.located == "exact" and complete.page == 2 and complete.page_label is None
    assert missing.located == "none" and missing.bbox is None

    context = Ctx()
    context.src["paper"] = info.id
    context.pdf_keys["paper"] = info.storage_key
    partial_ref = context.pdf_ref("paper", FABRICATED, 1)
    complete_ref = context.pdf_ref("paper", FULL, 1)
    missing_ref = context.pdf_ref("paper", MISSING, 1)
    assert partial_ref["located"] == "approximate" and partial_ref["page"] == 1
    assert partial_ref["quote"] == PREFIX
    assert complete_ref["located"] == "exact" and complete_ref["page"] == 2
    assert missing_ref["located"] == "none" and missing_ref["bbox"] is None
