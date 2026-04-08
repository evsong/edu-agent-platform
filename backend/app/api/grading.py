"""Grading API — submit for grading, retrieve results & annotations, manage rules."""

from __future__ import annotations

import base64
import json
import logging
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.assignment import Assignment, Submission
from app.models.user import User
from app.services.grading import GradingService
from app.services.llm import LLMClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/grading", tags=["grading"])

# Module-level singleton; initialised lazily on first request.
_grading_service: GradingService | None = None


def _get_service() -> GradingService:
    global _grading_service
    if _grading_service is None:
        _grading_service = GradingService(llm=LLMClient())
    return _grading_service


# ── Request / Response models ───────────────────────────────────────


class SubmitRequest(BaseModel):
    submission_id: str


class RulesRequest(BaseModel):
    course_id: str
    rules: dict


# ── Endpoints ───────────────────────────────────────────────────────


@router.post("/submit")
async def submit_for_grading(
    payload: SubmitRequest,
    db: AsyncSession = Depends(get_db),
):
    """Load a submission from DB, run the 4-stage grading pipeline, return results."""
    svc = _get_service()

    # Validate UUID
    try:
        sub_uuid = uuid.UUID(payload.submission_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid submission_id format",
        )

    # Load submission
    result = await db.execute(
        select(Submission).where(Submission.id == sub_uuid)
    )
    submission = result.scalar_one_or_none()
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found",
        )

    if not submission.content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission has no content to grade",
        )

    # Derive course_id via the assignment relationship
    course_id = str(submission.assignment.course_id)

    grading_result = await svc.grade_submission(
        submission_id=payload.submission_id,
        content=submission.content,
        course_id=course_id,
        db=db,
    )

    return {
        "task_id": payload.submission_id,
        "status": "completed",
        "result": grading_result,
    }


@router.get("/result/{submission_id}")
async def get_grading_result(
    submission_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return the full grading result with student name, assignment title, content."""
    submission = await _load_submission(submission_id, db)

    # Fetch student name
    student_name = ""
    if submission.student_id:
        stu_q = await db.execute(select(User.name).where(User.id == submission.student_id))
        student_name = stu_q.scalar() or ""

    # Fetch assignment title
    assignment_title = ""
    if submission.assignment_id:
        asgn_q = await db.execute(select(Assignment.title).where(Assignment.id == submission.assignment_id))
        assignment_title = asgn_q.scalar() or ""

    return {
        "submission_id": submission_id,
        "student_name": student_name,
        "assignment_title": assignment_title,
        "content": submission.content or "",
        "status": submission.status,
        "score": submission.score,
        "annotations": submission.annotations,
    }


@router.get("/annotations/{submission_id}")
async def get_annotations(
    submission_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return just the annotations array for a submission."""
    submission = await _load_submission(submission_id, db)
    annotations_data = submission.annotations or {}
    return {
        "submission_id": submission_id,
        "annotations": annotations_data.get("annotations", [])
        if isinstance(annotations_data, dict)
        else [],
    }


@router.post("/rules")
async def set_grading_rules(
    payload: RulesRequest,
    db: AsyncSession = Depends(get_db),
):
    """Save grading rules for a course's assignments."""
    svc = _get_service()
    await svc.save_grading_rules(payload.course_id, payload.rules, db)
    return {"status": "ok", "course_id": payload.course_id}


@router.get("/rules/{course_id}")
async def get_grading_rules(
    course_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return the grading rules for a course."""
    svc = _get_service()
    rules = await svc.get_grading_rules(course_id, db)
    return {"course_id": course_id, "rules": rules}


# ── Multimodal endpoint ────────────────────────────────────────────


_IMAGE_GRADING_PROMPT = (
    "分析这张图片中的学生作业，找出错误并给出批注。\n\n"
    "请按以下JSON格式输出：\n"
    '{"annotations": [{"location": "描述位置", "type": "error|warning|suggestion|praise", '
    '"severity": "critical|major|minor", "comment": "批注内容", '
    '"correction": "修正建议或null"}], '
    '"overall_score": 0-100, '
    '"summary": "总体评价", '
    '"strengths": ["优点"], '
    '"improvements": ["改进建议"]}'
)


@router.post("/submit-multimodal")
async def submit_multimodal(
    submission_id: str = Form(...),
    image: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
):
    """Grade a submission that may include an image (e.g. handwritten work).

    If *image* is provided the LLM is called with vision capability to
    analyse the image.  Otherwise, falls back to the standard text pipeline.
    """
    svc = _get_service()

    # Validate UUID
    try:
        sub_uuid = uuid.UUID(submission_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid submission_id format",
        )

    # Load submission
    result = await db.execute(
        select(Submission).where(Submission.id == sub_uuid)
    )
    submission = result.scalar_one_or_none()
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found",
        )

    # ── Image path: use LLM vision ──
    if image is not None:
        image_bytes = await image.read()
        if not image_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded image is empty",
            )

        image_b64 = base64.b64encode(image_bytes).decode("utf-8")

        messages = [
            {"role": "system", "content": "你是一位资深教师，擅长批改学生手写作业和图片格式的作业。输出严格JSON格式。"},
            {"role": "user", "content": _IMAGE_GRADING_PROMPT},
        ]

        try:
            raw_response = await svc.llm.chat_with_image(messages, image_b64)
            grading_result = json.loads(raw_response)
        except json.JSONDecodeError:
            logger.error("LLM returned invalid JSON for image submission %s", submission_id)
            grading_result = {
                "annotations": [],
                "overall_score": 0,
                "summary": "图片批改失败：无法解析LLM返回结果。",
                "strengths": [],
                "improvements": [],
            }
        except RuntimeError as e:
            logger.error("LLM vision call failed for submission %s: %s", submission_id, e)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"LLM视觉服务调用失败: {e}",
            )

        # Persist result
        await svc._save_result(submission_id, grading_result, db)

        return {
            "task_id": submission_id,
            "status": "completed",
            "mode": "image",
            "result": grading_result,
        }

    # ── Text-only fallback (same as /submit) ──
    if not submission.content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission has no content and no image was provided",
        )

    course_id = str(submission.assignment.course_id)
    grading_result = await svc.grade_submission(
        submission_id=submission_id,
        content=submission.content,
        course_id=course_id,
        db=db,
    )

    return {
        "task_id": submission_id,
        "status": "completed",
        "mode": "text",
        "result": grading_result,
    }


# ── Helpers ─────────────────────────────────────────────────────────


async def _load_submission(
    submission_id: str, db: AsyncSession
) -> Submission:
    """Shared helper to load and validate a submission by UUID."""
    try:
        sub_uuid = uuid.UUID(submission_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid submission_id format",
        )

    result = await db.execute(
        select(Submission).where(Submission.id == sub_uuid)
    )
    submission = result.scalar_one_or_none()
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found",
        )
    return submission
