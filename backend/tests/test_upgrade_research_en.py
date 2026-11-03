from sqlalchemy import select

from app.db import SessionLocal
from app.models import Lab
from app.seed.demo import _seed_one, _system_user
from app.seed.research_natural import RESEARCH_NATURAL_DEMOS
from app.seed.upgrade_research_en import _upgrade_attention, upgrade
from app.seed import upgrade_research_en
from app.security import Actor


def test_upgrade_preserves_identifiers_and_skips_modified_demos(client, monkeypatch):
    first, edited, source_edited = RESEARCH_NATURAL_DEMOS[:3]
    with SessionLocal() as db:
        owner = _system_user(db)
        a, b, c = (_seed_one(db, owner, d) for d in (first, edited, source_edited))
        source_id = a.sources[0].id
        lab_id = a.id
        a.language, a.title = 'vi', 'Old title'
        b.language, b.title, b.version = 'vi', 'Teacher edit', 2
        c.language = 'vi'
        monkeypatch.setitem(upgrade_research_en.LEGACY_FINGERPRINTS, first.code, upgrade_research_en._legacy_fingerprint(a, a.sources[0]))
        monkeypatch.setitem(upgrade_research_en.LEGACY_FINGERPRINTS, source_edited.code, upgrade_research_en._legacy_fingerprint(c, c.sources[0]))
        c.sources[0].text_content = 'Teacher-edited source'
        db.commit()

    upgrade()
    with SessionLocal() as db:
        a = db.scalar(select(Lab).where(Lab.share_code == first.code))
        b = db.scalar(select(Lab).where(Lab.share_code == edited.code))
        c = db.scalar(select(Lab).where(Lab.share_code == source_edited.code))
        assert (a.id, a.sources[0].id, a.language, a.title) == (lab_id, source_id, 'en', first.title)
        assert (b.language, b.title, b.version) == ('vi', 'Teacher edit', 2)
        assert (c.language, c.sources[0].text_content) == ('vi', 'Teacher-edited source')


def test_attention_upgrade_keeps_source_and_ignores_modified_content(client):
    from app.seed.content import DEMOS

    demo = next(d for d in DEMOS if d.code == 'ATTN24')
    with SessionLocal() as db:
        owner = _system_user(db)
        actor = Actor(user=owner, session=None, viewer_key=None, ip='test')
        lab = _seed_one(db, owner, demo)
        lab.language = 'vi'
        lab.topic = 'Công thức (1) — attention có chia √dₖ'
        lab.sources[0].title = 'Scaled Dot-Product Attention — trích đoạn học tập'
        db.commit()
        source_id, lab_id = lab.sources[0].id, lab.id
        _upgrade_attention(db, owner, actor)
        assert (lab.id, lab.sources[0].id, lab.language) == (lab_id, source_id, 'en')
        assert lab.topic == demo.topic

        # A changed current lesson no longer matches its snapshot, so it is never replaced.
        lab.language = 'vi'
        lab.topic = 'Công thức (1) — attention có chia √dₖ'
        lab.sources[0].title = 'Scaled Dot-Product Attention — trích đoạn học tập'
        lab.spec_json = {**lab.spec_json, 'summary': 'A teacher changed this.'}
        db.commit()
        _upgrade_attention(db, owner, actor)
        assert lab.language == 'vi'
        assert lab.spec_json['summary'] == 'A teacher changed this.'
