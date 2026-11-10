"""Convert stored rows into the JSON shape consumed by the frontend."""

from __future__ import annotations

import json


def analysis_to_dict(row: dict) -> dict:
    completed = row.get("status") == "completed"
    base = f"/api/analyses/{row['id']}"
    return {
        "id": row["id"],
        "title": row["title"],
        "locationName": row.get("location_name"),
        "latitude": row.get("latitude"),
        "longitude": row.get("longitude"),
        "bbox": json.loads(row["bbox"]) if row.get("bbox") else None,
        "dateBefore": row.get("date_before"),
        "dateAfter": row.get("date_after"),
        "status": row.get("status"),
        "progress": row.get("progress") or 0,
        "stage": row.get("stage"),
        "error": row.get("error"),
        "engine": row.get("engine"),
        "engineLabel": row.get("engine_label"),
        "modelName": row.get("model_name"),
        "device": row.get("device"),
        "width": row.get("width"),
        "height": row.get("height"),
        "pixels": row.get("pixels"),
        "changedPixels": row.get("changed_pixels"),
        "changeRatio": row.get("change_ratio"),
        "areaKm2": row.get("area_km2"),
        "regionId": row.get("region_id"),
        "inferenceMs": row.get("inference_ms"),
        "createdAt": row.get("created_at"),
        "startedAt": row.get("started_at"),
        "completedAt": row.get("completed_at"),
        "thumbnails": {
            "before": f"{base}/images/1" if completed else None,
            "after": f"{base}/images/2" if completed else None,
        },
        "artifacts": {
            "binaryMask": f"{base}/mask" if completed else None,
            "semanticMask": f"{base}/semantic-mask" if completed else None,
            "overlay": f"{base}/overlay" if completed else None,
            "semanticRgb": f"{base}/semantic-rgb" if completed else None,
            "reportPdf": f"{base}/report?format=pdf" if completed else None,
            "reportCsv": f"{base}/report?format=csv" if completed else None,
            "bundleZip": f"{base}/report?format=zip" if completed else None,
        },
    }


def region_to_dict(region: dict, analysis_count: int = 0, latest: dict | None = None) -> dict:
    center = None
    if region.get("center_lon") is not None and region.get("center_lat") is not None:
        center = [region["center_lon"], region["center_lat"]]
    return {
        "id": region["id"],
        "name": region["name"],
        "description": region.get("description"),
        "geometry": json.loads(region["geometry"]),
        "bbox": json.loads(region["bbox"]) if region.get("bbox") else None,
        "areaKm2": region.get("area_km2"),
        "center": center,
        "createdAt": region.get("created_at"),
        "analysisCount": analysis_count,
        "latestAnalysis": (
            {
                "id": latest["id"],
                "title": latest["title"],
                "status": latest.get("status"),
                "completedAt": latest.get("completed_at"),
                "changeRatio": latest.get("change_ratio"),
                "changedPixels": latest.get("changed_pixels"),
            }
            if latest
            else None
        ),
    }


def user_to_dict(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "organization": user.get("organization"),
        "isDemo": bool(user.get("is_demo")),
        "createdAt": user.get("created_at"),
        "avatarUrl": user.get("avatar_url"),
        "provider": user.get("auth_provider") or "password",
    }


__all__ = ["analysis_to_dict", "region_to_dict", "user_to_dict"]
