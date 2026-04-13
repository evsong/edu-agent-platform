"""Practice API — adaptive exercise generation, answer checking, and history."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.exercise import Exercise
from app.models.xapi_statement import XAPIStatement
from app.services.analytics import AnalyticsService
from app.services.llm import LLMClient

router = APIRouter(prefix="/api/practice", tags=["practice"])

# Module-level singleton; initialised lazily on first request.
_analytics_service: AnalyticsService | None = None


def _get_service() -> AnalyticsService:
    global _analytics_service
    if _analytics_service is None:
        _analytics_service = AnalyticsService(llm=LLMClient())
    return _analytics_service


# ── Request models ─────────────────────────────────────────────────


class GenerateRequest(BaseModel):
    user_id: uuid.UUID
    course_id: uuid.UUID
    knowledge_point_id: uuid.UUID | None = None


class AnswerRequest(BaseModel):
    user_id: uuid.UUID
    course_id: uuid.UUID
    exercise_id: uuid.UUID
    answer: str
    knowledge_point_id: uuid.UUID | None = None


# ── Endpoints ──────────────────────────────────────────────────────


@router.post("/generate")
async def generate_exercise(
    payload: GenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Select or generate a practice exercise tailored to the student."""
    svc = _get_service()
    exercise = await svc.select_exercise(
        db,
        payload.user_id,
        payload.course_id,
        focus_kp_id=payload.knowledge_point_id,
    )
    if exercise is None:
        return {
            "message": "All exercises mastered or no exercises available.",
            "exercise": None,
        }
    return {"exercise": exercise}


@router.post("/answer")
async def submit_answer(
    payload: AnswerRequest,
    db: AsyncSession = Depends(get_db),
):
    """Check a student's answer and update BKT mastery accordingly."""
    svc = _get_service()

    # Load the exercise to check correctness
    result = await db.execute(
        select(Exercise).where(Exercise.id == payload.exercise_id)
    )
    exercise = result.scalar_one_or_none()

    if exercise is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found",
        )

    is_correct = (
        payload.answer.strip().upper() == (exercise.answer or "").strip().upper()
    )

    # Determine the knowledge point to update — skip BKT if the exercise has none
    kp_id = payload.knowledge_point_id or exercise.knowledge_point_id
    updated_profile = None
    if kp_id is not None:
        updated_profile = await svc.update_bkt(
            db=db,
            user_id=payload.user_id,
            course_id=payload.course_id,
            knowledge_point_id=kp_id,
            is_correct=is_correct,
        )

    # Record exercise completion
    await svc.record_xapi(
        db=db,
        user_id=payload.user_id,
        verb="completed",
        object_type="exercise",
        object_id=str(payload.exercise_id),
        result_score=1.0 if is_correct else 0.0,
        result_success=is_correct,
        context={"course_id": str(payload.course_id)},
    )

    return {
        "is_correct": is_correct,
        "correct_answer": exercise.answer,
        "explanation": exercise.explanation,
        "updated_profile": updated_profile,
    }


@router.get("/history/{user_id}")
async def get_practice_history(
    user_id: uuid.UUID,
    course_id: uuid.UUID = Query(..., description="Course to retrieve history for"),
    db: AsyncSession = Depends(get_db),
):
    """Return a student's practice history with xAPI statements."""
    result = await db.execute(
        select(XAPIStatement)
        .where(
            XAPIStatement.user_id == user_id,
            XAPIStatement.object_type.in_(["exercise", "knowledge_point"]),
            XAPIStatement.context["course_id"].as_string() == str(course_id),
        )
        .order_by(XAPIStatement.timestamp.desc())
        .limit(100)
    )
    statements = result.scalars().all()

    history = [
        {
            "id": str(s.id),
            "verb": s.verb,
            "object_type": s.object_type,
            "object_id": s.object_id,
            "result_score": s.result_score,
            "result_success": s.result_success,
            "timestamp": s.timestamp.isoformat() if s.timestamp else None,
        }
        for s in statements
    ]

    return {"user_id": str(user_id), "course_id": str(course_id), "history": history}
