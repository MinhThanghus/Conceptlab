"""Translate a lab's text (vi ↔ en) for the teacher to review before applying (spec §10.4).

Every translatable string of the spec is extracted with its path, translated in batches with
a structured call (ids preserved), and written back into a deep copy. Ids, numbers,
expressions, symbols, units, quotes and LaTeX never change: math segments are replaced by
placeholders before translation and restored afterwards (a translation that loses a
placeholder is discarded, keeping the original text). Nothing is saved here.
"""

from __future__ import annotations

import asyncio
import copy
import re
from typing import Any

from sqlalchemy.orm import Session

from ..ai import prompts
from ..ai.client import get_ai
from ..ai.outputs import TranslateOutput, clip
from ..models import Lab
from ..schemas.api import TranslateIn, TranslateOut
from ..schemas.spec import LabSpec
from ..security import Actor
from .analysis import call_ctx, choose_mode, effort
from .generation import new_id

Path = tuple[Any, ...]

CHUNK_ITEMS = 60
CHUNK_CHARS = 9000
CONCURRENCY = 3
MATH_RE = re.compile(r"\$\$.+?\$\$|\$[^$\n]+?\$", re.DOTALL)
PLACEHOLDER_RE = re.compile(r"⟦M\d+⟧")

LIMITS = {
    "title": 200, "label": 200, "name": 200, "x_label": 200, "y_label": 200, "observe": 200, "option": 200, "lead": 200,
    "feedback": 400,
    "description": 2000, "check_question": 2000, "description_simple": 2000, "note": 2000, "prompt": 2000,
    "question": 2000, "limits_note": 2000, "text": 2000, "objective": 2000, "explanation_short": 2000,
    "context": 2000, "hint": 2000,
    "body": 12000, "description_detailed": 12000, "notes": 12000, "summary": 12000, "explanation": 12000,
}

# Per block type: (list key or "" for the block itself, [text fields]).
BLOCK_FIELDS: dict[str, list[tuple[str, list[str]]]] = {
    "steps": [("steps", ["title", "body", "check_question"])],
    "flow": [("nodes", ["label", "description"]), ("edges", ["label", "description"])],
    "diagram": [("hotspots", ["label", "description_simple", "description_detailed"]), ("relations", ["label", "description"])],
    "graph": [("", ["x_label", "y_label", "explanation"]), ("params", ["name"])],
    "simulation": [("", ["notes"]), ("params", ["name"])],
    "algorithm": [("", ["explanation"])],
    "video": [("", ["limits_note"]), ("markers", ["label", "note"])],
    "field": [("", ["prompt"]), ("frames", ["note"]), ("solution_frames", ["note"])],
    "quiz": [("questions", ["context", "prompt", "hint", "explanation"])],
    "widget": [("", ["prompt"])],
    "text": [("", ["body"])],
    # The transcribed lines and the words before a formula; LaTeX and drawing labels stay as written
    # (the redrawn sheet keeps the original language), crossed-out lines are never shown.
    "board": [("items", ["text", "lead"])],
}


def _worth(text: Any) -> bool:
    return isinstance(text, str) and len(text.strip()) >= 2 and any(ch.isalpha() for ch in text)


def extract_strings(spec: dict[str, Any]) -> list[tuple[Path, str, int]]:
    """(path, text, max_length) for every translatable string."""
    out: list[tuple[Path, str, int]] = []

    def add(path: Path, text: Any, limit: int) -> None:
        if _worth(text):
            out.append((path, text, limit))

    add(("summary",), spec.get("summary"), LIMITS["summary"])
    for i, text in enumerate(spec.get("objectives") or []):
        add(("objectives", i), text, LIMITS["objective"])
    for i, item in enumerate(spec.get("assumptions") or []):
        add(("assumptions", i, "text"), item.get("text"), LIMITS["text"])
    for i, item in enumerate(spec.get("glossary") or []):
        add(("glossary", i, "note"), item.get("note"), LIMITS["note"])
    for b, block in enumerate(spec.get("blocks") or []):
        kind = block.get("type")
        base: Path = ("blocks", b)
        add(base + ("title",), block.get("title"), LIMITS["title"])
        add(base + ("description",), block.get("description"), LIMITS["description"])
        for list_key, fields in BLOCK_FIELDS.get(kind, []):
            if not list_key:
                for name in fields:
                    limit = LIMITS["explanation"] if name == "explanation" else LIMITS.get(name, 2000)
                    add(base + (name,), block.get(name), limit)
                continue
            for j, item in enumerate(block.get(list_key) or []):
                if not isinstance(item, dict) or (kind == "board" and item.get("struck")):
                    continue
                for name in fields:
                    limit = LIMITS["explanation_short"] if name == "explanation" else LIMITS.get(name, 2000)
                    add(base + (list_key, j, name), item.get(name), limit)
                if kind == "quiz" and item.get("kind") in ("mcq", "order"):
                    for k, option in enumerate(item.get("options") or []):
                        add(base + (list_key, j, "options", k), option, LIMITS["option"])
                if kind == "quiz" and item.get("kind", "mcq") in ("mcq", "truefalse"):
                    for k, note in enumerate(item.get("option_feedback") or []):
                        add(base + (list_key, j, "option_feedback", k), note, LIMITS["feedback"])
        active = block.get("active")
        if isinstance(active, dict):
            add(base + ("active", "question"), active.get("question"), LIMITS["question"])
            add(base + ("active", "explanation"), active.get("explanation"), LIMITS["explanation_short"])
            for k, option in enumerate(active.get("options") or []):
                add(base + ("active", "options", k), option, LIMITS["option"])
    return out


def set_path(data: Any, path: Path, value: Any) -> None:
    node = data
    for key in path[:-1]:
        node = node[key]
    node[path[-1]] = value


def protect_math(text: str) -> tuple[str, list[str]]:
    segments: list[str] = []

    def repl(match: re.Match) -> str:
        segments.append(match.group(0))
        return f"⟦M{len(segments)}⟧"

    return MATH_RE.sub(repl, text), segments


def restore_math(text: str, segments: list[str]) -> str | None:
    """Put formulas back; None if the translation lost or invented a placeholder."""
    found = PLACEHOLDER_RE.findall(text)
    if sorted(found) != sorted(f"⟦M{i}⟧" for i in range(1, len(segments) + 1)):
        return None
    for i, segment in enumerate(segments, start=1):
        text = text.replace(f"⟦M{i}⟧", segment)
    return text


def chunk(items: list[dict[str, str]]) -> list[list[dict[str, str]]]:
    chunks: list[list[dict[str, str]]] = []
    current: list[dict[str, str]] = []
    size = 0
    for item in items:
        if current and (len(current) >= CHUNK_ITEMS or size + len(item["text"]) > CHUNK_CHARS):
            chunks.append(current)
            current, size = [], 0
        current.append(item)
        size += len(item["text"])
    if current:
        chunks.append(current)
    return chunks


async def translate_spec(db: Session, lab: Lab, actor: Actor, body: TranslateIn) -> TranslateOut:
    target = body.target
    spec = LabSpec.model_validate(lab.spec_json or {}).model_dump(mode="json")
    entries = extract_strings(spec)
    items, math_by_id, path_by_id, limit_by_id = [], {}, {}, {}
    for i, (path, text, limit) in enumerate(entries, start=1):
        item_id = f"t{i}"
        protected, segments = protect_math(text)
        items.append({"id": item_id, "text": protected})
        math_by_id[item_id], path_by_id[item_id], limit_by_id[item_id] = segments, path, limit
    target_name = "Vietnamese" if target == "vi" else "English"
    source_name = "English" if target == "vi" else "Vietnamese"
    mode, _ = choose_mode(lab)
    semaphore = asyncio.Semaphore(CONCURRENCY)
    db.commit()

    async def run(batch: list[dict[str, str]]) -> TranslateOutput:
        task = prompts.TRANSLATE_TASK.format(
            source=source_name, target=target_name, audience=prompts.audience(lab.grade), items=prompts.as_json(batch, 40000)
        )
        async with semaphore:
            result = await get_ai().chat_json(
                messages=[{"role": "system", "content": prompts.system_prompt(lab, role="a careful translator of teaching materials")},
                          {"role": "user", "content": task}],
                ctx=call_ctx("translate", actor, lab),
                model_cls=TranslateOutput,
                name="translate",
                mode=mode,
                effort=effort(False),
            )
        return result.data

    batches = chunk(items) if items else []
    results = await asyncio.gather(*(run(b) for b in batches)) if batches else []
    translated = copy.deepcopy(spec)
    glossary_terms = []
    for out in results:
        glossary_terms.extend(out.glossary)
        for item in out.items:
            if item.id not in path_by_id or not item.text.strip():
                continue
            restored = restore_math(item.text.strip(), math_by_id[item.id])
            if restored is None:
                continue
            set_path(translated, path_by_id[item.id], clip(restored, limit_by_id[item.id]))
    tf = prompts.msg("tf_options", target).split("|")
    for block in translated.get("blocks") or []:
        if block.get("type") == "quiz":
            for q in block.get("questions") or []:
                if q.get("kind") == "truefalse":
                    q["options"] = tf
    glossary = list(translated.get("glossary") or [])
    seen = {(str(g.get("vi", "")).lower(), str(g.get("en", "")).lower()) for g in glossary}
    ids = {g.get("id") for g in glossary}
    for term in glossary_terms:
        key = (term.vi.strip().lower(), term.en.strip().lower())
        if not key[0] or not key[1] or key in seen or len(glossary) >= 120:
            continue
        seen.add(key)
        gid = f"g{len(glossary) + 1}"
        while gid in ids:
            gid = new_id("g")
        ids.add(gid)
        glossary.append({"id": gid, "vi": clip(term.vi, 200), "en": clip(term.en, 200), "note": clip(term.note, 2000)})
    translated["glossary"] = glossary
    final = LabSpec.model_validate(translated).model_dump(mode="json")
    return TranslateOut(spec=final, target=target)
