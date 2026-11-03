"""Upgrade only untouched, system-owned research demos; preserve IDs and learner data.

Run after reviewing the English seed content: python -X utf8 -m app.seed.upgrade_research_en
The source rows remain the same so existing links and learner records continue to work.
"""
import hashlib
import json

from sqlalchemy import select

from ..db import SessionLocal
from ..models import Lab, LabVersion
from ..schemas.analysis import LabAnalysis
from ..schemas.spec import LabSpec
from ..security import Actor
from ..services import labs as lab_service
from .. import storage
from .demo import ASSETS, Ctx, _system_user
from .localize_existing import _replace_exact
from .research_computing import RESEARCH_COMPUTING_DEMOS
from .research_natural import RESEARCH_NATURAL_DEMOS

# Fingerprints of the original Vietnamese demo metadata and source notes.
# Source edits do not necessarily increment a lab's version.
LEGACY_FINGERPRINTS = {
    'RNATTA': 'e09f16f3b99c0e2ef31d3c171d59917d030d11a6a15a353ce90a53139d185492',
    'RNBYA2': '47b3b0c7aea69c4b366901477182731a6208785f631cf67c6cd22e9758bb2782',
    'RNBYA3': '002526a7038abde82b3dfbd49827cb6530f4ded7032a74355ce38c46a1f43191',
    'RNCHE2': '123bb86f8c751643c74f18c4f59501fb4e2e07c5177d540cb9b7dc310ba397da',
    'RNCHE3': '7265fdc3b4e02e3a85e13c7c408174f8ef99e02791833d057a7a0b65732ef9d3',
    'RNDFFA': '320f7b76e7fe202a0ae2cd84df76a6d2b8119fc08f2f15d571aa9b4d1b6e0aea',
    'RNECNA': '8548f41d48aefb31e67e674e29dc55ba7f23b0ffc509ca9ee84e90f31c344bdf',
    'RNECNB': 'fb2b2fc8f7c3482ddc311b82f63456a16050da9f0c0bc2f12fdcc87741b85714',
    'RNEDTA': 'd5672bccd293d6d4a43c8617b04f3fab6771e5d327236267d3a479561ededd0a',
    'RNENV2': '8b6ea0c02e47d6c0b142c011adc6426398e84bc760ec2aad998e94178635a1e9',
    'RNENV3': '0d3c9cce66df8a6d38a98c38d7b92f7f5dc55024fcf84e6fdd2abfb8c9adb2d0',
    'RNGYA2': '45cd9078c9c7e9e29cfd12f5d9b4dee0d8376d24e06d4a3056ab0dc9ea0693f0',
    'RNGYA3': '49597d2a288b93c58bb748fe631cb837e7b4c5592532981101d8ac4a513266b8',
    'RNMAT2': '486740f2f4885c8ee16196ddeff964c0513658f86383d46966d4012ffa6fb77e',
    'RNMAT3': '44feb863bdd16d4d5733499762dac25bb262b76c42eab6ba119cbd3108f6286e',
    'RNPHY2': 'e06a5f59a90154756e83c9f770dfcb244a13c6b3d09fd3b4927657a6c3ddc451',
    'RNPHY3': '9104d6f2b10d202d75a37c270796165ead92f52eab8829658002b648a9a02183',
    'RNSPVA': '108b2966fe1110c1b8fcfe4bd6a93a36c222aa6f4bb4cb35dbaa3e8ff5395467',
    'RNSRTA': '629fad4df4d519f358ab7424e3a76a70ed3b54b7625769fb4106b00a97ec74a9',
    'RNUAVA': '9d4d580b0c738b15fc1a03994f8aef715f62a41f7f240320d339079092b2783a',
}


def _legacy_fingerprint(lab, source):
    fields = (lab.title, lab.topic, source.title, source.text_content)
    payload = json.dumps(fields, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(payload).hexdigest()


def upgrade():
    db = SessionLocal()
    try:
        user = _system_user(db)
        actor = Actor(user=user, session=None, viewer_key=None, ip="seed")
        for demo in RESEARCH_NATURAL_DEMOS + RESEARCH_COMPUTING_DEMOS:
            lab = db.scalar(select(Lab).where(Lab.share_code == demo.code))
            if lab is None:
                print(f"{demo.code}: missing; skipped")
                continue
            if lab.language == "en":
                print(f"{demo.code}: already English; skipped")
                continue
            # A changed version could contain someone's edits: do not overwrite them.
            if not lab.is_demo or lab.owner_id != user.id or lab.version != 1 or lab.status != "published":
                print(f"{demo.code}: modified or not a system demo; skipped")
                continue
            sources = sorted(lab.sources, key=lambda s: s.position)
            if len(sources) != len(demo.sources) or any(s.kind != d.kind for s, d in zip(sources, demo.sources)):
                print(f"{demo.code}: sources changed; skipped")
                continue
            if len(sources) != 1 or _legacy_fingerprint(lab, sources[0]) != LEGACY_FINGERPRINTS.get(demo.code):
                print(f"{demo.code}: title, topic or source changed; skipped")
                continue
            latest = db.scalar(select(LabVersion).where(LabVersion.lab_id == lab.id, LabVersion.version == lab.version))
            if (not latest or latest.created_by != user.id or _replace_exact(latest.spec_json) != lab.spec_json
                    or _replace_exact(latest.analysis_json) != lab.analysis_json
                    or lab.published_version != lab.version or (lab.published_spec_json or {}).get("spec") != lab.spec_json):
                print(f"{demo.code}: content changed; skipped")
                continue
            ctx = Ctx()
            for src, sdef in zip(sources, demo.sources):
                ctx.src[sdef.key] = src.id
                src.title = sdef.title
                src.text_content = sdef.text
            spec, _ = demo.build(ctx)
            lab.spec_json = LabSpec.model_validate(spec).model_dump(mode="json")
            lab.title, lab.topic, lab.language = demo.title, demo.topic, demo.language
            lab.version += 1
            lab_service.publish(db, lab, actor, lab.visibility or "public", lab.allow_tutor)
            print(f"{demo.code}: upgraded")
        _upgrade_attention(db, user, actor)
    finally:
        db.close()


def _upgrade_attention(db, user, actor):
    """Only translate the original PDF demo when its published snapshot is untouched."""
    from .content import DEMOS

    demo = next(d for d in DEMOS if d.code == "ATTN24")
    lab = db.scalar(select(Lab).where(Lab.share_code == demo.code))
    if not lab or lab.language == "en":
        return
    latest = db.scalar(select(LabVersion).where(LabVersion.lab_id == lab.id, LabVersion.version == lab.version))
    if (not lab.is_demo or lab.owner_id != user.id or lab.status != "published"
            or lab.published_version != lab.version or not latest or latest.created_by != user.id
            or _replace_exact(latest.spec_json) != lab.spec_json
            or _replace_exact(latest.analysis_json) != lab.analysis_json
            or (lab.published_spec_json or {}).get("spec") != lab.spec_json
            or lab.title != "Scaled Dot-Product Attention"
            or lab.topic != "Công thức (1) — attention có chia √dₖ"
            or len(lab.sources) != 1 or lab.sources[0].kind != "pdf"
            or lab.sources[0].title != "Scaled Dot-Product Attention — trích đoạn học tập"):
        print("ATTN24: modified or not the original system demo; skipped")
        return
    source = lab.sources[0]
    sdef = demo.sources[0]
    if storage.path_for(source.storage_key).read_bytes() != (ASSETS / sdef.file).read_bytes():
        print("ATTN24: PDF changed; skipped")
        return
    ctx = Ctx()
    ctx.src[sdef.key], ctx.pdf_keys[sdef.key] = source.id, source.storage_key
    spec, analysis = demo.build(ctx)
    lab.spec_json = LabSpec.model_validate(spec).model_dump(mode="json")
    lab.analysis_json = LabAnalysis.model_validate(analysis).model_dump(mode="json")
    source.title = sdef.title
    lab.title, lab.topic, lab.language = demo.title, demo.topic, demo.language
    lab.version += 1
    lab_service.publish(db, lab, actor, lab.visibility or "public", lab.allow_tutor)
    print("ATTN24: upgraded")


if __name__ == "__main__":
    upgrade()
