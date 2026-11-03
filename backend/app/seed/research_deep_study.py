"""Reviewed English lessons with traceable, openly accessible primary papers.

The JSON manifest is shared with research tooling and is the single editorial
source for this batch. It contains paraphrases, not republished paper figures
or full text. Every interactive model is a separate teaching illustration.
"""
from __future__ import annotations

import json
from pathlib import Path

from .demo import Ctx, DemoDef, SourceDef, question

_MANIFEST = Path(__file__).resolve().parents[3] / "shared" / "paper_study_batch.json"
_RECORDS = json.loads(_MANIFEST.read_text(encoding="utf-8"))
_SUBJECTS = {"agriculture": "agriculture", "physical_chemistry": "chemistry", "semiconductors": "engineering"}
_DEVICE_VIEW = {
    "CHNASH": ("device", "nanosheet"),
    "CHNWRE": ("device", "nanowire"),
    "CHCMPS": ("cmos", "planar"),
    "CHMSTE": ("device", "planar"),
    "CHMEMS": ("memristor", "planar"),
}


def _make_demo(record: dict) -> DemoDef:
    author_names = ", ".join(record["authors"])
    citation = f"{author_names} ({record['year']}). {record['title']}. DOI: {record['doi']}"
    # This note is explicitly a pointer and paraphrase index, not a local PDF.
    claim_index = "\n".join(
        f"Section {claim['source_section']}: {claim['text']}" for claim in record["key_claims"]
    )
    section_index = "\n".join(f"Section {i}: {name}" for i, name in enumerate(record["source_sections"], 1))
    source_text = (
        f"Bibliographic and reading note; this is not the full paper.\n{citation}\n"
        f"Original full text: {record['fulltext_url']}\nOriginal PDF: {record['pdf_url']}\n"
        f"DOI landing page: {record['landing_url']}\n"
        f"Article reuse terms: {record['license']}; consult the original publication for details.\n\n"
        f"Section index (not PDF page numbers):\n{section_index}\n\nParaphrased reading guide:\n{claim_index}"
    )

    def build(c: Ctx):
        general_ref = c.ref("paper")
        def section_ref(section: str):
            return c.ref("paper", page_label=f"Section {record['source_sections'].index(section) + 1}")

        stages = record["lesson_flow"]
        blocks = [
            {"id": "reading", "type": "text", "confirmed": True,
             "title": "The original research paper", "source_refs": [general_ref],
             "body": (f"{citation}\n\nRead the complete article: {record['fulltext_url']}\n"
                      f"Original PDF: {record['pdf_url']}\n\n"
                      "This lesson paraphrases the paper and identifies sections for follow-up. "
                      "Its interactive models are separate educational illustrations, not research data.")},
            {"id": "steps", "type": "steps", "title": "Read the evidence step by step",
             "description": "Read each step, then use the named section to inspect the original article.",
             "confirmed": True, "sequence_confirmed": True, "source_refs": [general_ref],
             "steps": [{"id": f"s{i}", "title": stage["title"],
                        "body": f"{stage['body']}\n\nSource section: {stage['source_section']}.",
                        "check_question": stage["check_question"],
                        "source_refs": [section_ref(stage["source_section"])]}
                       for i, stage in enumerate(stages, 1)]},
            {"id": "flow", "type": "flow", "title": "Connect the investigation",
             "description": "Follow the reasoning from the research question to interpretation and limitations.",
             "confirmed": True, "source_refs": [general_ref], "layout": "linear",
             "nodes": [{"id": f"n{i}", "label": stage["title"],
                        "description": stage["body"], "source_refs": [section_ref(stage["source_section"])]}
                       for i, stage in enumerate(stages, 1)],
             "edges": [{"id": f"e{i}", "source": f"n{i}", "target": f"n{i+1}"}
                       for i in range(1, len(stages))]},
            {"id": "visual3d", "type": "text", "title": "Explore the idea in 3D",
             "body": record["visual_task"], "visual3d": record["visual_kind"],
             "confirmed": True, "source_refs": [general_ref]},
            {"id": "limits", "type": "text", "title": "What the evidence does and does not show",
             "body": "\n\n".join(record["limitations"]), "confirmed": True, "source_refs": [general_ref]},
            {"id": "quiz", "type": "quiz", "title": "Check your understanding",
             "confirmed": True, "source_refs": [general_ref],
             "questions": [question(f"q{i}", "mcq", item["prompt"], item["options"],
                                    answer_index=item["answer_index"],
                                    explanation=f"{item['explanation']} Source section: {item['source_section']}.",
                                    refs=[section_ref(item["source_section"])])
                           for i, item in enumerate(record["questions"], 1)]},
        ]
        if record["share_code"] in _DEVICE_VIEW:
            mode, geometry = _DEVICE_VIEW[record["share_code"]]
            visual = next(block for block in blocks if block["id"] == "visual3d")
            visual.update(visual_mode=mode, visual_geometry=geometry)
        return {"schema_version": 1,
                "summary": f"Read and critically explore {record['title']} using the original research and a conceptual interactive model.",
                "objectives": record["learning_objectives"],
                "assumptions": [{"id": f"a{i}", "confirmed": True, "text": limit}
                                for i, limit in enumerate(record["limitations"], 1)],
                "blocks": blocks}, None

    return DemoDef(record["share_code"], "paper2explorer", record["title"],
                   _SUBJECTS[record["domain"]], "university", record["title"],
                   "explore_paper", "detailed",
                   [SourceDef("paper", "note", f"Reading guide: {record['title']}", text=source_text)],
                   build, language="en")


DEEP_STUDY_DEMOS = [_make_demo(record) for record in _RECORDS]
