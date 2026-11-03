"""Private file storage on local disk (outside any web root).

Keys look like ``labs/<lab_id>/<random>.<ext>``; callers never pass user-controlled
paths. Every read resolves the key and checks it stays inside ``STORAGE_DIR``.
Downloads are served only through API routes that check permission first.
"""

from __future__ import annotations

import os
import secrets
import shutil
from pathlib import Path

from fastapi import UploadFile
from fastapi.responses import FileResponse

from .config import get_settings
from .errors import AppError

CHUNK = 1024 * 1024


def root() -> Path:
    path = Path(get_settings().storage_dir).resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def path_for(key: str) -> Path:
    base = root()
    target = (base / key).resolve()
    if base != target and base not in target.parents:
        raise AppError("invalid_storage_key", 400, "Invalid file reference")
    return target


def new_key(lab_id: str, ext: str) -> str:
    ext = ext.lower().lstrip(".")
    if not ext.isalnum() or len(ext) > 5:
        raise AppError("invalid_extension", 400, "Unsupported file extension")
    if not lab_id.isalnum():
        raise AppError("invalid_storage_key", 400, "Invalid lab id")
    return f"labs/{lab_id}/{secrets.token_hex(16)}.{ext}"


def save_bytes(lab_id: str, data: bytes, ext: str) -> str:
    key = new_key(lab_id, ext)
    target = path_for(key)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return key


async def save_upload(lab_id: str, upload: UploadFile, ext: str, max_bytes: int) -> tuple[str, int]:
    """Stream an upload to disk, aborting (and cleaning up) past ``max_bytes``."""
    key = new_key(lab_id, ext)
    target = path_for(key)
    target.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    try:
        with target.open("wb") as fh:
            while True:
                chunk = await upload.read(CHUNK)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise AppError(
                        "file_too_large",
                        413,
                        "File is larger than allowed",
                        extra={"max_mb": max_bytes // (1024 * 1024)},
                    )
                fh.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    if size == 0:
        target.unlink(missing_ok=True)
        raise AppError("empty_file", 400, "The uploaded file is empty")
    return key, size


def read_bytes(key: str) -> bytes:
    return path_for(key).read_bytes()


def head_bytes(key: str, n: int = 64) -> bytes:
    with path_for(key).open("rb") as fh:
        return fh.read(n)


def delete_key(key: str | None) -> None:
    if not key:
        return
    try:
        path_for(key).unlink(missing_ok=True)
    except AppError:
        pass


def delete_lab_files(lab_id: str) -> None:
    if not lab_id.isalnum():
        return
    folder = path_for(f"labs/{lab_id}")
    if folder.exists():
        shutil.rmtree(folder, ignore_errors=True)


def exists(key: str | None) -> bool:
    return bool(key) and path_for(key).exists()


def file_response(key: str, mime: str, filename: str | None = None, max_age: int = 0) -> FileResponse:
    path = path_for(key)
    if not path.exists():
        raise AppError("not_found", 404, "File not found")
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": f"private, max-age={max_age}" if max_age else "private, no-cache",
        "Content-Security-Policy": "default-src 'none'; sandbox",
    }
    resp = FileResponse(path, media_type=mime, headers=headers)
    if filename:
        safe = "".join(ch for ch in filename if ch.isalnum() or ch in "._- ")[:120] or "file"
        resp.headers["Content-Disposition"] = f'inline; filename="{safe}"'
    return resp


# --------------------------------------------------------------------------- content sniffing
def sniff_kind(head: bytes) -> str | None:
    """Detect a file's real type from magic bytes (never trust client MIME/extension)."""
    if head.startswith(b"%PDF-"):
        return "pdf"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "wav"
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in (b"heic", b"heix", b"hevc", b"mif1", b"msf1"):
            return "heic"
        if brand == b"qt  ":
            return "mov"
        return "mp4"
    if head.startswith(b"\x1a\x45\xdf\xa3"):
        return "webm"
    if head.startswith(b"OggS"):
        return "ogg"
    if head.startswith(b"ID3") or head[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return "mp3"
    if head.startswith(b"GIF87a") or head.startswith(b"GIF89a"):
        return "gif"
    return None


def human_size(n: int) -> str:
    size = float(n)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{n} B"


def disk_usage_bytes() -> int:
    total = 0
    for dirpath, _dirs, files in os.walk(root()):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(dirpath, name))
            except OSError:
                pass
    return total
