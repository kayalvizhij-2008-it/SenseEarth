"""Filesystem helpers: safe upload writes, artefact lookup and storage stats."""

from __future__ import annotations

import io
import shutil
from pathlib import Path

from PIL import Image

from backend.app.core.config import settings

_EXTENSION_BY_FORMAT = {
    "PNG": ".png",
    "JPEG": ".jpg",
    "WEBP": ".webp",
    "BMP": ".bmp",
    "TIFF": ".tif",
}


def safe_extension(image_format: str) -> str:
    """Derive a file extension from the *detected* format, never the client name."""
    return _EXTENSION_BY_FORMAT.get(image_format.upper(), ".png")


def analysis_upload_dir(analysis_id: str) -> Path:
    return settings.UPLOAD_DIR / _safe_id(analysis_id)


def analysis_prediction_dir(analysis_id: str) -> Path:
    return settings.PREDICTION_DIR / _safe_id(analysis_id)


def _safe_id(value: str) -> str:
    cleaned = "".join(ch for ch in value if ch.isalnum() or ch in "-_")
    if not cleaned or cleaned != value:
        raise ValueError("Invalid identifier")
    return cleaned


def save_upload(analysis_id: str, slot: int, raw: bytes, image_format: str) -> Path:
    """Write an upload under a server-controlled path with a canonical extension."""
    directory = analysis_upload_dir(analysis_id)
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"image{slot}{safe_extension(image_format)}"
    target.write_bytes(raw)
    return target


def save_thumbnail(source: Path, target: Path, max_size: int = 1024) -> Path | None:
    """Downscale a copy for the UI; returns None when the file is unreadable."""
    try:
        with Image.open(source) as image:
            image = image.convert("RGB")
            image.thumbnail((max_size, max_size), Image.LANCZOS)
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=88, optimize=True)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(buffer.getvalue())
        return target
    except Exception:
        return None


def resolve_stored_path(relative_or_absolute: str | None) -> Path | None:
    """Resolve a stored path while refusing anything outside the storage root."""
    if not relative_or_absolute:
        return None
    path = Path(relative_or_absolute)
    if not path.is_absolute():
        path = settings.PROJECT_ROOT / path
    try:
        resolved = path.resolve()
        root = settings.STORAGE_DIR.resolve()
    except OSError:
        return None
    if resolved != root and root not in resolved.parents:
        return None
    return resolved if resolved.exists() else None


def relative_to_project(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(settings.PROJECT_ROOT.resolve()))
    except ValueError:
        return str(path)


def delete_analysis_files(analysis_id: str) -> None:
    for directory in (analysis_upload_dir(analysis_id), analysis_prediction_dir(analysis_id)):
        if directory.exists():
            shutil.rmtree(directory, ignore_errors=True)
    for suffix in ("pdf", "csv", "zip"):
        report = settings.REPORT_DIR / f"{_safe_id(analysis_id)}.{suffix}"
        if report.exists():
            report.unlink(missing_ok=True)


def directory_size(path: Path) -> int:
    total = 0
    if not path.exists():
        return 0
    for file in path.rglob("*"):
        if file.is_file():
            total += file.stat().st_size
    return total


def storage_usage() -> dict:
    uploads = directory_size(settings.UPLOAD_DIR)
    predictions = directory_size(settings.PREDICTION_DIR)
    reports = directory_size(settings.REPORT_DIR)
    database = settings.STORAGE_DIR / "senseearth.db"
    db_bytes = database.stat().st_size if database.exists() else 0
    return {
        "uploadsBytes": uploads,
        "predictionsBytes": predictions,
        "reportsBytes": reports,
        "databaseBytes": db_bytes,
        "totalBytes": uploads + predictions + reports + db_bytes,
        "limitBytes": None,
        "root": "storage/",
    }


__all__ = [
    "analysis_prediction_dir",
    "analysis_upload_dir",
    "delete_analysis_files",
    "relative_to_project",
    "resolve_stored_path",
    "safe_extension",
    "save_thumbnail",
    "save_upload",
    "storage_usage",
]
