"""Add the circulation model to the unchanged published system demo, in place."""
from sqlalchemy import select

from ..db import SessionLocal
from ..models import Lab, LabVersion
from ..schemas.spec import LabSpec
from ..security import Actor
from ..services import labs as lab_service
from .content import build_circulation
from .demo import ASSETS, Ctx, _same_file, _system_user
from .localize_existing import _replace_exact


def upgrade():
    db = SessionLocal()
    try:
        owner = _system_user(db)
        lab = db.scalar(select(Lab).where(Lab.share_code == 'HEART8'))
        if not lab or not lab.is_demo or lab.owner_id != owner.id or lab.status != 'published':
            print('HEART8: not a published system demo; skipped')
            return False
        if any(b.get('id') == 'b4' for b in lab.spec_json.get('blocks', [])):
            print('HEART8: block already exists; skipped')
            return False
        sources = sorted(lab.sources, key=lambda src: src.position)
        latest = db.scalar(select(LabVersion).where(LabVersion.lab_id == lab.id, LabVersion.version == lab.version))
        if (len(sources) != 1 or sources[0].kind != 'image' or not latest or latest.created_by != owner.id
                or _replace_exact(latest.spec_json) != lab.spec_json or lab.published_version != lab.version
                or (lab.published_spec_json or {}).get('spec') != lab.spec_json
                or not _same_file(sources[0].storage_key, (ASSETS / 'circulatory_diagram.png').read_bytes(), True)):
            print('HEART8: source or lesson changed; skipped')
            return False
        ctx = Ctx()
        ctx.src['diagram'] = sources[0].id
        new_spec, _ = build_circulation(ctx)
        if not any(b.get('id') == 'b4' and b.get('visual3d') == 'circulation' for b in new_spec['blocks']):
            print('HEART8: 3D block unavailable; skipped')
            return False
        old_spec = dict(new_spec)
        old_spec['blocks'] = [b for b in new_spec['blocks'] if b.get('id') != 'b4']
        old_spec = _replace_exact(LabSpec.model_validate(old_spec).model_dump(mode='json'))
        if old_spec != LabSpec.model_validate(lab.spec_json).model_dump(mode='json'):
            print('HEART8: lesson differs from original; skipped')
            return False
        # Keep every existing block exactly as it was; append only the new block.
        visual = LabSpec.model_validate(new_spec).model_dump(mode='json')['blocks'][-1]
        lab.spec_json = {**lab.spec_json, 'blocks': [*lab.spec_json['blocks'], visual]}
        lab.version += 1
        actor = Actor(user=owner, session=None, viewer_key=None, ip='seed')
        lab_service.publish(db, lab, actor, lab.visibility or 'public', lab.allow_tutor)
        print('HEART8: 3D circulation added')
        return True
    finally:
        db.close()


if __name__ == '__main__':
    upgrade()
