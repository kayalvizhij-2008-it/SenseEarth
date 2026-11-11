"""Pydantic request/response contracts shared with the TypeScript client."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    # Format is checked by the auth route with a strict regex (``is_valid_email``),
    # which avoids the extra ``email-validator`` dependency.
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    organization: str | None = Field(default=None, max_length=160)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str
    organization: str | None = None
    isDemo: bool = Field(default=False, alias="is_demo")
    createdAt: str | None = Field(default=None, alias="created_at")


class AuthResponse(BaseModel):
    token: str
    user: dict
    expiresIn: int


# --------------------------------------------------------------------------- #
# Analyses
# --------------------------------------------------------------------------- #
AnalysisStatus = Literal["queued", "processing", "completed", "failed"]


class AnalysisOut(BaseModel):
    id: str
    title: str
    locationName: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    bbox: list[float] | None = None
    dateBefore: str | None = None
    dateAfter: str | None = None
    status: str
    progress: int
    stage: str
    error: str | None = None
    engine: str | None = None
    engineLabel: str | None = None
    modelName: str | None = None
    device: str | None = None
    width: int | None = None
    height: int | None = None
    pixels: int | None = None
    changedPixels: int | None = None
    changeRatio: float | None = None
    areaKm2: float | None = None
    regionId: str | None = None
    inferenceMs: int | None = None
    createdAt: str | None = None
    startedAt: str | None = None
    completedAt: str | None = None
    thumbnails: dict[str, str | None] = Field(default_factory=dict)
    artifacts: dict[str, str | None] = Field(default_factory=dict)


class AnalysisStatusOut(BaseModel):
    id: str
    status: str
    progress: int
    stage: str
    error: str | None = None
    completedAt: str | None = None


class AnalysisListOut(BaseModel):
    items: list[AnalysisOut]
    total: int
    page: int
    pageSize: int
    pages: int


class AnalysisResultsOut(BaseModel):
    analysis: AnalysisOut
    statistics: dict[str, Any]
    regions: dict[str, Any] | None = None


class AoiInput(BaseModel):
    """Optional geographic context captured from the map."""

    bbox: list[float] | None = Field(default=None, min_length=4, max_length=4)
    geometry: dict[str, Any] | None = None
    areaKm2: float | None = Field(default=None, ge=0)
    center: list[float] | None = None


# --------------------------------------------------------------------------- #
# Regions
# --------------------------------------------------------------------------- #
class RegionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    geometry: dict[str, Any]
    bbox: list[float] | None = None
    areaKm2: float | None = Field(default=None, ge=0)
    center: list[float] | None = None


class RegionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    geometry: dict[str, Any] | None = None
    bbox: list[float] | None = None
    areaKm2: float | None = Field(default=None, ge=0)
    center: list[float] | None = None
    monitoringStatus: Literal["active", "paused"] | None = None


class RegionOut(BaseModel):
    id: str
    name: str
    description: str | None = None
    geometry: dict[str, Any]
    bbox: list[float] | None = None
    areaKm2: float | None = None
    center: list[float] | None = None
    monitoringStatus: str = "active"
    lastCheckedAt: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None
    analysisCount: int = 0
    latestAnalysis: dict[str, Any] | None = None


# --------------------------------------------------------------------------- #
# Analytics / insights
# --------------------------------------------------------------------------- #
class AnalyticsSummary(BaseModel):
    totalAnalyses: int
    completed: int
    processing: int
    queued: int
    failed: int
    totalChangedPixels: int
    totalAreaKm2: float
    totalChangedAreaKm2: float
    averageChangeRatio: float
    regions: int
    lastCompletedAt: str | None = None


class HistoryPoint(BaseModel):
    date: str
    completed: int
    failed: int
    changedPixels: int


class InsightsOut(BaseModel):
    analysisId: str
    headline: str
    summary: str
    observations: list[str]
    caveats: list[str]
    generatedBy: str
    source: str


__all__ = [
    "AnalysisListOut",
    "AnalysisOut",
    "AnalysisResultsOut",
    "AnalysisStatusOut",
    "AoiInput",
    "AnalyticsSummary",
    "AuthResponse",
    "HistoryPoint",
    "InsightsOut",
    "LoginRequest",
    "RegionCreate",
    "RegionOut",
    "RegionUpdate",
    "RegisterRequest",
    "UserOut",
]
