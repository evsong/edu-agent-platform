"""Assignments & Submissions API — list assignments, submission queues, student history."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.assignment import Assignment, Submission
from app.models.course import Course
from app.models.user import User

router = APIRouter(prefix="/api", tags=["assignments"])


# ── Assignments ────────────────────────────────────────────────────


@router.get("/assignments")
async def list_assignments(
    course_id: Optional[uuid.UUID] = Query(None, description="Filter by course"),
    db: AsyncSession = Depends(get_db),
):
    """List all assignments with submission statistics.

    Optionally filter by course_id.  Each item includes the course name,
    total submission count, and graded submission count.
    """
    # Sub-queries for submission stats
    sub_total = (
        select(
            Submission.assignment_id,
            func.count().label("submission_count"),
        )
        .group_by(Submission.assignment_id)
        .subquery()
    )

    sub_graded = (
        select(
            Submission.assignment_id,
            func.count().label("graded_count"),
        )
        .where(Submission.status == "graded")
        .group_by(Submission.assignment_id)
        .subquery()
    )

    stmt = (
        select(
            Assignment,
            Course.name.label("course_name"),
            func.coalesce(sub_total.c.submission_count, 0).label("submission_count"),
            func.coalesce(sub_graded.c.graded_count, 0).label("graded_count"),
        )
        .join(Course, Assignment.course_id == Course.id)
        .outerjoin(sub_total, Assignment.id == sub_total.c.assignment_id)
        .outerjoin(sub_graded, Assignment.id == sub_graded.c.assignment_id)
        .order_by(Assignment.created_at.desc())
    )

    if course_id is not None:
        stmt = stmt.where(Assignment.course_id == course_id)

    result = await db.execute(stmt)
    rows = result.all()

    return [
        {
            "id": str(row.Assignment.id),
            "title": row.Assignment.title,
            "course_id": str(row.Assignment.course_id),
            "course_name": row.course_name,
            "content": row.Assignment.content,
            "due_date": row.Assignment.due_date.isoformat() if row.Assignment.due_date else None,
            "created_at": row.Assignment.created_at.isoformat(),
            "submission_count": row.submission_count,
            "graded_count": row.graded_count,
        }
        for row in rows
    ]


@router.get("/assignments/{assignment_id}")
async def get_assignment(
    assignment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Return a single assignment's full detail."""
    result = await db.execute(
        select(Assignment).where(Assignment.id == assignment_id)
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )

    return {
        "id": str(assignment.id),
        "title": assignment.title,
        "course_id": str(assignment.course_id),
        "content": assignment.content,
        "due_date": assignment.due_date.isoformat() if assignment.due_date else None,
        "grading_rules": assignment.grading_rules,
        "created_at": assignment.created_at.isoformat(),
    }


# ── Submissions for an assignment (teacher grading queue) ──────────


@router.get("/assignments/{assignment_id}/submissions")
async def list_submissions_for_assignment(
    assignment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Return all submissions for a given assignment (teacher grading queue).

    Joins Submission -> User to include student name.  The student_avatar
    field is the first character of the student's name.
    """
    # Validate the assignment exists
    asg_result = await db.execute(
        select(Assignment.title).where(Assignment.id == assignment_id)
    )
    asg_row = asg_result.one_or_none()
    if asg_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )
    assignment_title = asg_row.title

    stmt = (
        select(Submission, User.name.label("student_name"))
        .join(User, Submission.student_id == User.id)
        .where(Submission.assignment_id == assignment_id)
        .order_by(Submission.created_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    return [
        {
            "id": str(row.Submission.id),
            "student_name": row.student_name,
            "student_avatar": row.student_name[0] if row.student_name else "",
            "assignment_title": assignment_title,
            "submitted_at": row.Submission.created_at.isoformat(),
            "status": row.Submission.status,
            "score": row.Submission.score,
        }
        for row in rows
    ]


# ── Current student's own submissions ──────────────────────────────


@router.get("/submissions/mine", tags=["submissions"])
async def list_my_submissions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return submissions scoped to the authenticated user.

    For a student: their own submissions across every course they are
    enrolled in. For a teacher: every student submission in the courses
    they teach (used by the teacher's grading queue)."""
    stmt = (
        select(
            Submission,
            Assignment.title.label("assignment_title"),
            Assignment.due_date.label("due_date"),
            Course.name.label("course_name"),
            User.name.label("student_name"),
        )
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .join(Course, Assignment.course_id == Course.id)
        .join(User, Submission.student_id == User.id)
        .order_by(Submission.created_at.desc())
    )
    if current_user.role == "teacher":
        stmt = stmt.where(Course.teacher_id == current_user.id)
    else:
        stmt = stmt.where(Submission.student_id == current_user.id)
    result = await db.execute(stmt)
    rows = result.all()

    return [
        {
            "id": str(row.Submission.id),
            "assignment_id": str(row.Submission.assignment_id),
            "assignment_title": row.assignment_title,
            "course_name": row.course_name,
            "student_id": str(row.Submission.student_id),
            "student_name": row.student_name,
            "student_avatar": (row.student_name or "?")[0],
            "status": row.Submission.status,
            "score": row.Submission.score,
            "submitted_at": row.Submission.created_at.isoformat(),
            "due_date": row.due_date.isoformat() if row.due_date else None,
        }
        for row in rows
    ]
