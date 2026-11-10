"""Deterministic, evidence-bound narrative generation.

Every sentence is derived from numbers already stored for the analysis. No LLM
is required, and no claim is made that the stored data cannot support (for
example, we never describe causes, NDVI, emissions or imagery we never saw).
"""

from __future__ import annotations

import json
from typing import Any

from backend.app.ml.class_mapping import class_by_id


def _fmt_number(value: float | int | None, unit: str = "") -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        if value >= 1000:
            text = f"{value:,.0f}"
        elif value >= 1:
            text = f"{value:,.2f}"
        else:
            text = f"{value:.4f}"
    else:
        text = f"{value:,}"
    return f"{text}{unit}"


def _pct(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{value * 100:.2f}%"


def build_insights(analysis: dict[str, Any], statistics: dict[str, Any]) -> dict[str, Any]:
    status = analysis.get("status")
    location = analysis.get("locationName") or "the selected area"
    if status != "completed":
        return {
            "analysisId": analysis.get("id"),
            "headline": "Analysis has no results yet",
            "summary": (
                f"This analysis of {location} is currently '{status}'. Insights are generated "
                "only from completed model output."
            ),
            "observations": [],
            "caveats": ["Nothing is inferred while the job is queued, running or failed."],
            "generatedBy": "deterministic",
            "source": "analysis-record",
        }

    engine = statistics.get("engine", {})
    semantic_available = engine.get("semanticAvailable", True)
    ratio = statistics.get("changeRatio") or 0.0
    changed_pixels = statistics.get("changedPixels") or 0
    changed_classes = statistics.get("changedClasses") or []
    transitions = statistics.get("transitions") or []

    if changed_pixels == 0:
        headline = f"No change detected in {location}"
    elif ratio < 0.01:
        headline = f"Marginal change detected in {location}"
    elif ratio < 0.1:
        headline = f"Localised change detected in {location}"
    else:
        headline = f"Widespread change detected in {location}"

    summary_parts = [
        f"{_fmt_number(changed_pixels)} of {_fmt_number(statistics.get('pixels'))} pixels "
        f"({_pct(ratio)}) were classified as changed between "
        f"{analysis.get('dateBefore') or 'the first date'} and "
        f"{analysis.get('dateAfter') or 'the second date'}."
    ]
    if statistics.get("changedAreaKm2") is not None:
        summary_parts.append(
            f"That corresponds to approximately {_fmt_number(statistics['changedAreaKm2'], ' km²')} "
            f"within the supplied area of interest "
            f"({_fmt_number(statistics.get('areaKm2'), ' km²')} in total)."
        )
    elif statistics.get("pixels"):
        summary_parts.append(
            "No geographic boundary was supplied, so the result is reported in pixels rather "
            "than ground area."
        )
    if engine.get("key") == "spectral_baseline":
        summary_parts.append(
            "These figures come from the spectral difference baseline, not from the trained "
            "SenseEarth network, and carry no semantic classes."
        )

    observations: list[str] = []
    if semantic_available and changed_classes:
        ordered = sorted(changed_classes, key=lambda item: item["pixels"], reverse=True)
        top = ordered[0]
        observations.append(
            f"Largest changed class in the later acquisition: {top['label']} with "
            f"{_fmt_number(top['pixels'])} pixels ({_pct(top['ratio'])} of the scene, "
            f"{_pct(top['pixels'] / changed_pixels if changed_pixels else 0)} of all change)."
        )
        if len(ordered) > 1:
            others = ", ".join(
                f"{item['label']} ({_fmt_number(item['pixels'])} px)" for item in ordered[1:4]
            )
            observations.append(f"Other changed classes present: {others}.")
        built = next((item for item in ordered if item["key"] == "buildings"), None)
        if built and built["pixels"] > 0:
            observations.append(
                f"Built-up change covers {_fmt_number(built['pixels'])} pixels "
                f"({_pct(built['ratio'])} of the scene)."
            )
        vegetation = sum(
            item["pixels"] for item in ordered if item["key"] in ("low_vegetation", "trees")
        )
        if vegetation:
            observations.append(
                f"Vegetation classes (low vegetation + trees) account for "
                f"{_fmt_number(vegetation)} changed pixels ({_pct(vegetation / max(changed_pixels, 1))} "
                "of all change)."
            )
        water = next((item for item in ordered if item["key"] == "water"), None)
        if water and water["pixels"]:
            observations.append(
                f"Water change covers {_fmt_number(water['pixels'])} pixels "
                f"({_pct(water['ratio'])} of the scene)."
            )

    if transitions:
        rendered = "; ".join(
            f"{item['from']['label']} → {item['to']['label']} "
            f"({_fmt_number(item['pixels'])} px)"
            for item in transitions[:4]
        )
        observations.append(f"Most frequent before → after class transitions: {rendered}.")

    groups = statistics.get("groups") or []
    dominant = max(groups, key=lambda item: item["pixels"]) if groups else None
    if dominant and dominant["pixels"]:
        labels = {
            "water": "water",
            "vegetation": "vegetation",
            "ground": "bare ground",
            "built": "built-up areas",
            "sports": "sports surfaces",
        }
        observations.append(
            f"Dominant changed surface group: {labels.get(dominant['key'], dominant['key'])} "
            f"({_pct(dominant['changedRatio'])} of changed pixels)."
        )

    if not observations:
        observations.append(
            "The model produced a binary change mask without semantic classes, so class-level "
            "observations are unavailable for this run."
        )

    caveats = [
        "Insights are a deterministic restatement of stored model output — not an "
        "independent assessment, and not a causal explanation.",
        "Semantic classes describe surface-cover transitions detected between the two "
        "acquisitions only; they do not identify what caused them.",
    ]
    if not semantic_available:
        caveats.append(
            "This analysis used the spectral baseline, which cannot assign semantic classes."
        )
    if statistics.get("areaSource") == "none":
        caveats.append(
            "Areas are reported in pixels; no georeferenced boundary was supplied for this analysis."
        )
    for warning in statistics.get("warnings", []):
        caveats.append(warning)
    if engine.get("model") and "hrnet" not in str(engine.get("model", "")).lower():
        caveats.append("The inference engine recorded for this run is not the HRNet model.")

    return {
        "analysisId": analysis.get("id"),
        "headline": headline,
        "summary": " ".join(summary_parts),
        "observations": observations,
        "caveats": caveats,
        "generatedBy": "deterministic",
        "source": "analysis-record",
    }


def statistics_from_record(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def class_label(class_id: int) -> str:
    return class_by_id(class_id)["label"]


__all__ = ["build_insights", "class_label", "statistics_from_record"]
