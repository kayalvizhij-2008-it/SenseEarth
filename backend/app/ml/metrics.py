"""Statistics derived strictly from generated masks.

Nothing here invents data: every number is either a pixel count from the
produced masks, or an area estimate that is only emitted when the analysis was
created with a real geographic bounding box.
"""

from __future__ import annotations

import math

import numpy as np

from backend.app.ml.class_mapping import CHANGE_CLASSES, CLASSES, class_by_id

KM_PER_DEG_LAT = 110.574
KM_PER_DEG_LON_EQUATOR = 111.320


def bbox_area_km2(bbox: list[float] | None) -> float | None:
    """Planar approximation of a WGS84 bounding box, adequate for AOI extents."""
    if not bbox or len(bbox) != 4:
        return None
    west, south, east, north = (float(v) for v in bbox)
    if not (-180 <= west <= 180 and -180 <= east <= 180 and -90 <= south <= 90 and -90 <= north <= 90):
        return None
    if east <= west or north <= south:
        return None
    mid_lat = math.radians((south + north) / 2.0)
    width_km = (east - west) * KM_PER_DEG_LON_EQUATOR * math.cos(mid_lat)
    height_km = (north - south) * KM_PER_DEG_LAT
    area = abs(width_km * height_km)
    return round(area, 6) if area > 0 else None


def pixel_area_m2(total_pixels: int, area_km2: float | None) -> float | None:
    if not area_km2 or total_pixels <= 0:
        return None
    return area_km2 * 1_000_000.0 / total_pixels


def _class_entries(counts: np.ndarray, pixels: int, per_pixel_m2: float | None) -> list[dict]:
    entries = []
    for cls in CLASSES:
        count = int(counts[cls["id"]]) if cls["id"] < len(counts) else 0
        entries.append(
            {
                "id": cls["id"],
                "key": cls["key"],
                "label": cls["label"],
                "labelZh": cls["label_zh"],
                "rgb": list(cls["rgb"]),
                "hex": cls["hex"],
                "pixels": count,
                "ratio": (count / pixels) if pixels else 0.0,
                "areaKm2": round(count * per_pixel_m2 / 1_000_000.0, 4)
                if per_pixel_m2 is not None
                else None,
            }
        )
    return entries


def compute_statistics(
    changed: np.ndarray,
    semantic_before: np.ndarray,
    semantic_after: np.ndarray,
    bbox: list[float] | None = None,
    aoi_area_km2: float | None = None,
    extra_warnings: list[str] | None = None,
) -> dict:
    """Build the results payload consumed by the frontend and the report writer."""
    height, width = changed.shape
    total = int(height * width)
    changed_count = int(np.count_nonzero(changed))
    ratio = changed_count / total if total else 0.0

    area_total = aoi_area_km2 if aoi_area_km2 else bbox_area_km2(bbox)
    per_pixel = pixel_area_m2(total, area_total)

    counts_after = np.bincount(semantic_after.ravel(), minlength=len(CLASSES))
    counts_before = np.bincount(semantic_before.ravel(), minlength=len(CLASSES))
    counts_after[0] = total - changed_count
    counts_before[0] = total - changed_count

    # Only changed pixels belong to semantic classes; unchanged stays class 0.
    changed_classes_after = _class_entries(counts_after, total, per_pixel)
    changed_classes_before = _class_entries(counts_before, total, per_pixel)

    # Class transitions (before -> after) over changed pixels only.
    transitions: list[dict] = []
    if changed_count:
        before_ids = semantic_before[changed].astype(np.int64)
        after_ids = semantic_after[changed].astype(np.int64)
        joint = np.bincount(before_ids * len(CLASSES) + after_ids, minlength=len(CLASSES) ** 2)
        for inline in np.argsort(joint)[::-1][:12]:
            count = int(joint[inline])
            if count <= 0:
                continue
            before_id, after_id = divmod(int(inline), len(CLASSES))
            if before_id == after_id:
                continue
            transitions.append(
                {
                    "from": {
                        "id": before_id,
                        "label": class_by_id(before_id)["label"],
                        "hex": class_by_id(before_id)["hex"],
                    },
                    "to": {
                        "id": after_id,
                        "label": class_by_id(after_id)["label"],
                        "hex": class_by_id(after_id)["hex"],
                    },
                    "pixels": count,
                    "ratio": count / changed_count,
                }
            )

    groups = {
        "water": ["water"],
        "vegetation": ["low_vegetation", "trees"],
        "ground": ["ground"],
        "built": ["buildings"],
        "sports": ["playground"],
    }
    group_stats = []
    for key, member_keys in groups.items():
        member_ids = {c["id"] for c in CLASSES if c["key"] in member_keys}
        pixels = sum(int(counts_after[i]) for i in member_ids if i < len(counts_after))
        group_stats.append(
            {
                "key": key,
                "pixels": pixels,
                "ratio": pixels / total if total else 0.0,
                "changedRatio": pixels / changed_count if changed_count else 0.0,
                "areaKm2": round(pixels * per_pixel / 1_000_000.0, 4)
                if per_pixel is not None
                else None,
            }
        )

    warnings = list(extra_warnings or [])
    area_source = "aoi" if aoi_area_km2 else ("bbox" if bbox_area_km2(bbox) else "none")
    if area_source == "none":
        warnings.append(
            "No geographic boundary was supplied, so areas are reported in pixels only. "
            "Pixel counts do not imply a ground area without georeferencing."
        )

    return {
        "width": width,
        "height": height,
        "pixels": total,
        "changedPixels": changed_count,
        "unchangedPixels": total - changed_count,
        "changeRatio": ratio,
        "areaKm2": round(area_total, 4) if area_total else None,
        "changedAreaKm2": round(changed_count * per_pixel / 1_000_000.0, 4)
        if per_pixel is not None
        else None,
        "pixelAreaM2": round(per_pixel, 6) if per_pixel is not None else None,
        "areaSource": area_source,
        "classes": changed_classes_after,
        "classesBefore": changed_classes_before,
        "changedClasses": [
            entry for entry in changed_classes_after if entry["id"] != 0 and entry["pixels"] > 0
        ],
        "transitions": transitions,
        "groups": group_stats,
        "classCount": len(CHANGE_CLASSES),
        "warnings": warnings,
    }


__all__ = ["bbox_area_km2", "compute_statistics", "pixel_area_m2"]
