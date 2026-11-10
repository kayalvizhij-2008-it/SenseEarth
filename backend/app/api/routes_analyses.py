"""Analysis lifecycle: upload, queue, poll, retrieve results, export, delete."""

from __future__ import annotations

import json
import math
import sqlite3
from datetime import datetime
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse

from backend.app.api.deps import current_user, db_session, owned_analysis
from backend.app.core.config import settings
from backend.app.database.store import (
    delete_analysis,
    get_region,
    insert_analysis,
    list_analyses,
    new_id,
    now_iso,
    update_analysis,
)
from backend.app.ml.preprocessing import ImageValidationError, inspect_image_bytes
from backend.app.schemas.schemas import AnalysisOut, AnalysisStatusOut
from backend.app.services.insights import build_insights, statistics_from_record
from backend.app.services.jobs import queue_summary, submit_analysis
from backend.app.services.reports import build_bundle, build_csv, build_pdf
from backend.app.services.serializers import analysis_to_dict
from backend.app.services.storage import (
    analysis_prediction_dir,
    analysis_upload_dir,
    delete_analysis_files,
    relative_to_project,
    resolve_stored_path,
    save_upload,
)

router = APIRouter(prefix="/analyses", tags=["analyses"])

_MEDIA_TYPES = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "pdf": "application/pdf",
    "csv": "text/csv",
    "zip": "application/zip",
}
_CHUNK = 1024 * 1024


async def _read_upload(upload: UploadFile, label: str) -> bytes:
    limit = settings.MAX_UPLOAD_MB * 1024 * 1024
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"{label} exceeds the {settings.MAX_UPLOAD_MB} MB upload limit.",
            )
        chunks.append(chunk)
    if total == 0:
        raise HTTPException(status_code=422, detail=f"{label} is empty.")
    return b"".join(chunks)


def _parse_bbox(raw: str | None) -> list[float] | None:
    if not raw:
        return None
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="bbox must be a JSON array.") from exc
    if not isinstance(value, list) or len(value) != 4:
        raise HTTPException(status_code=422, detail="bbox must be [west, south, east, north].")
    try:
        bbox = [float(item) for item in value]
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="bbox values must be numbers.") from exc
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise HTTPException(status_code=422, detail="bbox is outside valid coordinate ranges.")
    return bbox


def _parse_geometry(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="AOI geometry must be valid GeoJSON.") from exc
    if not isinstance(value, dict) or "type" not in value:
        raise HTTPException(status_code=422, detail="AOI geometry must be a GeoJSON geometry.")
    return json.dumps(value)


def _validate_date(value: str | None, label: str) -> str | None:
    if not value:
        return None
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"{label} must use YYYY-MM-DD.") from exc
    return value


@router.post("", status_code=status.HTTP_202_ACCEPTED, response_model=AnalysisOut)
async def create_analysis(
    image1: UploadFile = File(..., description="Earlier acquisition"),
    image2: UploadFile = File(..., description="Later acquisition"),
    title: str = Form(...),
    locationName: str | None = Form(default=None),
    latitude: float | None = Form(default=None),
    longitude: float | None = Form(default=None),
    dateBefore: str | None = Form(default=None),
    dateAfter: str | None = Form(default=None),
    bbox: str | None = Form(default=None),
    aoiGeometry: str | None = Form(default=None),
    areaKm2: float | None = Form(default=None),
    regionId: str | None = Form(default=None),
    connection: sqlite3.Connection = Depends(db_session),
    user: dict = Depends(current_user),
) -> dict:
    if latitude is not None and not (-90 <= latitude <= 90):
        raise HTTPException(status_code=422, detail="latitude must be between -90 and 90.")
    if longitude is not None and not (-180 <= longitude <= 180):
        raise HTTPException(status_code=422, detail="longitude must be between -180 and 180.")
    if not title.strip():
        raise HTTPException(status_code=422, detail="Give the analysis a title.")

    parsed_bbox = _parse_bbox(bbox)
    parsed_geometry = _parse_geometry(aoiGeometry)
    date_before = _validate_date(dateBefore, "dateBefore")
    date_after = _validate_date(dateAfter, "dateAfter")
    if date_before and date_after and date_before > date_after:
        raise HTTPException(status_code=422, detail="The earlier date must precede the later date.")

    if regionId:
        region = get_region(connection, regionId)
        if region is None or region["owner_id"] != user["id"]:
            raise HTTPException(status_code=404, detail="Saved region not found.")

    raw1 = await _read_upload(image1, "The first image")
    raw2 = await _read_upload(image2, "The second image")

    try:
        meta1 = inspect_image_bytes(raw1, image1.filename or "image1")
        meta2 = inspect_image_bytes(raw2, image2.filename or "image2")
    except ImageValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    ratio1 = meta1["width"] / meta1["height"]
    ratio2 = meta2["width"] / meta2["height"]
    if abs(ratio1 - ratio2) / max(ratio1, ratio2) > 0.02:
        raise HTTPException(
            status_code=422,
            detail=(
                "The two images have different aspect ratios "
                f"({meta1['width']}x{meta1['height']} and {meta2['width']}x{meta2['height']}). "
                "Upload two acquisitions of the same scene at matching dimensions."
            ),
        )

    analysis_id = new_id()
    path1 = save_upload(analysis_id, 1, raw1, meta1["format"])
    path2 = save_upload(analysis_id, 2, raw2, meta2["format"])

    record = insert_analysis(
        connection,
        {
            "id": analysis_id,
            "owner_id": user["id"],
            "title": title.strip()[:200],
            "location_name": (locationName or "").strip()[:200] or None,
            "latitude": latitude,
            "longitude": longitude,
            "date_before": date_before,
            "date_after": date_after,
            "bbox": json.dumps(parsed_bbox) if parsed_bbox else None,
            "aoi_geometry": parsed_geometry,
            "area_km2": areaKm2 if areaKm2 and areaKm2 > 0 else None,
            "region_id": regionId or None,
            "status": "queued",
            "stage": "queued",
            "progress": 5,
            "image1_path": relative_to_project(path1),
            "image2_path": relative_to_project(path2),
            "created_at": now_iso(),
        },
    )

    submit_analysis(analysis_id)
    return analysis_to_dict(record)


@router.get("")
def list_analyses_endpoint(
    q: str | None = Query(default=None, max_length=120),
    status_filter: str | None = Query(default=None, alias="status"),
    regionId: str | None = Query(default=None),
    dateFrom: str | None = Query(default=None),
    dateTo: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=12, ge=1, le=100),
    sort: str = Query(default="newest"),
    connection: sqlite3.Connection = Depends(db_session),
    user: dict = Depends(current_user),
) -> dict:
    rows, total = list_analyses(
        connection,
        user["id"],
        q=q,
        status=status_filter,
        region_id=regionId,
        date_from=dateFrom,
        date_to=dateTo,
        sort=sort,
        page=page,
        page_size=pageSize,
    )
    return {
        "items": [analysis_to_dict(row) for row in rows],
        "total": total,
        "page": page,
        "pageSize": pageSize,
        "pages": max(1, math.ceil(total / pageSize)),
    }


@router.get("/{analysis_id}", response_model=AnalysisOut)
def get_analysis_endpoint(analysis: dict = Depends(owned_analysis)) -> dict:
    return analysis_to_dict(analysis)


@router.get("/{analysis_id}/status", response_model=AnalysisStatusOut)
def get_status(analysis: dict = Depends(owned_analysis)) -> dict:
    payload = analysis_to_dict(analysis)
    return {
        "id": payload["id"],
        "status": payload["status"],
        "progress": payload["progress"],
        "stage": payload["stage"],
        "error": payload["error"],
        "completedAt": payload["completedAt"],
    }


@router.get("/{analysis_id}/results")
def get_results(analysis: dict = Depends(owned_analysis)) -> dict:
    if analysis["status"] == "failed":
        raise HTTPException(
            status_code=409, detail=analysis.get("error") or "This analysis failed."
        )
    if analysis["status"] != "completed":
        raise HTTPException(status_code=409, detail="Results are not ready yet.")
    statistics = statistics_from_record(analysis.get("stats"))
    region = None
    if analysis.get("region_id"):
        record = get_region_placeholder(analysis)
        if record:
            region = record
    return {
        "analysis": analysis_to_dict(analysis),
        "statistics": statistics,
        "regions": region,
        "engineNotice": (
            "These masks come from the spectral difference baseline, not the SenseEarth network."
            if analysis.get("engine") == "spectral_baseline"
            else None
        ),
    }


def get_region_placeholder(analysis: dict) -> dict | None:
    """Region metadata is best-effort; a deleted region must not break results."""
    from backend.app.database.db import connect

    try:
        with connect() as connection:
            region = get_region(connection, analysis["region_id"])
    except Exception:
        return None
    if not region:
        return None
    return {"id": region["id"], "name": region["name"], "areaKm2": region.get("area_km2")}


@router.get("/{analysis_id}/insights")
def get_insights(analysis: dict = Depends(owned_analysis)) -> dict:
    return build_insights(analysis_to_dict(analysis), statistics_from_record(analysis.get("stats")))


def _file_response(path: Path | None, download_name: str | None = None) -> FileResponse:
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail="That artefact is not available.")
    media_type = _MEDIA_TYPES.get(path.suffix.lstrip(".").lower(), "application/octet-stream")
    headers = {"Cache-Control": "private, max-age=300"}
    if download_name:
        headers["Content-Disposition"] = f'attachment; filename="{download_name}"'
    return FileResponse(path, media_type=media_type, headers=headers)


@router.get("/{analysis_id}/mask")
def get_mask(analysis: dict = Depends(owned_analysis), download: bool = False) -> FileResponse:
    return _file_response(
        resolve_stored_path(analysis.get("mask_path")),
        f"senseearth-{analysis['id']}-binary-mask.png" if download else None,
    )


@router.get("/{analysis_id}/semantic-mask")
def get_semantic_mask(
    analysis: dict = Depends(owned_analysis), download: bool = False
) -> FileResponse:
    return _file_response(
        resolve_stored_path(analysis.get("semantic_path")),
        f"senseearth-{analysis['id']}-semantic-mask.png" if download else None,
    )


@router.get("/{analysis_id}/semantic-rgb")
def get_semantic_rgb(analysis: dict = Depends(owned_analysis)) -> FileResponse:
    return _file_response(analysis_prediction_dir(analysis["id"]) / "semantic_rgb.png")


@router.get("/{analysis_id}/overlay")
def get_overlay(analysis: dict = Depends(owned_analysis)) -> FileResponse:
    return _file_response(resolve_stored_path(analysis.get("overlay_path")))


@router.get("/{analysis_id}/images/{slot}")
def get_source_image(
    slot: int, analysis: dict = Depends(owned_analysis), original: bool = False
) -> FileResponse:
    if slot not in (1, 2):
        raise HTTPException(status_code=404, detail="Unknown image slot.")
    if original:
        directory = analysis_upload_dir(analysis["id"])
        candidates = sorted(directory.glob(f"image{slot}.*"))
        return _file_response(candidates[0] if candidates else None)
    return _file_response(analysis_prediction_dir(analysis["id"]) / f"preview{slot}.jpg")


@router.get("/{analysis_id}/report")
def get_report(
    analysis: dict = Depends(owned_analysis),
    format: str = Query(default="pdf", pattern="^(pdf|csv|zip)$"),
) -> FileResponse:
    if analysis["status"] != "completed":
        raise HTTPException(
            status_code=409, detail="Reports are available once the analysis completes."
        )
    payload = analysis_to_dict(analysis)
    statistics = statistics_from_record(analysis.get("stats"))
    if format == "pdf":
        path = build_pdf(payload, statistics)
        name = f"senseearth-{analysis['id']}-report.pdf"
    elif format == "csv":
        path = build_csv(payload, statistics)
        name = f"senseearth-{analysis['id']}-statistics.csv"
    else:
        path = build_bundle(payload, statistics)
        name = f"senseearth-{analysis['id']}-export.zip"
    return _file_response(path, name)


@router.post("/{analysis_id}/retry", status_code=status.HTTP_202_ACCEPTED)
def retry_analysis(
    connection: sqlite3.Connection = Depends(db_session), analysis: dict = Depends(owned_analysis)
) -> dict:
    if analysis["status"] in ("queued", "processing"):
        raise HTTPException(status_code=409, detail="This analysis is already running.")
    for stored in (analysis.get("image1_path"), analysis.get("image2_path")):
        if resolve_stored_path(stored) is None:
            raise HTTPException(
                status_code=409,
                detail="The original uploads are no longer stored. Run a new analysis instead.",
            )
    update_analysis(
        connection,
        analysis["id"],
        status="queued",
        stage="queued",
        progress=5,
        error=None,
        completed_at=None,
        stats=None,
    )
    submit_analysis(analysis["id"])
    return {"id": analysis["id"], "status": "queued", "queue": queue_summary()}


@router.delete("/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_analysis_endpoint(
    connection: sqlite3.Connection = Depends(db_session), analysis: dict = Depends(owned_analysis)
) -> None:
    analysis_id = analysis["id"]
    delete_analysis(connection, analysis_id)
    delete_analysis_files(analysis_id)


__all__ = ["router"]
