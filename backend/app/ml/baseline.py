"""Non-neural fallback used only when model weights are unavailable.

This is a plain spectral-difference detector with an Otsu threshold. It is
*documented and labelled in the UI as not being the SenseEarth model*: it can
only answer "did this pixel change", never which semantic class it became. It
exists so the upload -> job -> results workflow stays testable without the
39 MB trained checkpoint, and it is disabled with
``SENSEEARTH_BASELINE_FALLBACK=false``.
"""

from __future__ import annotations

import time

import numpy as np
from PIL import Image, ImageFilter

from backend.app.ml.inference import InferenceOutput
from backend.app.ml.preprocessing import prepare_pair


def _otsu_threshold(values: np.ndarray) -> float:
    hist, edges = np.histogram(values, bins=64, range=(0.0, 1.0))
    hist = hist.astype(np.float64)
    total = hist.sum()
    if total == 0:
        return 0.1
    probabilities = hist / total
    centers = (edges[:-1] + edges[1:]) / 2.0
    omega = np.cumsum(probabilities)
    mu = np.cumsum(probabilities * centers)
    mu_total = mu[-1]
    denominator = omega * (1.0 - omega)
    denominator[denominator == 0] = np.nan
    sigma_b = (mu_total * omega - mu) ** 2 / denominator
    index = int(np.nanargmax(sigma_b))
    return float(max(0.06, min(0.45, centers[index])))


def run_baseline_inference(raw1: bytes, raw2: bytes, meta1: dict, meta2: dict, progress=None) -> InferenceOutput:
    def report(value: int, stage: str) -> None:
        if progress:
            progress(value, stage)

    report(35, "preprocessing")
    prepared = prepare_pair(raw1, raw2, meta1, meta2)
    image1 = prepared["image1"]
    image2 = prepared["image2"].resize(image1.size, Image.BILINEAR)

    report(55, "computing spectral difference")
    started = time.perf_counter()
    array1 = np.asarray(image1.filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255.0
    array2 = np.asarray(image2.filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255.0
    difference = np.abs(array1 - array2).mean(axis=2)
    threshold = _otsu_threshold(difference)
    changed = difference >= threshold

    # Remove isolated sensor noise with a 3x3 median filter.
    changed_image = Image.fromarray((changed * 255).astype(np.uint8), mode="L")
    changed = np.asarray(changed_image.filter(ImageFilter.MedianFilter(3))) > 127
    inference_ms = int((time.perf_counter() - started) * 1000)

    verbose = np.zeros(changed.shape, dtype=np.uint8)
    return InferenceOutput(
        engine="spectral_baseline",
        engine_label="Spectral difference baseline (NOT the SenseEarth model)",
        model_name="spectral-diff-otsu",
        device="cpu",
        weights_fingerprint=None,
        inference_ms=inference_ms,
        source_size=prepared["source_size"],
        model_size=prepared["source_size"],
        changed=changed,
        semantic_before=verbose,
        semantic_after=verbose,
        unchanged_probability=(1.0 - difference).astype(np.float32),
        warnings=list(prepared["warnings"])
        + [
            "Model weights were not available, so this result comes from a spectral-difference "
            "baseline. It detects pixel change only and provides no semantic classes.",
        ],
        extra={
            "sourceMeta": {"image1": meta1, "image2": meta2},
            "threshold": threshold,
            "semanticAvailable": False,
        },
    )


__all__ = ["run_baseline_inference"]
