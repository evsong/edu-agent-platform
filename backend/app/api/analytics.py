"""Analytics API — student profiles, BKT updates, early warnings, class reports."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.analytics import AnalyticsService
from app.services.llm import LLMClient

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# Module-level singleton; initialised lazily on first request.
_analytics_service: AnalyticsService | None = None


def _get_service() -> AnalyticsService:
    global _analytics_service
    if _analytics_service is None:
        _analytics_service = AnalyticsService(llm=LLMClient())
    return _analytics_service


# ── Request models ─────────────────────────────────────────────────


class BKTUpdateRequest(BaseModel):
    user_id: uuid.UUID
    course_id: uuid.UUID
    knowledge_point_id: uuid.UUID
    is_correct: bool


# ── Endpoints ──────────────────────────────────────────────────────


@router.get("/overview")
async def get_overview(db: AsyncSession = Depends(get_db)):
    """Return aggregated dashboard stats across all courses."""
    import json
    from app.services.cache import cache_get, cache_set

    try:
        cached = await cache_get("analytics:overview")
        if cached:
            return json.loads(cached)
    except Exception:
        pass  # Redis down → skip cache

    svc = _get_service()
    result = await svc.get_overview(db)

    try:
        await cache_set("analytics:overview", json.dumps(result, default=str), ttl=60)
    except Exception:
        pass

    return result


@router.get("/mastery/{course_id}")
async def get_mastery(course_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Return average mastery per knowledge point for a course."""
    import json
    from app.services.cache import cache_get, cache_set

    cache_key = f"analytics:mastery:{course_id}"
    try:
        cached = await cache_get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    svc = _get_service()
    result = await svc.get_mastery_aggregation(db, course_id)

    try:
        await cache_set(cache_key, json.dumps(result, default=str), ttl=60)
    except Exception:
        pass

    return result


@router.get("/profile/{user_id}")
async def get_profile(
    user_id: uuid.UUID,
    course_id: uuid.UUID = Query(..., description="Course to retrieve profile for"),
    db: AsyncSession = Depends(get_db),
):
    """Return a student's BKT profile for a specific course."""
    svc = _get_service()
    profile = await svc.get_profile(db, user_id, course_id)
    return {
        "user_id": str(profile.user_id),
        "course_id": str(profile.course_id),
        "bkt_states": profile.bkt_states,
        "overall_mastery": profile.overall_mastery,
        "risk_level": profile.risk_level,
        "last_active": profile.last_active.isoformat() if profile.last_active else None,
    }


@router.get("/warnings/{course_id}")
async def get_warnings(
    course_id: uuid.UUID,
    threshold: float = Query(0.3, ge=0.0, le=1.0, description="Mastery threshold for warnings"),
    db: AsyncSession = Depends(get_db),
):
    """Return early-warning list of students with weak knowledge points."""
    svc = _get_service()
    warnings = await svc.get_warnings(db, course_id, threshold)
    return {"course_id": str(course_id), "warnings": warnings}


@router.get("/report/{course_id}")
async def get_report(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Generate a class-level analytics report with LLM teaching suggestions."""
    svc = _get_service()
    report = await svc.generate_report(db, course_id)
    return {"course_id": str(course_id), **report}


@router.post("/bkt/update")
async def update_bkt(
    payload: BKTUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Run a single BKT update step for a student-knowledge-point pair."""
    svc = _get_service()
    updated = await svc.update_bkt(
        db=db,
        user_id=payload.user_id,
        course_id=payload.course_id,
        knowledge_point_id=payload.knowledge_point_id,
        is_correct=payload.is_correct,
    )
    return updated
