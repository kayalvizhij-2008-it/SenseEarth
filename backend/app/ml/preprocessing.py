"""Image validation and preprocessing that mirrors the original pipeline.

The research repository feeds ImageNet-normalised RGB tensors straight into a
fully-convolutional Siamese network (``datasets/change_detection.py``). The only
adaptation for web uploads is a bounded resize so CPU inference stays practical.
"""

from __future__ import annotations

import io
import math
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from backend.app.core.config import settings

# torchvision.transforms.ToTensor + Normalize((0.485, 0.456, 0.406), (0.229, 0.224, 0.225))
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)
SCALE_MULTIPLE = 32


class ImageValidationError(ValueError):
    """Raised when an upload cannot be used by the model."""


def _multiple_of(value: int, multiple: int = SCALE_MULTIPLE, minimum: int = 64) -> int:
    stepped = max(minimum, int(round(value / multiple)) * multiple)
    return stepped - (stepped % multiple) if stepped % multiple else stepped


def inspect_image_bytes(raw: bytes, filename: str = "upload") -> dict:
    """Validate an upload without decoding the full raster into memory."""
    size_bytes = len(raw)
    if size_bytes == 0:
        raise ImageValidationError("The uploaded file is empty.")
    if size_bytes > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise ImageValidationError(
            f"{filename} is larger than the {settings.MAX_UPLOAD_MB} MB limit."
        )
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            probe.verify()
    except UnidentifiedImageError as exc:
        raise ImageValidationError(f"{filename} is not a recognised image file.") from exc
    except Exception as exc:
        raise ImageValidationError(f"{filename} could not be decoded: {exc}") from exc

    try:
        with Image.open(io.BytesIO(raw)) as image:
            fmt = (image.format or "").upper()
            width, height = image.size
            mode = image.mode
    except Exception as exc:
        raise ImageValidationError(f"{filename} could not be decoded: {exc}") from exc

    if fmt not in settings.ALLOWED_IMAGE_FORMATS:
        raise ImageValidationError(
            f"Unsupported format '{fmt or 'unknown'}'. Allowed: "
            + ", ".join(settings.ALLOWED_IMAGE_FORMATS)
        )
    if width < 32 or height < 32:
        raise ImageValidationError(f"{filename} is too small ({width}x{height}).")
    if width * height > settings.MAX_IMAGE_PIXELS:
        raise ImageValidationError(
            f"{filename} has {width * height:,} pixels, above the "
            f"{settings.MAX_IMAGE_PIXELS:,} pixel limit."
        )
    return {
        "filename": filename,
        "format": fmt,
        "mode": mode,
        "width": width,
        "height": height,
        "bytes": size_bytes,
    }


def open_rgb(raw: bytes) -> Image.Image:
    """Decode to RGB, honouring EXIF orientation like a human would expect."""
    with Image.open(io.BytesIO(raw)) as image:
        image = ImageOps.exif_transpose(image)
        return image.convert("RGB")


def pair_target_size(width: int, height: int, requested: int | None = None) -> tuple[int, int]:
    """Longest side <= configured size, dimensions snapped to a 32px grid."""
    limit = min(requested or settings.MODEL_INPUT_SIZE, settings.MODEL_MAX_INPUT_SIZE)
    scale = min(1.0, limit / max(width, height))
    target_w = _multiple_of(round(width * scale))
    target_h = _multiple_of(round(height * scale))
    return target_w, target_h


def to_tensor(image: Image.Image, size: tuple[int, int]):
    """Resize + ImageNet-normalise into a 1x3xHxW float tensor."""
    import numpy as np
    import torch

    resized = image.resize(size, Image.BILINEAR) if image.size != size else image
    array = np.asarray(resized, dtype=np.float32) / 255.0
    tensor = torch.from_numpy(array).permute(2, 0, 1).contiguous()
    mean = torch.tensor(IMAGENET_MEAN, dtype=torch.float32).view(3, 1, 1)
    std = torch.tensor(IMAGENET_STD, dtype=torch.float32).view(3, 1, 1)
    tensor = (tensor - mean) / std
    return tensor.unsqueeze(0)


def prepare_pair(raw1: bytes, raw2: bytes, meta1: dict, meta2: dict) -> dict:
    """Return tensors plus a record of every geometric transformation applied.

    The two acquisitions must be pixel aligned for change detection to be
    meaningful. When the rasters differ in size the second image is resampled to
    the first one's dimensions and the mismatch is reported as a warning instead
    of silently producing a misaligned comparison.
    """
    warnings: list[str] = []
    image1 = open_rgb(raw1)
    image2 = open_rgb(raw2)

    aspect1 = image1.width / image1.height
    aspect2 = image2.width / image2.height
    if abs(aspect1 - aspect2) / max(aspect1, aspect2) > 0.02:
        raise ImageValidationError(
            "The two images have different aspect ratios "
            f"({image1.width}x{image1.height} vs {image2.width}x{image2.height}). "
            "Use two acquisitions of the same scene, resampled to identical dimensions."
        )
    if image1.size != image2.size:
        warnings.append(
            "The second image was resampled to match the first image's dimensions "
            f"({image1.width}x{image1.height} vs {image2.width}x{image2.height})."
        )

    target_w, target_h = pair_target_size(image1.width, image1.height)
    tensor1 = to_tensor(image1, (target_w, target_h))
    tensor2 = to_tensor(image2.resize((target_w, target_h), Image.BILINEAR), (target_w, target_h))

    if abs(target_w / target_h - aspect1) > 1e-3:
        warnings.append(
            f"Model input was snapped to a 32-pixel grid ({target_w}x{target_h}), "
            "which slightly changes the aspect ratio."
        )

    return {
        "tensor1": tensor1,
        "tensor2": tensor2,
        "model_size": (target_w, target_h),
        "source_size": image1.size,
        "image1": image1,
        "image2": image2,
        "meta1": meta1,
        "meta2": meta2,
        "warnings": warnings,
        "mean_pixels": int(math.prod(image1.size)),
    }


__all__ = [
    "ImageValidationError",
    "IMAGENET_MEAN",
    "IMAGENET_STD",
    "inspect_image_bytes",
    "open_rgb",
    "pair_target_size",
    "prepare_pair",
    "to_tensor",
]
