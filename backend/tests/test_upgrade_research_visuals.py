from dataclasses import replace

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Lab
from app.seed.demo import _seed_one, _system_user
from app.seed.research_natural import RESEARCH_NATURAL_DEMOS
from app.seed.upgrade_research_visuals import upgrade


def _without_visual(demo):
    def build(ctx):
        spec, analysis = demo.build(ctx)
        spec['blocks'] = [b for b in spec['blocks'] if b['id'] != 'visual3d']
        return spec, analysis
    return replace(demo, build=build)


def test_visual_upgrade_only_updates_untouched_lesson(client):
    demos = [d for d in RESEARCH_NATURAL_DEMOS if d.code in {'RNBYA3', 'RNGYA2'}]
    with SessionLocal() as db:
        owner = _system_user(db)
        first, edited = [_seed_one(db, owner, _without_visual(d)) for d in demos]
        original_source = first.sources[0].id
        edited.sources[0].text_content = 'Edited source'
        db.commit()
    upgrade()
    with SessionLocal() as db:
        first = db.scalar(select(Lab).where(Lab.share_code == demos[0].code))
        edited = db.scalar(select(Lab).where(Lab.share_code == demos[1].code))
        assert first.sources[0].id == original_source
        assert any(b['id'] == 'visual3d' for b in first.spec_json['blocks'])
        assert not any(b['id'] == 'visual3d' for b in edited.spec_json['blocks'])
        assert edited.sources[0].text_content == 'Edited source'
