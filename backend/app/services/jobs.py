"""Background analysis job manager.

Inference runs in a small thread pool so the HTTP request returns immediately and
the frontend can poll ``/status``. Each job uses its own SQLite connection; the
model itself is loaded once and shared.
"""

from __future__ import annotations

import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from backend.app.core.config import settings
from backend.app.database.db import connect
from backend.app.database.store import get_analysis, mark_interrupted, now_iso, update_analysis
from backend.app.ml.baseline import run_baseline_inference
from backend.app.ml.inference import run_model_inference
from backend.app.ml.metrics import compute_statistics
from backend.app.ml.postprocessing import write_prediction_artifacts
from backend.app.services.storage import (
    analysis_prediction_dir,
    relative_to_project,
    save_thumbnail,
)

logger = logging.getLogger("senseearth.jobs")

_executor = ThreadPoolExecutor(
    max_workers=max(1, settings.MAX_WORKERS), thread_name_prefix="analysis"
)
_state_lock = threading.Lock()
_running: set[str] = set()


def submit_analysis(analysis_id: str) -> None:
    _executor.submit(_execute_analysis, analysis_id)


def is_running(analysis_id: str) -> bool:
    with _state_lock:
        return analysis_id in _running


def _set_progress(analysis_id: str, progress: int, stage: str) -> None:
    with connect() as connection:
        record = get_analysis(connection, analysis_id)
        if record is None or record["status"] == "failed":
            return
        update_analysis(
            connection, analysis_id, progress=max(0, min(100, progress)), stage=stage
        )


def _source_meta(path: str | None) -> dict:
    from PIL import Image

    if not path:
        return {}
    try:
        with Image.open(path) as image:
            return {
                "width": image.width,
                "height": image.height,
                "format": (image.format or "").upper(),
                "mode": image.mode,
            }
    except Exception:
        return {}


def _execute_analysis(analysis_id: str) -> None:
    with _state_lock:
        _running.add(analysis_id)

    with connect() as connection:
        record = get_analysis(connection, analysis_id)
        if record is None:
            with _state_lock:
                _running.discard(analysis_id)
            return
        update_analysis(
            connection,
            analysis_id,
            status="processing",
            stage="starting",
            progress=10,
            started_at=now_iso(),
            error=None,
        )
        image1_path = record["image1_path"]
        image2_path = record["image2_path"]
        bbox = json.loads(record["bbox"]) if record.get("bbox") else None
        aoi_area = record.get("area_km2")

    try:
        raw1 = Path(image1_path).read_bytes() if image1_path else b""
        raw2 = Path(image2_path).read_bytes() if image2_path else b""
        if not raw1 or not raw2:
            raise FileNotFoundError("The stored uploads for this analysis are missing.")

        _set_progress(analysis_id, 25, "validating")
        meta1 = _source_meta(image1_path)
        meta2 = _source_meta(image2_path)

        if settings.MODEL_WEIGHTS.exists():
            output = run_model_inference(
                raw1,
                raw2,
                meta1,
                meta2,
                progress=lambda value, stage: _set_progress(analysis_id, value, stage),
            )
        elif settings.ALLOW_BASELINE_FALLBACK:
            logger.warning("Model weights missing — running the labelled spectral baseline.")
            output = run_baseline_inference(
                raw1,
                raw2,
                meta1,
                meta2,
                progress=lambda value, stage: _set_progress(analysis_id, value, stage),
            )
        else:
            raise RuntimeError(
                "Model weights are not configured. Set SENSEEARTH_WEIGHTS to the trained "
                "checkpoint (see docs/MODEL_SETUP.md)."
            )

        _set_progress(analysis_id, 85, "writing artifacts")
        prediction_dir = analysis_prediction_dir(analysis_id)
        files = write_prediction_artifacts(
            prediction_dir,
            output.changed,
            output.semantic_before,
            output.semantic_after,
            output.unchanged_probability,
        )
        # Previews sit next to the masks; the original uploads stay untouched.
        save_thumbnail(Path(image1_path), prediction_dir / "preview1.jpg")
        save_thumbnail(Path(image2_path), prediction_dir / "preview2.jpg")

        statistics = compute_statistics(
            output.changed,
            output.semantic_before,
            output.semantic_after,
            bbox=bbox,
            aoi_area_km2=aoi_area,
            extra_warnings=output.warnings,
        )
        statistics["engine"] = {
            "key": output.engine,
            "label": output.engine_label,
            "model": output.model_name,
            "device": output.device,
            "weightsFingerprint": output.weights_fingerprint,
            "inferenceMs": output.inference_ms,
            "modelInputSize": list(output.model_size),
            "sourceSize": list(output.source_size),
            "tta": bool(output.extra.get("tta", False)),
            "semanticAvailable": output.engine != "spectral_baseline",
        }
        statistics["sources"] = output.extra.get("sourceMeta", {})

        _set_progress(analysis_id, 95, "saving results")
        with connect() as connection:
            update_analysis(
                connection,
                analysis_id,
                status="completed",
                stage="completed",
                progress=100,
                engine=output.engine,
                engine_label=output.engine_label,
                model_name=output.model_name,
                device=output.device,
                weights_fingerprint=output.weights_fingerprint,
                inference_ms=output.inference_ms,
                width=statistics["width"],
                height=statistics["height"],
                pixels=statistics["pixels"],
                changed_pixels=statistics["changedPixels"],
                change_ratio=statistics["changeRatio"],
                area_km2=aoi_area or statistics["areaKm2"],
                stats=json.dumps(statistics),
                mask_path=relative_to_project(Path(files["mask"])),
                semantic_path=relative_to_project(Path(files["semantic"])),
                overlay_path=relative_to_project(Path(files["overlay"])),
                completed_at=now_iso(),
            )
        logger.info(
            "Analysis %s completed via %s in %d ms",
            analysis_id,
            output.engine,
            output.inference_ms,
        )
    except Exception as exc:  # noqa: BLE001 - surfaced to the client as a job error
        logger.exception("Analysis %s failed", analysis_id)
        message = str(exc).strip() or exc.__class__.__name__
        with connect() as connection:
            update_analysis(
                connection,
                analysis_id,
                status="failed",
                stage="failed",
                error=message[:600],
                completed_at=now_iso(),
            )
    finally:
        with _state_lock:
            _running.discard(analysis_id)


def reset_interrupted_jobs() -> int:
    """Mark jobs left in-flight by a previous process as failed."""
    with connect() as connection:
        return mark_interrupted(
            connection,
            "The server restarted before this analysis finished. Please run it again.",
        )


def queue_summary() -> dict:
    with _state_lock:
        running = len(_running)
    workers = max(1, settings.MAX_WORKERS)
    return {"workers": workers, "running": running, "idle": max(0, workers - running)}


__all__ = [
    "is_running",
    "queue_summary",
    "reset_interrupted_jobs",
    "submit_analysis",
]
