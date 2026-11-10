"""End-to-end smoke test against a running SenseEarth API.

Verifies the real workflow with the bundled demo pair: demo login, upload,
worker inference, results, insights and every report format.

    python scripts/smoke_test.py [--api http://127.0.0.1:8000/api]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
DEMO_BEFORE = ROOT / "storage" / "samples" / "before.jpg"
DEMO_AFTER = ROOT / "storage" / "samples" / "after.jpg"


def fail(message: str) -> None:
    print(f"FAIL  {message}")
    sys.exit(1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://127.0.0.1:8000/api")
    parser.add_argument("--timeout", type=float, default=240.0)
    args = parser.parse_args()
    api = args.api.rstrip("/")

    for path in (DEMO_BEFORE, DEMO_AFTER):
        if not path.exists():
            fail(f"missing demo image {path}")

    with httpx.Client(base_url=api, timeout=60.0) as client:
        health = client.get("/health")
        health.raise_for_status()
        body = health.json()
        print(f"health      ok | db={body['database']} | model={body['model']['name']} ({body['model']['device']})")

        login = client.post("/auth/demo")
        login.raise_for_status()
        token = login.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        print(f"auth        demo session · {login.json()['user']['email']}")

        model = client.get("/model/status", headers=headers)
        model.raise_for_status()
        status = model.json()
        if not status.get("available") or not status.get("weightsPresent"):
            fail(f"model weights unavailable: {status}")
        print(f"weights     {status['weightsPath']} · {status['classes'][0]['label']}…{status['classes'][-1]['label']}")

        files = {
            "image1": ("before.jpg", DEMO_BEFORE.read_bytes(), "image/jpeg"),
            "image2": ("after.jpg", DEMO_AFTER.read_bytes(), "image/jpeg"),
        }
        data = {
            "title": "Smoke test · Dubai coastline",
            "locationName": "Dubai, United Arab Emirates",
            "latitude": "25.1",
            "longitude": "55.13",
            "dateBefore": "2024-06-15",
            "dateAfter": "2025-09-20",
            "bbox": json.dumps([54.9, 24.85, 55.5, 25.35]),
            "areaKm2": "3344.02",
        }
        created = client.post("/analyses", files=files, data=data, headers=headers, timeout=120.0)
        if created.status_code != 202:
            fail(f"upload rejected ({created.status_code}): {created.text[:300]}")
        analysis = created.json()
        analysis_id = analysis["id"]
        print(f"queued      {analysis_id} · status={analysis['status']}")

        deadline = time.time() + args.timeout
        last = None
        while time.time() < deadline:
            poll = client.get(f"/analyses/{analysis_id}/status", headers=headers)
            poll.raise_for_status()
            payload = poll.json()
            if payload["stage"] != last:
                last = payload["stage"]
                print(f"  {payload['progress']:>3}%  {payload['stage']}")
            if payload["status"] in {"completed", "failed"}:
                break
            time.sleep(1.5)
        else:
            fail("analysis did not finish before the timeout")

        if payload["status"] != "completed":
            fail(f"analysis failed: {payload.get('error')}")

        results = client.get(f"/analyses/{analysis_id}/results", headers=headers)
        results.raise_for_status()
        stats = results.json()["statistics"]
        print(
            f"completed   changed={stats['changedPixels']} px "
            f"({stats['changeRatio'] * 100:.3f}%) · classes={len(stats['changedClasses'])} · "
            f"transitions={len(stats['transitions'])}"
        )
        if stats["changedPixels"] <= 0:
            fail("model reported zero changed pixels on the demo pair")
        if not stats["classes"] or not stats["engine"].get("semanticAvailable", True):
            fail("semantic classes missing from results")

        insights = client.get(f"/analyses/{analysis_id}/insights", headers=headers)
        insights.raise_for_status()
        print(f"insights    {insights.json()['headline'][:80]}")

        for fmt, prefix in (("pdf", b"%PDF"), ("csv", b"SenseEarth change detection statistics"), ("zip", b"PK")):
            report = client.get(f"/analyses/{analysis_id}/report", params={"format": fmt}, headers=headers)
            report.raise_for_status()
            if not report.content.startswith(prefix):
                fail(f"{fmt} report has an unexpected signature")
            print(f"report      {fmt} · {len(report.content):,} bytes")

        for name in ("mask", "semantic-mask", "semantic-rgb", "overlay"):
            media = client.get(f"/analyses/{analysis_id}/{name}", headers=headers)
            media.raise_for_status()
            if media.headers.get("content-type") != "image/png":
                fail(f"{name} is not served as image/png")
        print("artifacts   mask · semantic mask · semantic rgb · overlay")

        deleted = client.delete(f"/analyses/{analysis_id}", headers=headers)
        if deleted.status_code != 204:
            fail(f"delete returned {deleted.status_code}")
        gone = client.get(f"/analyses/{analysis_id}", headers=headers)
        if gone.status_code != 404:
            fail("deleted analysis is still readable")
        print("cleanup     deleted and verified 404")

    print("\nSMOKE TEST PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
