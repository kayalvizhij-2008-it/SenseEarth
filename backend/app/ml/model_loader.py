"""Loads the original SenseEarth PSPNet/HRNet change-detection network.

The research code is imported unchanged from the repository root:

* ``models/model_zoo.py`` builds ``PSPNet(backbone="hrnet_w18", nclass=6, lightweight=True)``
* ``models/sseg/base.py`` implements the shared Siamese forward pass
  (two semantic heads + one binary head over ``|F1 - F2|``)

Only runtime shims live here, so ``train.py`` / ``test.py`` / ``label.py`` keep
working exactly as published.
"""

from __future__ import annotations

import hashlib
import logging
import os
import sys
import threading
from dataclasses import dataclass
from pathlib import Path

from backend.app.core.config import settings
from backend.app.ml.class_mapping import NUM_CLASSES

logger = logging.getLogger("senseearth.model")

_lock = threading.Lock()
_model = None
_state: dict = {"loaded": False, "error": None, "loaded_at": None, "load_ms": None}


def _install_numpy_compat() -> None:
    """The 2021 code uses ``np.int``/``np.float``, removed in NumPy >= 1.24."""
    import numpy as np

    if not hasattr(np, "int"):
        np.int = int  # type: ignore[attr-defined]
    if not hasattr(np, "float"):
        np.float = float  # type: ignore[attr-defined]


def _ensure_repo_on_path() -> None:
    root = str(settings.PROJECT_ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)


def weights_fingerprint(path: Path) -> str | None:
    """Cheap stable fingerprint of the checkpoint file (size + head/tail hash)."""
    if not path.exists():
        return None
    digest = hashlib.sha256()
    size = path.stat().st_size
    digest.update(str(size).encode("ascii"))
    with path.open("rb") as handle:
        digest.update(handle.read(1024 * 1024))
        if size > 1024 * 1024:
            handle.seek(-1024 * 1024, os.SEEK_END)
            digest.update(handle.read(1024 * 1024))
    return digest.hexdigest()[:16]


def resolve_device() -> str:
    import torch

    requested = (settings.MODEL_DEVICE or "auto").lower()
    if requested == "cuda":
        return "cuda" if torch.cuda.is_available() else "cpu"
    if requested == "cpu":
        return "cpu"
    return "cuda" if torch.cuda.is_available() else "cpu"


@dataclass
class ModelBundle:
    model: object
    device: str
    model_name: str
    backbone: str
    weights_path: Path
    fingerprint: str | None
    parameters: int
    load_ms: int
    num_classes: int = NUM_CLASSES

    @property
    def class_offset(self) -> int:
        """How to turn an output channel index into a palette id.

        Training scripts build the semantic head with ``len(CLASSES) - 1 = 6``
        channels and decode with ``argmax + 1`` (verified: the released
        PSPNet-HRNet-W18 checkpoint has 6 channels). A checkpoint that also
        models class 0 would need no offset, so this is derived from the
        checkpoint rather than hard-coded.
        """
        return 1 if self.num_classes == NUM_CLASSES - 1 else 0


def _detect_num_classes(state: dict) -> int:
    """Read the semantic head width straight out of the checkpoint."""
    for key, value in state.items():
        if key.endswith("head.head.4.weight") or key.endswith("head.4.weight"):
            if hasattr(value, "shape") and len(value.shape) == 4:
                return int(value.shape[0])
    raise RuntimeError(
        "Could not determine the semantic head width from the checkpoint. "
        "Expected a FCNHead/PSPHead final 1x1 convolution weight."
    )


def _load_checkpoint() -> dict:
    import torch

    checkpoint = torch.load(
        str(settings.MODEL_WEIGHTS), map_location="cpu", weights_only=False
    )
    if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
        checkpoint = checkpoint["state_dict"]
    return {key[7:] if key.startswith("module.") else key: value for key, value in checkpoint.items()}


def _build_model():
    """Instantiate the published architecture with the published settings."""
    import time

    from models.model_zoo import get_model  # original research code

    _install_numpy_compat()
    _ensure_repo_on_path()

    started = time.perf_counter()
    cleaned = _load_checkpoint()
    num_classes = _detect_num_classes(cleaned)
    if num_classes not in (NUM_CLASSES, NUM_CLASSES - 1):
        raise RuntimeError(
            f"Checkpoint head has {num_classes} channels; expected {NUM_CLASSES - 1} or "
            f"{NUM_CLASSES}. This does not look like a SenseEarth change-detection checkpoint."
        )

    previous_cwd = os.getcwd()
    try:
        # HRNet loads ``configs/<backbone>.yaml`` relative to the working
        # directory. Model creation happens once, under a lock, so switching
        # directories here is safe and leaves the research files untouched.
        os.chdir(settings.PROJECT_ROOT)
        model = get_model(
            settings.MODEL_NAME,
            settings.MODEL_BACKBONE,
            False,  # do not download ImageNet backbones; checkpoint supplies weights
            num_classes,
            settings.MODEL_LIGHTWEIGHT,
        )
    finally:
        os.chdir(previous_cwd)

    device = resolve_device()
    missing, unexpected = model.load_state_dict(cleaned, strict=False)
    if missing:
        raise RuntimeError(
            f"Checkpoint does not match the {settings.MODEL_NAME}/{settings.MODEL_BACKBONE} "
            f"architecture. Missing {len(missing)} tensors, unexpected {len(unexpected)}."
        )

    model.to(device)
    model.eval()

    parameters = sum(p.numel() for p in model.parameters())
    load_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "Loaded %s/%s on %s (%d params, %d classes, %d ms)",
        settings.MODEL_NAME,
        settings.MODEL_BACKBONE,
        device,
        parameters,
        num_classes,
        load_ms,
    )
    return ModelBundle(
        model=model,
        device=device,
        model_name=f"{settings.MODEL_NAME}-{settings.MODEL_BACKBONE}",
        backbone=settings.MODEL_BACKBONE,
        weights_path=settings.MODEL_WEIGHTS,
        fingerprint=weights_fingerprint(settings.MODEL_WEIGHTS),
        parameters=parameters,
        load_ms=load_ms,
        num_classes=num_classes,
    )


def get_model_bundle() -> ModelBundle:
    """Return the process-wide model bundle, loading it on first use."""
    global _model
    if _model is not None:
        return _model
    with _lock:
        if _model is not None:
            return _model
        import time

        started = time.perf_counter()
        _state["error"] = None
        try:
            _model = _build_model()
            _state.update(
                loaded=True,
                loaded_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                load_ms=_model.load_ms,
            )
            return _model
        except Exception as exc:  # surfaced through /api/model/status
            _state.update(loaded=False, error=str(exc), load_ms=None)
            logger.exception("Unable to load the SenseEarth model")
            raise


def model_availability() -> dict:
    """Non-invasive status probe used by the health and settings endpoints."""
    import torch

    weights = settings.MODEL_WEIGHTS
    exists = weights.exists()
    status = {
        "name": f"{settings.MODEL_NAME}-{settings.MODEL_BACKBONE}",
        "model": settings.MODEL_NAME,
        "backbone": settings.MODEL_BACKBONE,
        "lightweightHead": settings.MODEL_LIGHTWEIGHT,
        "numSemanticClasses": NUM_CLASSES,        "weightsPath": str(weights.relative_to(settings.PROJECT_ROOT))
        if weights.is_relative_to(settings.PROJECT_ROOT)
        else str(weights),
        "weightsPresent": exists,
        "weightsBytes": weights.stat().st_size if exists else 0,
        "weightsFingerprint": weights_fingerprint(weights),
        "device": resolve_device(),
        "cudaAvailable": torch.cuda.is_available(),
        "torchVersion": torch.__version__,
        "inputSize": settings.MODEL_INPUT_SIZE,
        "changeThreshold": settings.MODEL_CHANGE_THRESHOLD,
        "tta": settings.MODEL_TTA,
        "loaded": _state["loaded"],
        "loadedAt": _state["loaded_at"],
        "loadMs": _state["load_ms"],
        "error": _state["error"],
        "available": bool(exists),
        "parameters": _model.parameters if _model is not None else None,
    }
    if _model is not None:
        status["loaded"] = True
        status["activeDevice"] = _model.device
        status["semanticChannels"] = _model.num_classes
        status["classOffset"] = _model.class_offset
    return status


__all__ = [
    "ModelBundle",
    "get_model_bundle",
    "model_availability",
    "resolve_device",
    "weights_fingerprint",
]
