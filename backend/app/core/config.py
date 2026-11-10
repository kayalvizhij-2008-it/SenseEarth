"""Central configuration for the SenseEarth application backend.

All values can be overridden with environment variables so the same code runs
locally, on a workstation with CUDA and behind a reverse proxy in production.
"""

from __future__ import annotations

import os
import secrets
from pathlib import Path

# backend/app/core/config.py -> backend/app/core -> backend/app -> backend -> <project root>
PROJECT_ROOT = Path(__file__).resolve().parents[3]


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


class Settings:
    """Runtime settings resolved once at import time."""

    APP_NAME: str = "SenseEarth"
    APP_VERSION: str = "2.0.0"

    PROJECT_ROOT: Path = PROJECT_ROOT
    STORAGE_DIR: Path = Path(os.environ.get("SENSEEARTH_STORAGE", PROJECT_ROOT / "storage"))
    UPLOAD_DIR: Path = STORAGE_DIR / "uploads"
    PREDICTION_DIR: Path = STORAGE_DIR / "predictions"
    REPORT_DIR: Path = STORAGE_DIR / "reports"
    SECRET_FILE: Path = STORAGE_DIR / ".session_secret"

    # SQLite by default; set DATABASE_URL to a PostgreSQL DSN in production.
    DATABASE_URL: str = os.environ.get(
        "DATABASE_URL", f"sqlite:///{(STORAGE_DIR / 'senseearth.db').as_posix()}"
    )

    # Model -----------------------------------------------------------------
    MODEL_NAME: str = os.environ.get("SENSEEARTH_MODEL", "pspnet")
    MODEL_BACKBONE: str = os.environ.get("SENSEEARTH_BACKBONE", "hrnet_w18")
    MODEL_LIGHTWEIGHT: bool = _env_bool("SENSEEARTH_LIGHTWEIGHT", True)
    MODEL_WEIGHTS: Path = Path(
        os.environ.get(
            "SENSEEARTH_WEIGHTS",
            PROJECT_ROOT / "models" / "weights" / "pspnet_hrnet_w18.pth",
        )
    )
    MODEL_NUM_CLASSES: int = 6  # classes excluding "unchanged"
    MODEL_INPUT_SIZE: int = _env_int("SENSEEARTH_INPUT_SIZE", 512)
    MODEL_MAX_INPUT_SIZE: int = _env_int("SENSEEARTH_MAX_INPUT_SIZE", 1024)
    MODEL_DEVICE: str = os.environ.get("SENSEEARTH_DEVICE", "auto")  # auto|cpu|cuda
    MODEL_TTA: bool = _env_bool("SENSEEARTH_TTA", False)
    MODEL_CHANGE_THRESHOLD: float = float(os.environ.get("SENSEEARTH_CHANGE_THRESHOLD", "0.5"))

    # Allows a clearly labelled, non-neural fallback when weights are absent.
    ALLOW_BASELINE_FALLBACK: bool = _env_bool("SENSEEARTH_BASELINE_FALLBACK", True)

    # Uploads ---------------------------------------------------------------
    MAX_UPLOAD_MB: int = _env_int("SENSEEARTH_MAX_UPLOAD_MB", 25)
    ALLOWED_IMAGE_FORMATS: tuple[str, ...] = ("PNG", "JPEG", "WEBP", "BMP", "TIFF")
    MAX_IMAGE_PIXELS: int = _env_int("SENSEEARTH_MAX_IMAGE_PIXELS", 80_000_000)

    # Security --------------------------------------------------------------
    SESSION_TTL_SECONDS: int = _env_int("SENSEEARTH_SESSION_TTL", 7 * 24 * 3600)
    CORS_ORIGINS: list[str] = list(dict.fromkeys([
        origin.strip()
        for origin in os.environ.get(
            "SENSEEARTH_CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173",
        ).split(",")
        if origin.strip()
    ] + [
        "https://site-da783295f19548d69bbd52b5ba2e00d1.freebuff.page",
        "https://senseearth.vercel.app",
    ]))

    # Google OAuth ----------------------------------------------------------
    # Set these in the environment (see .env.example and docs/GOOGLE_OAUTH.md).
    # The client secret stays server-side; it is never sent to the browser.
    GOOGLE_CLIENT_ID: str = os.environ.get("SENSEEARTH_GOOGLE_CLIENT_ID", "").strip()
    GOOGLE_CLIENT_SECRET: str = os.environ.get("SENSEEARTH_GOOGLE_CLIENT_SECRET", "").strip()
    GOOGLE_REDIRECT_URI: str = os.environ.get(
        "SENSEEARTH_GOOGLE_REDIRECT_URI", "http://127.0.0.1:8000/api/auth/google/callback"
    ).strip()
    FRONTEND_URL: str = os.environ.get("SENSEEARTH_FRONTEND_URL", "http://127.0.0.1:5173").rstrip("/")

    # Jobs ------------------------------------------------------------------
    MAX_WORKERS: int = _env_int("SENSEEARTH_WORKERS", 2)

    # Optional external LLM (never required, never invents findings) ---------
    LLM_API_BASE: str = os.environ.get("SENSEEARTH_LLM_BASE", "").rstrip("/")
    LLM_API_KEY: str = os.environ.get("SENSEEARTH_LLM_KEY", "")
    LLM_MODEL: str = os.environ.get("SENSEEARTH_LLM_MODEL", "")

    def ensure_directories(self) -> None:
        for directory in (
            self.STORAGE_DIR,
            self.UPLOAD_DIR,
            self.PREDICTION_DIR,
            self.REPORT_DIR,
        ):
            directory.mkdir(parents=True, exist_ok=True)

    def session_secret(self) -> bytes:
        """Read (or create once) the HMAC key used to sign session tokens."""
        env_secret = os.environ.get("SENSEEARTH_SECRET_KEY")
        if env_secret:
            return env_secret.encode("utf-8")
        self.ensure_directories()
        if self.SECRET_FILE.exists():
            value = self.SECRET_FILE.read_text(encoding="utf-8").strip()
            if value:
                return value.encode("utf-8")
        value = secrets.token_urlsafe(48)
        self.SECRET_FILE.write_text(value, encoding="utf-8")
        try:  # best effort on POSIX; Windows ignores chmod semantics
            os.chmod(self.SECRET_FILE, 0o600)
        except OSError:
            pass
        return value.encode("utf-8")


settings = Settings()
settings.ensure_directories()
