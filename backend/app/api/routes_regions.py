"""Saved areas of interest (polygons drawn on the Explore map)."""

from __future__ import annotations

import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.api.deps import current_user, db_session
from backend.app.database.store import (
    analyses_for_region,
    count_region_analyses,
    create_region,
    delete_region,
    get_region,
    list_regions,
    new_id,
    now_iso,
)
from backend.app.ml.metrics import bbox_area_km2
from backend.app.schemas.schemas import RegionCreate
from backend.app.services.serializers import region_to_dict

router = APIRouter(prefix="/regions", tags=["regions"])

_ALLOWED_GEOMETRIES = {"Polygon", "MultiPolygon"}


@router.get("")
def list_regions_endpoint(
    connection: sqlite3.Connection = Depends(db_session), user: dict = Depends(current_user)
) -> dict:
    items = []
    for region in list_regions(connection, user["id"]):
        rows = analyses_for_region(connection, user["id"], region["id"], limit=1)
        count = count_region_analyses(connection, user["id"], region["id"])
        items.append(region_to_dict(region, analysis_count=count, latest=rows[0] if rows else None))
    return {"items": items, "total": len(items)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_region_endpoint(
    payload: RegionCreate,
    connection: sqlite3.Connection = Depends(db_session),
    user: dict = Depends(current_user),
) -> dict:
    geometry = payload.geometry
    if geometry.get("type") not in _ALLOWED_GEOMETRIES:
        raise HTTPException(
            status_code=422, detail="Only Polygon or MultiPolygon geometries can be saved."
        )
    bbox = payload.bbox or _bbox_from_geometry(geometry)
    if bbox:
        _validate_bbox(bbox)
    area = payload.areaKm2
    if area is None and bbox:
        area = bbox_area_km2(bbox)
    center = payload.center
    if center is None and bbox:
        center = [(bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0]

    region = create_region(
        connection,
        {
            "id": new_id(),
            "owner_id": user["id"],
            "name": payload.name.strip()[:160],
            "description": (payload.description or "").strip() or None,
            "geometry": json.dumps(geometry),
            "bbox": json.dumps(bbox) if bbox else None,
            "area_km2": area,
            "center_lon": center[0] if center else None,
            "center_lat": center[1] if center else None,
            "created_at": now_iso(),
        },
    )
    return region_to_dict(region)


@router.delete("/{region_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_region_endpoint(
    region_id: str,
    connection: sqlite3.Connection = Depends(db_session),
    user: dict = Depends(current_user),
) -> None:
    region = get_region(connection, region_id)
    if region is None or region["owner_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Region not found.")
    # Analyses keep their results; only the association is cleared.
    delete_region(connection, region_id)


def _validate_bbox(bbox: list[float]) -> None:
    if len(bbox) != 4:
        raise HTTPException(status_code=422, detail="bbox must be [west, south, east, north].")
    west, south, east, north = (float(value) for value in bbox)
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise HTTPException(status_code=422, detail="bbox is outside valid coordinates.")


def _bbox_from_geometry(geometry: dict) -> list[float] | None:
    coordinates = geometry.get("coordinates")
    if not coordinates:
        return None
    xs: list[float] = []
    ys: list[float] = []

    def walk(node) -> None:
        if (
            isinstance(node, (list, tuple))
            and len(node) >= 2
            and all(isinstance(value, (int, float)) for value in node[:2])
        ):
            xs.append(float(node[0]))
            ys.append(float(node[1]))
            return
        if isinstance(node, (list, tuple)):
            for child in node:
                walk(child)

    walk(coordinates)
    if not xs or not ys:
        return None
    return [min(xs), min(ys), max(xs), max(ys)]


__all__ = ["router"]
