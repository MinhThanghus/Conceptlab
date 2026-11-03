"""Seed the published demo labs (idempotent).

    python -m app.cli seed-demo             # create missing demos
    python -m app.cli seed-demo --force     # recreate them (deletes learners' attempts on them)
    python -m app.seed.demo --refresh       # update existing demos in place (keeps codes and learners' rows)

Demo materials in ``app/seed/assets`` are original illustrations made for ConceptLab:
textbook pages typeset in HTML/CSS and procedural Three.js scenes rendered in headless
Chromium (scripts/render/render.py; scripts/make_demo_assets.py builds the PDF and calls it).
Regions the lessons cite are measured on those renders (quote boxes from the DOM, diagram
parts from per-part masks in ``*_regions.json``). The pendulum cut-out and the ball track were
produced with the real SAM 3.1 API (scripts/make_sam_cutout.py, make_sam_track.py).
Lesson content is hand-written and reviewed (spec §14: demos use checked materials).
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy import select

from .. import storage
from ..db import SessionLocal, utcnow
from ..models import Asset, Lab, Source, User
from ..schemas.analysis import LabAnalysis
from ..schemas.spec import LabSpec
from ..security import Actor
from ..services import labs as lab_service
from ..services import media

ASSETS = Path(__file__).resolve().parent / "assets"
DEMO_EMAIL = "demo@conceptlab.local"


@dataclass
class SourceDef:
    key: str
    kind: str  # pdf | image | video | data | note
    title: str
    file: str | None = None
    data: list[dict[str, Any]] | None = None
    text: str | None = None
    contains_people: bool = False


@dataclass
class AssetDef:
    key: str
    kind: str
    file: str
    source_key: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class DemoDef:
    code: str
    space: str
    title: str
    subject: str
    grade: str
    topic: str
    goal: str
    level: str
    sources: list[SourceDef]
    build: Callable[["Ctx"], tuple[dict[str, Any], dict[str, Any] | None]]
    assets: list[AssetDef] = field(default_factory=list)
    language: str = "vi"


class Ctx:
    """Ids of created sources/assets + helpers to write SourceRefs honestly."""

    def __init__(self) -> None:
        self.src: dict[str, str] = {}
        self.asset: dict[str, str] = {}
        self.pdf_keys: dict[str, str] = {}

    def ref(self, key: str, *, page: int | None = None, bbox: list[float] | None = None, quote: str | None = None,
            time: float | None = None, page_label: str | None = None, exact: bool = False) -> dict[str, Any]:
        """``exact=True`` only for a box measured on the material itself (the render of a page or a
        diagram), never for a box drawn by eye."""
        located = ("exact" if exact else "approximate") if bbox else "none"
        if time is not None:
            located = "exact"
        return {
            "source_id": self.src[key],
            "page": page,
            "page_label": page_label,
            "bbox": bbox,
            "time": time,
            "quote": quote,
            "located": located,
        }

    def pdf_ref(self, key: str, quote: str, page_hint: int | None = None) -> dict[str, Any]:
        """Locate a verbatim quote in a PDF text layer (exact) — never invent a location."""
        found = media.locate_quote(self.pdf_keys[key], quote, page_hint)
        if not found:
            return {"source_id": self.src[key], "page": page_hint, "bbox": None, "quote": quote, "located": "none", "time": None, "page_label": None}
        pad = 0.006
        x0, y0, x1, y1 = found["bbox"]
        bbox = [max(0.0, x0 - pad), max(0.0, y0 - pad), min(1.0, x1 + pad), min(1.0, y1 + pad)]
        return {"source_id": self.src[key], "page": found["page"], "bbox": [round(v, 4) for v in bbox], "quote": found["matched_quote"],
                "located": found["located"], "time": None, "page_label": None}


def q(symbol, name, unit, value, lo, hi, step, role="input", provenance="user", source_ref=None) -> dict[str, Any]:
    return {"symbol": symbol, "name": name, "unit": unit, "value": value, "min": lo, "max": hi, "step": step, "role": role,
            "provenance": provenance, "source_ref": source_ref, "confirmed": True}


def question(qid, kind, prompt, options=None, *, answer_index=None, answer_order=None, answer_value=None, tolerance=None,
             unit="", explanation="", refs=None, context="", hint="", cognitive_level=None,
             option_feedback=None) -> dict[str, Any]:
    """A reviewed, approved question. ``context`` is the situation above the stem (the lesson's own
    material first, else everyday life), ``hint`` points at the idea to use without giving the
    answer, ``option_feedback`` holds one note per option (mcq) or two (true/false: answering True,
    then False). Learners see the notes and the explanation only after their answer is marked."""
    return {"id": qid, "kind": kind, "prompt": prompt, "options": options or [], "answer_index": answer_index,
            "answer_order": answer_order, "answer_value": answer_value, "tolerance": tolerance, "unit": unit,
            "explanation": explanation, "context": context, "hint": hint, "cognitive_level": cognitive_level,
            "option_feedback": list(option_feedback or []), "source_refs": refs or [], "approved": True}


def stroke_path(points: list[tuple[float, float]], width: float, img_w: float, img_h: float, half: float = 16) -> str:
    """Filled outline (0..1000 units) of an axis-aligned polyline — precise hotspots for drawn vessels/rivers."""
    parts = []
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        xa, xb = sorted((x1, x2))
        ya, yb = sorted((y1, y2))
        xa, xb, ya, yb = xa - half, xb + half, ya - half, yb + half
        sx, sy = 1000 / img_w, 1000 / img_h
        parts.append(f"M{xa * sx:.1f} {ya * sy:.1f}L{xb * sx:.1f} {ya * sy:.1f}L{xb * sx:.1f} {yb * sy:.1f}L{xa * sx:.1f} {yb * sy:.1f}Z")
    return "".join(parts)


def bbox_px(x0, y0, x1, y1, w, h) -> list[float]:
    return [round(x0 / w, 4), round(y0 / h, 4), round(x1 / w, 4), round(y1 / h, 4)]


# ============================================================================ machinery
def _system_user(db) -> User:
    user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if user is None:
        user = User(email=DEMO_EMAIL, name="ConceptLab Demo", role="teacher", password_hash=None, locale="vi", is_system=True,
                    school="ConceptLab AI")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def _create_source(db, lab: Lab, sdef: SourceDef, position: int, ctx: Ctx) -> Source:
    src = Source(lab_id=lab.id, kind=sdef.kind, title=sdef.title, position=position, contains_people=sdef.contains_people,
                 consent_confirmed=sdef.contains_people, meta_json={})
    if sdef.kind == "image":
        info = media.store_image(lab.id, (ASSETS / sdef.file).read_bytes())
        src.storage_key, src.width, src.height, src.mime = info.key, info.width, info.height, info.mime
        src.filename, src.size_bytes = sdef.file, storage.path_for(info.key).stat().st_size
    elif sdef.kind == "pdf":
        key = storage.save_bytes(lab.id, (ASSETS / sdef.file).read_bytes(), "pdf")
        info = media.pdf_info(key)
        src.storage_key, src.mime, src.filename = key, "application/pdf", sdef.file
        src.page_count, src.size_bytes = info["page_count"], storage.path_for(key).stat().st_size
        src.meta_json = {"toc": info["toc"], "has_text": info["has_text"]}
        ctx.pdf_keys[sdef.key] = key
    elif sdef.kind == "video":
        key = storage.save_bytes(lab.id, (ASSETS / sdef.file).read_bytes(), "mp4")
        out = media.transcode_video(key, lab.id)
        src.storage_key, src.mime, src.filename = key, "video/mp4", sdef.file
        src.size_bytes = storage.path_for(key).stat().st_size
        src.width, src.height, src.duration_ms, src.fps = out["width"], out["height"], out["duration_ms"], out["fps"]
        src.meta_json = {"web_key": out["web_key"], "ai_key": out["ai_key"], "poster_key": out["poster_key"]}
    elif sdef.kind == "data":
        src.data_json = sdef.data
        src.text_content = sdef.text
    elif sdef.kind == "note":
        src.text_content = sdef.text
    src.status = "ready"
    db.add(src)
    db.flush()
    ctx.src[sdef.key] = src.id
    return src


def _create_asset(db, lab: Lab, adef: AssetDef, ctx: Ctx) -> Asset:
    data = (ASSETS / adef.file).read_bytes()
    clean, mime, width, height = media.normalize_image_bytes(data)
    key = storage.save_bytes(lab.id, clean, "png" if mime == "image/png" else "jpg")
    asset = Asset(lab_id=lab.id, source_id=ctx.src.get(adef.source_key) if adef.source_key else None, kind=adef.kind,
                  storage_key=key, mime=mime, width=width, height=height, ai_generated=False, meta_json=adef.meta)
    db.add(asset)
    db.flush()
    ctx.asset[adef.key] = asset.id
    return asset


def _seed_one(db, user: User, demo: DemoDef) -> Lab:
    lab = Lab(owner_id=user.id, space=demo.space, title=demo.title, subject=demo.subject, grade=demo.grade, topic=demo.topic,
              language=demo.language, goal=demo.goal, level=demo.level, ai_mode="standard", is_demo=True, spec_json={},
              analysis_json=LabAnalysis().model_dump(mode="json"))
    db.add(lab)
    db.flush()
    ctx = Ctx()
    try:
        for i, sdef in enumerate(demo.sources):
            _create_source(db, lab, sdef, i, ctx)
        for adef in demo.assets:
            _create_asset(db, lab, adef, ctx)
        spec, analysis = demo.build(ctx)
        lab.spec_json = LabSpec.model_validate(spec).model_dump(mode="json")
        if analysis:
            lab.analysis_json = LabAnalysis.model_validate(analysis).model_dump(mode="json")
        lab.share_code = demo.code
        db.commit()
    except Exception:
        db.rollback()
        storage.delete_lab_files(lab.id)
        raise
    db.refresh(lab)
    actor = Actor(user=user, session=None, viewer_key=None, ip="seed")
    lab = lab_service.publish(db, lab, actor, "public", True)
    return lab


def seed_demo(force: bool = False) -> int:
    from .content import DEMOS

    db = SessionLocal()
    created = 0
    try:
        user = _system_user(db)
        for demo in DEMOS:
            existing = db.scalar(select(Lab).where(Lab.share_code == demo.code))
            if existing is not None:
                if not force:
                    print(f"  = {demo.code}  {demo.title} (exists)")
                    continue
                lab_service.delete_lab(db, existing)
            lab = _seed_one(db, user, demo)
            created += 1
            report = None
            try:
                from ..services.validation import validate_lab

                report = validate_lab(db, lab)
            except Exception as exc:  # validation is best-effort for seeding
                print(f"    validation error: {exc}")
            status = "" if report is None else ("ok" if report.ok else "CHECKS FAILED")
            print(f"  + {demo.code}  {demo.title}  {status}")
            if report is not None:
                for check in report.checks:
                    if check.status in ("fail", "warn"):
                        print(f"      {check.status:4s} {check.code}: {check.message}")
        print(f"Demo labs ready ({created} created). Open /s/<CODE>, e.g. /s/{DEMOS[0].code}")
        return 0
    finally:
        db.close()


def _same_file(src_key: str | None, data: bytes, image: bool) -> bool:
    """True when the stored file is what seeding ``data`` would store (images are normalized first)."""
    if not src_key or not storage.exists(src_key):
        return False
    if image:
        data = media.normalize_image_bytes(data)[0]
    return storage.read_bytes(src_key) == data


def _source_files(src: Source) -> list[str]:
    keys = [src.storage_key] if src.storage_key else []
    keys += [v for k, v in (src.meta_json or {}).items() if k.endswith("_key") and isinstance(v, str)]
    return keys


def refresh_demo(codes: list[str] | None = None) -> int:
    """Bring existing demo labs up to date with ``assets/`` and ``content.py`` IN PLACE.

    ``seed_demo(force=True)`` deletes a demo lab, and with it (cascade) every learner's quiz
    attempts, chat and feedback on it. This keeps the lab row, its id and its share code, so those
    rows of other users stay as they are. A changed file gets a new Source/Asset row (a file URL is
    cached by browsers for a day, so new content needs a new URL); an unchanged one keeps its row.
    Only rows and files of labs owned by the demo account are written or removed.
    """
    from ..services.validation import validate_lab
    from .content import DEMOS

    db = SessionLocal()
    try:
        user = _system_user(db)
        actor = Actor(user=user, session=None, viewer_key=None, ip="seed")
        for demo in DEMOS:
            if codes and demo.code not in codes:
                continue
            lab = db.scalar(select(Lab).where(Lab.share_code == demo.code))
            if lab is None:
                lab = _seed_one(db, user, demo)
                print(f"  + {demo.code}  {demo.title} (created)")
                continue
            if lab.owner_id != user.id or not lab.is_demo:
                print(f"  ! {demo.code} belongs to another account or is not a demo lab: left alone")
                continue
            ctx = Ctx()
            old_sources = sorted(lab.sources, key=lambda s: s.position)
            stale_files: list[str] = []
            replaced: dict[str, str] = {}  # old source id -> new source id
            for i, sdef in enumerate(demo.sources):
                src = old_sources[i] if i < len(old_sources) else None
                data = (ASSETS / sdef.file).read_bytes() if sdef.file else None
                keep = src is not None and src.kind == sdef.kind and (data is None or _same_file(src.storage_key, data, sdef.kind == "image"))
                if keep:
                    src.title = sdef.title
                    if sdef.kind == "data":
                        src.data_json, src.text_content = sdef.data, sdef.text
                    elif sdef.kind == "note":
                        src.text_content = sdef.text
                    ctx.src[sdef.key] = src.id
                    if sdef.kind == "pdf":
                        ctx.pdf_keys[sdef.key] = src.storage_key
                    continue
                new = _create_source(db, lab, sdef, i, ctx)
                if src is not None:
                    replaced[src.id] = new.id
                    stale_files += _source_files(src)
            for extra in old_sources[len(demo.sources):]:
                stale_files += _source_files(extra)
                replaced[extra.id] = ""
            for adef in demo.assets:
                data = (ASSETS / adef.file).read_bytes()
                source_id = ctx.src.get(adef.source_key) if adef.source_key else None
                old = next((a for a in lab.assets if a.kind == adef.kind and (a.meta_json or {}) == adef.meta), None)
                if old is not None and old.source_id == source_id and _same_file(old.storage_key, data, True):
                    ctx.asset[adef.key] = old.id
                    continue
                new_asset = _create_asset(db, lab, adef, ctx)
                if old is not None:
                    if lab.cover_asset_id == old.id:
                        lab.cover_asset_id = new_asset.id
                    stale_files.append(old.storage_key)
                    db.delete(old)
            for old_id in replaced:
                db.delete(db.get(Source, old_id))
            spec, analysis = demo.build(ctx)
            lab.spec_json = LabSpec.model_validate(spec).model_dump(mode="json")
            if analysis:
                lab.analysis_json = LabAnalysis.model_validate(analysis).model_dump(mode="json")
            lab.version += 1
            db.commit()
            db.refresh(lab)
            for key in stale_files:
                storage.delete_key(key)
            lab = lab_service.publish(db, lab, actor, lab.visibility or "public", lab.allow_tutor)
            report = validate_lab(db, lab)
            changed = f"{len(replaced)} source(s) replaced" if replaced else "spec only"
            print(f"  ~ {demo.code}  {demo.title}  v{lab.version}  {changed}  {'ok' if report.ok else 'CHECKS FAILED'}")
            for check in report.checks:
                if check.status in ("fail", "warn"):
                    print(f"      {check.status:4s} {check.code}: {check.message}")
        return 0
    finally:
        db.close()


def demo_summary() -> list[dict[str, str]]:
    from .content import DEMOS

    return [{"code": d.code, "title": d.title, "space": d.space, "subject": d.subject} for d in DEMOS]


if __name__ == "__main__":  # pragma: no cover
    # python -m app.seed.demo                     list the demos
    # python -m app.seed.demo --refresh [CODE…]   update existing demo labs in place (see refresh_demo)
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--refresh":
        raise SystemExit(refresh_demo(sys.argv[2:] or None))
    print(json.dumps(demo_summary(), ensure_ascii=False, indent=1))
    _ = utcnow
