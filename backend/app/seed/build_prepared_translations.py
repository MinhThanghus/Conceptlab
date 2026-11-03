"""Build the distributable demo translation pack from verified system snapshots.

Run against an isolated copy of the seeded database, with read-only access to its
storage. Results are checkpointed; re-running resumes completed fingerprints.
No user lessons or source files are modified.
"""
from __future__ import annotations

import asyncio
import json
import os

from sqlalchemy import select

from ..db import SessionLocal
from ..models import Lab, User
from ..schemas.spec import LabSpec
from ..services import share, share_translation
from ..services.labs import public_spec
from ..services import translate
from .content import DEMOS
from .demo import ASSETS, Ctx, DEMO_EMAIL, _same_file
from .prepared_translations import PACK, fingerprint, record


def verify_seed(lab, original, demo):
    if (original.title, original.topic, original.language) != (demo.title, demo.topic, demo.language):
        raise ValueError(f'{demo.code}: metadata differs from seed')
    if len(original.sources) != len(demo.sources) or len(original.assets) != len(demo.assets):
        raise ValueError(f'{demo.code}: sources or assets differ from seed')
    ctx = Ctx()
    sources = {s.id: s for s in lab.sources}
    assets = {a.id: a for a in lab.assets}
    for current, expected in zip(original.sources, demo.sources):
        row = sources[current.id]
        if current.kind != expected.kind or current.title != expected.title:
            raise ValueError(f'{demo.code}: source metadata differs')
        if expected.kind == 'note' and current.text != expected.text:
            raise ValueError(f'{demo.code}: source note differs')
        if expected.kind == 'data' and current.data != expected.data:
            raise ValueError(f'{demo.code}: source data differs')
        if expected.file and not _same_file(row.storage_key, (ASSETS / expected.file).read_bytes(), expected.kind == 'image'):
            raise ValueError(f'{demo.code}: source bytes differ')
        ctx.src[expected.key] = current.id
        if expected.kind == 'pdf':
            ctx.pdf_keys[expected.key] = row.storage_key
    for current, expected in zip(original.assets, demo.assets):
        row = assets[current.id]
        if (current.kind != expected.kind or current.meta != expected.meta
                or not _same_file(row.storage_key, (ASSETS / expected.file).read_bytes(), True)):
            raise ValueError(f'{demo.code}: asset differs')
        ctx.asset[expected.key] = current.id
    expected_spec = public_spec(LabSpec.model_validate(demo.build(ctx)[0]).model_dump(mode='json'))
    actual_spec = LabSpec.model_validate(original.spec).model_dump(mode='json')
    if actual_spec != expected_spec:
        # A previous visual migration appended the unchanged guided illustration
        # after the quiz. Accept only that known ordering variant.
        blocks = expected_spec['blocks']
        guided = next((b for b in blocks if b.get('id') == 'guided_visual'), None)
        if guided:
            expected_spec['blocks'] = [b for b in blocks if b is not guided] + [guided]
        if actual_spec != expected_spec:
            raise ValueError(f'{demo.code}: published snapshot differs from seed')


def preserve_bibliography(original, result, target):
    """Research article titles, authors, DOI and URLs are original source data."""
    if target != 'vi':
        return
    for old, new in zip(original.spec.get('blocks', []), result.spec.get('blocks', [])):
        if old.get('id') != 'reading' or old.get('type') != 'text':
            continue
        parts = old.get('body', '').split('\n\n')
        if len(parts) < 3 or 'Read the complete article:' not in parts[1]:
            continue
        links = parts[1].replace('Read the complete article:', 'Đọc toàn văn:').replace('Original PDF:', 'Bản PDF gốc:')
        new['body'] = (parts[0] + '\n\n' + links + '\n\n'
                       'Bài học diễn giải nội dung bài báo và chỉ rõ các mục để đối chiếu. '
                       'Các mô hình tương tác là minh họa giáo dục riêng, không phải dữ liệu nghiên cứu.')


async def main():
    PACK.parent.mkdir(parents=True, exist_ok=True)
    data = json.loads(PACK.read_text(encoding='utf-8')) if PACK.exists() else {'version': 1, 'records': {}}
    records = data['records']
    jobs = []
    db = SessionLocal()
    try:
        for demo in DEMOS:
            if demo.language != 'en':  # Existing independently reviewed EN translations handle the Vietnamese demos.
                continue
            lab = db.scalar(select(Lab).join(User, User.id == Lab.owner_id).where(
                Lab.share_code == demo.code, Lab.status == 'published', Lab.is_demo.is_(True),
                User.is_system.is_(True), User.email == DEMO_EMAIL))
            if lab is None:
                raise ValueError(f'{demo.code}: seed is missing')
            original = share.shared_lab(db, lab)
            verify_seed(lab, original, demo)
            signature = fingerprint(lab, original)
            known = records.get(demo.code, {})
            # A fresh seed matches the fresh-order variant of the four reordered lessons below.
            if signature in (known.get('fingerprint'), *(v.get('fingerprint') for v in known.get('variants', []))):
                print(demo.code, 'cached', flush=True)
            else:
                jobs.append((demo, lab, original))
        semaphore = asyncio.Semaphore(int(os.getenv('DEMO_TRANSLATE_CONCURRENCY', '2')))
        lock = asyncio.Lock()

        async def one(demo, lab, original):
            async with semaphore:
                for attempt in range(5):
                    try:
                        translated = await share_translation._machine_translate(original, lab, None, 'vi')
                        preserve_bibliography(original, translated, 'vi')
                        entry = record(lab, original, translated, 'vi', 'machine')
                        async with lock:
                            records[demo.code] = entry
                            tmp = PACK.with_suffix('.tmp')
                            tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
                            tmp.replace(PACK)
                            print(demo.code, 'prepared', len(records), flush=True)
                        return
                    except Exception as exc:
                        print(demo.code, 'attempt', attempt + 1, type(exc).__name__, str(exc)[:160], flush=True)
                        if attempt == 4:
                            raise
                        await asyncio.sleep(min(2 ** attempt, 16))

        await asyncio.gather(*(one(*job) for job in jobs))
        # Four historical snapshots moved an otherwise identical guided visual to
        # the end. Include the fresh-seed order as a second exact fingerprint,
        # without accepting arbitrary reorderings at runtime.
        for demo in DEMOS:
            if demo.code not in {'RNBYA2', 'RNDFFA', 'RNUAVA', 'RNSPVA'}:
                continue
            lab = db.scalar(select(Lab).where(Lab.share_code == demo.code))
            original = share.shared_lab(db, lab)
            ctx = Ctx()
            for source, expected in zip(original.sources, demo.sources):
                ctx.src[expected.key] = source.id
            for asset, expected in zip(original.assets, demo.assets):
                ctx.asset[expected.key] = asset.id
            seed_spec = public_spec(LabSpec.model_validate(demo.build(ctx)[0]).model_dump(mode='json'))
            order = [block['id'] for block in seed_spec['blocks']]
            if order == [block['id'] for block in original.spec['blocks']]:
                continue
            translated = original.model_copy(deep=True)
            for path, text in records[demo.code]['text']:
                translate.set_path(translated.spec, tuple(path), text)
            alt_original = original.model_copy(deep=True)
            alt_original.spec = seed_spec
            blocks = {b['id']: b for b in translated.spec['blocks']}
            translated.spec['blocks'] = [blocks[block_id] for block_id in order]
            translated.title, translated.topic = records[demo.code]['title'], records[demo.code]['topic']
            records[demo.code]['variants'] = [record(lab, alt_original, translated, 'vi', 'machine')]
        tmp = PACK.with_suffix('.tmp')
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        tmp.replace(PACK)
        print('prepared', len(records), 'of', sum(d.language == 'en' for d in DEMOS), flush=True)
    finally:
        db.close()


if __name__ == '__main__':
    asyncio.run(main())
