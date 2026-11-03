"""Content-addressed translations for unmodified system-owned demonstration labs.

Only text is stored in the pack; source and asset IDs always come from the
current published snapshot. Source bytes and all non-text model fields are part
of the fingerprint, so edited demos must fall back to normal translation.
"""
from __future__ import annotations

import copy
from functools import lru_cache
import hashlib
import json
from pathlib import Path

from .. import storage
from ..schemas.spec import LabSpec
from ..services import translate

PACK = Path(__file__).resolve().parent / 'prepared_translations.json'
# Quiz fields added after the pack was built: hashed only when set, so every existing
# fingerprint (and the reviewed pack) stays valid for snapshots that leave them empty.
OPTIONAL_QUIZ_KEYS = ('context', 'hint', 'cognitive_level', 'option_feedback')


def _hashable_spec(spec):
    data = LabSpec.model_validate(spec).model_dump(mode='json')
    for block in data.get('blocks', []):
        if block.get('type') == 'quiz':
            for question in block.get('questions', []):
                for key in OPTIONAL_QUIZ_KEYS:
                    if question.get(key) in ('', None, []):
                        question.pop(key, None)
    return data


@lru_cache(maxsize=512)
def _digest_file(path: str, size: int, mtime_ns: int) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def _file_hash(key):
    if not key:
        return None
    path = storage.path_for(key)
    stat = path.stat()
    return _digest_file(str(path), stat.st_size, stat.st_mtime_ns)


def fingerprint(lab, original):
    ids = {source.id: f'@source:{i}' for i, source in enumerate(original.sources)}
    ids.update({asset.id: f'@asset:{i}' for i, asset in enumerate(original.assets)})

    def normalize(value):
        if isinstance(value, dict):
            return {k: normalize(v) for k, v in value.items()}
        if isinstance(value, list):
            return [normalize(v) for v in value]
        return ids.get(value, value) if isinstance(value, str) else value

    sources = {s.id: s for s in lab.sources}
    assets = {a.id: a for a in lab.assets}
    source_info = []
    for s in original.sources:
        row = sources[s.id]
        source_info.append({'kind': s.kind, 'title': s.title, 'filename': s.filename,
                            'text': s.text, 'data': s.data, 'contains_people': s.contains_people,
                            'consent_confirmed': s.consent_confirmed, 'file': _file_hash(row.storage_key)})
    asset_info = []
    for a in original.assets:
        row = assets[a.id]
        asset_info.append({'kind': a.kind, 'source_id': ids.get(a.source_id),
                           'meta': normalize(a.meta), 'file': _file_hash(row.storage_key)})
    payload = {'title': original.title, 'topic': original.topic, 'language': original.language,
               'space': original.space, 'subject': original.subject, 'grade': original.grade,
               'level': original.level,
               'spec': normalize(_hashable_spec(original.spec)),
               'sources': source_info, 'assets': asset_info}
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


@lru_cache(maxsize=1)
def load_pack():
    if not PACK.is_file():
        return {}
    return json.loads(PACK.read_text(encoding='utf-8')).get('records', {})


def prepared(db, lab, original, target):
    """Return full translated snapshot on exact match, otherwise None."""
    from ..models import User
    from .demo import DEMO_EMAIL
    if not lab.is_demo or target == original.language:
        return None
    owner = db.get(User, lab.owner_id)
    if not owner or not owner.is_system or owner.email != DEMO_EMAIL:
        return None
    record = load_pack().get(lab.share_code)
    if not record or record.get('target') != target:
        return None
    try:
        signature = fingerprint(lab, original)
        record = next((variant for variant in [record, *record.get('variants', [])]
                       if variant.get('target') == target and variant.get('fingerprint') == signature), None)
        if record is None:
            return None
        result = original.model_copy(deep=True)
        for path, value in record['text']:
            translate.set_path(result.spec, tuple(path), value)
        result.title = record['title']
        result.topic = record['topic']
        result.translated_language = target
        result.translation_kind = record.get('kind', 'machine')
        return result
    except (KeyError, IndexError, TypeError, ValueError, OSError):
        return None


def record(lab, original, translated, target, kind='machine'):
    """Validate that only translatable text changed; emit an ID-free record."""
    base = LabSpec.model_validate(original.spec).model_dump(mode='json')
    spec = LabSpec.model_validate(translated.spec).model_dump(mode='json')
    entries = translate.extract_strings(base)
    # True/false labels are localised separately by the normal translator.
    paths = [path for path, _, _ in entries]
    for i, block in enumerate(base.get('blocks', [])):
        if block.get('type') == 'quiz':
            for j, question in enumerate(block.get('questions', [])):
                if question.get('kind') == 'truefalse':
                    for k, _ in enumerate(question.get('options', [])):
                        paths.append(('blocks', i, 'questions', j, 'options', k))

    def get(data, path):
        for item in path:
            data = data[item]
        return data

    values = [(list(path), get(spec, path)) for path in paths]
    restored = copy.deepcopy(base)
    for path, value in values:
        translate.set_path(restored, tuple(path), value)
    if restored != spec:
        raise ValueError(f'{lab.share_code}: translation changed non-text structure')
    return {'fingerprint': fingerprint(lab, original), 'target': target, 'kind': kind,
            'title': translated.title, 'topic': translated.topic, 'text': values}
