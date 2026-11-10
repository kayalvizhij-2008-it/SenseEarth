"""Shared FastAPI dependencies: database connections, auth, ownership checks."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator

from fastapi import Depends, HTTPException, Query, Request, status

from backend.app.core.security import decode_access_token
from backend.app.database.db import connect
from backend.app.database.store import get_analysis, get_user


def db_session() -> Iterator[sqlite3.Connection]:
    with connect() as connection:
        yield connection


def _token_from_request(request: Request, token: str | None) -> str | None:
    if token:
        return token
    header = request.headers.get("authorization") or ""
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def _resolve_user(request: Request, token: str | None, connection: sqlite3.Connection) -> dict | None:
    raw = _token_from_request(request, token)
    if not raw:
        return None
    payload = decode_access_token(raw)
    if not payload:
        return None
    return get_user(connection, str(payload.get("sub")))


def current_user(
    request: Request,
    token: str | None = Query(default=None, include_in_schema=False),
    connection: sqlite3.Connection = Depends(db_session),
) -> dict:
    """Authenticate via ``Authorization: Bearer`` or a ``?token=`` media fallback."""
    raw = _token_from_request(request, token)
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = _resolve_user(request, token, connection)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def optional_user(
    request: Request,
    token: str | None = Query(default=None, include_in_schema=False),
    connection: sqlite3.Connection = Depends(db_session),
) -> dict | None:
    return _resolve_user(request, token, connection)


def owned_analysis(
    analysis_id: str,
    connection: sqlite3.Connection = Depends(db_session),
    user: dict = Depends(current_user),
) -> dict:
    analysis = get_analysis(connection, analysis_id)
    if analysis is None or analysis["owner_id"] != user["id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found.")
    return analysis


__all__ = ["current_user", "db_session", "owned_analysis", "optional_user"]
