"""Add reviewed 3D blocks to untouched English research demos without replacing sources."""
from copy import deepcopy

from sqlalchemy import select

from ..db import SessionLocal
from ..models import Lab, LabVersion
from ..schemas.spec import LabSpec
from ..security import Actor
from ..services import labs as lab_service
from .demo import Ctx, _system_user
from .research_natural import RESEARCH_NATURAL_DEMOS

VISUAL_CODES = frozenset({'RNBYA3', 'RNGYA2'})


def upgrade():
    db = SessionLocal()
    try:
        owner = _system_user(db)
        actor = Actor(user=owner, session=None, viewer_key=None, ip='seed')
        for demo in RESEARCH_NATURAL_DEMOS:
            if demo.code not in VISUAL_CODES:
                continue
            lab = db.scalar(select(Lab).where(Lab.share_code == demo.code))
            if not lab or not lab.is_demo or lab.owner_id != owner.id or lab.language != 'en' or lab.status != 'published':
                print(f'{demo.code}: not the published English system demo; skipped')
                continue
            latest = db.scalar(select(LabVersion).where(LabVersion.lab_id == lab.id, LabVersion.version == lab.version))
            sources = sorted(lab.sources, key=lambda s: s.position)
            if (not latest or latest.created_by != owner.id or latest.spec_json != lab.spec_json
                    or lab.published_version != lab.version or (lab.published_spec_json or {}).get('spec') != lab.spec_json
                    or len(sources) != 1 or sources[0].kind != 'note'
                    or sources[0].title != demo.sources[0].title or sources[0].text_content != demo.sources[0].text
                    or lab.title != demo.title or lab.topic != demo.topic):
                print(f'{demo.code}: lesson or source changed; skipped')
                continue
            if any(b.get('id') == 'visual3d' for b in lab.spec_json.get('blocks', [])):
                print(f'{demo.code}: already has the 3D illustration; skipped')
                continue
            ctx = Ctx()
            ctx.src[demo.sources[0].key] = sources[0].id
            spec, _ = demo.build(ctx)
            new_spec = LabSpec.model_validate(spec).model_dump(mode='json')
            without_visual = deepcopy(new_spec)
            without_visual['blocks'] = [b for b in without_visual['blocks'] if b.get('id') != 'visual3d']
            old_spec = LabSpec.model_validate(lab.spec_json).model_dump(mode='json')
            if without_visual != old_spec:
                print(f'{demo.code}: differs from original demo; skipped')
                continue
            lab.spec_json = new_spec
            lab.version += 1
            lab_service.publish(db, lab, actor, lab.visibility or 'public', lab.allow_tutor)
            print(f'{demo.code}: 3D illustration added')
    finally:
        db.close()


if __name__ == '__main__':
    upgrade()
