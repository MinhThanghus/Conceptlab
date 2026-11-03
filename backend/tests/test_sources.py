"""Sources & assets: uploads (PDF, image, video), privacy, limits, files, pages, permissions,
share-scoped twins. Real app + real database + real media processing (no mocks)."""

from __future__ import annotations

import io
from pathlib import Path

import pymupdf
import pytest
from PIL import Image

from app import storage
from app.config import get_settings
from app.db import SessionLocal
from app.models import Asset, Lab, Source
from tests.conftest import create_lab

FIX = Path(__file__).resolve().parent / "fixtures"
STEPS = {"id": "b1", "type": "steps", "title": "Các bước", "steps": [{"id": "s1", "title": "Quan sát", "body": "…"}]}


def upload(c, lab_id, content: bytes, name: str, **fields):
    data = {k: (str(v).lower() if isinstance(v, bool) else v) for k, v in fields.items()}
    return c.post(
        f"/api/labs/{lab_id}/sources", files={"file": (name, content, "application/octet-stream")}, data=data
    )


def fixture(name: str) -> bytes:
    return (FIX / name).read_bytes()


def db_source(source_id: str) -> Source:
    db = SessionLocal()
    try:
        return db.get(Source, source_id)
    finally:
        db.close()


def jpeg_with_gps() -> bytes:
    img = Image.new("RGB", (40, 20), (200, 100, 50))
    exif = Image.Exif()
    exif[0x0112] = 6  # orientation: rotate 90° clockwise to display
    exif[0x010F] = "PhoneMakerXYZ"
    exif[0x8825] = {1: "N", 2: (21.0, 1.0, 30.0), 3: "E", 4: (105.0, 50.0, 10.0)}  # GPS: Hà Nội
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif.tobytes())
    return buf.getvalue()


def png_rgba(size=(30, 20), alpha=0) -> bytes:
    img = Image.new("RGBA", size, (255, 0, 0, alpha))
    img.putpixel((1, 1), (0, 128, 0, 255))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


@pytest.fixture
def settings():
    return get_settings()


# ============================================================================ PDF
def test_upload_pdf_with_pages_text_locate(teacher):
    c, _ = teacher
    lab = create_lab(c)
    r = upload(c, lab["id"], fixture("attention_paper.pdf"), "Attention – bài báo.pdf")
    assert r.status_code == 201, r.text
    src = r.json()
    assert src["kind"] == "pdf" and src["status"] == "ready" and src["page_count"] == 2
    assert src["title"] == "Attention – bài báo.pdf" and src["filename"] == "Attention – bài báo.pdf"
    assert src["mime"] == "application/pdf" and isinstance(src["toc"], list)
    assert src["urls"]["file"] == f"/api/sources/{src['id']}/file"
    assert src["urls"]["page"] == f"/api/sources/{src['id']}/pages/{{n}}.png"

    f = c.get(src["urls"]["file"])
    assert f.status_code == 200 and f.content.startswith(b"%PDF-")
    assert f.headers["content-type"] == "application/pdf"
    assert f.headers["content-disposition"] == 'inline; filename="Attention bai bao.pdf"'
    assert f.headers["cache-control"] == "private, max-age=86400" and f.headers["x-content-type-options"] == "nosniff"
    part = c.get(src["urls"]["file"], headers={"Range": "bytes=0-9"})
    assert part.status_code == 206 and len(part.content) == 10

    page = c.get(f"/api/sources/{src['id']}/pages/1.png?scale=1")
    assert page.status_code == 200 and page.headers["content-type"] == "image/png"
    assert page.content.startswith(b"\x89PNG") and page.headers["cache-control"] == "private, max-age=86400"
    assert c.get(f"/api/sources/{src['id']}/pages/1.png").status_code == 200  # default scale 1.5
    assert c.get(f"/api/sources/{src['id']}/pages/9.png").status_code == 404
    assert c.get(f"/api/sources/{src['id']}/pages/1.png?scale=5").status_code == 422

    text = c.get(f"/api/sources/{src['id']}/text?page=1").json()
    assert text["page"] == 1 and "Attention" in text["text"]
    x0, y0, x1, y1, word = text["words"][0]
    assert 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1 and isinstance(word, str)
    assert c.get(f"/api/sources/{src['id']}/text").status_code == 422

    hit = c.post(f"/api/sources/{src['id']}/locate", json={"quote": "An attention function maps a query"}).json()
    assert hit["located"] == "exact" and hit["page"] == 1 and hit["rects"] and len(hit["bbox"]) == 4
    hit2 = c.post(f"/api/sources/{src['id']}/locate", json={"quote": "Multi-Head Attention", "page": 2}).json()
    assert hit2["located"] == "exact" and hit2["page"] == 2
    miss = c.post(f"/api/sources/{src['id']}/locate", json={"quote": "con lắc đơn dao động điều hoà"}).json()
    assert miss == {"located": "none", "page": None, "rects": [], "bbox": None}


def test_password_protected_pdf_rejected(teacher):
    c, _ = teacher
    lab = create_lab(c)
    doc = pymupdf.open()
    doc.new_page()
    data = doc.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw="secret", owner_pw="owner")
    r = upload(c, lab["id"], data, "locked.pdf")
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_file"
    assert c.get(f"/api/labs/{lab['id']}").json()["sources"] == []


def test_delete_pdf_removes_file_and_page_cache(teacher):
    c, _ = teacher
    lab = create_lab(c)
    src = upload(c, lab["id"], fixture("attention_paper.pdf"), "paper.pdf").json()
    c.get(f"/api/sources/{src['id']}/pages/1.png?scale=1")
    c.get(f"/api/sources/{src['id']}/pages/2.png?scale=2")
    key = db_source(src["id"]).storage_key
    folder = storage.path_for(key).parent
    stem = Path(key).stem
    renders = [p for p in folder.iterdir() if p.name.startswith(stem + ".p") and p.name.endswith(".png")]
    assert sorted(p.name.split(".", 1)[1] for p in renders) == ["p1.s100.png", "p2.s200.png"]
    assert c.delete(f"/api/sources/{src['id']}").status_code == 204
    assert not storage.exists(key)
    assert [p for p in folder.iterdir() if p.name.startswith(stem)] == []
    assert c.get(f"/api/sources/{src['id']}").status_code == 404


# ============================================================================ images
def test_image_exif_gps_stripped_and_orientation_applied(teacher):
    c, _ = teacher
    lab = create_lab(c)
    original = jpeg_with_gps()
    assert b"PhoneMakerXYZ" in original
    r = upload(c, lab["id"], original, "IMG_0001.jpg", title="Con lắc trong lớp", contains_people=False)
    assert r.status_code == 201, r.text
    src = r.json()
    assert src["kind"] == "image" and src["status"] == "ready" and src["title"] == "Con lắc trong lớp"
    assert (src["width"], src["height"]) == (20, 40)  # EXIF orientation applied
    stored = c.get(src["urls"]["file"]).content
    assert b"PhoneMakerXYZ" not in stored and b"Exif" not in stored[:200]
    with Image.open(io.BytesIO(stored)) as img:
        assert img.size == (20, 40)
        assert len(img.getexif()) == 0 and not img.getexif().get_ifd(0x8825)
        assert "exif" not in img.info
    # only the clean copy exists on disk for this lab
    lab_dir = storage.path_for(f"labs/{lab['id']}")
    assert [p.name for p in lab_dir.iterdir()] == [Path(db_source(src["id"]).storage_key).name]


def test_png_fixture_and_large_photo_downscaled(teacher):
    c, _ = teacher
    lab = create_lab(c)
    src = upload(c, lab["id"], fixture("textbook_pendulum.png"), "trang64.png").json()
    assert src["kind"] == "image" and (src["width"], src["height"]) == (1100, 1500)
    assert src["mime"] in ("image/jpeg", "image/png")
    big = io.BytesIO()
    Image.new("RGB", (3000, 1500), (10, 20, 30)).save(big, "JPEG")
    src2 = upload(c, lab["id"], big.getvalue(), "big.jpg").json()
    assert max(src2["width"], src2["height"]) == 2400 and src2["width"] == 2400


def test_photo_fixture_and_people_flags(teacher):
    c, _ = teacher
    lab = create_lab(c)
    src = upload(c, lab["id"], fixture("pendulum_photo.jpg"), "con_lac.jpg", contains_people=True, consent_confirmed=False).json()
    assert src["contains_people"] is True and src["consent_confirmed"] is False
    r = c.patch(f"/api/sources/{src['id']}", json={"consent_confirmed": True, "title": "Ảnh con lắc"})
    assert r.status_code == 200 and r.json()["consent_confirmed"] is True and r.json()["title"] == "Ảnh con lắc"
    assert upload(c, lab["id"], fixture("pendulum_photo.jpg"), "x.jpg", contains_people="maybe").status_code == 422


# ============================================================================ video
def test_video_processed_in_background(teacher):
    c, _ = teacher
    lab = create_lab(c, subject="pe", title="Chuyền bóng")
    r = upload(c, lab["id"], fixture("practice_h264.mp4"), "luyen_tap.mp4", contains_people=True, consent_confirmed=True)
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["kind"] == "video" and created["status"] == "processing"
    assert created["urls"]["file"] is None  # nothing to play until the web copy exists
    src = c.get(f"/api/sources/{created['id']}").json()  # the background job ran after the response
    assert src["status"] == "ready" and src["error_code"] is None
    assert 5000 <= src["duration_ms"] <= 7000 and src["fps"] and src["width"] and src["height"] <= 720
    assert src["mime"] == "video/mp4"
    assert src["urls"]["file"] and src["urls"]["poster"]
    poster = c.get(src["urls"]["poster"])
    assert poster.status_code == 200 and poster.headers["content-type"] == "image/jpeg"
    video = c.get(src["urls"]["file"])
    assert video.status_code == 200 and video.headers["content-type"] == "video/mp4"
    part = c.get(src["urls"]["file"], headers={"Range": "bytes=0-1023"})
    assert part.status_code == 206 and len(part.content) == 1024
    row = db_source(src["id"])
    keys = [row.storage_key] + [row.meta_json[k] for k in ("web_key", "ai_key", "poster_key")]
    assert all(storage.exists(k) for k in keys)
    assert c.delete(f"/api/sources/{src['id']}").status_code == 204
    assert not any(storage.exists(k) for k in keys)


def test_video_too_long_fails_and_original_removed(teacher, settings, monkeypatch):
    c, _ = teacher
    lab = create_lab(c)
    monkeypatch.setattr(settings, "max_video_seconds", 2)
    created = upload(c, lab["id"], fixture("practice_h264.mp4"), "dai.mp4").json()
    src = c.get(f"/api/sources/{created['id']}").json()
    assert src["status"] == "failed" and src["error_code"] == "video_too_long"
    assert db_source(src["id"]).storage_key is None
    assert list(storage.path_for(f"labs/{lab['id']}").iterdir()) == []
    r = c.get(f"/api/sources/{src['id']}/file")
    assert r.status_code == 404


def test_broken_video_marked_failed(teacher):
    c, _ = teacher
    lab = create_lab(c)
    fake = b"\x00\x00\x00\x18ftypmp42" + b"\x00\x01" * 4000
    created = upload(c, lab["id"], fake, "hong.mp4").json()
    src = c.get(f"/api/sources/{created['id']}").json()
    assert src["status"] == "failed" and src["error_code"] == "processing_failed"


def test_processing_video_file_is_not_ready(teacher):
    c, _ = teacher
    lab = create_lab(c)
    db = SessionLocal()
    try:
        row = Source(lab_id=lab["id"], kind="video", title="v", status="processing", storage_key=None, meta_json={})
        db.add(row)
        db.commit()
        sid = row.id
    finally:
        db.close()
    r = c.get(f"/api/sources/{sid}/file")
    assert r.status_code == 409 and r.json()["error"]["code"] == "source_not_ready"


# ============================================================================ rejected uploads
def test_wrong_types_rejected(teacher):
    c, _ = teacher
    lab = create_lab(c)
    r = upload(c, lab["id"], b"just some text, not a document", "notes.pdf")
    assert r.status_code == 415 and r.json()["error"]["code"] == "unsupported_file"
    heic = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 200
    r = upload(c, lab["id"], heic, "IMG_1234.HEIC")
    assert r.status_code == 415 and r.json()["error"]["hint"] == "heic"
    r = upload(c, lab["id"], fixture("speech_en.wav"), "voice.wav")
    assert r.status_code == 415 and r.json()["error"]["detected"] == "wav"
    r = upload(c, lab["id"], b"", "empty.pdf")
    assert r.status_code == 400 and r.json()["error"]["code"] == "empty_file"
    r = c.post(f"/api/labs/{lab['id']}/sources", data={"title": "no file"})
    assert r.status_code == 422 and r.json()["error"]["fields"] == {"file": "required"}
    r = c.post(f"/api/labs/{lab['id']}/sources", json={"file": "x"})
    assert r.status_code == 422
    assert list(storage.path_for(f"labs/{lab['id']}").iterdir()) == []  # nothing left behind


def test_oversize_rejected(teacher, settings, monkeypatch):
    c, _ = teacher
    lab = create_lab(c)
    monkeypatch.setattr(settings, "max_upload_mb_image", 1)
    big_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * (1024 * 1024 + 10)
    r = upload(c, lab["id"], big_jpeg, "huge.jpg")
    assert r.status_code == 413 and r.json()["error"]["code"] == "file_too_large" and r.json()["error"]["max_mb"] == 1
    monkeypatch.setattr(settings, "max_upload_mb_pdf", 1)
    monkeypatch.setattr(settings, "max_upload_mb_video", 1)
    r = upload(c, lab["id"], b"%PDF-1.7\n" + b"0" * (3 * 1024 * 1024), "big.pdf")  # refused before reading
    assert r.status_code == 413 and r.json()["error"]["code"] == "file_too_large"
    assert list(storage.path_for(f"labs/{lab['id']}").iterdir()) == []


def test_too_many_sources(teacher, settings, monkeypatch):
    c, _ = teacher
    lab = create_lab(c)
    monkeypatch.setattr(settings, "max_sources_per_lab", 2)
    for i in range(2):
        assert c.post(f"/api/labs/{lab['id']}/sources/note", json={"title": f"n{i}", "text": "ghi chú"}).status_code == 201
    r = upload(c, lab["id"], fixture("attention_paper.pdf"), "a.pdf")
    assert r.status_code == 409 and r.json()["error"]["code"] == "too_many_sources" and r.json()["error"]["max"] == 2
    r = c.post(f"/api/labs/{lab['id']}/sources/data", json={"title": "x", "values": [{"symbol": "L", "value": 1}]})
    assert r.status_code == 409


# ============================================================================ data & notes
def test_data_and_note_sources(teacher):
    c, _ = teacher
    lab = create_lab(c)
    body = {
        "title": "Số đo của nhóm 3",
        "values": [{"symbol": "L", "name": "Chiều dài dây", "value": 0.82, "unit": "m"}, {"symbol": "T10", "name": "10 dao động", "value": 18.1, "unit": "s"}],
        "note": "Đo bằng thước dây",
    }
    r = c.post(f"/api/labs/{lab['id']}/sources/data", json=body)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["kind"] == "data" and data["status"] == "ready" and data["text"] == "Đo bằng thước dây"
    assert data["data"][0] == {"symbol": "L", "name": "Chiều dài dây", "value": 0.82, "unit": "m"}
    assert data["urls"] == {"file": None, "poster": None, "page": None}
    dup = {"title": "x", "values": [{"symbol": "L", "value": 1}, {"symbol": "L", "value": 2}]}
    r = c.post(f"/api/labs/{lab['id']}/sources/data", json=dup)
    assert r.status_code == 422 and "values.1.symbol" in r.json()["error"]["fields"]
    r = c.post(f"/api/labs/{lab['id']}/sources/data", content=b'{"title":"x","values":[{"symbol":"L","value":NaN}]}', headers={"content-type": "application/json"})
    assert r.status_code == 422
    r = c.patch(f"/api/sources/{data['id']}", json={"data": [{"symbol": "L", "name": "", "value": 0.9, "unit": "m"}]})
    assert r.status_code == 200 and r.json()["data"][0]["value"] == 0.9

    note = c.post(f"/api/labs/{lab['id']}/sources/note", json={"title": "Câu hỏi", "text": "Vì sao chu kỳ không đổi?"}).json()
    assert note["kind"] == "note" and note["text"] == "Vì sao chu kỳ không đổi?"
    assert c.patch(f"/api/sources/{note['id']}", json={"text": "Mới"}).json()["text"] == "Mới"
    r = c.patch(f"/api/sources/{note['id']}", json={"data": [{"symbol": "x", "value": 1}]})
    assert r.status_code == 422 and r.json()["error"]["fields"] == {"data": "only data sources have values"}
    r = c.patch(f"/api/sources/{note['id']}", json={"text": "   "})
    assert r.status_code == 422
    assert c.get(f"/api/sources/{note['id']}/file").status_code == 404
    sources = c.get(f"/api/labs/{lab['id']}").json()["sources"]
    assert [s["id"] for s in sources] == [data["id"], note["id"]]  # kept in upload order


# ============================================================================ permissions
def test_permissions(teacher, other_user, client):
    c, _ = teacher
    o, _ = other_user
    lab = create_lab(c)
    src = upload(c, lab["id"], fixture("attention_paper.pdf"), "a.pdf").json()
    sid = src["id"]
    for method, url in [
        ("get", f"/api/sources/{sid}"),
        ("get", f"/api/sources/{sid}/file"),
        ("get", f"/api/sources/{sid}/pages/1.png"),
        ("get", f"/api/sources/{sid}/text?page=1"),
        ("delete", f"/api/sources/{sid}"),
    ]:
        assert getattr(o, method)(url).status_code == 404, url
        assert getattr(client, method)(url).status_code == 401, url
    assert o.patch(f"/api/sources/{sid}", json={"title": "x"}).status_code == 404
    assert o.post(f"/api/sources/{sid}/locate", json={"quote": "attention"}).status_code == 404
    assert upload(o, lab["id"], fixture("attention_paper.pdf"), "a.pdf").status_code == 404
    assert upload(client, lab["id"], fixture("attention_paper.pdf"), "a.pdf").status_code == 401
    assert o.post(f"/api/labs/{lab['id']}/sources/note", json={"title": "x", "text": "y"}).status_code == 404
    assert client.post(f"/api/labs/{lab['id']}/sources/note", json={"title": "x", "text": "y"}).status_code == 401
    assert c.get(f"/api/sources/{sid}").json()["title"] == "a.pdf"
    assert c.get("/api/sources/not-an-id").status_code == 404


# ============================================================================ assets
def asset_upload(c, lab_id, content, kind="cutout", **fields):
    return c.post(
        f"/api/labs/{lab_id}/assets", files={"file": ("a.png", content, "image/png")}, data={"kind": kind, **fields}
    )


def test_assets_cutout_frame_meta_and_delete(teacher, other_user, client):
    c, _ = teacher
    o, _ = other_user
    lab = create_lab(c)
    photo = upload(c, lab["id"], fixture("pendulum_photo.jpg"), "p.jpg").json()
    r = asset_upload(c, lab["id"], png_rgba(), "cutout", source_id=photo["id"], meta='{"phrase": "pendulum bob", "box": [1, 2, 3, 4]}')
    assert r.status_code == 201, r.text
    cut = r.json()
    assert cut["kind"] == "cutout" and cut["mime"] == "image/png" and cut["source_id"] == photo["id"]
    assert cut["meta"] == {"phrase": "pendulum bob", "box": [1, 2, 3, 4]} and cut["url"] == f"/api/assets/{cut['id']}/file"
    with Image.open(io.BytesIO(c.get(cut["url"]).content)) as img:
        assert img.mode == "RGBA" and img.getpixel((0, 0))[3] == 0  # transparency kept
    frame = asset_upload(c, lab["id"], png_rgba(alpha=255), "frame", meta='{"t": 2.5}').json()
    assert frame["mime"] == "image/jpeg" and frame["meta"] == {"t": 2.5}

    assert asset_upload(c, lab["id"], png_rgba(), "cover").status_code == 422
    assert asset_upload(c, lab["id"], png_rgba(), "cutout", meta="not json").status_code == 422
    assert asset_upload(c, lab["id"], png_rgba(), "cutout", meta="[1, 2]").status_code == 422
    assert asset_upload(c, lab["id"], png_rgba(), "cutout", meta='{"x": NaN}').status_code == 422
    assert asset_upload(c, lab["id"], fixture("attention_paper.pdf"), "page").status_code == 415
    assert asset_upload(c, lab["id"], b"\x89PNG\r\n\x1a\n" + b"\x00" * (10 * 1024 * 1024 + 1), "page").status_code == 413
    other_lab = create_lab(o)
    other_src = upload(o, other_lab["id"], fixture("pendulum_photo.jpg"), "p.jpg").json()
    r = asset_upload(c, lab["id"], png_rgba(), "cutout", source_id=other_src["id"])
    assert r.status_code == 422 and r.json()["error"]["fields"] == {"source_id": "not found"}

    assert o.get(cut["url"]).status_code == 404 and client.get(cut["url"]).status_code == 401
    assert o.delete(f"/api/assets/{cut['id']}").status_code == 404
    assert asset_upload(o, lab["id"], png_rgba(), "cutout").status_code == 404

    db = SessionLocal()
    try:
        db.get(Lab, lab["id"]).cover_asset_id = cut["id"]
        db.commit()
        key = db.get(Asset, cut["id"]).storage_key
    finally:
        db.close()
    assert c.delete(f"/api/assets/{cut['id']}").status_code == 204
    assert not storage.exists(key)
    db = SessionLocal()
    try:
        assert db.get(Lab, lab["id"]).cover_asset_id is None
    finally:
        db.close()
    assert c.get(cut["url"]).status_code == 404
    # deleting the source keeps cut-outs made from it (the link is cleared)
    keep = asset_upload(c, lab["id"], png_rgba(), "cutout", source_id=photo["id"]).json()
    assert c.delete(f"/api/sources/{photo['id']}").status_code == 204
    assets = c.get(f"/api/labs/{lab['id']}").json()["assets"]
    assert any(a["id"] == keep["id"] and a["source_id"] is None for a in assets)


# ============================================================================ share-scoped twins
def publish(c, lab_id, spec, visibility="link"):
    version = c.get(f"/api/labs/{lab_id}").json()["version"]
    r = c.patch(f"/api/labs/{lab_id}", json={"version": version, "spec": spec})
    assert r.status_code == 200, r.text
    r = c.post(f"/api/labs/{lab_id}/publish", json={"visibility": visibility, "allow_tutor": True})
    assert r.status_code == 200, r.text
    return r.json()["share_code"]


def test_share_scoped_files(teacher, client):
    c, _ = teacher
    lab = create_lab(c)
    pdf = upload(c, lab["id"], fixture("attention_paper.pdf"), "a.pdf").json()
    photo = upload(c, lab["id"], fixture("pendulum_photo.jpg"), "p.jpg").json()
    used = asset_upload(c, lab["id"], png_rgba(), "cutout").json()
    unused = asset_upload(c, lab["id"], png_rgba(), "cutout").json()
    diagram = {"id": "d1", "type": "diagram", "title": "Sơ đồ", "image": {"asset_id": used["id"]}, "hotspots": []}
    code = publish(c, lab["id"], {"blocks": [STEPS, diagram]})

    shared = client.get(f"/api/share/{code}").json()
    shared_pdf = next(s for s in shared["sources"] if s["id"] == pdf["id"])
    assert shared_pdf["urls"]["file"] == f"/api/share/{code}/sources/{pdf['id']}/file"
    r = client.get(shared_pdf["urls"]["file"])
    assert r.status_code == 200 and r.content.startswith(b"%PDF") and "content-disposition" not in r.headers
    assert client.get(f"/api/share/{code}/sources/{pdf['id']}/pages/1.png?scale=0.5").status_code == 200
    assert client.get(f"/api/share/{code}/sources/{pdf['id']}/text?page=2").json()["page"] == 2
    assert client.get(f"/api/share/{code}/sources/{photo['id']}/file").status_code == 200
    assert client.get(f"/api/share/{code}/assets/{used['id']}/file").status_code == 200
    assert client.get(f"/api/share/{code}/assets/{unused['id']}/file").status_code == 404
    assert client.get(f"/api/share/{code}/sources/{photo['id']}/poster").status_code == 404

    later = upload(c, lab["id"], fixture("attention_paper.pdf"), "later.pdf").json()
    assert client.get(f"/api/share/{code}/sources/{later['id']}/file").status_code == 404
    assert client.get(f"/api/share/ZZZZZZ/sources/{pdf['id']}/file").status_code == 404
    other_lab = create_lab(c)
    other_pdf = upload(c, other_lab["id"], fixture("attention_paper.pdf"), "o.pdf").json()
    assert client.get(f"/api/share/{code}/sources/{other_pdf['id']}/file").status_code == 404

    # media showing students disappears for learners if consent is withdrawn
    c.patch(f"/api/sources/{photo['id']}", json={"contains_people": True, "consent_confirmed": False})
    assert client.get(f"/api/share/{code}/sources/{photo['id']}/file").status_code == 404
    assert photo["id"] not in [s["id"] for s in client.get(f"/api/share/{code}").json()["sources"]]

    c.post(f"/api/labs/{lab['id']}/unpublish")
    assert client.get(f"/api/share/{code}/sources/{pdf['id']}/file").status_code == 404
    assert client.get(f"/api/share/{code}/assets/{used['id']}/file").status_code == 404


def test_vietnamese_filename_download_header(teacher):
    c, _ = teacher
    lab = create_lab(c)
    src = upload(c, lab["id"], fixture("attention_paper.pdf"), "Bài 12 – Con lắc đơn.pdf").json()
    assert src["title"] == "Bài 12 – Con lắc đơn.pdf"
    r = c.get(src["urls"]["file"])
    assert r.status_code == 200
    assert r.headers["content-disposition"] == 'inline; filename="Bai 12 Con lac don.pdf"'
