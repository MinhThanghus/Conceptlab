"""AI tutor chat with lab context and citations, streamed as Server-Sent Events.

``POST /api/labs/{id}/chat`` (owner preview, draft spec, channel ``studio``) and
``POST /api/share/{code}/chat`` (learners, published snapshot, channel ``share``; 403
``tutor_disabled`` when the teacher turned the tutor off). Events: ``delta`` {text} …
then ``done`` (ChatMessageOut with citations) or ``error`` {code, message}.
Permission, rate-limit and configuration errors are returned as normal JSON errors before
the stream starts. ``GET`` on the same paths returns the caller's own history.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..db import get_db
from ..schemas.api import ChatIn, ChatMessageOut
from ..security import Actor, ai_rate_limit, ensure_viewer_cookie, get_actor, require_user
from ..services import labs, tutor
from ..services import share as share_svc
from .ai import ensure_ai, tutor_lab

router = APIRouter(tags=["chat"])

SSE_HEADERS = {"Cache-Control": "no-store", "X-Accel-Buffering": "no"}
SSE_MEDIA_TYPE = "text/event-stream; charset=utf-8"


@router.post("/api/labs/{lab_id}/chat")
async def owner_chat(lab_id: str, body: ChatIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> StreamingResponse:
    lab = labs.get_lab_for_owner(db, lab_id, actor)
    ai_rate_limit(actor)
    ensure_ai()
    # Reading the cited PDF pages is blocking work: keep it off the event loop.
    ctx = await run_in_threadpool(
        tutor.build_context, db, lab, shared=False, body=body, user_id=actor.user.id, viewer_key=None
    )
    db.commit()
    stream = tutor.stream_answer(lab, actor, ctx, body.message, actor.user.id, None)
    return StreamingResponse(stream, media_type=SSE_MEDIA_TYPE, headers=SSE_HEADERS)


@router.get("/api/labs/{lab_id}/chat", response_model=list[ChatMessageOut])
def owner_history(lab_id: str, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> list[ChatMessageOut]:
    lab = labs.get_lab_for_owner(db, lab_id, actor)
    return tutor.history(db, lab, "studio", actor.user.id, None)


@router.post("/api/share/{code}/chat")
async def share_chat(
    code: str, body: ChatIn, request: Request, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)
) -> StreamingResponse:
    lab = tutor_lab(db, code, actor)
    user_id = actor.user_id
    ctx = await run_in_threadpool(
        tutor.build_context, db, lab, shared=True, body=body, user_id=user_id, viewer_key=actor.viewer_key
    )
    db.commit()
    holder: dict[str, str | None] = {"viewer": actor.viewer_key}

    async def events():
        async for chunk in tutor.stream_answer(lab, actor, ctx, body.message, user_id, holder["viewer"]):
            yield chunk

    response = StreamingResponse(events(), media_type=SSE_MEDIA_TYPE, headers=SSE_HEADERS)
    holder["viewer"] = ensure_viewer_cookie(request, response)  # groups an anonymous learner's history
    return response


@router.get("/api/share/{code}/chat", response_model=list[ChatMessageOut])
def share_history(code: str, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)) -> list[ChatMessageOut]:
    lab = share_svc.published_lab(db, code, actor)
    if actor.user_id is None and not actor.viewer_key:
        return []
    return tutor.history(db, lab, "share", actor.user_id, actor.viewer_key)


__all__ = ["ensure_ai", "router"]
