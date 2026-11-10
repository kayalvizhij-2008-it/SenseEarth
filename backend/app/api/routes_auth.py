"""Registration, login and profile endpoints."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.api.deps import current_user, db_session
from backend.app.core.config import settings
from backend.app.core.security import (
    create_access_token,
    hash_password,
    is_valid_email,
    normalize_email,
    verify_password,
)
from backend.app.database.db import DEMO_EMAIL, DEMO_PASSWORD
from backend.app.database.store import create_user, get_user_by_email, new_id, now_iso
from backend.app.schemas.schemas import LoginRequest, RegisterRequest
from backend.app.services.serializers import user_to_dict

router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_payload(user: dict) -> dict:
    return {
        "token": create_access_token(user["id"]),
        "user": user_to_dict(user),
        "expiresIn": settings.SESSION_TTL_SECONDS,
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, connection: sqlite3.Connection = Depends(db_session)) -> dict:
    email = normalize_email(payload.email)
    if not is_valid_email(email):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    if get_user_by_email(connection, email) is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = create_user(
        connection,
        {
            "id": new_id(),
            "email": email,
            "name": payload.name.strip(),
            "organization": (payload.organization or "").strip() or None,
            "password_hash": hash_password(payload.password),
            "is_demo": 0,
            "created_at": now_iso(),
        },
    )
    return _auth_payload(user)


@router.post("/login")
def login(payload: LoginRequest, connection: sqlite3.Connection = Depends(db_session)) -> dict:
    user = get_user_by_email(connection, normalize_email(payload.email))
    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    return _auth_payload(user)


@router.post("/demo")
def demo_login(connection: sqlite3.Connection = Depends(db_session)) -> dict:
    """Sign in to the seeded demo workspace (clearly marked as demo in the UI)."""
    user = get_user_by_email(connection, DEMO_EMAIL)
    if user is None or not verify_password(DEMO_PASSWORD, user["password_hash"]):
        raise HTTPException(status_code=503, detail="Demo workspace is not available.")
    return _auth_payload(user)


@router.get("/me")
def me(user: dict = Depends(current_user)) -> dict:
    return user_to_dict(user)


@router.patch("/me")
def update_me(
    payload: dict,
    connection: sqlite3.Connection = Depends(db_session),
    user: dict = Depends(current_user),
) -> dict:
    """Update display name / organisation. Email and password are immutable here."""
    name = (payload.get("name") or "").strip()
    organization = payload.get("organization")
    if name and len(name) > 120:
        raise HTTPException(status_code=422, detail="Name is too long.")
    connection.execute(
        "UPDATE users SET name = ?, organization = ? WHERE id = ?",
        (name or user["name"], (organization or "").strip() or None, user["id"]),
    )
    connection.commit()
    from backend.app.database.store import get_user

    return user_to_dict(get_user(connection, user["id"]))


@router.post("/password")
def change_password(
    payload: dict,
    connection: sqlite3.Connection = Depends(db_session),
    user: dict = Depends(current_user),
) -> dict:
    current = str(payload.get("currentPassword") or "")
    new = str(payload.get("newPassword") or "")
    if len(new) < 8:
        raise HTTPException(status_code=422, detail="The new password must be at least 8 characters.")
    if not verify_password(current, user["password_hash"]):
        raise HTTPException(status_code=403, detail="Current password is incorrect.")
    connection.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(new), user["id"])
    )
    connection.commit()
    return {"updated": True}


__all__ = ["router"]
