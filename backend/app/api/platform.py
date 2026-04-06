"""Platform API — LTI launch, grade passback, DingTalk webhook & notifications."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.platform import (
    DingTalkNotifyRequest,
    LTIGradeRequest,
    LTILaunchData,
    XAPIStatementSchema,
)
from app.services.analytics import AnalyticsService
from app.services.llm import LLMClient
from app.services.platform import PlatformService

router = APIRouter(prefix="/api/platform", tags=["platform"])

# Module-level singletons; initialised lazily on first request.
_platform_service: PlatformService | None = None
_analytics_service: AnalyticsService | None = None


def _get_platform_service() -> PlatformService:
    global _platform_service
    if _platform_service is None:
        _platform_service = PlatformService(llm=LLMClient())
    return _platform_service


def _get_analytics_service() -> AnalyticsService:
    global _analytics_service
    if _analytics_service is None:
        _analytics_service = AnalyticsService(llm=LLMClient())
    return _analytics_service


# ── LTI ──────────────────────────────────────────────────────────────


@router.post("/lti-launch")
async def lti_launch(
    data: LTILaunchData,
    db: AsyncSession = Depends(get_db),
):
    """Handle an LTI 1.3 launch forwarded by the ltijs provider."""
    svc = _get_platform_service()
    return await svc.handle_lti_launch(db, data.model_dump())


@router.post("/lti-grade")
async def lti_grade(payload: LTIGradeRequest):
    """Submit a grade back to the LMS via LTI grade passback."""
    svc = _get_platform_service()
    try:
        return await svc.submit_lti_grade(
            user_id=payload.user_id,
            score=payload.score,
            comment=payload.comment,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LTI grade passback failed: {exc}",
        ) from exc


# ── DingTalk ─────────────────────────────────────────────────────────


@router.post("/dingtalk/webhook")
async def dingtalk_webhook(request: Request):
    """Receive an incoming DingTalk robot callback and return a response."""
    data = await request.json()
    svc = _get_platform_service()
    response = await svc.handle_dingtalk_webhook(data)
    return {"response": response}


@router.post("/dingtalk/notify")
async def dingtalk_notify(payload: DingTalkNotifyRequest):
    """Send a notification to a DingTalk group via webhook."""
    svc = _get_platform_service()
    success = await svc.send_dingtalk_notification(
        webhook_url=payload.webhook_url,
        content=payload.content,
    )
    return {"success": success}


# ── Platform User Resolution ────────────────────────────────────────


@router.get("/user/resolve")
async def resolve_user(
    platform: str = Query(..., description="Platform name, e.g. 'chaoxing'"),
    platform_user_id: str = Query(..., description="User ID on the platform"),
    db: AsyncSession = Depends(get_db),
):
    """Look up the internal user mapped to a platform identity."""
    svc = _get_platform_service()
    result = await svc.resolve_user(db, platform, platform_user_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Platform user mapping not found",
        )
    return result


# ── xAPI Statement ──────────────────────────────────────────────────


@router.post("/xapi/statement")
async def record_xapi(
    statement: XAPIStatementSchema,
    db: AsyncSession = Depends(get_db),
):
    """Record an xAPI statement via the analytics service."""
    svc = _get_analytics_service()
    stmt_id = await svc.record_xapi(
        db=db,
        user_id=statement.user_id,
        verb=statement.verb,
        object_type=statement.object_type,
        object_id=statement.object_id,
        result_score=statement.result_score,
        result_success=statement.result_success,
        context=statement.context,
    )
    return {"id": str(stmt_id)}
