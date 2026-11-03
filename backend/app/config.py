"""Runtime settings loaded from environment variables and ``backend/.env``.

Only names are referenced in source; values live in ``backend/.env`` (git-ignored).
See ``backend/.env.example`` for every variable, its purpose and safe defaults.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        env_ignore_empty=True,  # `KEY=` in .env means "use the default"
        extra="ignore",
        case_sensitive=False,
    )

    # --- App / server -----------------------------------------------------
    app_env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'conceptlab.db').as_posix()}"
    storage_dir: Path = BACKEND_DIR / "storage"
    frontend_dist: Path = PROJECT_DIR / "frontend" / "dist"
    public_base_url: str = "http://localhost:5173"
    allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )

    # --- Auth / cookies ---------------------------------------------------
    session_ttl_hours: int = 24 * 14
    cookie_secure: bool = False

    # --- Meta Model API ---------------------------------------------------
    model_api_key: SecretStr | None = None
    model_api_base_url: str = "https://api.meta.ai/v1"
    muse_model_contributor: str = "muse-spark-1.3-contributor"
    muse_model_standard: str = "muse-spark-1.3"
    muse_model_deep: str = "muse-wonder-1.0"
    sam_model: str = "sam-3.1"
    image_model: str = "muse-image-1.0"
    asr_model: str = "muse-voice-transcribe-1.0"
    default_ai_mode: Literal["contributor", "standard"] = "contributor"
    enable_deep_analysis: bool = True
    enable_image_generation: bool = True
    ai_timeout_seconds: float = 240.0
    ai_max_retries: int = 2
    ai_effort_fast: str = "low"
    ai_effort_deep: str = "medium"

    # --- Limits -----------------------------------------------------------
    max_upload_mb_pdf: int = 40
    max_upload_mb_image: int = 15
    max_upload_mb_video: int = 150
    max_upload_mb_audio: int = 15
    max_video_seconds: int = 300
    max_sources_per_lab: int = 12
    anon_ai_requests_per_hour: int = 40
    # Anonymous visitors pick their own viewer cookie, so the per-browser budget above is also
    # capped per IP address (sized for a whole class behind one school IP).
    anon_ai_requests_per_ip_hour: int = 600
    user_ai_requests_per_hour: int = 400
    login_attempts_per_15min: int = 10
    registrations_per_hour: int = 30  # per IP address: a teacher workshop behind one school network fits

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if value.startswith("["):
                import json

                return json.loads(value)
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def _secure_production_cookies(self):
        if self.app_env == "production" and not self.cookie_secure:
            raise ValueError("COOKIE_SECURE must be true when APP_ENV=production (serve over HTTPS)")
        return self

    @property
    def ai_configured(self) -> bool:
        return bool(self.model_api_key and self.model_api_key.get_secret_value().strip())

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
