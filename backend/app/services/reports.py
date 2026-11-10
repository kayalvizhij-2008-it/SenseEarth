"""Report export: PDF summary, CSV statistics and a ZIP bundle."""

from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image as RLImage,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from backend.app.core.config import settings
from backend.app.ml.class_mapping import CLASSES
from backend.app.services.insights import build_insights
from backend.app.services.storage import analysis_prediction_dir, resolve_stored_path

NAVY = colors.HexColor("#0D1B2A")
CYAN = colors.HexColor("#22D3EE")
SLATE = colors.HexColor("#64748B")


def report_path(analysis_id: str, suffix: str) -> Path:
    settings.REPORT_DIR.mkdir(parents=True, exist_ok=True)
    return settings.REPORT_DIR / f"{analysis_id}.{suffix}"


def _styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="SE_Title",
            parent=styles["Title"],
            fontSize=20,
            leading=24,
            textColor=NAVY,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SE_Sub",
            parent=styles["Normal"],
            fontSize=9,
            textColor=SLATE,
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SE_H2",
            parent=styles["Heading2"],
            fontSize=12,
            textColor=NAVY,
            spaceBefore=10,
            spaceAfter=6,
        )
    )
    styles.add(ParagraphStyle(name="SE_Body", parent=styles["BodyText"], fontSize=9, leading=13))
    return styles


def _fmt(value, unit: str = "") -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:,.4f}{unit}" if value < 1 else f"{value:,.2f}{unit}"
    return f"{value:,}{unit}"


def _image_flowable(path: Path, max_width: float, max_height: float):
    from PIL import Image as PILImage

    try:
        with PILImage.open(path) as image:
            width, height = image.size
    except Exception:
        return None
    ratio = min(max_width / width, max_height / height)
    return RLImage(str(path), width=width * ratio, height=height * ratio)


class _NumberedCanvas:
    """Adds a footer to every page without depending on reportlab internals."""

    @staticmethod
    def draw(canvas, doc) -> None:
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#E2E8F0"))
        canvas.line(doc.leftMargin, 14 * mm, A4[0] - doc.rightMargin, 14 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(SLATE)
        canvas.drawString(doc.leftMargin, 10 * mm, "SenseEarth · Satellite Change Intelligence")
        canvas.drawRightString(A4[0] - doc.rightMargin, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()


def build_pdf(analysis: dict, statistics: dict) -> Path:
    target = report_path(analysis["id"], "pdf")
    styles = _styles()
    document = SimpleDocTemplate(
        str(target),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=20 * mm,
        title=f"SenseEarth analysis {analysis.get('title')}",
        author="SenseEarth",
    )
    story = []
    story.append(Paragraph("SenseEarth Change Detection Report", styles["SE_Title"]))
    engine = statistics.get("engine", {})
    story.append(
        Paragraph(
            f"{analysis.get('title', 'Untitled analysis')} · "
            f"generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
            styles["SE_Sub"],
        )
    )

    meta_rows = [
        ["Location", analysis.get("locationName") or "—"],
        [
            "Coordinates",
            f"{analysis.get('latitude'):.5f}, {analysis.get('longitude'):.5f}"
            if analysis.get("latitude") is not None and analysis.get("longitude") is not None
            else "—",
        ],
        ["Dates", f"{analysis.get('dateBefore') or '—'} → {analysis.get('dateAfter') or '—'}"],
        ["Analysis ID", analysis.get("id", "—")],
        ["Status", analysis.get("status", "—")],
        ["Engine", engine.get("label") or analysis.get("engineLabel") or "—"],
        ["Model", engine.get("model") or analysis.get("modelName") or "—"],
        ["Device", engine.get("device") or analysis.get("device") or "—"],
        [
            "Raster size",
            f"{statistics.get('width', '—')} × {statistics.get('height', '—')} px",
        ],
        ["Inference time", f"{engine.get('inferenceMs', analysis.get('inferenceMs', '—'))} ms"],
    ]
    meta_table = Table(meta_rows, colWidths=[38 * mm, 120 * mm])
    meta_table.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, -1), "Helvetica", 8.5),
                ("TEXTCOLOR", (0, 0), (0, -1), SLATE),
                ("TEXTCOLOR", (1, 0), (1, -1), NAVY),
                ("LINEBELOW", (0, 0), (-1, -2), 0.4, colors.HexColor("#E2E8F0")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(meta_table)

    story.append(Paragraph("Change summary", styles["SE_H2"]))
    summary_rows = [
        ["Changed pixels", _fmt(statistics.get("changedPixels"))],
        ["Total pixels", _fmt(statistics.get("pixels"))],
        ["Change ratio", f"{(statistics.get('changeRatio') or 0) * 100:.2f}%"],
        [
            "Changed area",
            _fmt(statistics.get("changedAreaKm2"), " km²")
            if statistics.get("changedAreaKm2") is not None
            else "not georeferenced",
        ],
        ["Analysed area", _fmt(statistics.get("areaKm2"), " km²")],
        ["Area source", statistics.get("areaSource", "none")],
    ]
    summary_table = Table(summary_rows, colWidths=[38 * mm, 120 * mm])
    summary_table.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, -1), "Helvetica", 8.5),
                ("TEXTCOLOR", (0, 0), (0, -1), SLATE),
                ("LINEBELOW", (0, 0), (-1, -2), 0.4, colors.HexColor("#E2E8F0")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(summary_table)

    changed_classes = statistics.get("changedClasses") or []
    if changed_classes:
        story.append(Paragraph("Changed classes (later acquisition)", styles["SE_H2"]))
        rows = [["Class", "Pixels", "Share of scene", "Area (km²)"]]
        for entry in changed_classes:
            rows.append(
                [
                    entry["label"],
                    _fmt(entry["pixels"]),
                    f"{entry['ratio'] * 100:.2f}%",
                    _fmt(entry.get("areaKm2")) if entry.get("areaKm2") is not None else "—",
                ]
            )
        table = Table(rows, colWidths=[62 * mm, 32 * mm, 32 * mm, 32 * mm])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8),
                    ("FONT", (0, 1), (-1, -1), "Helvetica", 8),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(table)

    transitions = statistics.get("transitions") or []
    if transitions:
        story.append(Paragraph("Class transitions (before → after)", styles["SE_H2"]))
        rows = [["From", "To", "Pixels", "Share of change"]]
        for item in transitions[:10]:
            rows.append(
                [
                    item["from"]["label"],
                    item["to"]["label"],
                    _fmt(item["pixels"]),
                    f"{item['ratio'] * 100:.2f}%",
                ]
            )
        table = Table(rows, colWidths=[52 * mm, 52 * mm, 27 * mm, 27 * mm])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8),
                    ("FONT", (0, 1), (-1, -1), "Helvetica", 8),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(table)

    story.append(PageBreak())
    story.append(Paragraph("Imagery and masks", styles["SE_H2"]))
    prediction_dir = analysis_prediction_dir(analysis["id"])
    panels = [
        ("First acquisition", prediction_dir / "preview1.jpg"),
        ("Second acquisition", prediction_dir / "preview2.jpg"),
        ("Binary change mask", resolve_stored_path(analysis.get("mask_path"))),
        ("Semantic change overlay", resolve_stored_path(analysis.get("overlay_path"))),
    ]
    grid_rows = []
    for index in range(0, len(panels), 2):
        row = []
        for label, path in panels[index : index + 2]:
            cell = []
            cell.append(Paragraph(label, styles["SE_Body"]))
            flowable = _image_flowable(path, 78 * mm, 62 * mm) if path else None
            if flowable is not None:
                cell.append(flowable)
            else:
                cell.append(Paragraph("not available", styles["SE_Body"]))
            row.append(cell)
        grid_rows.append(row)
    grid = Table(grid_rows, colWidths=[82 * mm, 82 * mm])
    grid.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 10)]))
    story.append(grid)

    insights = build_insights(analysis, statistics)
    story.append(Spacer(1, 6))
    story.append(Paragraph("Automated observations", styles["SE_H2"]))
    story.append(Paragraph(insights["headline"], styles["SE_Body"]))
    story.append(Paragraph(insights["summary"], styles["SE_Body"]))
    for observation in insights["observations"]:
        story.append(Paragraph(f"• {observation}", styles["SE_Body"]))
    story.append(Paragraph("Caveats", styles["SE_H2"]))
    for caveat in insights["caveats"]:
        story.append(Paragraph(f"• {caveat}", styles["SE_Body"]))

    legend_rows = [["Class", "Colour"]]
    for cls in CLASSES:
        legend_rows.append([cls["label"], f"RGB {cls['rgb']}"])
    legend = Table(legend_rows, colWidths=[70 * mm, 60 * mm])
    legend.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, -1), "Helvetica", 7.5),
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(KeepTogether([Paragraph("Class palette", styles["SE_H2"]), legend]))

    document.build(story, onFirstPage=_NumberedCanvas.draw, onLaterPages=_NumberedCanvas.draw)
    return target


def build_csv(analysis: dict, statistics: dict) -> Path:
    target = report_path(analysis["id"], "csv")
    with target.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["SenseEarth change detection statistics"])
        writer.writerow(["analysis_id", analysis.get("id")])
        writer.writerow(["title", analysis.get("title")])
        writer.writerow(["location", analysis.get("locationName") or ""])
        writer.writerow(["date_before", analysis.get("dateBefore") or ""])
        writer.writerow(["date_after", analysis.get("dateAfter") or ""])
        writer.writerow(["engine", (statistics.get("engine") or {}).get("label", "")])
        writer.writerow(["model", (statistics.get("engine") or {}).get("model", "")])
        writer.writerow([])
        writer.writerow(["metric", "value"])
        writer.writerow(["width_px", statistics.get("width")])
        writer.writerow(["height_px", statistics.get("height")])
        writer.writerow(["total_pixels", statistics.get("pixels")])
        writer.writerow(["changed_pixels", statistics.get("changedPixels")])
        writer.writerow(["change_ratio", statistics.get("changeRatio")])
        writer.writerow(["analysed_area_km2", statistics.get("areaKm2")])
        writer.writerow(["changed_area_km2", statistics.get("changedAreaKm2")])
        writer.writerow(["area_source", statistics.get("areaSource")])
        writer.writerow([])
        writer.writerow(["class_id", "class_key", "class_label", "pixels", "ratio_of_scene", "area_km2"])
        for entry in statistics.get("classes") or []:
            writer.writerow(
                [
                    entry["id"],
                    entry["key"],
                    entry["label"] if "label" in entry else entry.get("key"),
                    entry["pixels"],
                    entry["ratio"],
                    entry.get("areaKm2"),
                ]
            )
        writer.writerow([])
        writer.writerow(["transition_from", "transition_to", "pixels", "share_of_change"])
        for item in statistics.get("transitions") or []:
            writer.writerow(
                [item["from"]["label"], item["to"]["label"], item["pixels"], item["ratio"]]
            )
    return target


def build_bundle(analysis: dict, statistics: dict) -> Path:
    target = report_path(analysis["id"], "zip")
    prediction_dir = analysis_prediction_dir(analysis["id"])
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in (
            "binary_mask.png",
            "semantic_mask.png",
            "semantic_rgb.png",
            "overlay.png",
            "semantic_before.png",
            "unchanged_probability.png",
            "preview1.jpg",
            "preview2.jpg",
        ):
            candidate = prediction_dir / name
            if candidate.exists():
                archive.write(candidate, arcname=f"{analysis['id']}/{name}")
        archive.writestr(
            f"{analysis['id']}/metadata.json",
            json.dumps({**analysis, "statistics": statistics}, indent=2, default=str),
        )
        csv_path = build_csv(analysis, statistics)
        archive.write(csv_path, arcname=f"{analysis['id']}/statistics.csv")
    return target


__all__ = ["build_bundle", "build_csv", "build_pdf", "report_path"]
