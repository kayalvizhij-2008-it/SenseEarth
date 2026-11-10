"""Actual PyTorch inference through the published SenseEarth network.

Numerical contract taken from the original ``test.py`` (do not "improve" it,
otherwise outputs stop matching the trained checkpoint):

* ``out1``/``out2`` are logits over the six changed-area classes -> ``argmax + 1``
* ``out_bin`` is a sigmoid probability of the *unchanged* class, because
  training built ``mask_bin`` with ``mask_bin[gt_mask == 0] = 1``
* after ``out_bin > 0.5`` (unchanged), both semantic maps are set to class 0

The only difference is that this service keeps the per-image semantic maps
(into "before" and "after") so transitions such as water -> buildings can be
reported, which the original script discarded.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import numpy as np

from backend.app.core.config import settings
from backend.app.ml.class_mapping import NUM_CLASSES
from backend.app.ml.model_loader import get_model_bundle
from backend.app.ml.preprocessing import prepare_pair

logger = logging.getLogger("senseearth.inference")


@dataclass
class InferenceOutput:
    engine: str
    engine_label: str
    model_name: str
    device: str
    weights_fingerprint: str | None
    inference_ms: int
    source_size: tuple[int, int]
    model_size: tuple[int, int]
    changed: np.ndarray            # bool, (H, W) at source resolution
    semantic_before: np.ndarray    # uint8 class ids, 0 = unchanged
    semantic_after: np.ndarray
    unchanged_probability: np.ndarray  # float32 at source resolution
    warnings: list[str] = field(default_factory=list)
    extra: dict = field(default_factory=dict)


def _upscale_nearest(array: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    if (array.shape[1], array.shape[0]) == size:
        return array
    from PIL import Image

    image = Image.fromarray(array)
    return np.asarray(image.resize(size, Image.NEAREST))


def run_model_inference(
    raw1: bytes,
    raw2: bytes,
    meta1: dict,
    meta2: dict,
    progress=None,
) -> InferenceOutput:
    """Run the trained Siamese PSPNet-HRNet over an aligned image pair."""
    import torch

    def report(value: int, stage: str) -> None:
        if progress:
            progress(value, stage)

    report(35, "preprocessing")
    prepared = prepare_pair(raw1, raw2, meta1, meta2)

    report(45, "loading model")
    bundle = get_model_bundle()
    model = bundle.model

    tensor1 = prepared["tensor1"].to(bundle.device)
    tensor2 = prepared["tensor2"].to(bundle.device)

    report(55, "running inference")
    started = time.perf_counter()
    offset = bundle.class_offset
    with torch.inference_mode():
        out1, out2, out_bin = model(tensor1, tensor2, settings.MODEL_TTA)
        probabilities = torch.softmax(out1, dim=1)
        probabilities2 = torch.softmax(out2, dim=1)
        semantics_before = torch.argmax(probabilities, dim=1) + offset
        semantics_after = torch.argmax(probabilities2, dim=1) + offset
        # ``BaseNet.forward`` squeezes the binary channel, but tolerate either shape.
        unchanged_prob = out_bin.squeeze(1) if out_bin.dim() == 4 else out_bin
        changed = unchanged_prob <= settings.MODEL_CHANGE_THRESHOLD

        semantics_before = semantics_before * changed.long()
        semantics_after = semantics_after * changed.long()

        before_np = semantics_before[0].to(torch.uint8).cpu().numpy()
        after_np = semantics_after[0].to(torch.uint8).cpu().numpy()
        changed_np = changed[0].cpu().numpy().astype(bool)
        unchanged_np = unchanged_prob[0].to(torch.float32).cpu().numpy()
    inference_ms = int((time.perf_counter() - started) * 1000)

    report(80, "postprocessing")
    source_size = prepared["source_size"]
    changed_full = _upscale_nearest(changed_np.astype(np.uint8), source_size).astype(bool)
    before_full = _upscale_nearest(before_np, source_size).astype(np.uint8)
    after_full = _upscale_nearest(after_np, source_size).astype(np.uint8)
    prob_full = _upscale_nearest(unchanged_np.astype(np.float32), source_size)

    # Guard: upsampled semantic ids must stay inside the documented palette.
    before_full = np.clip(before_full, 0, NUM_CLASSES - 1)
    after_full = np.clip(after_full, 0, NUM_CLASSES - 1)

    warnings = list(prepared["warnings"])
    if settings.MODEL_TTA:
        warnings.append("Test-time augmentation was enabled (6 forward passes) — slower on CPU.")

    return InferenceOutput(
        engine="senseearth_pspnet_hrnet",
        engine_label=(
            f"SenseEarth {settings.MODEL_NAME.upper()}-{settings.MODEL_BACKBONE.upper()} "
            "(published trained checkpoint)"
        ),
        model_name=bundle.model_name,
        device=bundle.device,
        weights_fingerprint=bundle.fingerprint,
        inference_ms=inference_ms,
        source_size=source_size,
        model_size=prepared["model_size"],
        changed=changed_full,
        semantic_before=before_full,
        semantic_after=after_full,
        unchanged_probability=prob_full,
        warnings=warnings,
        extra={
            "sourceMeta": {"image1": prepared["meta1"], "image2": prepared["meta2"]},
            "tta": settings.MODEL_TTA,
            "parameters": bundle.parameters,
            "semanticChannels": bundle.num_classes,
            "decodeOffset": offset,
        },
    )

