"""FastAPI application factory.

Dev:   uvicorn app.main:app --reload --port 8000   (Vite on :5173 proxies /api)
Prod:  build the frontend, then `uvicorn app.main:app --host 0.0.0.0 --port 8000`
       — this app also serves ``frontend/dist`` on the same origin.
"""

from __future__ import annotations

import logging
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import update
from starlette.staticfiles import StaticFiles
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from . import storage
from .ai.client import close_ai
from .api import admin, ai, auth, chat, health, labs, share, sources
from .config import get_settings
from .db import SessionLocal
from .errors import error_body, install_error_handlers
from .models import Source
from .security import BodySizeLimitMiddleware, CSRFMiddleware

# SPA navigation retains the first document's CSP, so Mapbox's narrowly scoped
# read-only APIs must be allowed on every app shell, not only /learn/geography.
# The feature loads Mapbox only after an explicit user action. Widget documents
# keep their separate, more restrictive CSP in services/widgets.py.
MAPBOX_CONNECT = (
    "https://api.mapbox.com/v4/ https://api.mapbox.com/raster/v1/ "
    "https://api.mapbox.com/rasterarrays/v1/ https://api.mapbox.com/styles/v1/mapbox/ "
    "https://api.mapbox.com/fonts/v1/mapbox/ https://api.mapbox.com/models/v1/mapbox/ https://api.mapbox.com/mapbox-gl-js/ "
    "https://api.mapbox.com/map-sessions/v1 https://events.mapbox.com/"
)
APP_CSP = (
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; "
    f"connect-src 'self' {MAPBOX_CONNECT}; frame-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; "
    "base-uri 'self'; form-action 'self'; object-src 'none'"
)


class SecurityHeadersMiddleware:
    """Baseline security headers; per-route responses may set stricter ones first."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = secrets.token_hex(6)
        path: str = scope.get("path", "")

        async def _send(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                present = {k.lower() for k, _ in headers}

                def add(name: str, value: str) -> None:
                    if name.encode() not in present:
                        headers.append((name.encode(), value.encode()))

                add("x-content-type-options", "nosniff")
                add("referrer-policy", "strict-origin-when-cross-origin")
                add("permissions-policy", "camera=(self), microphone=(self), geolocation=()")
                add("x-request-id", request_id)
                if path.startswith("/api/"):
                    add("cache-control", "no-store")
                    add("x-frame-options", "DENY")
                else:
                    add("content-security-policy", APP_CSP)
                    add("x-frame-options", "DENY")
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, _send)


def _recover_interrupted_jobs() -> None:
    """Media processing runs in-process; anything left 'processing' after a restart failed."""
    db = SessionLocal()
    try:
        db.execute(
            update(Source)
            .where(Source.status == "processing")
            .values(status="failed", error_code="processing_interrupted")
        )
        db.commit()
    except Exception:  # pragma: no cover - table may not exist before migrations
        db.rollback()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    storage.root()
    _recover_interrupted_jobs()
    yield
    await close_ai()


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    app = FastAPI(
        title="ConceptLab AI",
        version="1.0.0",
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/api/openapi.json",
    )
    install_error_handlers(app)
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(BodySizeLimitMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)

    for module in (health, auth, labs, sources, ai, chat, share, admin):
        app.include_router(module.router)

    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
    async def _api_not_found(rest: str):
        return JSONResponse(error_body("not_found", "API route not found"), status_code=404)

    _mount_frontend(app, Path(settings.frontend_dist))
    return app


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    """Serve the built React app (same origin as the API) when ``frontend/dist`` exists."""
    index = dist / "index.html"
    if not index.exists():
        return
    assets = dist / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _spa(full_path: str, request: Request):
        candidate = (dist / full_path).resolve()
        if full_path and candidate.is_file() and dist.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})


app = create_app()
