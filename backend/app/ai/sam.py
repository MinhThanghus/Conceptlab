"""SAM 3.1 prompt building and output parsing.

Wire format (one line per frame)::

    <0f>0<|box;x1=497;y1=404;x2=565;y2=471;w=900;h=700|><|mask;x=0;y=0;data=68,69,~...|>,1<|box;...|><|mask;...|>

* ``x2``/``y2`` are inclusive; the mask covers ``[x1, x2] x [y1, y2]``.
* ``data=H,W,PAYLOAD``: mask height, width, then the payload (``~`` lossless, ``!`` one_bit).
* Masks are decoded in the browser with the official ``@meta-sam/parser`` package.

Geometric prompts must follow a frame header, e.g. ``<0f>1<|point;x=530;y=440;w=900;h=700|>``.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any

FRAME_RE = re.compile(r"^<(\d+)f>(.*)$")
RECORD_RE = re.compile(r"(?:^|,)\s*(\d+)((?:<\|[^|]*\|>)+)")  # the model sometimes writes ", 1<|...|>"
TOKEN_RE = re.compile(r"<\|([a-z_]+);([^|]*)\|>")


@dataclass
class SamObject:
    id: str
    frame: int
    box: list[int]  # [x1, y1, x2, y2] inclusive, source pixels
    mask: dict[str, Any] | None = None  # {encoding, payload, width, height}
    confidence: float | None = None


@dataclass
class SamResult:
    width: int = 0
    height: int = 0
    frames: dict[int, list[SamObject]] = field(default_factory=dict)
    raw_text: str = ""

    @property
    def objects(self) -> list[SamObject]:
        return [obj for frame in sorted(self.frames) for obj in self.frames[frame]]

    def to_dict(self, include_masks: bool = True) -> dict[str, Any]:
        frames = []
        for index in sorted(self.frames):
            objs = []
            for obj in self.frames[index]:
                item = asdict(obj)
                if not include_masks:
                    item["mask"] = None
                objs.append(item)
            frames.append({"frame": index, "objects": objs})
        return {"width": self.width, "height": self.height, "frames": frames}


def _fields(body: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in body.split(";"):
        key, sep, value = part.partition("=")
        if sep:
            out[key.strip()] = value
    return out


def parse_sam_text(text: str) -> SamResult:
    result = SamResult(raw_text=text)
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        header = FRAME_RE.match(line)
        if not header:
            continue
        frame = int(header.group(1))
        for record in RECORD_RE.finditer(header.group(2)):
            obj_id = record.group(1)
            box = mask = None
            confidence = None
            for token in TOKEN_RE.finditer(record.group(2)):
                name, body = token.group(1), token.group(2)
                if name == "box":
                    f = _fields(body)
                    try:
                        box = [int(f["x1"]), int(f["y1"]), int(f["x2"]), int(f["y2"])]
                        result.width = int(f.get("w", result.width) or 0)
                        result.height = int(f.get("h", result.height) or 0)
                        if "c" in f:
                            confidence = float(f["c"])
                    except (KeyError, ValueError):
                        box = None
                elif name == "mask":
                    # data=H,W,PAYLOAD (payload may contain commas? no: alphabet excludes ',')
                    data = body.split("data=", 1)[-1]
                    pieces = data.split(",", 2)
                    if len(pieces) == 3 and pieces[0].isdigit() and pieces[1].isdigit():
                        payload = pieces[2]
                        mask = {
                            "encoding": "lossless" if payload.startswith("~") else "one_bit",
                            "payload": payload,
                            "height": int(pieces[0]),
                            "width": int(pieces[1]),
                        }
            if box is not None:
                result.frames.setdefault(frame, []).append(
                    SamObject(id=obj_id, frame=frame, box=box, mask=mask, confidence=confidence)
                )
    return result


def clamp_int(value: float, low: int, high: int) -> int:
    return max(low, min(high, int(value)))


def point_prompt(points: list[dict[str, Any]], width: int, height: int, frame: int = 0, obj_id: int = 1) -> str:
    """Build ``<Nf>id<|point;...|>-<|point;...|>`` (``-`` prefix marks a negative point)."""
    if not points:
        raise ValueError("at least one point is required")
    parts = []
    for p in points:
        x = clamp_int(p["x"], 0, width - 1)
        y = clamp_int(p["y"], 0, height - 1)
        prefix = "-" if p.get("negative") else ""
        parts.append(f"{prefix}<|point;x={x};y={y};w={width};h={height}|>")
    return f"<{frame}f>{obj_id}" + "".join(parts)


def box_prompt(box: list[float], width: int, height: int, frame: int = 0, obj_id: int = 1) -> str:
    x1 = clamp_int(min(box[0], box[2]), 0, width - 1)
    y1 = clamp_int(min(box[1], box[3]), 0, height - 1)
    x2 = clamp_int(max(box[0], box[2]), 0, width - 1)
    y2 = clamp_int(max(box[1], box[3]), 0, height - 1)
    return f"<{frame}f>{obj_id}<|box;x1={x1};y1={y1};x2={x2};y2={y2};w={width};h={height}|>"


def clean_phrase(phrase: str) -> str:
    """SAM concept prompts must be a short noun phrase without control tokens."""
    phrase = re.sub(r"<\|.*?\|>|<\d+f>", " ", phrase or "")
    phrase = re.sub(r"[^\w\s\-'/]", " ", phrase, flags=re.UNICODE)
    phrase = re.sub(r"\s+", " ", phrase).strip()
    return phrase[:80]
