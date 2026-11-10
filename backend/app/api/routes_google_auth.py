"""Google OAuth 2.0 (authorization-code + PKCE) sign-in.

Nothing here is enabled until ``SENSEEARTH_GOOGLE_CLIENT_ID`` and
``SENSEEARTH_GOOGLE_CLIENT_SECRET`` are set. The client secret never leaves the
server: the browser only ever receives Google's authorize URL.

Flow
----
1. ``GET /api/auth/google/start`` creates a state + PKCE verifier, stores them in
   ``oauth_states`` and returns Google's authorize URL.
2. The browser is redirected to Google and back to
   ``GET /api/auth/google/callback`` (this is the redirect URI registered in the
   Google Cloud console).
3. The callback exchanges the code for tokens, reads the user info, links or
   creates the account and redirects to the frontend ``/auth/callback`` with a
   short-lived SenseEarth session token.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
import sqlite3
import urllib.error
import urllib.parse
import urllib.request

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

from backend.app.api.deps import db_session
from backend.app.core.config import settings
from backend.app.core.security import create_access_token, hash_password
from backend.app.database.store import (
    consume_oauth_state,
    create_google_user,
    create_oauth_state,
    get_user_by_email,
    get_user_by_google_sub,
    link_google_identity,
)

logger = logging.getLogger("senseearth.auth.google")

router = APIRouter(prefix="/auth/google", tags=["auth"])

GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"


def _configured() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def _frontend_redirect(**params: str) -> RedirectResponse:
    target = f"{settings.FRONTEND_URL}/auth/callback?" + urllib.parse.urlencode(params)
    return RedirectResponse(target, status_code=302)


@router.get("/status")
def google_status() -> dict:
    """Lets the login page decide whether to offer Google sign-in."""
    return {
        "enabled": _configured(),
        "redirectUri": settings.GOOGLE_REDIRECT_URI,
        "frontendUrl": settings.FRONTEND_URL,
        "missing": [
            name
            for name, value in (
                ("SENSEEARTH_GOOGLE_CLIENT_ID", settings.GOOGLE_CLIENT_ID),
                ("SENSEEARTH_GOOGLE_CLIENT_SECRET", settings.GOOGLE_CLIENT_SECRET),
            )
            if not value
        ],
    }


@router.get("/start")
def google_start(connection: sqlite3.Connection = Depends(db_session)) -> dict:
    if not _configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "Google sign-in is not configured. Set SENSEEARTH_GOOGLE_CLIENT_ID and "
                "SENSEEARTH_GOOGLE_CLIENT_SECRET on the backend, then restart it."
            ),
        )
    state = secrets.token_urlsafe(32)
    verifier, challenge = _pkce_pair()
    create_oauth_state(
        connection, state=state, code_verifier=verifier, redirect_uri=settings.GOOGLE_REDIRECT_URI
    )
    query = urllib.parse.urlencode(
        {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "access_type": "online",
            "prompt": "select_account",
        }
    )
    return {"authorizeUrl": f"{GOOGLE_AUTH_ENDPOINT}?{query}", "state": state}


def _post_form(url: str, fields: dict[str, str]) -> dict:
    data = urllib.parse.urlencode(fields).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def _get_json(url: str, access_token: str) -> dict:
    request = urllib.request.Request(
        url, headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


@router.get("/callback")
def google_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    connection: sqlite3.Connection = Depends(db_session),
) -> RedirectResponse:
    """Google redirects here. Always ends on the frontend callback page."""
    if error:
        return _frontend_redirect(error=error)
    if not code or not state:
        return _frontend_redirect(error="missing_code")

    stored = consume_oauth_state(connection, state)
    if stored is None:
        return _frontend_redirect(error="invalid_state")

    try:
        tokens = _post_form(
            GOOGLE_TOKEN_ENDPOINT,
            {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "code": code,
                "code_verifier": stored["code_verifier"],
                "grant_type": "authorization_code",
                "redirect_uri": stored["redirect_uri"],
            },
        )
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("Google token exchange failed: %s", exc)
        return _frontend_redirect(error="token_exchange_failed")

    access_token = tokens.get("access_token")
    if not access_token:
        return _frontend_redirect(error="no_access_token")

    try:
        profile = _get_json(GOOGLE_USERINFO_ENDPOINT, access_token)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("Google userinfo request failed: %s", exc)
        return _frontend_redirect(error="userinfo_failed")

    email = str(profile.get("email") or "").strip().lower()
    google_sub = str(profile.get("sub") or "").strip()
    if not email or not google_sub:
        return _frontend_redirect(error="incomplete_profile")
    if profile.get("email_verified") is False:
        return _frontend_redirect(error="email_not_verified")

    display_name = str(profile.get("name") or email.split("@")[0]).strip()
    avatar = profile.get("picture")

    user = get_user_by_google_sub(connection, google_sub)
    if user is None:
        existing = get_user_by_email(connection, email)
        if existing is not None:
            # Same verified email: attach the Google identity to the existing account.
            user = link_google_identity(
                connection, existing["id"], google_sub=google_sub, avatar_url=avatar
            )
        else:
            user = create_google_user(
                connection,
                email=email,
                name=display_name,
                google_sub=google_sub,
                avatar_url=avatar,
                password_hash=hash_password(secrets.token_urlsafe(32)),
            )

    if user is None:
        return _frontend_redirect(error="account_failed")

    token = create_access_token(user["id"])
    return _frontend_redirect(token=token, expiresIn=str(settings.SESSION_TTL_SECONDS))


__all__ = ["router"]
