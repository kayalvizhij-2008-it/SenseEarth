"""Data access helpers on top of the sqlite3 connection.

Rows are returned as plain dicts so route handlers and serialisers stay free of
driver-specific types. All SQL is parameterised.
"""

from __future__ import annotations

import datetime as dt
import sqlite3
import uuid
from typing import Any, Iterable, Mapping

ANALYSIS_COLUMNS = (
    "id, owner_id, title, location_name, latitude, longitude, bbox, aoi_geometry, region_id, "
    "date_before, date_after, status, progress, stage, error, engine, engine_label, model_name, "
    "device, weights_fingerprint, width, height, pixels, changed_pixels, change_ratio, "
    "inference_ms, area_km2, stats, image1_path, image2_path, mask_path, semantic_path, "
    "overlay_path, created_at, started_at, completed_at"
)

REGION_COLUMNS = (
    "id, owner_id, name, description, geometry, bbox, area_km2, center_lat, center_lon, created_at"
)

USER_COLUMNS = (
    "id, email, name, organization, is_demo, created_at, password_hash, "
    "google_sub, avatar_url, auth_provider"
)

UPDATABLE_ANALYSIS_FIELDS = {
    "title",
    "location_name",
    "latitude",
    "longitude",
    "bbox",
    "aoi_geometry",
    "region_id",
    "date_before",
    "date_after",
    "status",
    "progress",
    "stage",
    "error",
    "engine",
    "engine_label",
    "model_name",
    "device",
    "weights_fingerprint",
    "width",
    "height",
    "pixels",
    "changed_pixels",
    "change_ratio",
    "inference_ms",
    "area_km2",
    "stats",
    "image1_path",
    "image2_path",
    "mask_path",
    "semantic_path",
    "overlay_path",
    "started_at",
    "completed_at",
}


def new_id() -> str:
    return uuid.uuid4().hex


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _row(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #
def create_user(connection: sqlite3.Connection, data: Mapping[str, Any]) -> dict:
    connection.execute(
        "INSERT INTO users (id, email, name, password_hash, organization, is_demo, created_at) "
        "VALUES (:id, :email, :name, :password_hash, :organization, :is_demo, :created_at)",
        {
            "id": data["id"],
            "email": data["email"],
            "name": data["name"],
            "password_hash": data["password_hash"],
            "organization": data.get("organization"),
            "is_demo": int(data.get("is_demo", 0)),
            "created_at": data.get("created_at") or now_iso(),
        },
    )
    connection.commit()
    return get_user(connection, data["id"])  # type: ignore[return-value]


def get_user(connection: sqlite3.Connection, user_id: str) -> dict | None:
    cursor = connection.execute(f"SELECT {USER_COLUMNS} FROM users WHERE id = ?", (user_id,))
    return _row(cursor.fetchone())


def get_user_by_google_sub(connection: sqlite3.Connection, google_sub: str) -> dict | None:
    cursor = connection.execute(
        f"SELECT {USER_COLUMNS} FROM users WHERE google_sub = ?", (google_sub,)
    )
    return _row(cursor.fetchone())


def create_google_user(
    connection: sqlite3.Connection,
    *,
    email: str,
    name: str,
    google_sub: str,
    avatar_url: str | None,
    password_hash: str,
) -> dict:
    """Create a password-less account backed by a Google identity.

    ``password_hash`` receives a random, unusable value so the NOT NULL
    constraint stays satisfied and password login can never match.
    """
    user_id = new_id()
    connection.execute(
        "INSERT INTO users (id, email, name, organization, password_hash, is_demo, created_at, "
        "google_sub, avatar_url, auth_provider) VALUES (?, ?, ?, NULL, ?, 0, ?, ?, ?, 'google')",
        (user_id, email, name, password_hash, now_iso(), google_sub, avatar_url),
    )
    connection.commit()
    return get_user(connection, user_id)  # type: ignore[return-value]


def link_google_identity(
    connection: sqlite3.Connection,
    user_id: str,
    *,
    google_sub: str,
    avatar_url: str | None,
) -> dict:
    connection.execute(
        "UPDATE users SET google_sub = ?, avatar_url = COALESCE(?, avatar_url), auth_provider = 'google' "
        "WHERE id = ?",
        (google_sub, avatar_url, user_id),
    )
    connection.commit()
    return get_user(connection, user_id)  # type: ignore[return-value]


def create_oauth_state(
    connection: sqlite3.Connection, *, state: str, code_verifier: str, redirect_uri: str
) -> None:
    # One kept state per browser tab; prune anything older than ten minutes.
    connection.execute(
        "DELETE FROM oauth_states WHERE created_at < ?",
        ((dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=10)).isoformat(),),
    )
    connection.execute(
        "INSERT INTO oauth_states (state, code_verifier, redirect_uri, created_at) VALUES (?, ?, ?, ?)",
        (state, code_verifier, redirect_uri, now_iso()),
    )
    connection.commit()


def consume_oauth_state(connection: sqlite3.Connection, state: str) -> dict | None:
    cursor = connection.execute(
        "SELECT state, code_verifier, redirect_uri, created_at FROM oauth_states WHERE state = ?",
        (state,),
    )
    row = _row(cursor.fetchone())
    connection.execute("DELETE FROM oauth_states WHERE state = ?", (state,))
    connection.commit()
    return row


def get_user_by_email(connection: sqlite3.Connection, email: str) -> dict | None:
    cursor = connection.execute(
        f"SELECT {USER_COLUMNS} FROM users WHERE lower(email) = ?", (email.strip().lower(),)
    )
    return _row(cursor.fetchone())


# --------------------------------------------------------------------------- #
# Analyses
# --------------------------------------------------------------------------- #
def insert_analysis(connection: sqlite3.Connection, data: Mapping[str, Any]) -> dict:
    payload = {field: data.get(field) for field in UPDATABLE_ANALYSIS_FIELDS}
    payload["id"] = data["id"]
    payload["owner_id"] = data["owner_id"]
    payload["created_at"] = data.get("created_at") or now_iso()
    payload.setdefault("status", "queued")
    payload.setdefault("progress", 0)
    payload.setdefault("stage", "queued")
    columns = ", ".join(payload.keys())
    placeholders = ", ".join(f":{key}" for key in payload)
    connection.execute(f"INSERT INTO analyses ({columns}) VALUES ({placeholders})", payload)
    connection.commit()
    return get_analysis(connection, data["id"])  # type: ignore[return-value]


def get_analysis(connection: sqlite3.Connection, analysis_id: str) -> dict | None:
    cursor = connection.execute(
        f"SELECT {ANALYSIS_COLUMNS} FROM analyses WHERE id = ?", (analysis_id,)
    )
    return _row(cursor.fetchone())


def update_analysis(connection: sqlite3.Connection, analysis_id: str, **fields: Any) -> None:
    filtered = {key: value for key, value in fields.items() if key in UPDATABLE_ANALYSIS_FIELDS}
    if not filtered:
        return
    assignments = ", ".join(f"{key} = :{key}" for key in filtered)
    filtered["analysis_id"] = analysis_id
    connection.execute(f"UPDATE analyses SET {assignments} WHERE id = :analysis_id", filtered)
    connection.commit()


def delete_analysis(connection: sqlite3.Connection, analysis_id: str) -> None:
    connection.execute("DELETE FROM analyses WHERE id = ?", (analysis_id,))
    connection.commit()


def _filter_sql(
    owner_id: str,
    q: str | None,
    status: str | None,
    region_id: str | None,
    date_from: str | None,
    date_to: str | None,
) -> tuple[str, list[Any]]:
    clauses = ["owner_id = ?"]
    params: list[Any] = [owner_id]
    if q:
        clauses.append("(lower(title) LIKE ? OR lower(coalesce(location_name, '')) LIKE ?)")
        pattern = f"%{q.strip().lower()}%"
        params.extend([pattern, pattern])
    if status and status != "all":
        clauses.append("status = ?")
        params.append(status)
    if region_id:
        clauses.append("region_id = ?")
        params.append(region_id)
    if date_from:
        clauses.append("created_at >= ?")
        params.append(f"{date_from}T00:00:00+00:00")
    if date_to:
        clauses.append("created_at <= ?")
        params.append(f"{date_to}T23:59:59.999999+00:00")
    return " AND ".join(clauses), params


def list_analyses(
    connection: sqlite3.Connection,
    owner_id: str,
    q: str | None = None,
    status: str | None = None,
    region_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    sort: str = "newest",
    page: int = 1,
    page_size: int = 12,
) -> tuple[list[dict], int]:
    where, params = _filter_sql(owner_id, q, status, region_id, date_from, date_to)
    order = {
        "newest": "created_at DESC",
        "oldest": "created_at ASC",
        "largest": "changed_pixels IS NULL, changed_pixels DESC",
        "ratio": "change_ratio IS NULL, change_ratio DESC",
    }.get(sort, "created_at DESC")
    total = connection.execute(
        f"SELECT COUNT(*) AS count FROM analyses WHERE {where}", params
    ).fetchone()["count"]
    rows = connection.execute(
        f"SELECT {ANALYSIS_COLUMNS} FROM analyses WHERE {where} "
        f"ORDER BY {order} LIMIT ? OFFSET ?",
        [*params, page_size, max(0, (page - 1) * page_size)],
    ).fetchall()
    return [dict(row) for row in rows], int(total)


def status_counts(connection: sqlite3.Connection, owner_id: str) -> dict[str, int]:
    rows = connection.execute(
        "SELECT status, COUNT(*) AS count FROM analyses WHERE owner_id = ? GROUP BY status",
        (owner_id,),
    ).fetchall()
    return {row["status"]: int(row["count"]) for row in rows}


def completed_analyses(connection: sqlite3.Connection, owner_id: str) -> list[dict]:
    rows = connection.execute(
        f"SELECT {ANALYSIS_COLUMNS} FROM analyses WHERE owner_id = ? AND status = 'completed'",
        (owner_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def analyses_created_since(connection: sqlite3.Connection, owner_id: str, since_iso: str) -> list[dict]:
    rows = connection.execute(
        f"SELECT {ANALYSIS_COLUMNS} FROM analyses WHERE owner_id = ? AND created_at >= ?",
        (owner_id, since_iso),
    ).fetchall()
    return [dict(row) for row in rows]


def recent_analyses(connection: sqlite3.Connection, owner_id: str, limit: int) -> list[dict]:
    rows = connection.execute(
        f"SELECT {ANALYSIS_COLUMNS} FROM analyses WHERE owner_id = ? "
        "ORDER BY created_at DESC LIMIT ?",
        (owner_id, limit),
    ).fetchall()
    return [dict(row) for row in rows]


def analyses_for_region(
    connection: sqlite3.Connection, owner_id: str, region_id: str, limit: int = 20
) -> list[dict]:
    rows = connection.execute(
        f"SELECT {ANALYSIS_COLUMNS} FROM analyses WHERE owner_id = ? AND region_id = ? "
        "ORDER BY created_at DESC LIMIT ?",
        (owner_id, region_id, limit),
    ).fetchall()
    return [dict(row) for row in rows]


def mark_interrupted(connection: sqlite3.Connection, message: str) -> int:
    cursor = connection.execute(
        "UPDATE analyses SET status = 'failed', stage = 'failed', error = ?, completed_at = ? "
        "WHERE status IN ('queued', 'processing')",
        (message, now_iso()),
    )
    connection.commit()
    return cursor.rowcount or 0


# --------------------------------------------------------------------------- #
# Saved regions
# --------------------------------------------------------------------------- #
def create_region(connection: sqlite3.Connection, data: Mapping[str, Any]) -> dict:
    connection.execute(
        "INSERT INTO saved_regions (id, owner_id, name, description, geometry, bbox, area_km2, "
        "center_lat, center_lon, created_at) "
        "VALUES (:id, :owner_id, :name, :description, :geometry, :bbox, :area_km2, :center_lat, "
        ":center_lon, :created_at)",
        {
            "id": data["id"],
            "owner_id": data["owner_id"],
            "name": data["name"],
            "description": data.get("description"),
            "geometry": data["geometry"],
            "bbox": data.get("bbox"),
            "area_km2": data.get("area_km2"),
            "center_lat": data.get("center_lat"),
            "center_lon": data.get("center_lon"),
            "created_at": data.get("created_at") or now_iso(),
        },
    )
    connection.commit()
    return get_region(connection, data["id"])  # type: ignore[return-value]


def get_region(connection: sqlite3.Connection, region_id: str) -> dict | None:
    cursor = connection.execute(
        f"SELECT {REGION_COLUMNS} FROM saved_regions WHERE id = ?", (region_id,)
    )
    return _row(cursor.fetchone())


def list_regions(connection: sqlite3.Connection, owner_id: str) -> list[dict]:
    rows = connection.execute(
        f"SELECT {REGION_COLUMNS} FROM saved_regions WHERE owner_id = ? ORDER BY created_at DESC",
        (owner_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def delete_region(connection: sqlite3.Connection, region_id: str) -> None:
    connection.execute("UPDATE analyses SET region_id = NULL WHERE region_id = ?", (region_id,))
    connection.execute("DELETE FROM saved_regions WHERE id = ?", (region_id,))
    connection.commit()


def count_regions(connection: sqlite3.Connection, owner_id: str) -> int:
    row = connection.execute(
        "SELECT COUNT(*) AS count FROM saved_regions WHERE owner_id = ?", (owner_id,)
    ).fetchone()
    return int(row["count"])


def count_analyses(
    connection: sqlite3.Connection, owner_id: str, status: str | None = None
) -> int:
    if status:
        row = connection.execute(
            "SELECT COUNT(*) AS count FROM analyses WHERE owner_id = ? AND status = ?",
            (owner_id, status),
        ).fetchone()
    else:
        row = connection.execute(
            "SELECT COUNT(*) AS count FROM analyses WHERE owner_id = ?", (owner_id,)
        ).fetchone()
    return int(row["count"])


def count_region_analyses(connection: sqlite3.Connection, owner_id: str, region_id: str) -> int:
    row = connection.execute(
        "SELECT COUNT(*) AS count FROM analyses WHERE owner_id = ? AND region_id = ?",
        (owner_id, region_id),
    ).fetchone()
    return int(row["count"])


def executemany_placeholder() -> Iterable[str]:  # pragma: no cover - unused helper
    return ()


__all__ = [
    "ANALYSIS_COLUMNS",
    "REGION_COLUMNS",
    "USER_COLUMNS",
    "analyses_created_since",
    "analyses_for_region",
    "completed_analyses",
    "count_analyses",
    "count_region_analyses",
    "count_regions",
    "create_region",
    "create_user",
    "delete_analysis",
    "delete_region",
    "get_analysis",
    "get_region",
    "get_user",
    "get_user_by_email",
    "insert_analysis",
    "list_analyses",
    "list_regions",
    "mark_interrupted",
    "new_id",
    "now_iso",
    "recent_analyses",
    "status_counts",
    "update_analysis",
]
