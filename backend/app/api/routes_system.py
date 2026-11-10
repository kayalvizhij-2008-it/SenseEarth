"""Health, model status, class palette and storage endpoints."""

from __future__ import annotations

import platform
import sqlite3
import time

from fastapi import APIRouter, Depends

from backend.app.api.deps import current_user, db_session
from backend.app.core.config import settings
from backend.app.database.store import count_analyses
from backend.app.ml.class_mapping import classes_payload
from backend.app.ml.model_loader import model_availability
from backend.app.services.jobs import queue_summary, reset_interrupted_jobs
from backend.app.services.storage import storage_usage

router = APIRouter(tags=["system"])
_started_at = time.time()


@router.get("/health")
def health(connection: sqlite3.Connection = Depends(db_session)) -> dict:
    database_ok = True
    try:
        connection.execute("SELECT 1").fetchone()
    except sqlite3.Error:
        database_ok = False
    availability = model_availability()
    return {
        "status": "ok" if database_ok else "degraded",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "uptimeSeconds": int(time.time() - _started_at),
        "database": "ok" if database_ok else "error",
        "model": {
            "available": availability["available"],
            "loaded": availability["loaded"],
            "device": availability["device"],
            "name": availability["name"],
        },
        "queue": queue_summary(),
        "python": platform.python_version(),
    }


@router.get("/model/status")
def model_status(user: dict = Depends(current_user)) -> dict:
    availability = model_availability()
    availability["classes"] = classes_payload()
    availability["inputRequirements"] = {
        "channels": 3,
        "normalization": "ImageNet mean/std (0.485/0.456/0.406, 0.229/0.224/0.225)",
        "alignment": "both images must show the same scene at matching dimensions",
        "defaultInputSize": settings.MODEL_INPUT_SIZE,
        "maxInputSize": settings.MODEL_MAX_INPUT_SIZE,
        "allowedFormats": list(settings.ALLOWED_IMAGE_FORMATS),
        "maxUploadMb": settings.MAX_UPLOAD_MB,
    }
    availability["baselineFallbackEnabled"] = settings.ALLOW_BASELINE_FALLBACK
    return availability


@router.get("/model/classes")
def model_classes() -> dict:
    return {"classes": classes_payload(), "source": "utils/palette.py"}


@router.get("/system/storage")
def system_storage(
    connection: sqlite3.Connection = Depends(db_session), user: dict = Depends(current_user)
) -> dict:
    usage = storage_usage()
    usage.update(
        {
            "analyses": count_analyses(connection, user["id"]),
            "completedAnalyses": count_analyses(connection, user["id"], "completed"),
            "modelWeightsBytes": settings.MODEL_WEIGHTS.stat().st_size
            if settings.MODEL_WEIGHTS.exists()
            else 0,
        }
    )
    return usage


@router.post("/system/recover-stale-jobs")
def recover_stale_jobs(user: dict = Depends(current_user)) -> dict:
    """Mark analyses left running by a previous server process as failed."""
    return {"recovered": reset_interrupted_jobs()}


__all__ = ["router"]
