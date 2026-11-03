"""AI tutor (spec §10.1): grounded answers about the lesson, streamed as Server-Sent Events.

Context sent to Muse: lab meta, summary, objectives, assumptions, glossary, the focused
block (trimmed JSON), the client's live state and selection, numbered SOURCE EXCERPTS and the
last 8 messages of this user/viewer. Excerpts are paragraph blocks of the PDF pages the
lesson cites (exact bbox from the text layer), measured data and notes (exact), image/scan
evidence quoted during analysis (approximate) and confirmed video markers (time).

The model cites excerpts as ``[n]``; only markers that exist become citations (invalid ones
are removed from the saved answer). Learners see the published snapshot only, with quiz answers
withheld exactly as on the share page (``share.learner_spec``), and a passage they point at
becomes an excerpt only when the published lesson cites it.
"""

from __future__ import annotations

import json
import logging
import re
import secrets
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

import anyio
import pymupdf
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import storage
from ..ai import prompts
from ..ai.client import get_ai
from ..ai.outputs import clip
from ..db import SessionLocal, utcnow
from ..errors import AppError
from ..models import ChatMessage, Lab, Source
from ..schemas.analysis import LabAnalysis
from ..schemas.api import ChatIn, ChatMessageOut, Citation
from ..security import Actor
from .analysis import call_ctx, choose_mode, data_note, data_rows, effort, format_value
from .learning import trim
from .share import LearnerView, learner_spec

log = logging.getLogger("conceptlab.tutor")

MAX_EXCERPT_CHARS = 12000
MAX_PAGES = 4
HISTORY_TURNS = 8
HISTORY_LIMIT = 50
MARKER_RE = re.compile(r"\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\]")


@dataclass
class Excerpt:
    n: int
    source_id: str
    title: str
    text: str
    page: int | None = None
    bbox: list[float] | None = None
    time: float | None = None
    located: str = "none"

    def line(self) -> str:
        where = []
        if self.page:
            where.append(f"page {self.page}")
        if self.time is not None:
            where.append(f"{self.time:.1f} s")
        loc = f" ({', '.join(where)})" if where else ""
        return f"[{self.n}] “{self.title}”{loc}: {self.text}"

    def citation(self) -> Citation:
        return Citation(
            n=self.n,
            source_id=self.source_id,
            title=self.title[:200],
            page=self.page,
            bbox=self.bbox,
            time=self.time,
            quote=self.text[:300],
            located=self.located,  # type: ignore[arg-type]
        )


@dataclass
class TutorContext:
    messages: list[dict[str, Any]]
    excerpts: list[Excerpt]
    mode: str
    channel: str
    context_json: dict[str, Any] = field(default_factory=dict)


# ============================================================================ refs & excerpts
def walk_refs(node: Any, out: list[dict[str, Any]]) -> None:
    """Collect SourceRef-like dicts (anything with a source_id) in document order."""
    if isinstance(node, dict):
        if isinstance(node.get("source_id"), str) and ("located" in node or "quote" in node or "page" in node):
            out.append(node)
        for key, value in node.items():
            if key not in ("html", "mask_path", "tracks"):
                walk_refs(value, out)
    elif isinstance(node, list):
        for item in node:
            walk_refs(item, out)


def pdf_paragraphs(key: str, page: int) -> list[tuple[list[float], str]]:
    """Text blocks of one PDF page with normalized boxes (empty for scans)."""
    try:
        doc = pymupdf.open(storage.path_for(key))
    except Exception:  # noqa: BLE001 - unreadable file: no excerpts
        return []
    try:
        if not 1 <= page <= doc.page_count:
            return []
        pg = doc[page - 1]
        width, height = pg.rect.width or 1, pg.rect.height or 1
        blocks: list[tuple[list[float], str]] = []
        for x0, y0, x1, y1, text, _no, kind in pg.get_text("blocks"):
            text = " ".join(str(text).split())
            if kind != 0 or len(text) < 3:
                continue
            box = [x0 / width, y0 / height, x1 / width, y1 / height]
            if blocks and len(blocks[-1][1]) < 60:  # merge headings/fragments into the next paragraph
                prev_box, prev_text = blocks.pop()
                box = [min(prev_box[0], box[0]), min(prev_box[1], box[1]), max(prev_box[2], box[2]), max(prev_box[3], box[3])]
                text = prev_text + " " + text
            blocks.append(([round(max(0.0, min(1.0, v)), 4) for v in box], text))
        return blocks
    finally:
        doc.close()


class ExcerptBuilder:
    def __init__(self) -> None:
        self.items: list[Excerpt] = []
        self.chars = 0
        self.keys: set[tuple] = set()

    def full(self) -> bool:
        return self.chars >= MAX_EXCERPT_CHARS

    def add(self, src: Source, text: str, *, page=None, bbox=None, time=None, located="none") -> None:
        text = " ".join((text or "").split())
        if not text or self.full():
            return
        key = (src.id, page, tuple(bbox or ()), time, text[:80])
        if key in self.keys:
            return
        self.keys.add(key)
        text = text[: min(1600, MAX_EXCERPT_CHARS - self.chars)]
        self.items.append(
            Excerpt(n=len(self.items) + 1, source_id=src.id, title=src.title or src.kind, text=text, page=page, bbox=bbox, time=time, located=located)
        )
        self.chars += len(text)


def build_excerpts(
    sources: list[Source], refs: list[dict[str, Any]], focus_refs: list[dict[str, Any]], spec: dict[str, Any]
) -> list[Excerpt]:
    """Blocking (PDF reading). ``focus_refs`` come first, then the rest of ``refs``."""
    by_id = {s.id: s for s in sources}
    builder = ExcerptBuilder()
    ordered = [r for r in focus_refs + refs if r.get("source_id") in by_id]

    # 1. PDF pages cited by the focused content first, then by the lesson.
    pages: list[tuple[str, int]] = []
    for ref in ordered:
        src = by_id[ref["source_id"]]
        page = ref.get("page")
        if src.kind == "pdf" and isinstance(page, int) and (src.id, page) not in pages:
            pages.append((src.id, page))
    if not pages:
        for src in sources:
            if src.kind == "pdf" and src.status == "ready":
                pages.append((src.id, 1))
                if len(pages) >= 2:
                    break
    for sid, page in pages[:MAX_PAGES]:
        src = by_id[sid]
        paragraphs = pdf_paragraphs(src.storage_key, page) if src.storage_key and src.status == "ready" else []
        if paragraphs:
            for box, text in paragraphs:
                builder.add(src, text, page=page, bbox=box, located="exact")
        else:  # scan: use the words quoted from that page during analysis
            for ref in ordered:
                if ref.get("source_id") == sid and ref.get("page") == page and ref.get("quote"):
                    builder.add(src, ref["quote"], page=page, bbox=ref.get("bbox"), located="approximate")

    # 2. Measured data and teacher notes (the whole source is the evidence).
    for src in sources:
        if src.kind == "data":
            rows = data_rows(src.data_json)
            values = "; ".join(
                f"{r['symbol']} = {format_value(r['value'])}{(' ' + r['unit']) if r['unit'] else ''}" + (f" ({r['name']})" if r["name"] else "")
                for r in rows
            )
            note = data_note_from(src)
            builder.add(src, f"User-provided measurements: {values}" + (f". {note}" if note else ""), located="exact")
        elif src.kind == "note":
            builder.add(src, (src.text_content or "")[:1500], located="exact")

    # 3. Images and other evidence quoted in the lesson (approximate regions).
    for ref in ordered:
        src = by_id[ref["source_id"]]
        if src.kind == "image" and ref.get("quote"):
            builder.add(src, ref["quote"], bbox=ref.get("bbox"), located="approximate" if ref.get("bbox") else "none")
    for block in spec.get("blocks") or []:
        if block.get("type") == "diagram":
            image = block.get("image") or {}
            src = by_id.get(image.get("source_id") or "")
            if src is None:
                continue
            for hotspot in block.get("hotspots") or []:
                text = f"{hotspot.get('label', '')}: {hotspot.get('description_simple', '')}"
                builder.add(src, text, page=image.get("page"), bbox=hotspot.get("bbox"), located="approximate")
        elif block.get("type") == "video":
            src = by_id.get(block.get("source_id") or "")
            if src is None:
                continue
            for marker in block.get("markers") or []:
                text = f"{marker.get('label', '')}. {marker.get('note', '')}".strip()
                builder.add(src, text, time=marker.get("t"), located="approximate")
    return builder.items


def data_note_from(src: Source) -> str:
    data = src.data_json
    if isinstance(data, dict) and data.get("note"):
        return str(data["note"])[:500]
    return (src.text_content or "")[:500]


# ============================================================================ context
def lesson_content(spec: dict[str, Any]) -> str:
    lines = []
    if spec.get("summary"):
        lines.append("Summary: " + str(spec["summary"])[:2000])
    for objective in (spec.get("objectives") or [])[:8]:
        lines.append("Objective: " + str(objective)[:300])
    for a in (spec.get("assumptions") or [])[:12]:
        state = "confirmed" if a.get("confirmed") else "not yet confirmed"
        lines.append(f"Assumption ({state}): {str(a.get('text', ''))[:300]}")
    terms = [f"{g.get('vi', '')} = {g.get('en', '')}" for g in (spec.get("glossary") or [])[:30]]
    if terms:
        lines.append("Glossary (vi = en): " + "; ".join(terms))
    blocks = [f"{b.get('type')}: {b.get('title', '')}" for b in (spec.get("blocks") or [])[:40]]
    if blocks:
        lines.append("Blocks of the lesson: " + "; ".join(blocks))
    return "\n".join(lines) or "-"


def _quote_key(text: Any) -> str:
    return " ".join(str(text or "").split()).casefold()


def published_ref(ref: dict[str, Any], refs: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The lesson's own ref that a learner's ``source_ref`` points at (same source and page, its
    quote inside the published one), or None. The published ref is returned, never the client's."""
    quote = _quote_key(ref.get("quote"))
    for known in refs:
        if known.get("source_id") == ref.get("source_id") and known.get("page") == ref.get("page") and quote in _quote_key(known.get("quote")):
            return known
    return None


def focus_text(block: dict[str, Any] | None, context: Any, pointed: dict[str, Any] | None = None) -> str:
    """``pointed``: a source passage from the learner's screen that the lesson does not cite
    (plain focus text, never an excerpt or a citation)."""
    lines = []
    if block is not None:
        lines.append("Focused block (JSON): " + prompts.as_json(trim(block), 5000))
    if context is not None:
        if context.item_id:
            lines.append(f"Focused item id: {context.item_id}")
        if context.selection:
            lines.append(f"Selected text: {context.selection[:2000]}")
        if context.state:
            lines.append("CURRENT STATE (live values in the learner's screen): " + prompts.as_json(trim(context.state), 3000))
    if pointed is not None and pointed.get("quote"):
        page = f" (page {pointed['page']})" if pointed.get("page") else ""
        lines.append(f"Passage the learner points at{page}, not a source excerpt: {str(pointed['quote'])[:600]}")
    return "\n".join(lines) or "-"


def history_query(lab_id: str, channel: str, user_id: str | None, viewer_key: str | None):
    query = select(ChatMessage).where(ChatMessage.lab_id == lab_id, ChatMessage.channel == channel)
    if user_id:
        return query.where(ChatMessage.user_id == user_id)
    if viewer_key:
        return query.where(ChatMessage.viewer_key == viewer_key, ChatMessage.user_id.is_(None))
    return None


def recent_history(db: Session, lab_id: str, channel: str, user_id: str | None, viewer_key: str | None, limit: int) -> list[ChatMessage]:
    query = history_query(lab_id, channel, user_id, viewer_key)
    if query is None:
        return []
    rows = list(db.scalars(query.order_by(ChatMessage.created_at.desc()).limit(limit)))
    return list(reversed(rows))


def build_context(
    db: Session,
    lab: Lab,
    *,
    shared: bool,
    body: ChatIn,
    user_id: str | None,
    viewer_key: str | None,
) -> TutorContext:
    channel = "share" if shared else "studio"
    if shared:
        snap = lab.published_spec_json or {}
        # What the share page sends: quiz answers, explanations and option feedback withheld.
        spec = learner_spec(lab.id, snap.get("spec") or {})
        allowed = set(snap.get("source_ids") or [])
        # Same rule as the share page: media whose consent was withdrawn is not used (spec §16).
        sources = [s for s in lab.sources if s.id in allowed and not (s.contains_people and not s.consent_confirmed)]
    else:
        spec = lab.spec_json or {}
        sources = list(lab.sources)
    context = body.context
    block = None
    if context is not None and context.block_id:
        block = next((b for b in spec.get("blocks") or [] if b.get("id") == context.block_id), None)
    refs: list[dict[str, Any]] = []
    walk_refs(spec.get("blocks") or [], refs)
    focus_refs: list[dict[str, Any]] = []
    pointed = None
    if context is not None and context.source_ref is not None:
        ref = context.source_ref.model_dump(mode="json")
        if not shared:
            focus_refs.append(ref)
        else:  # a learner's quote is evidence only when the published lesson cites it
            known = published_ref(ref, refs)
            if known is not None:
                focus_refs.append(known)
            else:
                pointed = ref
    if block is not None:
        walk_refs(block, focus_refs)
    if not shared:
        analysis = LabAnalysis.model_validate(lab.analysis_json or {})
        if analysis.result is not None:
            walk_refs(analysis.result.model_dump(mode="json"), refs)
        if analysis.paper is not None:
            walk_refs(analysis.paper.model_dump(mode="json"), refs)
    excerpts = build_excerpts(sources, refs, focus_refs, spec)
    lang = lab.language
    system = prompts.TUTOR_SYSTEM.format(
        audience=prompts.audience(lab.grade),
        level=prompts.level_rule(lab.level),
        language=prompts.language_name(lang),
        beyond_label=prompts.BEYOND_LABEL.get(lang, prompts.BEYOND_LABEL["en"]),
        audience_rule=prompts.TUTOR_AUDIENCE_RULE[channel],
    )
    excerpt_text = "\n".join(e.line() for e in excerpts) or "(no source excerpts are available: say that the lesson sources do not cover this)"
    system += "\n\n" + "\n\n".join(
        [
            prompts.lesson_context(LearnerView(lab) if shared else lab),  # learners: the published title
            "LESSON CONTENT\n" + lesson_content(spec),
            "FOCUS\n" + focus_text(block, context, pointed),
            "SOURCE EXCERPTS (cite with [n])\n" + excerpt_text,
        ]
    )
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for row in recent_history(db, lab.id, channel, user_id, viewer_key, HISTORY_TURNS):
        messages.append({"role": row.role, "content": row.content[:3000]})
    messages.append({"role": "user", "content": body.message})
    mode, _ = choose_mode(lab)
    context_json = context.model_dump(mode="json", exclude_none=True) if context is not None else {}
    if "state" in context_json:
        context_json["state"] = trim(context_json["state"])
    return TutorContext(messages=messages, excerpts=excerpts, mode=mode, channel=channel, context_json=context_json)


# ============================================================================ citations
def extract_citations(text: str, excerpts: list[Excerpt]) -> tuple[str, list[Citation]]:
    """Keep only markers that point at real excerpts; return (clean text, citations used)."""
    valid = {e.n: e for e in excerpts}
    used: set[int] = set()

    def repl(match: re.Match) -> str:
        numbers = [int(x) for x in re.split(r"\s*[,;]\s*", match.group(1)) if x.strip().isdigit()]
        kept = [n for n in dict.fromkeys(numbers) if n in valid]
        used.update(kept)
        return "".join(f"[{n}]" for n in kept)

    clean = MARKER_RE.sub(repl, text)
    clean = re.sub(r"[ \t]+([.,;:!?])", r"\1", clean)
    clean = re.sub(r"[ \t]{2,}", " ", clean).strip()
    return clean, [valid[n].citation() for n in sorted(used)]


# ============================================================================ streaming
def sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


def message_out(row: ChatMessage) -> ChatMessageOut:
    citations = []
    for item in row.citations_json or []:
        try:
            citations.append(Citation.model_validate(item))
        except Exception:  # noqa: BLE001 - skip malformed legacy rows
            continue
    return ChatMessageOut(id=row.id, role=row.role, content=row.content, citations=citations, created_at=row.created_at)


def persist(lab_id: str, channel: str, user_id: str | None, viewer_key: str | None, question: str,
            context_json: dict[str, Any], answer: str, citations: list[Citation]) -> ChatMessageOut:
    db = SessionLocal()
    try:
        now = utcnow()
        user_row = ChatMessage(
            lab_id=lab_id, user_id=user_id, viewer_key=viewer_key, channel=channel, role="user",
            content=question, context_json=context_json, citations_json=[], created_at=now,
        )
        assistant_row = ChatMessage(
            lab_id=lab_id, user_id=user_id, viewer_key=viewer_key, channel=channel, role="assistant",
            content=answer, context_json={}, citations_json=[c.model_dump(mode="json") for c in citations],
            created_at=now + timedelta(milliseconds=1),
        )
        db.add_all([user_row, assistant_row])
        db.commit()
        db.refresh(assistant_row)
        return message_out(assistant_row)
    finally:
        db.close()


async def stream_answer(
    lab: Lab, actor: Actor | None, ctx: TutorContext, question: str, user_id: str | None, viewer_key: str | None
) -> AsyncIterator[str]:
    lab_id = lab.id
    call = call_ctx("chat", actor, lab)
    yield ": ok\n\n"
    parts: list[str] = []
    try:
        async for delta in get_ai().chat_stream(messages=ctx.messages, ctx=call, mode=ctx.mode, effort=effort(False)):
            parts.append(delta)
            yield sse("delta", {"text": delta})
    except AppError as exc:
        yield sse("error", {"code": exc.code, "message": exc.message})
        return
    except Exception:  # noqa: BLE001 - the stream must end with an event
        log.exception("tutor stream failed")
        yield sse("error", {"code": "ai_upstream_error", "message": "The AI service had a problem, please retry"})
        return
    answer = "".join(parts).strip()
    if not answer:
        yield sse("error", {"code": "ai_bad_output", "message": "The AI response was empty"})
        return
    clean, citations = extract_citations(answer, ctx.excerpts)
    try:
        out = await anyio.to_thread.run_sync(
            lambda: persist(lab_id, ctx.channel, user_id, viewer_key, question, ctx.context_json, clip(clean, 20000), citations)
        )
    except Exception:  # noqa: BLE001
        log.exception("could not save tutor messages")
        yield sse("error", {"code": "internal_error", "message": "The answer could not be saved"})
        return
    yield sse("done", out.model_dump(mode="json"))


def new_viewer_key() -> str:
    return secrets.token_urlsafe(18)


def history(db: Session, lab: Lab, channel: str, user_id: str | None, viewer_key: str | None) -> list[ChatMessageOut]:
    return [message_out(r) for r in recent_history(db, lab.id, channel, user_id, viewer_key, HISTORY_LIMIT)]


__all__ = ["build_context", "data_note", "extract_citations", "history", "stream_answer", "sse"]
