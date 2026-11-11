"""End-to-end backend tests.

These run the real application (real SQLite store, real PSPNet-HRNet checkpoint
when present) through FastAPI's TestClient, including a full upload -> queued ->
inference -> results -> export cycle.
"""

from __future__ import annotations

import io
import json
import os
import sys
import time
from pathlib import Path

import pytest

os.environ.setdefault("SENSEEARTH_PRELOAD", "0")
os.environ.setdefault("SENSEEARTH_STORAGE", str(Path(__file__).resolve().parents[2] / "storage"))

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from backend.app.main import app  # noqa: E402

SAMPLE_DIR = PROJECT_ROOT / "storage" / "samples"


def _png_bytes(color, size=(96, 96)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def token(client: TestClient) -> str:
    response = client.post("/api/auth/demo")
    assert response.status_code == 200, response.text
    return response.json()["token"]


@pytest.fixture(scope="session")
def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"


def test_auth_required(client: TestClient) -> None:
    assert client.get("/api/analyses").status_code == 401
    assert client.get("/api/model/status").status_code == 401


def test_register_login_flow(client: TestClient) -> None:
    email = f"analyst{int(time.time() * 1000)}@example.com"
    created = client.post(
        "/api/auth/register",
        json={"name": "Test Analyst", "email": email, "password": "supersecret1"},
    )
    assert created.status_code == 201, created.text
    assert "token" in created.json()

    duplicate = client.post(
        "/api/auth/register",
        json={"name": "Test Analyst", "email": email, "password": "supersecret1"},
    )
    assert duplicate.status_code == 409

    bad = client.post("/api/auth/login", json={"email": email, "password": "wrong-password"})
    assert bad.status_code == 401

    good = client.post("/api/auth/login", json={"email": email, "password": "supersecret1"})
    assert good.status_code == 200
    assert good.json()["user"]["email"] == email


def test_model_status(client: TestClient, auth: dict) -> None:
    response = client.get("/api/model/status", headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "pspnet-hrnet_w18"
    assert len(body["classes"]) == 7
    assert [c["hex"] for c in body["classes"]][:3] == ["#FFFFFF", "#0000FF", "#808080"]
    if body["weightsPresent"]:
        assert body["available"] is True


def test_upload_validation_rejects_non_image(client: TestClient, auth: dict) -> None:
    response = client.post(
        "/api/analyses",
        headers=auth,
        data={"title": "Bad upload"},
        files={
            "image1": ("a.png", b"not an image", "image/png"),
            "image2": ("b.png", b"also not an image", "image/png"),
        },
    )
    assert response.status_code == 422
    assert "image" in response.json()["detail"].lower()


def test_upload_validation_rejects_mismatched_aspect(client: TestClient, auth: dict) -> None:
    response = client.post(
        "/api/analyses",
        headers=auth,
        data={"title": "Aspect mismatch"},
        files={
            "image1": ("a.png", _png_bytes((10, 20, 30), (128, 128)), "image/png"),
            "image2": ("b.png", _png_bytes((10, 20, 30), (256, 64)), "image/png"),
        },
    )
    assert response.status_code == 422
    assert "aspect" in response.json()["detail"].lower()


def test_create_requires_auth(client: TestClient) -> None:
    response = client.post("/api/analyses", data={"title": "Unauthorised"})
    assert response.status_code == 401


def test_full_analysis_workflow(client: TestClient, auth: dict) -> None:
    before = SAMPLE_DIR / "before.jpg"
    after = SAMPLE_DIR / "after.jpg"
    if not before.exists() or not after.exists():
        pytest.skip("Sample satellite pair not available in storage/samples")

    response = client.post(
        "/api/analyses",
        headers=auth,
        data={
            "title": "Palm Jumeirah temporal check",
            "locationName": "Palm Jumeirah, Dubai",
            "latitude": "25.1124",
            "longitude": "55.1390",
            "dateBefore": "2024-06-15",
            "dateAfter": "2025-09-20",
            "bbox": json.dumps([54.9, 24.85, 55.5, 25.35]),
            "areaKm2": "3344.02",
        },
        files={
            "image1": ("before.jpg", before.read_bytes(), "image/jpeg"),
            "image2": ("after.jpg", after.read_bytes(), "image/jpeg"),
        },
    )
    assert response.status_code == 202, response.text
    analysis = response.json()
    analysis_id = analysis["id"]
    assert analysis["status"] in ("queued", "processing")

    deadline = time.time() + 240
    status_body = {}
    while time.time() < deadline:
        status_response = client.get(f"/api/analyses/{analysis_id}/status", headers=auth)
        assert status_response.status_code == 200
        status_body = status_response.json()
        if status_body["status"] in ("completed", "failed"):
            break
        time.sleep(1.0)

    assert status_body.get("status") == "completed", status_body

    results = client.get(f"/api/analyses/{analysis_id}/results", headers=auth)
    assert results.status_code == 200
    body = results.json()
    stats = body["statistics"]
    assert stats["width"] > 0 and stats["height"] > 0
    assert stats["pixels"] == stats["width"] * stats["height"]
    assert stats["changedPixels"] <= stats["pixels"]
    assert stats["engine"]["key"] in ("senseearth_pspnet_hrnet", "spectral_baseline")
    if stats["engine"]["key"] == "senseearth_pspnet_hrnet":
        assert stats["engine"]["model"] == "pspnet-hrnet_w18"
        assert stats["engine"]["weightsFingerprint"]

    mask = client.get(f"/api/analyses/{analysis_id}/mask", headers=auth)
    assert mask.status_code == 200
    assert mask.headers["content-type"] == "image/png"
    with Image.open(io.BytesIO(mask.content)) as image:
        assert image.size == (stats["width"], stats["height"])
        assert image.mode == "L"

    semantic = client.get(f"/api/analyses/{analysis_id}/semantic-mask", headers=auth)
    assert semantic.status_code == 200
    with Image.open(io.BytesIO(semantic.content)) as image:
        assert image.mode == "P"

    preview = client.get(f"/api/analyses/{analysis_id}/images/1", headers=auth)
    assert preview.status_code == 200

    for fmt, expected in (("pdf", "application/pdf"), ("csv", "text/csv"), ("zip", "application/zip")):
        report = client.get(f"/api/analyses/{analysis_id}/report?format={fmt}", headers=auth)
        assert report.status_code == 200, report.text
        assert report.headers["content-type"].startswith(expected)
        assert len(report.content) > 200

    insights = client.get(f"/api/analyses/{analysis_id}/insights", headers=auth)
    assert insights.status_code == 200
    assert insights.json()["generatedBy"] == "deterministic"

    listing = client.get(f"/api/analyses?q=palm", headers=auth)
    assert listing.status_code == 200
    assert listing.json()["total"] >= 1

    summary = client.get("/api/analytics/summary", headers=auth)
    assert summary.status_code == 200
    assert summary.json()["completed"] >= 1

    distribution = client.get("/api/analytics/class-distribution", headers=auth)
    assert distribution.status_code == 200
    assert len(distribution.json()["classes"]) == 7

    history = client.get("/api/analytics/history?days=14", headers=auth)
    assert history.status_code == 200
    assert len(history.json()["points"]) == 14


def test_region_crud(client: TestClient, auth: dict) -> None:
    geometry = {
        "type": "Polygon",
        "coordinates": [[[55.0, 25.0], [55.2, 25.0], [55.2, 25.2], [55.0, 25.2], [55.0, 25.0]]],
    }
    created = client.post(
        "/api/regions",
        headers=auth,
        json={"name": "Test AOI", "geometry": geometry, "areaKm2": 403.0},
    )
    assert created.status_code == 201, created.text
    region_id = created.json()["id"]
    assert created.json()["bbox"] is not None

    listing = client.get("/api/regions", headers=auth)
    assert listing.status_code == 200
    saved = next(item for item in listing.json()["items"] if item["id"] == region_id)
    assert saved["monitoringStatus"] == "active"

    updated = client.patch(
        f"/api/regions/{region_id}",
        headers=auth,
        json={"name": "Renamed AOI", "monitoringStatus": "paused"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Renamed AOI"
    assert updated.json()["monitoringStatus"] == "paused"

    rejected = client.post(
        "/api/regions",
        headers=auth,
        json={"name": "Bad", "geometry": {"type": "Point", "coordinates": [1, 2]}},
    )
    assert rejected.status_code == 422

    deleted = client.delete(f"/api/regions/{region_id}", headers=auth)
    assert deleted.status_code == 204


def test_unknown_analysis_is_404(client: TestClient, auth: dict) -> None:
    assert client.get("/api/analyses/doesnotexist", headers=auth).status_code == 404
    assert client.get("/api/analyses/doesnotexist/mask", headers=auth).status_code == 404


def test_storage_endpoint(client: TestClient, auth: dict) -> None:
    response = client.get("/api/system/storage", headers=auth)
    assert response.status_code == 200
    assert response.json()["totalBytes"] >= 0
