"""Canonical semantic class mapping for SenseEarth change detection.

The values come from the original research repository (``utils/palette.py`` and
``datasets/change_detection.py``) and must never be re-ordered: the trained
network emits six changed-area channels that correspond to classes 1..6 after
``argmax + 1``.
"""

from __future__ import annotations

from typing import TypedDict


class ClassDef(TypedDict):
    id: int
    key: str
    label: str
    label_zh: str
    rgb: tuple[int, int, int]
    hex: str


CLASSES: list[ClassDef] = [
    {
        "id": 0,
        "key": "unchanged",
        "label": "Unchanged",
        "label_zh": "未变化区域",
        "rgb": (255, 255, 255),
        "hex": "#FFFFFF",
    },
    {
        "id": 1,
        "key": "water",
        "label": "Water",
        "label_zh": "水体",
        "rgb": (0, 0, 255),
        "hex": "#0000FF",
    },
    {
        "id": 2,
        "key": "ground",
        "label": "Ground / Bare land",
        "label_zh": "地面",
        "rgb": (128, 128, 128),
        "hex": "#808080",
    },
    {
        "id": 3,
        "key": "low_vegetation",
        "label": "Low vegetation",
        "label_zh": "低矮植被",
        "rgb": (0, 128, 0),
        "hex": "#008000",
    },
    {
        "id": 4,
        "key": "trees",
        "label": "Trees",
        "label_zh": "树木",
        "rgb": (0, 255, 0),
        "hex": "#00FF00",
    },
    {
        "id": 5,
        "key": "buildings",
        "label": "Buildings",
        "label_zh": "建筑物",
        "rgb": (128, 0, 0),
        "hex": "#800000",
    },
    {
        "id": 6,
        "key": "playground",
        "label": "Playground / Sports",
        "label_zh": "运动场",
        "rgb": (255, 0, 0),
        "hex": "#FF0000",
    },
]

NUM_CLASSES = len(CLASSES)
CHANGE_CLASSES = [c for c in CLASSES if c["id"] != 0]

# Palette in the exact layout expected by ``PIL.Image.putpalette`` for the
# 7-entry label palette used by the research code.
PALETTE_FLAT: list[int] = [channel for cls in CLASSES for channel in cls["rgb"]]


def class_by_id(class_id: int) -> ClassDef:
    if 0 <= class_id < NUM_CLASSES:
        return CLASSES[class_id]
    return CLASSES[0]


def class_index_to_rgb_array():
    """Return a (7, 3) uint8 lookup table for fast palette conversion."""
    import numpy as np

    table = np.zeros((NUM_CLASSES, 3), dtype=np.uint8)
    for cls in CLASSES:
        table[cls["id"]] = cls["rgb"]
    return table


def classes_payload() -> list[dict]:
    """JSON-serialisable description of the class palette for the frontend."""
    return [
        {
            "id": cls["id"],
            "key": cls["key"],
            "label": cls["label"],
            "labelZh": cls["label_zh"],
            "rgb": list(cls["rgb"]),
            "hex": cls["hex"],
        }
        for cls in CLASSES
    ]


__all__ = [
    "CLASSES",
    "CHANGE_CLASSES",
    "NUM_CLASSES",
    "PALETTE_FLAT",
    "class_by_id",
    "class_index_to_rgb_array",
    "classes_payload",
]
