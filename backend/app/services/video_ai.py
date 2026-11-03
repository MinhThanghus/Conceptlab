"""Practice-video features (spec §8.3): AI-suggested observation markers and SAM 3.1 tracking.

Markers are *suggestions* (``ai_suggested: true, confirmed: false``) that the teacher
confirms; the prompt forbids grading technique, measuring joint angles, judging injury risk
or identifying people. Tracking runs SAM 3.1 on the small AI proxy (12 fps) and returns
per-frame boxes normalized to 0..1 with ``t = frame_index / 12``.
"""

from __future__ import annotations

import secrets

from sqlalchemy.orm import Session

from .. import storage
from ..ai import prompts
from ..ai.client import get_ai, part_text, part_video
from ..ai.outputs import MarkersOutput, clip
from ..errors import AppError
from ..models import Lab
from ..schemas.analysis import LabAnalysis
from ..schemas.api import TrackIn, TrackOut, VideoMarkersIn, VideoMarkersOut
from ..schemas.spec import TrackFrame, VideoMarker, VideoTrack
from ..security import Actor
from .analysis import AI_VIDEO_FPS, AI_VIDEO_MAX_SECONDS, SourceInfo, call_ctx, choose_mode, effort, load_sources, snapshot_source
from .segmentation import english_phrase

MAX_MARKERS = 12
MIN_GAP_S = 0.3
MAX_TRACK_FRAMES = 5000


def video_source(db: Session, lab: Lab, source_id: str) -> SourceInfo:
    src = load_sources(db, lab, [source_id])[0]
    if src.kind != "video":
        raise AppError("unsupported_file", 422, "This feature needs a video source")
    info = snapshot_source(src)
    ai_key = info.meta.get("ai_key")
    if info.status != "ready" or not ai_key or not storage.exists(ai_key):
        raise AppError("source_not_ready", 409, "The video is still being processed")
    return info


def duration_s(info: SourceInfo) -> float:
    return max(0.0, (info.duration_ms or 0) / 1000.0)


async def suggest_markers(
    lab: Lab, actor: Actor | None, info: SourceInfo, lesson_steps: list[str]
) -> tuple[list[VideoMarker], str, str, list[str]]:
    """Returns (markers, limits, notes, warnings)."""
    lang = lab.language
    duration = duration_s(info)
    if duration:
        duration = min(duration, AI_VIDEO_MAX_SECONDS)  # the part of the video the model sees
    video = storage.read_bytes(info.meta["ai_key"])
    mode, warnings = choose_mode(lab, people=info.contains_people)
    intro = prompts.lesson_context(lab)
    if lesson_steps:
        intro += "\n\nSTAGES OF THE LESSON (from the reviewed analysis):\n" + "\n".join(f"- {s}" for s in lesson_steps[:12])
    content = [
        part_text(intro + f"\n\nVIDEO: “{info.title}”, {duration:.1f} s, low-resolution preview at 12 frames per second."),
        part_video(video, "video/mp4"),
        part_text(prompts.MARKERS_TASK.format(duration=duration or 0.0)),
    ]
    result = await get_ai().chat_json(
        messages=[{"role": "system", "content": prompts.system_prompt(lab)}, {"role": "user", "content": content}],
        ctx=call_ctx("video-markers", actor, lab),
        model_cls=MarkersOutput,
        name="video_markers",
        mode=mode,
        effort=effort(True),
    )
    out: MarkersOutput = result.data
    markers: list[VideoMarker] = []
    for m in sorted(out.markers, key=lambda x: x.t if x.t is not None else 0):
        label = clip(m.label, 200)
        if not label or m.t is None:
            continue
        t = max(0.0, float(m.t))
        if duration:
            t = min(t, duration)
        t = round(t, 2)
        if markers and abs(t - markers[-1].t) < MIN_GAP_S:
            continue
        markers.append(
            VideoMarker(id=f"m_{secrets.token_hex(4)}", t=t, label=label, note=clip(m.note, 2000), confirmed=False, ai_suggested=True)
        )
        if len(markers) >= MAX_MARKERS:
            break
    default_limits = prompts.msg("markers_limits_default", lang)
    limits = clip(out.limits, 1500)
    limits = f"{limits}\n{default_limits}".strip() if limits else default_limits
    return markers, clip(limits, 2000), clip(out.notes, 2000), warnings


async def video_markers(db: Session, lab: Lab, actor: Actor, body: VideoMarkersIn) -> VideoMarkersOut:
    info = video_source(db, lab, body.source_id)
    analysis = LabAnalysis.model_validate(lab.analysis_json or {})
    steps = [s.title for s in (analysis.result.steps if analysis.result else [])]
    if not steps:
        for block in (lab.spec_json or {}).get("blocks") or []:
            if block.get("type") == "steps":
                steps = [s.get("title", "") for s in block.get("steps") or [] if s.get("title")]
                break
    db.commit()
    markers, limits, notes, warnings = await suggest_markers(lab, actor, info, steps)
    notes = "\n".join([*warnings, notes]).strip()
    return VideoMarkersOut(markers=markers, notes=notes[:2000], limits=limits)


def normalized_box(box: list[int], width: int, height: int) -> list[float]:
    """Inclusive pixel box → normalized [x0, y0, x1, y1] (same convention as lib/sam.js)."""
    x1, y1, x2, y2 = box
    vals = [x1 / width, y1 / height, (x2 + 1) / width, (y2 + 1) / height]
    return [round(max(0.0, min(1.0, v)), 4) for v in vals]


def track_frames(result, duration: float, fps: float = AI_VIDEO_FPS) -> tuple[list[TrackFrame], int]:
    """SAM video result → one TrackFrame per proxy frame (empty boxes when nothing is visible).

    Only the part of the video the AI proxy covers is returned (it is cut after
    ``AI_VIDEO_MAX_SECONDS``), so "nothing visible" never stands for "not analysed"."""
    width, height = result.width or 0, result.height or 0
    if not width or not height:
        return [], 0
    last = max(result.frames) if result.frames else -1
    analysed = min(duration, AI_VIDEO_MAX_SECONDS) if duration else AI_VIDEO_MAX_SECONDS
    count = max(last + 1, int(round(analysed * fps)))
    count = min(count, MAX_TRACK_FRAMES, int(round(AI_VIDEO_MAX_SECONDS * fps)))
    frames: list[TrackFrame] = []
    with_objects = 0
    for index in range(count):
        objs = result.frames.get(index) or []
        boxes = [normalized_box(o.box, width, height) for o in objs[:20]]
        if boxes:
            with_objects += 1
        frames.append(TrackFrame(t=round(index / fps, 3), boxes=boxes))
    return frames, with_objects


async def track(db: Session, lab: Lab, actor: Actor, body: TrackIn) -> TrackOut:
    info = video_source(db, lab, body.source_id)
    db.commit()
    phrase = await english_phrase(body.phrase, lab, actor)
    if not phrase:
        raise AppError("validation_error", 422, "Describe the object to follow", fields={"phrase": "invalid"})
    video = storage.read_bytes(info.meta["ai_key"])
    result = await get_ai().segment(
        media=video, mime="video/mp4", prompt=phrase, ctx=call_ctx("track", actor, lab), is_video=True
    )
    frames, with_objects = track_frames(result, duration_s(info))
    track_obj = VideoTrack(id=f"t_{secrets.token_hex(4)}", phrase=clip(body.phrase, 200), frames=frames)
    return TrackOut(track=track_obj, frames_with_objects=with_objects)
