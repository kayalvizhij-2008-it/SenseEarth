"""Dashboard analytics computed from stored analysis records only."""

from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from backend.app.api.deps import current_user, db_session
from backend.app.database.store import (
    analyses_created_since,
    analyses_for_region,
    completed_analyses,
    get_analysis,
    list_regions,
    recent_analyses,
    status_counts,
)
from backend.app.ml.class_mapping import CLASSES
from backend.app.services.serializers import analysis_to_dict, region_to_dict

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
def summary(
    connection: sqlite3.Connection = Depends(db_session), user: dict = Depends(current_user)
) -> dict:
    counts = status_counts(connection, user["id"])
    completed_rows = completed_analyses(connection, user["id"])
    changed_pixels = sum(row.get("changed_pixels") or 0 for row in completed_rows)
    changed_area = 0.0
    for row in completed_rows:
        if not row.get("stats"):
            continue
        try:
            changed_area += json.loads(row["stats"]).get("changedAreaKm2") or 0
        except json.JSONDecodeError:
            continue
    analysed_area = sum(row.get("area_km2") or 0 for row in completed_rows)
    ratios = [row["change_ratio"] for row in completed_rows if row.get("change_ratio") is not None]
    regions = len(list_regions(connection, user["id"]))
    completed_times = [row["completed_at"] for row in completed_rows if row.get("completed_at")]
    return {
        "totalAnalyses": int(sum(counts.values())),
        "completed": int(counts.get("completed", 0)),
        "processing": int(counts.get("processing", 0)),
        "queued": int(counts.get("queued", 0)),
        "failed": int(counts.get("failed", 0)),
        "totalChangedPixels": int(changed_pixels),
        "totalAreaKm2": round(analysed_area, 2),
        "totalChangedAreaKm2": round(changed_area, 2),
        "averageChangeRatio": round(sum(ratios) / len(ratios), 6) if ratios else 0.0,
        "regions": int(regions),
        "lastCompletedAt": max(completed_times) if completed_times else None,
        "sampleSize": len(completed_rows),
    }


@router.get("/class-distribution")
def class_distribution(
    connection: sqlite3.Connection = Depends(db_session), user: dict = Depends(current_user)
) -> dict:
    totals: dict[int, int] = defaultdict(int)
    considered = 0
    for row in completed_analyses(connection, user["id"]):
        if not row.get("stats"):
            continue
        try:
            stats = json.loads(row["stats"])
        except json.JSONDecodeError:
            continue
        if stats.get("engine", {}).get("semanticAvailable") is False:
            continue
        considered += 1
        for entry in stats.get("classes") or []:
            totals[int(entry["id"])] += int(entry.get("pixels") or 0)
    grand_total = sum(totals.values())
    entries = [
        {
            "id": cls["id"],
            "key": cls["key"],
            "label": cls["label"],
            "hex": cls["hex"],
            "pixels": totals.get(cls["id"], 0),
            "ratio": (totals.get(cls["id"], 0) / grand_total) if grand_total else 0.0,
        }
        for cls in CLASSES
    ]
    return {
        "classes": entries,
        "analysesConsidered": considered,
        "totalPixels": grand_total,
        "note": (
            "Aggregated from stored semantic masks of completed analyses."
            if considered
            else "No completed analysis with semantic classes yet."
        ),
    }


@router.get("/history")
def history(
    days: int = Query(default=30, ge=7, le=365),
    connection: sqlite3.Connection = Depends(db_session),
    user: dict = Depends(current_user),
) -> dict:
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = analyses_created_since(connection, user["id"], start.isoformat())
    buckets: dict[str, dict] = {}
    for offset in range(days):
        day = (start + timedelta(days=offset)).strftime("%Y-%m-%d")
        buckets[day] = {
            "date": day,
            "completed": 0,
            "failed": 0,
            "changedPixels": 0,
            "created": 0,
        }
    for row in rows:
        created = row.get("created_at") or ""
        key = created[:10]
        bucket = buckets.get(key)
        if bucket is None:
            continue
        bucket["created"] += 1
        if row["status"] == "completed":
            bucket["completed"] += 1
            bucket["changedPixels"] += row.get("changed_pixels") or 0
        elif row["status"] == "failed":
            bucket["failed"] += 1
    return {"days": days, "points": list(buckets.values())}


@router.get("/recent")
def recent(
    limit: int = Query(default=6, ge=1, le=50),
    connection: sqlite3.Connection = Depends(db_session),
    user: dict = Depends(current_user),
) -> dict:
    rows = recent_analyses(connection, user["id"], limit)
    return {"items": [analysis_to_dict(row) for row in rows]}


@router.get("/regions")
def region_activity(
    connection: sqlite3.Connection = Depends(db_session), user: dict = Depends(current_user)
) -> dict:
    regions = list_regions(connection, user["id"])
    payload = []
    for region in regions:
        rows = analyses_for_region(connection, user["id"], region["id"], limit=8)
        latest = rows[0] if rows else None
        item = region_to_dict(region, analysis_count=len(rows), latest=latest)
        item["changes"] = [
            {
                "id": row["id"],
                "title": row["title"],
                "status": row["status"],
                "changeRatio": row.get("change_ratio"),
                "changedPixels": row.get("changed_pixels"),
                "completedAt": row.get("completed_at"),
                "dateAfter": row.get("date_after"),
            }
            for row in rows
        ]
        payload.append(item)
    return {"regions": payload, "total": len(payload)}


@router.get("/compare")
def compare(
    ids: str = Query(..., description="Comma separated analysis ids"),
    connection: sqlite3.Connection = Depends(db_session),
    user: dict = Depends(current_user),
) -> dict:
    requested = [item.strip() for item in ids.split(",") if item.strip()][:6]
    rows = []
    for analysis_id in requested:
        row = get_analysis(connection, analysis_id)
        if (
            row is None
            or row["owner_id"] != user["id"]
            or row["status"] != "completed"
            or not row.get("stats")
        ):
            continue
        stats = json.loads(row["stats"])
        rows.append(
            {
                "analysis": analysis_to_dict(row),
                "changedClasses": stats.get("changedClasses") or [],
                "groups": stats.get("groups") or [],
                "changeRatio": stats.get("changeRatio"),
                "changedAreaKm2": stats.get("changedAreaKm2"),
            }
        )
    return {
        "items": rows,
        "requested": len(requested),
        "note": "Only completed analyses owned by the signed-in account are compared.",
    }


__all__ = ["router"]
