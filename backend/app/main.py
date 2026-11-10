"""SenseEarth FastAPI application entry point."""

from __future__ import annotations

import logging
import os
import sys
import threading
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Make ``backend.app.*`` and the original research packages importable no matter
# which directory uvicorn was started from.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.api import (  # noqa: E402
    routes_analyses,
    routes_analytics,
    routes_auth,
    routes_google_auth,
    routes_regions,
    routes_system,
)
from backend.app.core.config import settings  # noqa: E402
from backend.app.database.db import init_db  # noqa: E402
from backend.app.services.jobs import reset_interrupted_jobs  # noqa: E402

logging.basicConfig(
    level=os.environ.get("SENSEEARTH_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
)
logger = logging.getLogger("senseearth")

app = FastAPI(
    title="SenseEarth API",
    description=(
        "Satellite change detection built on the original SenseEarth2020 "
        "PSPNet-HRNet research model."
    ),
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(routes_system.router, prefix="/api")
app.include_router(routes_auth.router, prefix="/api")
app.include_router(routes_google_auth.router, prefix="/api")
app.include_router(routes_analyses.router, prefix="/api")
app.include_router(routes_analytics.router, prefix="/api")
app.include_router(routes_regions.router, prefix="/api")


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    location = ".".join(str(part) for part in first.get("loc", ()) if part != "body")
    message = first.get("msg", "Invalid request.")
    detail = f"{location}: {message}" if location else message
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected server error occurred. Check the backend logs."},
    )


def _preload_model() -> None:
    try:
        from backend.app.ml.model_loader import get_model_bundle

        bundle = get_model_bundle()
        logger.info("Model preloaded: %s on %s", bundle.model_name, bundle.device)
    except Exception as exc:  # pragma: no cover - depends on local weights
        logger.warning("Model preload skipped: %s", exc)


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    recovered = reset_interrupted_jobs()
    if recovered:
        logger.info("Marked %d interrupted analyses as failed", recovered)
    if settings.MODEL_WEIGHTS.exists() and os.environ.get("SENSEEARTH_PRELOAD", "1") != "0":
        threading.Thread(target=_preload_model, name="model-preload", daemon=True).start()


@app.get("/")
def root() -> dict:
    return {
        "name": "SenseEarth API",
        "version": settings.APP_VERSION,
        "docs": "/api/docs",
        "health": "/api/health",
    }


@app.get("/api")
def api_root() -> dict:
    return {"name": "SenseEarth API", "version": settings.APP_VERSION, "docs": "/api/docs"}
