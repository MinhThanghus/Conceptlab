"""Append reviewed scenes only to unchanged published system demos. Never replace content."""
from copy import deepcopy

from sqlalchemy import select

from ..db import SessionLocal
from ..models import Lab, LabVersion
from ..schemas.spec import LabSpec
from ..security import Actor
from ..services import labs as lab_service
from .content import DEMOS
from .demo import ASSETS, Ctx, _same_file, _system_user
from .visual_extensions import DEMO_VISUALS, EXTENSION_ID


def upgrade():
    changed = []
    with SessionLocal() as db:
        owner = _system_user(db)
        actor = Actor(user=owner, session=None, viewer_key=None, ip='seed')
        for demo in DEMOS:
            if demo.code not in DEMO_VISUALS:
                continue
            lab = db.scalar(select(Lab).where(Lab.share_code == demo.code))
            if not lab or not lab.is_demo or lab.owner_id != owner.id or lab.status != 'published' or lab.language != demo.language:
                continue
            if any(b.get('id') == EXTENSION_ID for b in lab.spec_json.get('blocks', [])):
                print(f'{demo.code}: scene already present')
                continue
            latest = db.scalar(select(LabVersion).where(LabVersion.lab_id == lab.id, LabVersion.version == lab.version))
            if (not latest or latest.created_by != owner.id or latest.spec_json != lab.spec_json
                    or lab.published_version != lab.version or (lab.published_spec_json or {}).get('spec') != lab.spec_json
                    or lab.title != demo.title or lab.topic != demo.topic):
                print(f'{demo.code}: edited lesson; skipped')
                continue
            sources = sorted(lab.sources, key=lambda s: s.position)
            if len(sources) != len(demo.sources) or demo.assets:
                continue
            ctx = Ctx()
            valid = True
            for actual, original in zip(sources, demo.sources):
                if actual.kind != original.kind or actual.title != original.title:
                    valid = False
                    break
                if original.kind == 'note' and actual.text_content != original.text:
                    valid = False
                    break
                if original.kind == 'image' and not _same_file(actual.storage_key, (ASSETS / original.file).read_bytes(), True):
                    valid = False
                    break
                ctx.src[original.key] = actual.id
            if not valid:
                print(f'{demo.code}: changed source; skipped')
                continue
            new_spec = LabSpec.model_validate(demo.build(ctx)[0]).model_dump(mode='json')
            without = deepcopy(new_spec)
            without['blocks'] = [b for b in without['blocks'] if b['id'] != EXTENSION_ID]
            if without != LabSpec.model_validate(lab.spec_json).model_dump(mode='json'):
                print(f'{demo.code}: content differs from reviewed baseline; skipped')
                continue
            scene = next(b for b in new_spec['blocks'] if b['id'] == EXTENSION_ID)
            # Preserve every existing block and learner result; append one known scene.
            lab.spec_json = {**lab.spec_json, 'blocks': [*lab.spec_json['blocks'], scene]}
            lab.version += 1
            lab_service.publish(db, lab, actor, lab.visibility or 'public', lab.allow_tutor)
            changed.append(demo.code)
            print(f'{demo.code}: {scene["visual3d"]} added')
    return changed


if __name__ == '__main__':
    upgrade()
