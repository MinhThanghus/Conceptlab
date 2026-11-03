"""Stable, translatable API errors.

Every error response has the shape ``{"error": {"code", "message", "fields"?}}``.
The frontend translates ``code`` (see ``frontend/src/i18n/locales/*/errors.js``);
``message`` is an English fallback and never contains secrets or stack traces.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("conceptlab.errors")


class AppError(Exception):
    def __init__(
        self,
        code: str,
        status: int = 400,
        message: str | None = None,
        fields: dict[str, str] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message or code)
        self.code = code
        self.status = status
        self.message = message or code.replace("_", " ")
        self.fields = fields
        self.extra = extra


def not_found(what: str = "resource") -> AppError:
    return AppError("not_found", 404, f"{what} not found")


def forbidden(message: str = "You do not have permission for this action") -> AppError:
    return AppError("forbidden", 403, message)


def error_body(code: str, message: str, fields: dict | None = None, extra: dict | None = None):
    body: dict[str, Any] = {"code": code, "message": message}
    if fields:
        body["fields"] = fields
    if extra:
        body.update(extra)
    return {"error": body}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_request: Request, exc: AppError):
        return JSONResponse(
            error_body(exc.code, exc.message, exc.fields, exc.extra), status_code=exc.status
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_request: Request, exc: RequestValidationError):
        fields: dict[str, str] = {}
        for err in exc.errors():
            loc = [str(part) for part in err.get("loc", []) if part not in ("body", "query", "path")]
            key = ".".join(loc) or "_"
            fields.setdefault(key, err.get("msg", "invalid"))
        return JSONResponse(
            error_body("validation_error", "Some fields are invalid", fields), status_code=422
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_request: Request, exc: StarletteHTTPException):
        code = {
            401: "unauthorized",
            403: "forbidden",
            404: "not_found",
            405: "method_not_allowed",
            413: "payload_too_large",
        }.get(exc.status_code, "http_error")
        return JSONResponse(error_body(code, str(exc.detail)), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):  # pragma: no cover - safety net
        ref = uuid.uuid4().hex[:10]
        log.exception("unhandled error ref=%s path=%s", ref, request.url.path)
        return JSONResponse(
            error_body("internal_error", "Unexpected server error", extra={"ref": ref}),
            status_code=500,
        )
