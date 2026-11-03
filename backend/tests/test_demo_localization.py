from app.db import SessionLocal
from app.models import Lab, Source, User
from app.seed.localize_existing import REPLACEMENTS, localize_existing


def test_exact_legacy_demo_updates_preserve_custom_data_and_are_idempotent():
    old_title = "Ảnh con lắc trong lớp (ảnh dựng 3D minh họa cho bản demo; 3D illustration made for the demo)"
    old_text = "Thay đổi Q, K, V để xem heatmap trọng số thay đổi."
    custom = old_text + " — chỉnh sửa riêng"
    with SessionLocal() as db:
        system = User(email="demo@conceptlab.local", name="Demo", role="teacher", is_system=True)
        owner = User(email="other@example.com", name="Other", role="teacher", is_system=False)
        db.add_all([system, owner])
        db.flush()
        def lab_for(user, code, demo):
            lab = Lab(owner_id=user.id, share_code=code, is_demo=demo, space="school2lab",
                      title="Example", subject="physics", grade="10",
                      spec_json={"description": old_text, "quote": old_text, "custom": custom},
                      analysis_json={"description": old_text, "excerpt": old_text},
                      published_spec_json={"spec": {"description": old_text, "highlight": {"quote": old_text}}, "source_ids": ["kept"]})
            db.add(lab)
            db.flush()
            source = Source(lab_id=lab.id, kind="note", title=old_title, text_content="Keep this")
            db.add(source)
            return lab, source
        demo, source = lab_for(system, "TPEND6", True)
        regular, regular_source = lab_for(system, "VBPASS", False)
        other, other_source = lab_for(owner, "HEART8", True)
        db.commit()

        assert localize_existing(db) == (1, 1)
        db.refresh(demo)
        db.refresh(source)
        assert demo.spec_json == {"description": REPLACEMENTS[old_text], "quote": old_text, "custom": custom}
        assert demo.analysis_json == {"description": REPLACEMENTS[old_text], "excerpt": old_text}
        assert demo.published_spec_json == {"spec": {"description": REPLACEMENTS[old_text], "highlight": {"quote": old_text}}, "source_ids": ["kept"]}
        assert source.title == REPLACEMENTS[old_title] and source.text_content == "Keep this"
        assert regular.spec_json["description"] == old_text and regular_source.title == old_title
        assert other.spec_json["description"] == old_text and other_source.title == old_title
        assert localize_existing(db) == (0, 0)
