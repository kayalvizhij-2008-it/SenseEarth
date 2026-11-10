"""Convert raw predictions into the artefacts the UI and reports consume."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from backend.app.ml.class_mapping import PALETTE_FLAT, class_index_to_rgb_array


def save_binary_mask(changed: np.ndarray, path: Path) -> None:
    """Binary change mask: 255 = changed, 0 = unchanged (PNG, greyscale)."""
    array = (changed.astype(np.uint8) * 255)
    Image.fromarray(array, mode="L").save(path, format="PNG", optimize=True)


def save_semantic_mask(class_map: np.ndarray, path: Path) -> None:
    """Palette-indexed label mask (single channel indices 0..6)."""
    image = Image.fromarray(class_map.astype(np.uint8), mode="P")
    image.putpalette(PALETTE_FLAT)
    image.save(path, format="PNG", optimize=True)


def save_semantic_rgb(class_map: np.ndarray, path: Path) -> None:
    """RGB rendering of the palette mask for straightforward browser display."""
    table = class_index_to_rgb_array()
    rgb = table[np.clip(class_map, 0, len(table) - 1)]
    Image.fromarray(rgb, mode="RGB").save(path, format="PNG", optimize=True)


def save_overlay(class_map: np.ndarray, path: Path, alpha: int = 205) -> None:
    """Transparent overlay: only changed pixels are coloured."""
    table = class_index_to_rgb_array()
    clipped = np.clip(class_map, 0, len(table) - 1)
    rgb = table[clipped]
    rgba = np.zeros((*class_map.shape, 4), dtype=np.uint8)
    rgba[..., :3] = rgb
    rgba[..., 3] = np.where(class_map > 0, alpha, 0).astype(np.uint8)
    Image.fromarray(rgba, mode="RGBA").save(path, format="PNG", optimize=True)


def save_probability_map(probability: np.ndarray, path: Path) -> None:
    """Unchanged-probability rendered as a cyan/blue ramp (diagnostic only)."""
    clipped = np.clip(probability, 0.0, 1.0)
    ramp = np.stack(
        [
            (clipped * 34).astype(np.uint8),
            (clipped * 211).astype(np.uint8),
            (clipped * 238).astype(np.uint8),
        ],
        axis=-1,
    )
    Image.fromarray(ramp, mode="RGB").save(path, format="PNG", optimize=True)


def write_prediction_artifacts(
    directory: Path,
    changed: np.ndarray,
    semantic_before: np.ndarray,
    semantic_after: np.ndarray,
    unchanged_probability: np.ndarray,
) -> dict[str, str]:
    """Persist every prediction artefact and return their relative paths."""
    directory.mkdir(parents=True, exist_ok=True)
    files = {
        "mask": directory / "binary_mask.png",
        "semantic": directory / "semantic_mask.png",
        "semantic_rgb": directory / "semantic_rgb.png",
        "overlay": directory / "overlay.png",
        "semantic_before": directory / "semantic_before.png",
        "probability": directory / "unchanged_probability.png",
    }
    save_binary_mask(changed, files["mask"])
    save_semantic_mask(semantic_after, files["semantic"])
    save_semantic_rgb(semantic_after, files["semantic_rgb"])
    save_overlay(semantic_after, files["overlay"])
    save_semantic_rgb(semantic_before, files["semantic_before"])
    save_probability_map(unchanged_probability, files["probability"])
    return {key: str(value) for key, value in files.items()}


__all__ = [
    "save_binary_mask",
    "save_overlay",
    "save_probability_map",
    "save_semantic_mask",
    "save_semantic_rgb",
    "write_prediction_artifacts",
]
