"""Async adapter for Meta Model API (OpenAI-compatible, ``https://api.meta.ai/v1``).

All AI features call Meta models through this module only:

* Muse Spark 1.3 (contributor / standard) and Muse Wonder 1.0 via ``/chat/completions``
  (text, images, PDF ``file`` parts, ``video_url`` parts, JSON-schema output, streaming).
* SAM 3.1 via ``/responses`` (noun-phrase, point and box prompts on images and videos).
* Muse Image 1.0 via ``/images/generations`` and ``/images/edits`` (multipart: re-make a photo).
* Muse Voice Transcribe 1.0 via ``/asr/transcribe`` (multipart WAV).

The API key is read from settings (``MODEL_API_KEY`` in ``backend/.env``) and never
leaves the server. Each call's metadata (feature, model, latency, tokens, status) is
written to ``ai_calls``; prompts and outputs are not logged.
"""

from __future__ import annotations

import asyncio
import base64
import copy
import json
import logging
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Literal

import anyio
import httpx
from pydantic import BaseModel, ValidationError

from ..config import Settings, get_settings
from ..db import SessionLocal
from ..errors import AppError
from ..models import AICall
from .sam import SamResult, parse_sam_text

log = logging.getLogger("conceptlab.ai")

Mode = Literal["contributor", "standard", "deep"]


@dataclass
class CallContext:
    feature: str
    user_id: str | None = None
    lab_id: str | None = None


@dataclass
class AIResult:
    text: str
    data: Any = None
    model: str = ""
    usage: dict[str, Any] = field(default_factory=dict)
    latency_ms: int = 0


class AIError(AppError):
    pass


# --------------------------------------------------------------------------- content parts
def data_url(data: bytes, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"


def part_text(text: str) -> dict[str, Any]:
    return {"type": "text", "text": text}


def part_image(data: bytes, mime: str) -> dict[str, Any]:
    return {"type": "image_url", "image_url": {"url": data_url(data, mime)}}


def part_pdf(data: bytes, filename: str = "document.pdf") -> dict[str, Any]:
    return {"type": "file", "file": {"filename": filename, "file_data": data_url(data, "application/pdf")}}


def part_video(data: bytes, mime: str = "video/mp4") -> dict[str, Any]:
    return {"type": "video_url", "video_url": {"url": data_url(data, mime)}}


# --------------------------------------------------------------------------- JSON schema helpers
_KEEP_KEYS = {
    "type",
    "properties",
    "required",
    "additionalProperties",
    "items",
    "enum",
    "anyOf",
    "$ref",
    "$defs",
    "description",
    "const",
}


def strict_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Normalise a JSON schema for strict structured output.

    Every object gets ``additionalProperties: false`` and lists all its properties as
    required; keywords outside the strict subset (lengths, ranges, defaults, titles)
    are dropped here and enforced afterwards by Pydantic validation.
    """

    def walk(node: Any) -> Any:
        if isinstance(node, list):
            return [walk(item) for item in node]
        if not isinstance(node, dict):
            return node
        out: dict[str, Any] = {}
        for key, value in node.items():
            if key not in _KEEP_KEYS:
                continue
            if key in ("properties", "$defs"):
                out[key] = {name: walk(sub) for name, sub in value.items()}
            else:
                out[key] = walk(value)
        if out.get("type") == "object" or "properties" in out:
            out.setdefault("type", "object")
            props = out.setdefault("properties", {})
            out["required"] = list(props.keys())
            out["additionalProperties"] = False
        return out

    return walk(copy.deepcopy(schema))


def schema_for(model_cls: type[BaseModel]) -> dict[str, Any]:
    return strict_schema(model_cls.model_json_schema())


def extract_json(text: str) -> Any:
    """Parse JSON from a model reply, tolerating code fences or leading prose."""
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for opener, closer in (("{", "}"), ("[", "]")):
        start, end = text.find(opener), text.rfind(closer)
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                continue
    raise AIError("ai_bad_output", 502, "The AI response could not be read")


# --------------------------------------------------------------------------- client
class MetaAIClient:
    def __init__(self, settings: Settings | None = None, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings or get_settings()
        self._transport = transport
        self._client: httpx.AsyncClient | None = None

    # -- plumbing ----------------------------------------------------------
    def _http(self) -> httpx.AsyncClient:
        if not self.settings.ai_configured:
            raise AIError("ai_not_configured", 503, "AI service is not configured on this server")
        if self._client is None:
            key = self.settings.model_api_key.get_secret_value().strip()
            self._client = httpx.AsyncClient(
                base_url=self.settings.model_api_base_url.rstrip("/"),
                headers={"Authorization": f"Bearer {key}", "User-Agent": "ConceptLab-AI/1.0"},
                timeout=httpx.Timeout(self.settings.ai_timeout_seconds, connect=15.0),
                transport=self._transport,
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def model_for(self, mode: Mode) -> str:
        if mode == "deep":
            return self.settings.muse_model_deep
        if mode == "standard":
            return self.settings.muse_model_standard
        return self.settings.muse_model_contributor

    async def _record(
        self,
        ctx: CallContext,
        model: str,
        status: str,
        started: float,
        usage: dict[str, Any] | None = None,
        error_code: str | None = None,
        http_status: int | None = None,
    ) -> None:
        usage = usage or {}
        row = AICall(
            user_id=ctx.user_id,
            lab_id=ctx.lab_id,
            feature=ctx.feature[:40],
            model=model[:60],
            status=status,
            error_code=error_code,
            http_status=http_status,
            latency_ms=int((time.monotonic() - started) * 1000),
            input_tokens=usage.get("prompt_tokens", usage.get("input_tokens")),
            output_tokens=usage.get("completion_tokens", usage.get("output_tokens")),
        )

        def _write() -> None:
            db = SessionLocal()
            try:
                db.add(row)
                db.commit()
            except Exception:  # pragma: no cover - logging must never break a request
                db.rollback()
                log.warning("could not record ai call", exc_info=True)
            finally:
                db.close()

        await anyio.to_thread.run_sync(_write)

    @staticmethod
    def _error_for(response: httpx.Response) -> AIError:
        # The provider's message (quotas, account/project ids, request ids, echoed input) is for
        # the server log only; clients get a stable code and a generic message.
        try:
            detail = str(response.json().get("error", {}).get("message", ""))
        except Exception:
            detail = response.text
        status = response.status_code
        log.warning("AI service returned HTTP %s: %s", status, " ".join(detail.split())[:300] or "-")
        if status == 429:
            return AIError("ai_rate_limited", 429, "The AI service is busy, please retry shortly")
        if status in (401, 403):
            return AIError("ai_auth_failed", 503, "The AI service rejected the server credentials")
        if status == 413:
            return AIError("ai_input_too_large", 413, "The material is too large for the AI service")
        if 400 <= status < 500:
            return AIError("ai_bad_request", 422, "The AI service could not process this input")
        return AIError("ai_upstream_error", 502, "The AI service had a problem, please retry")

    async def _request(
        self,
        method: str,
        path: str,
        ctx: CallContext,
        model: str,
        **kwargs: Any,
    ) -> tuple[httpx.Response, float]:
        client = self._http()
        started = time.monotonic()
        attempts = self.settings.ai_max_retries + 1
        last_error: AIError | None = None
        for attempt in range(attempts):
            try:
                response = await client.request(method, path, **kwargs)
            except httpx.TimeoutException:
                last_error = AIError("ai_timeout", 504, "The AI service took too long to answer")
            except httpx.HTTPError:
                last_error = AIError("ai_unreachable", 502, "Could not reach the AI service")
            else:
                if response.status_code < 400:
                    return response, started
                last_error = self._error_for(response)
                if response.status_code not in (429, 500, 502, 503, 504):
                    await self._record(ctx, model, "error", started, None, last_error.code, response.status_code)
                    raise last_error
            if attempt < attempts - 1:
                await asyncio.sleep(min(8.0, 1.5 * (2**attempt)))
        assert last_error is not None
        await self._record(ctx, model, "error", started, None, last_error.code, None)
        raise last_error

    # -- chat ----------------------------------------------------------------
    async def chat(
        self,
        *,
        messages: list[dict[str, Any]],
        ctx: CallContext,
        mode: Mode = "contributor",
        effort: str | None = None,
        response_format: dict[str, Any] | None = None,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> AIResult:
        model = model or self.model_for(mode)
        payload: dict[str, Any] = {"model": model, "messages": messages}
        payload["reasoning_effort"] = effort or self.settings.ai_effort_fast
        if response_format:
            payload["response_format"] = response_format
        if max_tokens:
            payload["max_completion_tokens"] = max_tokens
        response, started = await self._request("POST", "/chat/completions", ctx, model, json=payload)
        body = response.json()
        usage = body.get("usage") or {}
        try:
            choice = body["choices"][0]
            text = choice["message"].get("content") or ""
            refusal = choice["message"].get("refusal")
        except (KeyError, IndexError, TypeError):
            await self._record(ctx, model, "error", started, usage, "ai_bad_output", response.status_code)
            raise AIError("ai_bad_output", 502, "The AI response was empty")
        if refusal and not text:
            await self._record(ctx, model, "error", started, usage, "ai_refused", response.status_code)
            raise AIError("ai_refused", 422, "The AI declined to answer this request")
        await self._record(ctx, model, "ok", started, usage, None, response.status_code)
        return AIResult(text=text, model=model, usage=usage, latency_ms=int((time.monotonic() - started) * 1000))

    async def chat_json(
        self,
        *,
        messages: list[dict[str, Any]],
        ctx: CallContext,
        model_cls: type[BaseModel] | None = None,
        schema: dict[str, Any] | None = None,
        name: str = "output",
        mode: Mode = "contributor",
        effort: str | None = None,
        max_tokens: int | None = None,
    ) -> AIResult:
        """Structured output via ``response_format: json_schema`` (strict) + Pydantic validation.

        One automatic repair round is attempted if the JSON does not validate.
        """
        if schema is None:
            if model_cls is None:
                raise ValueError("schema or model_cls is required")
            schema = schema_for(model_cls)
        fmt = {"type": "json_schema", "json_schema": {"name": name, "schema": schema, "strict": True}}
        result = await self.chat(
            messages=messages, ctx=ctx, mode=mode, effort=effort, response_format=fmt, max_tokens=max_tokens
        )
        for attempt in range(2):
            try:
                raw = extract_json(result.text)
                result.data = model_cls.model_validate(raw) if model_cls else raw
                return result
            except (ValidationError, AIError) as exc:
                if attempt == 1:
                    raise AIError("ai_bad_output", 502, "The AI response did not match the expected format") from exc
                repair = messages + [
                    {"role": "assistant", "content": result.text[:20000]},
                    {
                        "role": "user",
                        "content": "Your previous JSON was invalid: "
                        + str(exc)[:1500]
                        + "\nReturn corrected JSON only, matching the schema exactly.",
                    },
                ]
                result = await self.chat(
                    messages=repair, ctx=ctx, mode=mode, effort=effort, response_format=fmt, max_tokens=max_tokens
                )
        raise AIError("ai_bad_output", 502, "The AI response did not match the expected format")

    async def chat_stream(
        self,
        *,
        messages: list[dict[str, Any]],
        ctx: CallContext,
        mode: Mode = "contributor",
        effort: str | None = None,
        model: str | None = None,
    ) -> AsyncIterator[str]:
        """Yield text deltas from a streamed chat completion."""
        model = model or self.model_for(mode)
        client = self._http()
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "reasoning_effort": effort or self.settings.ai_effort_fast,
        }
        started = time.monotonic()
        usage: dict[str, Any] = {}
        try:
            async with client.stream("POST", "/chat/completions", json=payload) as response:
                if response.status_code >= 400:
                    await response.aread()
                    err = self._error_for(response)
                    await self._record(ctx, model, "error", started, None, err.code, response.status_code)
                    raise err
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data or data == "[DONE]":
                        continue
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    if chunk.get("usage"):
                        usage = chunk["usage"]
                    for choice in chunk.get("choices") or []:
                        delta = (choice.get("delta") or {}).get("content")
                        if delta:
                            yield delta
        except httpx.TimeoutException as exc:
            await self._record(ctx, model, "error", started, usage, "ai_timeout", None)
            raise AIError("ai_timeout", 504, "The AI service took too long to answer") from exc
        except httpx.HTTPError as exc:
            await self._record(ctx, model, "error", started, usage, "ai_unreachable", None)
            raise AIError("ai_unreachable", 502, "Could not reach the AI service") from exc
        await self._record(ctx, model, "ok", started, usage, None, 200)

    # -- SAM 3.1 -----------------------------------------------------------------
    async def segment(
        self,
        *,
        media: bytes,
        mime: str,
        prompt: str,
        ctx: CallContext,
        is_video: bool = False,
        extra_metadata: dict[str, str] | None = None,
    ) -> SamResult:
        """Segment objects with SAM 3.1. ``prompt`` is a noun phrase or a geometric prompt."""
        model = self.settings.sam_model
        media_part = (
            {"type": "input_video", "video_url": data_url(media, mime)}
            if is_video
            else {"type": "input_image", "image_url": data_url(media, mime)}
        )
        payload: dict[str, Any] = {
            "model": model,
            "input": [
                {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": prompt}, media_part],
                }
            ],
        }
        if extra_metadata:
            payload["metadata"] = extra_metadata
        response, started = await self._request("POST", "/responses", ctx, model, json=payload)
        body = response.json()
        text = ""
        for item in body.get("output") or []:
            for content in item.get("content") or []:
                if content.get("type") == "output_text":
                    text += content.get("text") or ""
        await self._record(ctx, model, "ok", started, body.get("usage"), None, response.status_code)
        return parse_sam_text(text)

    # -- Muse Image ---------------------------------------------------------------
    async def generate_image(self, *, prompt: str, ctx: CallContext, size: str = "1024x1024") -> tuple[bytes, str]:
        if not self.settings.enable_image_generation:
            raise AIError("ai_feature_disabled", 403, "Image generation is disabled on this server")
        model = self.settings.image_model
        payload = {"model": model, "prompt": prompt, "n": 1, "size": size}
        response, started = await self._request("POST", "/images/generations", ctx, model, json=payload)
        body = response.json()
        try:
            item = body["data"][0]
            raw = base64.b64decode(item["b64_json"])
        except (KeyError, IndexError, TypeError, ValueError):
            await self._record(ctx, model, "error", started, body.get("usage"), "ai_bad_output", response.status_code)
            raise AIError("ai_bad_output", 502, "The image service returned no image")
        fmt = (body.get("output_format") or "png").lower()
        mime = {"webp": "image/webp", "jpeg": "image/jpeg", "jpg": "image/jpeg"}.get(fmt, "image/png")
        await self._record(ctx, model, "ok", started, body.get("usage"), None, response.status_code)
        return raw, mime

    async def edit_image(
        self, *, prompt: str, image: bytes, mime: str, ctx: CallContext, size: str = "1024x1024"
    ) -> tuple[bytes, str]:
        """Muse Image ``/images/edits``: re-make ``image`` following ``prompt``.

        Multipart form: ``model``, ``prompt``, ``n``, ``size`` (1536x1024, 1024x1536 or 1024x1024)
        and the file field ``image``. Answers ``{data: [{b64_json}], output_format, usage}``.
        """
        if not self.settings.enable_image_generation:
            raise AIError("ai_feature_disabled", 403, "Image generation is disabled on this server")
        model = self.settings.image_model
        ext = {"image/png": "png", "image/webp": "webp", "image/jpeg": "jpg"}.get(mime, "png")
        form = {"model": model, "prompt": prompt, "n": "1", "size": size}
        files = {"image": (f"image.{ext}", image, mime)}
        response, started = await self._request("POST", "/images/edits", ctx, model, data=form, files=files)
        body: Any = None
        try:
            body = response.json()
            raw = base64.b64decode(body["data"][0]["b64_json"])
            if not raw:
                raise ValueError("empty image")
        except (KeyError, IndexError, TypeError, ValueError, AttributeError):
            usage = body.get("usage") if isinstance(body, dict) else None
            await self._record(ctx, model, "error", started, usage, "ai_bad_output", response.status_code)
            raise AIError("ai_bad_output", 502, "The image service returned no image")
        fmt = str(body.get("output_format") or "png").lower()
        out_mime = {"webp": "image/webp", "jpeg": "image/jpeg", "jpg": "image/jpeg"}.get(fmt, "image/png")
        await self._record(ctx, model, "ok", started, body.get("usage"), None, response.status_code)
        return raw, out_mime

    # -- Muse Voice Transcribe ----------------------------------------------------
    async def transcribe(
        self,
        *,
        wav: bytes,
        ctx: CallContext,
        language_bias: list[str] | None = None,
        keywords: list[str] | None = None,
        mode: str = "PUSH_TO_TALK",
    ) -> dict[str, Any]:
        model = self.settings.asr_model
        request_part: dict[str, Any] = {"mode": mode, "model": model, "audioEncoding": "WAV"}
        if language_bias:
            request_part["languageBias"] = language_bias
        if keywords:
            request_part["keywords"] = [k[:60] for k in keywords[:50]]
        files = {
            "request": (None, json.dumps(request_part), "application/json"),
            "audio": ("audio.wav", wav, "audio/wav"),
        }
        response, started = await self._request("POST", "/asr/transcribe", ctx, model, files=files)
        body = response.json()
        await self._record(ctx, model, "ok", started, None, None, response.status_code)
        return {
            "transcript": (body.get("transcript") or "").strip(),
            "duration_ms": body.get("audioDurationMs"),
            "turns": body.get("turns") or [],
        }


_client: MetaAIClient | None = None


def get_ai() -> MetaAIClient:
    """FastAPI dependency / service accessor for the shared AI client."""
    global _client
    if _client is None:
        _client = MetaAIClient()
    return _client


def set_ai(client: MetaAIClient | None) -> None:
    """Swap the shared client (tests use this to inject a fake transport)."""
    global _client
    _client = client


async def close_ai() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
