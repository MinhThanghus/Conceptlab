"""Active learning helpers (spec §10.2), sports field scenarios (spec §8.4) and voice input (§10.4).

* ``explain_change``: why the output changed between two states of an interactive block,
  using only the numbers the browser sent (no invented measurements).
* ``prediction_feedback``: short, encouraging feedback comparing a learner's prediction with
  the observed values; correctness is decided deterministically when the block defines the
  correct option, otherwise by the model's verdict.
* ``make_field_scenario``: frames of players/ball/arrows in field coordinates (x along the
  length, y across, both 0..1), with player ids kept stable across frames.
* ``transcribe``: any recorded audio → WAV PCM16 mono → Muse Voice Transcribe.
"""

from __future__ import annotations

import json
import math
from typing import Any

import anyio
from fastapi import UploadFile

from ..ai import prompts
from ..ai.client import CallContext, get_ai
from ..ai.outputs import FieldOutput, PredictionOutput, clip
from ..config import get_settings
from ..errors import AppError
from ..models import Lab
from ..schemas.api import (
    ExplainChangeIn,
    ExplainOut,
    FieldScenarioIn,
    FieldScenarioOut,
    PredictionFeedbackIn,
    PredictionFeedbackOut,
    TranscribeOut,
)
from ..schemas.spec import FieldArrow, FieldFrame, FieldPlayer, Point
from ..security import Actor
from . import media
from .analysis import call_ctx, choose_mode, effort
from .segmentation import read_upload

MAX_PLAYERS = {"football": 11, "futsal": 5, "volleyball": 6, "basketball": 5, "badminton": 2}
SURFACE = {"football": "pitch", "futsal": "pitch", "volleyball": "court", "basketball": "court", "badminton": "court"}
MAX_FRAMES = 8
HEAVY_KEYS = {"html", "mask_path", "tracks", "validation", "frames", "solution_frames", "source_refs", "highlight"}


def find_block(spec: dict[str, Any] | None, block_id: str) -> dict[str, Any]:
    for block in (spec or {}).get("blocks") or []:
        if block.get("id") == block_id:
            return block
    raise AppError("not_found", 404, "Block not found")


def trim(node: Any, depth: int = 0) -> Any:
    """Compact copy of block/state data for prompts (no heavy or binary-ish fields)."""
    if depth > 6:
        return None
    if isinstance(node, dict):
        return {k: trim(v, depth + 1) for k, v in list(node.items())[:60] if k not in HEAVY_KEYS}
    if isinstance(node, list):
        return [trim(v, depth + 1) for v in node[:40]]
    if isinstance(node, str):
        return node[:1500]
    if isinstance(node, float) and not math.isfinite(node):
        return None
    return node


def block_brief(block: dict[str, Any]) -> str:
    return prompts.as_json(trim(block), 6000)


def assumptions_text(spec: dict[str, Any] | None) -> str:
    items = [a.get("text", "") for a in (spec or {}).get("assumptions") or [] if a.get("text")]
    return "\n".join(f"- {t}" for t in items[:12])


# ============================================================================ explain change
async def explain_change(lab: Lab, actor: Actor | None, spec: dict[str, Any], body: ExplainChangeIn) -> ExplainOut:
    block = find_block(spec, body.block_id)
    parts = [
        prompts.lesson_context(lab),
        "BLOCK (JSON):\n" + block_brief(block),
        "LESSON ASSUMPTIONS:\n" + (assumptions_text(spec) or "-"),
        "BEFORE:\n" + prompts.as_json(trim(body.before), 3000),
        "AFTER:\n" + prompts.as_json(trim(body.after), 3000),
        prompts.EXPLAIN_TASK.format(language=prompts.language_name(lab.language)),
    ]
    mode, _ = choose_mode(lab)
    result = await get_ai().chat(
        messages=[{"role": "system", "content": prompts.system_prompt(lab, role="a patient tutor")},
                  {"role": "user", "content": "\n\n".join(parts)}],
        ctx=call_ctx("explain-change", actor, lab),
        mode=mode,
        effort=effort(False),
    )
    text = (result.text or "").strip()
    if not text:
        raise AppError("ai_bad_output", 502, "The AI response was empty")
    return ExplainOut(explanation=text[:2000])


# ============================================================================ prediction feedback
def _match_option(prediction: str, options: list[str]) -> int | None:
    pred = prediction.strip().lower()
    for i, option in enumerate(options):
        if pred == str(option).strip().lower():
            return i
    if pred.isdigit() and 1 <= int(pred) <= len(options):
        return int(pred) - 1
    return None


async def prediction_feedback(
    lab: Lab, actor: Actor | None, spec: dict[str, Any], body: PredictionFeedbackIn
) -> PredictionFeedbackOut:
    block = find_block(spec, body.block_id)
    active = block.get("active") if isinstance(block.get("active"), dict) else {}
    options = [str(o) for o in active.get("options") or []]
    chosen = _match_option(body.prediction, options) if options else None
    correct_index = active.get("correct_option")
    known: bool | None = None
    if chosen is not None and isinstance(correct_index, int) and 0 <= correct_index < len(options):
        known = chosen == correct_index
    parts = [
        prompts.lesson_context(lab),
        "BLOCK (JSON):\n" + block_brief(block),
        "LESSON ASSUMPTIONS:\n" + (assumptions_text(spec) or "-"),
        "LEARNER'S PREDICTION: " + body.prediction.strip()[:1000],
    ]
    if body.reasoning:
        parts.append("LEARNER'S REASONING: " + body.reasoning.strip()[:1500])
    parts.append("OBSERVED (JSON):\n" + prompts.as_json(trim(body.observed), 3000))
    if known is not None:
        parts.append(
            f"The block defines the correct option as: “{options[correct_index]}”. The learner's prediction is "
            + ("CORRECT." if known else "NOT correct.")
            + " Your verdict must agree with this."
        )
    parts.append(prompts.PREDICTION_TASK.format(language=prompts.language_name(lab.language)))
    mode, _ = choose_mode(lab)
    result = await get_ai().chat_json(
        messages=[{"role": "system", "content": prompts.system_prompt(lab, role="a patient tutor")},
                  {"role": "user", "content": "\n\n".join(parts)}],
        ctx=call_ctx("prediction-feedback", actor, lab),
        model_cls=PredictionOutput,
        name="prediction_feedback",
        mode=mode,
        effort=effort(False),
    )
    out: PredictionOutput = result.data
    correct = known if known is not None else {"correct": True, "incorrect": False}.get(out.verdict)
    return PredictionFeedbackOut(feedback=clip(out.feedback, 2000), correct=correct)


# ============================================================================ field scenario
def _scale_of(out: FieldOutput) -> float:
    """Coordinates should be 0..1; tolerate percentages (0..100) or metres by rescaling the whole scenario."""
    values: list[float] = []
    for frame in out.frames:
        values += [v for p in frame.players for v in (p.x, p.y)]
        values += [v for a in frame.arrows for v in (a.x1, a.y1, a.x2, a.y2)]
        if frame.ball is not None:
            values += [frame.ball.x, frame.ball.y]
    peak = max((abs(v) for v in values if v is not None and math.isfinite(v)), default=1.0)
    if peak <= 1.05:
        return 1.0
    return 100.0 if peak <= 100.5 else peak


def _unit(value: float | None, scale: float) -> float:
    if value is None or not math.isfinite(value):
        return 0.5
    return round(max(0.0, min(1.0, float(value) / scale)), 4)


def convert_field(out: FieldOutput, sport: str) -> FieldScenarioOut:
    cap = MAX_PLAYERS.get(sport, 11)
    scale = _scale_of(out)
    ids: dict[tuple[str, str], str] = {}  # (team, label) -> stable player id across frames
    counter = 0
    frames: list[FieldFrame] = []
    for f_index, frame in enumerate(out.frames[:MAX_FRAMES], start=1):
        players: list[FieldPlayer] = []
        per_team = {"A": 0, "B": 0}
        used: set[str] = set()
        for p in frame.players:
            team = p.team if p.team in ("A", "B") else "A"
            if per_team[team] >= cap or len(players) >= 30:
                continue
            label = (str(p.label or "").strip()[:4]) or f"{team}{per_team[team] + 1}"
            key = (team, label.lower())
            pid = ids.get(key)
            if pid is None or pid in used:
                counter += 1
                pid = f"p{counter}"
                ids.setdefault(key, pid)
            used.add(pid)
            per_team[team] += 1
            players.append(FieldPlayer(id=pid, team=team, label=label, x=_unit(p.x, scale), y=_unit(p.y, scale)))
        arrows = [
            FieldArrow(id=f"a{i}", kind=a.kind, x1=_unit(a.x1, scale), y1=_unit(a.y1, scale), x2=_unit(a.x2, scale), y2=_unit(a.y2, scale))
            for i, a in enumerate(frame.arrows[:40], start=1)
        ]
        ball = Point(x=_unit(frame.ball.x, scale), y=_unit(frame.ball.y, scale)) if frame.ball is not None else None
        frames.append(FieldFrame(id=f"f{f_index}", note=clip(frame.note, 2000), players=players, ball=ball, arrows=arrows))
    if not frames:
        raise AppError("ai_bad_output", 502, "The AI did not return a usable scenario")
    return FieldScenarioOut(prompt=clip(out.prompt, 2000), frames=frames)


async def make_field_scenario(lab: Lab, actor: Actor | None, sport: str, description: str, mode: str | None = None) -> FieldScenarioOut:
    task = prompts.FIELD_TASK.format(
        sport=sport,
        surface=SURFACE.get(sport, "field"),
        description=description.strip()[:2000],
        max_players=MAX_PLAYERS.get(sport, 11),
        language=prompts.language_name(lab.language),
    )
    if mode is None:
        mode, _ = choose_mode(lab)
    result = await get_ai().chat_json(
        messages=[{"role": "system", "content": prompts.system_prompt(lab, role="a physical-education teaching assistant")},
                  {"role": "user", "content": prompts.lesson_context(lab) + "\n\n" + task}],
        ctx=call_ctx("field-scenario", actor, lab),
        model_cls=FieldOutput,
        name="field_scenario",
        mode=mode,
        effort=effort(True),
    )
    return convert_field(result.data, sport)


async def field_scenario(lab: Lab, actor: Actor, body: FieldScenarioIn) -> FieldScenarioOut:
    return await make_field_scenario(lab, actor, body.sport, body.description)


# ============================================================================ transcription
def parse_keywords(raw: str | None) -> list[str]:
    if not raw or not raw.strip():
        return []
    try:
        data = json.loads(raw)
    except ValueError:
        data = [part for part in raw.split(",")]
    if not isinstance(data, list):
        return []
    return [str(k).strip()[:60] for k in data if isinstance(k, (str, int, float)) and str(k).strip()][:50]


async def transcribe(actor: Actor, audio: UploadFile, lang: str | None, keywords_raw: str | None) -> TranscribeOut:
    settings = get_settings()
    raw = await read_upload(audio, settings.max_upload_mb_audio * 1024 * 1024)
    too_long = AppError("file_too_large", 413, "The recording is too long", extra={"max_mb": settings.max_upload_mb_audio})

    def convert() -> bytes:
        try:
            return media.to_wav_pcm16(raw)
        except AppError as exc:
            if exc.code == "file_too_large":  # decoding stopped past the 10 minutes the service accepts
                raise too_long from exc
            raise AppError("invalid_audio", 422, "The recording could not be read") from exc

    wav = await anyio.to_thread.run_sync(convert)
    if len(wav) > 30 * 1024 * 1024:  # the service accepts at most 32 MB / 10 minutes
        raise too_long
    bias = ["English", "Vietnamese"] if lang == "en" else ["Vietnamese", "English"]
    result = await get_ai().transcribe(
        wav=wav,
        ctx=CallContext(feature="transcribe", user_id=actor.user_id),
        language_bias=bias,
        keywords=parse_keywords(keywords_raw) or None,
    )
    return TranscribeOut(transcript=(result.get("transcript") or "")[:8000], duration_ms=result.get("duration_ms"))
