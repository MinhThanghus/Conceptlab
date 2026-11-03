from dataclasses import replace
from copy import deepcopy

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Lab
from app.seed.content import DEMOS
from app.seed.demo import _seed_one, _system_user
from app.seed.upgrade_guided_visuals import upgrade
from app.seed.visual_extensions import EXTENSION_ID


def without_visual(demo):
    def build(ctx):
        spec, analysis = demo.build(ctx)
        spec['blocks'] = [b for b in spec['blocks'] if b['id'] != EXTENSION_ID]
        return spec, analysis
    return replace(demo, build=build)


def test_only_append_to_unchanged_system_demos_and_keep_all_old_content(client):
    selected = [next(d for d in DEMOS if d.code == code) for code in ['RNUAVA', 'RNSPVA', 'RNBYA2', 'RNDFFA']]
    with SessionLocal() as db:
        owner = _system_user(db)
        labs = [_seed_one(db, owner, without_visual(d)) for d in selected]
        original_blocks = deepcopy(labs[0].spec_json['blocks'])
        source_id = labs[0].sources[0].id
        version = labs[0].version
        labs[1].sources[0].text_content = 'Edited by a teacher'
        labs[2].spec_json = {**labs[2].spec_json, 'summary': 'Edited lesson'}
        labs[3].is_demo = False
        db.commit()
    assert upgrade() == ['RNUAVA']
    assert upgrade() == []
    with SessionLocal() as db:
        lab = db.scalar(select(Lab).where(Lab.share_code == 'RNUAVA'))
        assert lab.sources[0].id == source_id
        assert lab.spec_json['blocks'][:-1] == original_blocks
        assert lab.spec_json['blocks'][-1]['visual3d'] == 'quadrotor'
        assert lab.version == version + 1 and lab.published_version == lab.version
        for code in ['RNSPVA', 'RNBYA2', 'RNDFFA']:
            other = db.scalar(select(Lab).where(Lab.share_code == code))
            assert not any(b['id'] == EXTENSION_ID for b in other.spec_json['blocks'])
