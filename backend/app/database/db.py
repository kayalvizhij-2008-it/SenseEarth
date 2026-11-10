"""SQLite connection management and schema for SenseEarth.

The project deliberately uses the standard-library ``sqlite3`` driver instead of
an ORM: it has zero native dependencies, which keeps the backend installable on
locked-down Windows machines where unsigned compiled extensions are blocked.

Every timestamp is stored as an ISO-8601 UTC string so text comparison ordering
matches chronological ordering, and swapping in PostgreSQL later only requires a
different driver plus the same SQL.
"""

from __future__ import annotations

import logging
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from backend.app.core.config import settings

logger = logging.getLogger("senseearth.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    organization  TEXT,
    is_demo       INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_regions (
    id          TEXT PRIMARY KEY,
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    geometry    TEXT NOT NULL,
    bbox        TEXT,
    area_km2    REAL,
    center_lat  REAL,
    center_lon  REAL,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_states (
    state         TEXT PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    redirect_uri  TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analyses (
    id                  TEXT PRIMARY KEY,
    owner_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    location_name       TEXT,
    latitude            REAL,
    longitude           REAL,
    bbox                TEXT,
    aoi_geometry        TEXT,
    region_id           TEXT REFERENCES saved_regions(id) ON DELETE SET NULL,
    date_before         TEXT,
    date_after          TEXT,
    status              TEXT NOT NULL DEFAULT 'queued',
    progress            INTEGER NOT NULL DEFAULT 0,
    stage               TEXT NOT NULL DEFAULT 'queued',
    error               TEXT,
    engine              TEXT,
    engine_label        TEXT,
    model_name          TEXT,
    device              TEXT,
    weights_fingerprint TEXT,
    width               INTEGER,
    height              INTEGER,
    pixels              INTEGER,
    changed_pixels      INTEGER,
    change_ratio        REAL,
    inference_ms        INTEGER,
    area_km2            REAL,
    stats               TEXT,
    image1_path         TEXT,
    image2_path         TEXT,
    mask_path           TEXT,
    semantic_path       TEXT,
    overlay_path        TEXT,
    created_at          TEXT NOT NULL,
    started_at          TEXT,
    completed_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_analyses_owner   ON analyses(owner_id);
CREATE INDEX IF NOT EXISTS idx_analyses_status  ON analyses(status);
CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at);
CREATE INDEX IF NOT EXISTS idx_analyses_region  ON analyses(region_id);
CREATE INDEX IF NOT EXISTS idx_regions_owner    ON saved_regions(owner_id);
"""

DEMO_EMAIL = "demo@senseearth.app"
DEMO_PASSWORD = "senseearth"


def _database_path() -> Path | None:
    url = settings.DATABASE_URL
    if url.startswith("sqlite:///"):
        return Path(url[len("sqlite:///") :])
    return None


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    path = _database_path()
    if path is None:
        raise RuntimeError(
            "Only SQLite is configured in this build. Set DATABASE_URL to a "
            "sqlite:///... path (see docs/BACKEND_INTEGRATION.md for PostgreSQL notes)."
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(path), timeout=30.0, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=15000")
        yield connection
    finally:
        connection.close()


def _migrate_user_columns(connection: sqlite3.Connection) -> None:
    """Older databases predate Google sign-in; add the columns in place."""
    existing = {row["name"] for row in connection.execute("PRAGMA table_info(users)").fetchall()}
    if "google_sub" not in existing:
        connection.execute("ALTER TABLE users ADD COLUMN google_sub TEXT")
    if "avatar_url" not in existing:
        connection.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT")
    if "auth_provider" not in existing:
        connection.execute("ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password'")


def init_db() -> None:
    with connect() as connection:
        connection.executescript(SCHEMA)
        _migrate_user_columns(connection)
        connection.commit()
    seed_demo_user()
    logger.info("Database ready at %s", _database_path())


def seed_demo_user() -> None:
    from backend.app.core.security import hash_password
    from backend.app.database.store import create_user, get_user_by_email, now_iso, new_id

    with connect() as connection:
        if get_user_by_email(connection, DEMO_EMAIL) is not None:
            return
        create_user(
            connection,
            {
                "id": new_id(),
                "email": DEMO_EMAIL,
                "name": "Demo Analyst",
                "organization": "SenseEarth Demo Workspace",
                "password_hash": hash_password(DEMO_PASSWORD),
                "is_demo": 1,
                "created_at": now_iso(),
            },
        )
        logger.info("Seeded demo account %s", DEMO_EMAIL)


__all__ = ["connect", "init_db", "seed_demo_user", "DEMO_EMAIL", "DEMO_PASSWORD", "SCHEMA"]
