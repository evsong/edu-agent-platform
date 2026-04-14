"""Analytics API — student profiles, BKT updates, early warnings, class reports."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select

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

    # Enrich bkt_states with KP names if missing
    bkt_states = profile.bkt_states or {}
    needs_names = any("name" not in v for v in bkt_states.values() if isinstance(v, dict))
    if needs_names:
        from app.models.knowledge_point import KnowledgePoint as KPModel
        kp_result = await db.execute(
            select(KPModel).where(KPModel.course_id == course_id)
        )
        kp_map = {}
        for kp in kp_result.scalars().all():
            kp_map[str(kp.id)] = kp.name
            if kp.external_id:
                kp_map[kp.external_id] = kp.name
        for kp_id, params in bkt_states.items():
            if isinstance(params, dict) and "name" not in params:
                params["name"] = kp_map.get(kp_id, kp_id)

    # Derive real stats + 7-day history from xapi_statements so the
    # frontend stops showing mock numbers.
    from app.models.xapi_statement import XAPIStatement
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import func, cast, Date

    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=6)

    # Scope xapi rows to this user AND this course (context.course_id)
    course_filter = XAPIStatement.context["course_id"].as_string() == str(course_id)
    base_q = select(XAPIStatement).where(
        XAPIStatement.user_id == user_id,
        course_filter,
    )

    # total interactions = every chat "asked" + every exercise "completed"
    total_q = await db.execute(
        select(func.count()).select_from(
            base_q.where(
                XAPIStatement.verb.in_(["asked", "completed", "answered"])
            ).subquery()
        )
    )
    total_interactions = int(total_q.scalar() or 0)

    # practice sessions = distinct days on which user completed an exercise
    sessions_q = await db.execute(
        select(func.count(func.distinct(cast(XAPIStatement.timestamp, Date)))).where(
            XAPIStatement.user_id == user_id,
            course_filter,
            XAPIStatement.verb == "completed",
            XAPIStatement.object_type == "exercise",
        )
    )
    practice_sessions = int(sessions_q.scalar() or 0)

    # daily avg result_score over last 7 days
    history_q = await db.execute(
        select(
            cast(XAPIStatement.timestamp, Date).label("day"),
            func.avg(XAPIStatement.result_score).label("avg_score"),
        )
        .where(
            XAPIStatement.user_id == user_id,
            course_filter,
            XAPIStatement.result_score.is_not(None),
            XAPIStatement.timestamp >= seven_days_ago,
        )
        .group_by("day")
        .order_by("day")
    )
    history_rows = {
        row.day.isoformat(): float(row.avg_score or 0) for row in history_q.all()
    }

    current_mastery_pct = round(float(profile.overall_mastery or 0) * 100)
    # Fill 7 days, forward-filling the last known value; default to current mastery
    mastery_history = []
    last_value = current_mastery_pct
    for i in range(7):
        day = (seven_days_ago + timedelta(days=i)).date().isoformat()
        if day in history_rows:
            last_value = round(history_rows[day] * 100)
        date_label = (seven_days_ago + timedelta(days=i)).strftime("%m/%d")
        mastery_history.append({"date": date_label, "mastery": last_value})

    # Improvement = first vs last day of the window
    first_val = mastery_history[0]["mastery"] if mastery_history else current_mastery_pct
    last_val = mastery_history[-1]["mastery"] if mastery_history else current_mastery_pct
    improvement_rate = round(
        ((last_val - first_val) / first_val * 100) if first_val > 0 else 0, 1
    )

    return {
        "user_id": str(profile.user_id),
        "course_id": str(profile.course_id),
        "bkt_states": bkt_states,
        "overall_mastery": profile.overall_mastery,
        "risk_level": profile.risk_level,
        "last_active": profile.last_active.isoformat() if profile.last_active else None,
        "stats": {
            "total_interactions": total_interactions,
            "practice_sessions": practice_sessions,
            "improvement_rate": improvement_rate,
        },
        "mastery_history": mastery_history,
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
