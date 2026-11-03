"""Translate only a published learner snapshot; never write back to the author's lab."""
from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import logging
import os
import tempfile
from collections import OrderedDict
from pathlib import Path

from ..ai import prompts
from ..ai.client import AIError, get_ai
from ..ai.outputs import TranslateOutput, clip
from ..config import get_settings
from ..errors import AppError
from ..schemas.api import SharedLabOut
from ..security import ai_rate_limit
from . import share, translate
from .analysis import call_ctx, effort

# Bounded in-process cache: content hash includes the published snapshot and source metadata.
# The cached copy keeps quiz answers, explanations and option feedback (marking swaps the
# translated texts into results); every learner response goes through _public_copy.
_CACHE: OrderedDict[str, SharedLabOut] = OrderedDict()
_CACHE_SIZE = 32
_PACK_KEYS: set[str] = set()
# Machine translations also live on disk under STORAGE_DIR/translations, keyed like the memory
# cache, so a restart does not make the next learner wait for the model again. A changed
# snapshot has a new key, so a stale file is never served.
_DISK_DIR = "translations"
# One model run per snapshot and language: a class opening the same lesson together shares it.
_INFLIGHT: dict[str, asyncio.Future] = {}
log = logging.getLogger(__name__)


def _settled(key: str, done: asyncio.Future) -> None:
    _INFLIGHT.pop(key, None)
    if not done.cancelled():
        done.exception()  # every waiter re-raises it; this only marks it as seen when nobody waited


def _disk_path(key: str) -> Path:
    target, _, digest = key.partition(":")
    return Path(get_settings().storage_dir) / _DISK_DIR / f"{digest}.{target}.json"


def _disk_load(key: str) -> SharedLabOut | None:
    path = _disk_path(key)
    try:
        out = SharedLabOut.model_validate_json(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        log.warning("Ignoring an unreadable cached translation: %s", path.name)
        return None
    return out if out.translation_kind == "machine" else None


def _disk_save(key: str, value: SharedLabOut) -> None:
    path = _disk_path(key)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, suffix=".tmp", delete=False) as handle:
            handle.write(value.model_dump_json())
        os.replace(handle.name, path)
    except OSError:
        # The translation is still served from memory; only the restart shortcut is lost.
        log.warning("Could not store a cached translation: %s", path.name)


def _key(out: SharedLabOut, target: str) -> str:
    payload = out.model_dump(mode="json", exclude={"translated_language", "translation_kind"})
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return target + ":" + hashlib.sha256(encoded).hexdigest()


def _public_copy(out: SharedLabOut) -> SharedLabOut:
    """The learner copy of a (translated) snapshot: the same helper as the own-language view."""
    return share.learner_copy(out)


def cached(db, lab, target: str):
    original = share.shared_lab(db, lab)
    if target == original.language:
        return None
    key = _key(original, target)
    result = _cached_reviewed_or_machine(db, lab, original, target, key)
    if result is None:
        # Reviewed demo is deterministic and can be reconstructed even after a restart.
        result = _reviewed_demo(db, lab, original, target)
        if result is not None:
            _remember(key, result)
    if result is None:
        result = _prepared_demo(db, lab, original, target)
        if result is not None:
            _remember(key, result, prepared=True)
    return result


def _remember(key, value, *, prepared=False):
    _CACHE[key] = value.model_copy(deep=True)
    if prepared:
        _PACK_KEYS.add(key)
    else:
        _PACK_KEYS.discard(key)
    _CACHE.move_to_end(key)
    while len(_CACHE) > _CACHE_SIZE:
        oldest, _ = _CACHE.popitem(last=False)
        _PACK_KEYS.discard(oldest)


def _cached_reviewed_or_machine(db, lab, original, target, key):
    """Revalidate reviewed demos: a source file can change without changing its metadata."""
    result = _CACHE.get(key)
    if result is None:
        result = _disk_load(key)
        if result is not None:
            _remember(key, result)
            return result
    if result is not None and key in _PACK_KEYS:
        checked = _prepared_demo(db, lab, original, target)
        if checked is None:
            _CACHE.pop(key, None)
            _PACK_KEYS.discard(key)
            return None
        _CACHE[key] = checked.model_copy(deep=True)
        return checked
    if result is not None and result.translation_kind == 'reviewed':
        checked = _reviewed_demo(db, lab, original, target)
        if checked is None:
            _CACHE.pop(key, None)
            return None
        result = checked
        _CACHE[key] = result.model_copy(deep=True)
    return result


def _prepared_demo(db, lab, original, target):
    from ..seed.prepared_translations import prepared
    return prepared(db, lab, original, target)


def localize_summaries(db, summaries, target):
    """Attach available display metadata without translating or modifying labs."""
    if not target or not summaries:
        return summaries
    from sqlalchemy import select
    from ..models import Lab
    ids = [item.id for item in summaries if item.is_demo and item.share_code]
    labs = {lab.id: lab for lab in db.scalars(select(Lab).where(Lab.id.in_(ids)))} if ids else {}
    for item in summaries:
        if item.language == target:
            item.display_title, item.display_topic, item.display_language = item.title, item.topic, target
            continue
        lab = labs.get(item.id)
        if lab is None:
            continue
        original = share.shared_lab(db, lab)
        translated = _reviewed_demo(db, lab, original, target) or _prepared_demo(db, lab, original, target)
        if translated is not None:
            item.display_title = translated.title
            item.display_topic = translated.topic
            item.display_language = target
    return summaries


def _reviewed_demo(db, lab, original, target):
    if target != 'en' or lab.share_code not in {'TPEND6', 'HEART8', 'PARAB3', 'SWAP42', 'WATER6', 'SAVE25', 'JUMP45',
                                                'SPFTBA', 'SPFUTS', 'SPBASK', 'SPBDMT', 'VBPASS'} or not lab.is_demo:
        return None
    from ..models import User
    from ..seed.demo import DEMO_EMAIL
    owner = db.get(User, lab.owner_id)
    if not owner or not owner.is_system or owner.email != DEMO_EMAIL:
        return None
    # Reviewed text is valid only for the complete seed snapshot, including
    # non-text controls and source/asset bytes, not merely matching prose.
    from ..seed.content import DEMOS
    from ..seed.build_prepared_translations import verify_seed
    demo = next((item for item in DEMOS if item.code == lab.share_code), None)
    if demo is None:
        return None
    try:
        verify_seed(lab, original, demo)
    except (ValueError, KeyError, IndexError, OSError):
        return None
    if lab.share_code in {'HEART8', 'WATER6'}:
        # A source title/ID alone does not prove that the underlying image is unchanged.
        from ..seed.demo import ASSETS, _same_file
        filename = 'circulatory_diagram.png' if lab.share_code == 'HEART8' else 'water_cycle.png'
        sources = list(lab.sources)
        if len(sources) != 1 or sources[0].kind != 'image' or not _same_file(sources[0].storage_key, (ASSETS / filename).read_bytes(), True):
            return None
    elif lab.share_code == 'VBPASS':
        from ..seed.demo import ASSETS, _same_file
        sources = {source.kind: source for source in lab.sources}
        if (len(lab.sources) != 2 or set(sources) != {'image', 'video'}
                or not _same_file(sources['image'].storage_key, (ASSETS / 'volleyball_textbook_page.png').read_bytes(), True)
                or not _same_file(sources['video'].storage_key, (ASSETS / 'volleyball_practice.mp4').read_bytes(), False)):
            return None
    from ..seed.heart_en import HeartTranslationUnavailable, translate_heart
    from ..seed.extra_demos_en import ExtraTranslationUnavailable, translate_extra_demo
    from ..seed.pendulum_en import PendulumTranslationUnavailable, translate_pendulum
    from ..seed.volleyball_en import VolleyballTranslationUnavailable, translate_volleyball
    try:
        if lab.share_code == 'HEART8':
            translated = translate_heart(original)
        elif lab.share_code == 'TPEND6':
            translated = translate_pendulum(original)
        elif lab.share_code == 'VBPASS':
            translated = translate_volleyball(original)
        else:
            translated = translate_extra_demo(original)
        translated.language = original.language
        translated.translation_kind = 'reviewed'
        translated.translated_language = target
        return translated
    except (HeartTranslationUnavailable, PendulumTranslationUnavailable, ExtraTranslationUnavailable, VolleyballTranslationUnavailable):
        return None


async def translated_shared(db, lab, actor, target: str) -> SharedLabOut:
    original = share.shared_lab(db, lab)
    if target == original.language:
        return _public_copy(original)
    cache_key = _key(original, target)
    existing = _cached_reviewed_or_machine(db, lab, original, target, cache_key)
    if existing is not None:
        _CACHE.move_to_end(cache_key)
        return _public_copy(existing)

    # The hand-reviewed translation applies only to the original system-owned demo.
    translated = _reviewed_demo(db, lab, original, target)
    is_prepared = False
    if translated is None:
        translated = _prepared_demo(db, lab, original, target)
        is_prepared = translated is not None

    if translated is None:
        ai_rate_limit(actor)
        if not get_ai().settings.ai_configured:
            raise AIError("ai_not_configured", 503, "AI service is not configured")
        db.commit()  # release read locks while the model is running
        running = _INFLIGHT.get(cache_key)
        if running is None:
            running = asyncio.ensure_future(_machine_translate(original, lab, actor, target))
            _INFLIGHT[cache_key] = running
            running.add_done_callback(lambda done, key=cache_key: _settled(key, done))
        # shield: a learner who leaves does not cancel the run the rest of the class is waiting for
        translated = (await asyncio.shield(running)).model_copy(deep=True)
        db.expire_all()
        current = share.published_lab(db, lab.share_code, actor)
        if _key(share.shared_lab(db, current), target) != cache_key:
            raise AppError('version_conflict', 409, 'The published lesson changed during translation')
        translated.translation_kind = "machine"
        translated.translated_language = target
        _disk_save(cache_key, translated)
    translated.translated_language = target
    _remember(cache_key, translated, prepared=is_prepared)
    return _public_copy(translated)


async def _machine_translate(original: SharedLabOut, lab, actor, target: str) -> SharedLabOut:
    result = original.model_copy(deep=True)
    root = {"title": result.title, "topic": result.topic, "spec": copy.deepcopy(result.spec),
            "sources": [{"title": source.title} for source in result.sources],
            "assets": [{"label": asset.meta.get("label")} for asset in result.assets]}
    entries = [(('spec',) + path, text, limit) for path, text, limit in translate.extract_strings(root['spec'])]
    for path, text, limit in [(('title',), root['title'], 200), (('topic',), root['topic'], 200)]:
        if translate._worth(text):
            entries.append((path, text, limit))
    for group in ('sources', 'assets'):
        field = 'title' if group == 'sources' else 'label'
        for i, entry in enumerate(root[group]):
            if translate._worth(entry[field]):
                entries.append(((group, i, field), entry[field], 200))
    items, paths, math, limits = [], {}, {}, {}
    for i, (path, text, limit) in enumerate(entries):
        identifier = f't{i + 1}'
        protected, math[identifier] = translate.protect_math(text)
        paths[identifier], limits[identifier] = path, limit
        items.append({'id': identifier, 'text': protected})
    target_name = 'English' if target == 'en' else 'Vietnamese'
    source_name = 'English' if original.language == 'en' else 'Vietnamese'
    semaphore = asyncio.Semaphore(translate.CONCURRENCY)

    async def run(batch):
        task = prompts.TRANSLATE_TASK.format(source=source_name, target=target_name,
                                             audience=prompts.audience(lab.grade), items=prompts.as_json(batch, 40000))
        async with semaphore:
            output = await get_ai().chat_json(
                messages=[{'role': 'system', 'content': prompts.system_prompt(share.LearnerView(lab, target), role='a careful translator of teaching materials')},
                          {'role': 'user', 'content': task}],
                ctx=call_ctx('translate', actor, lab), model_cls=TranslateOutput,
                name='translate', mode='standard', effort=effort(False))
            return output.data

    # The model may omit an item or lose a math placeholder. Never present a partial result as complete.
    outputs = await asyncio.gather(*(run(batch) for batch in translate.chunk(items)))
    seen = set()
    for output in outputs:
        for item in output.items:
            if item.id not in paths or item.id in seen or not item.text.strip():
                continue
            restored = translate.restore_math(item.text.strip(), math[item.id])
            if restored is not None:
                translate.set_path(root, paths[item.id], clip(restored, limits[item.id]))
                seen.add(item.id)
    if len(seen) != len(items):
        raise AIError('ai_bad_output', 502, 'Translation was incomplete')
    for block in root['spec'].get('blocks', []):
        if block.get('type') == 'quiz':
            for question in block.get('questions', []):
                if question.get('kind') == 'truefalse':
                    question['options'] = prompts.msg('tf_options', target).split('|')
    result.title, result.topic, result.spec = root['title'], root['topic'], root['spec']
    for source, entry in zip(result.sources, root['sources']):
        source.title = entry['title']
    for asset, entry in zip(result.assets, root['assets']):
        if entry['label'] is not None:
            asset.meta['label'] = entry['label']
    return result
