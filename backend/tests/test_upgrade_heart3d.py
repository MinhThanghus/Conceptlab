from dataclasses import replace

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Lab
from app.seed.content import DEMOS
from app.seed.demo import _seed_one, _system_user
from app.seed.upgrade_heart3d import upgrade


def _old_demo(demo):
    def build(ctx):
        spec, analysis = demo.build(ctx)
        spec['blocks'] = [b for b in spec['blocks'] if b['id'] != 'b4']
        return spec, analysis
    return replace(demo, build=build)


def test_upgrade_heart_adds_block_without_replacing_source(client):
    demo = next(d for d in DEMOS if d.code == 'HEART8')
    with SessionLocal() as db:
        lab = _seed_one(db, _system_user(db), _old_demo(demo))
        lab_id, source_id, original_blocks = lab.id, lab.sources[0].id, lab.spec_json['blocks']
    assert upgrade()
    with SessionLocal() as db:
        lab = db.scalar(select(Lab).where(Lab.share_code == 'HEART8'))
        assert (lab.id, lab.sources[0].id) == (lab_id, source_id)
        assert lab.spec_json['blocks'][:-1] == original_blocks
        assert lab.spec_json['blocks'][-1]['visual3d'] == 'circulation'
    assert not upgrade()


def test_upgrade_heart_skips_edited_demo(client):
    demo = next(d for d in DEMOS if d.code == 'HEART8')
    with SessionLocal() as db:
        lab = _seed_one(db, _system_user(db), _old_demo(demo))
        lab.spec_json = {**lab.spec_json, 'summary': 'Changed lesson'}
        db.commit()
    assert not upgrade()
    with SessionLocal() as db:
        lab = db.scalar(select(Lab).where(Lab.share_code == 'HEART8'))
        assert lab.spec_json['summary'] == 'Changed lesson'
        assert not any(b['id'] == 'b4' for b in lab.spec_json['blocks'])
