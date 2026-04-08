"""Courses API — list courses, course detail, enrolled students, create & update."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_current_user_optional
from app.database import get_db
from app.models.course import Course, CourseEnrollment
from app.models.knowledge_point import KnowledgePoint
from app.models.student_profile import StudentProfile
from app.models.user import User

router = APIRouter(prefix="/api/courses", tags=["courses"])

# ── Request schemas ──────────────────────────────────────────────

class CourseCreatePayload(BaseModel):
    name: str
    description: str = ""


class CourseUpdatePayload(BaseModel):
    name: str | None = None
    description: str | None = None


def _course_icon(name: str) -> str:
    """Return a Remix Icon class based on the course name."""
    if "数学" in name:
        return "ri-calculator-line"
    if "物理" in name:
        return "ri-flask-line"
    return "ri-book-open-line"


@router.get("")
async def list_courses(
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """List courses visible to the current user.

    - Teacher: courses they teach.
    - Student: courses they are enrolled in.
    - Anonymous / no auth: all courses.
    """
    # Build base query
    if current_user and current_user.role == "teacher":
        stmt = select(Course).where(Course.teacher_id == current_user.id)
    elif current_user and current_user.role == "student":
        stmt = (
            select(Course)
            .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
            .where(CourseEnrollment.user_id == current_user.id)
        )
    else:
        stmt = select(Course)

    result = await db.execute(stmt.order_by(Course.created_at.desc()))
    courses = result.scalars().all()

    # Gather student_count per course
    count_stmt = (
        select(
            CourseEnrollment.course_id,
            func.count().label("cnt"),
        )
        .group_by(CourseEnrollment.course_id)
    )
    count_result = await db.execute(count_stmt)
    student_counts: dict[uuid.UUID, int] = {
        row.course_id: row.cnt for row in count_result
    }

    # Gather kp_count per course
    kp_stmt = (
        select(
            KnowledgePoint.course_id,
            func.count().label("cnt"),
        )
        .group_by(KnowledgePoint.course_id)
    )
    kp_result = await db.execute(kp_stmt)
    kp_counts: dict[uuid.UUID, int] = {
        row.course_id: row.cnt for row in kp_result
    }

    return [
        {
            "id": str(c.id),
            "name": c.name,
            "description": c.description,
            "student_count": student_counts.get(c.id, 0),
            "kp_count": kp_counts.get(c.id, 0),
            "updated_at": c.created_at.isoformat() if c.created_at else None,
            "icon": _course_icon(c.name),
            "teacher_name": c.teacher.name if c.teacher else None,
        }
        for c in courses
    ]


@router.post("")
async def create_course(
    payload: CourseCreatePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Create a new course owned by the authenticated teacher.

    Falls back to the first teacher in the database for demo/anonymous usage.
    """
    teacher_id: uuid.UUID | None = None
    if current_user and current_user.role == "teacher":
        teacher_id = current_user.id
    else:
        # Fallback: pick the first teacher for demo purposes
        result = await db.execute(
            select(User).where(User.role == "teacher").limit(1)
        )
        teacher = result.scalar_one_or_none()
        if teacher is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No teacher user available. Please log in as a teacher.",
            )
        teacher_id = teacher.id

    course = Course(
        name=payload.name,
        description=payload.description,
        teacher_id=teacher_id,
    )
    db.add(course)
    await db.flush()
    await db.refresh(course)
    return {
        "id": str(course.id),
        "name": course.name,
        "description": course.description,
    }


@router.put("/{course_id}")
async def update_course(
    course_id: uuid.UUID,
    payload: CourseUpdatePayload,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing course's name and/or description."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        )
    if payload.name is not None:
        course.name = payload.name
    if payload.description is not None:
        course.description = payload.description
    await db.flush()
    return {
        "id": str(course.id),
        "name": course.name,
        "description": course.description,
    }


@router.get("/{course_id}")
async def get_course(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Return a single course with student_count and kp_count."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        )

    # student_count
    sc_result = await db.execute(
        select(func.count()).select_from(CourseEnrollment).where(
            CourseEnrollment.course_id == course_id
        )
    )
    student_count = sc_result.scalar() or 0

    # kp_count
    kp_result = await db.execute(
        select(func.count()).select_from(KnowledgePoint).where(
            KnowledgePoint.course_id == course_id
        )
    )
    kp_count = kp_result.scalar() or 0

    return {
        "id": str(course.id),
        "name": course.name,
        "description": course.description,
        "student_count": student_count,
        "kp_count": kp_count,
        "updated_at": course.created_at.isoformat() if course.created_at else None,
        "icon": _course_icon(course.name),
        "teacher_name": course.teacher.name if course.teacher else None,
    }


@router.get("/{course_id}/students")
async def list_students(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """List enrolled students with their mastery data."""
    # Verify course exists
    course_result = await db.execute(select(Course).where(Course.id == course_id))
    if course_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        )

    # Join CourseEnrollment -> User, then left-join StudentProfile
    stmt = (
        select(User, StudentProfile)
        .join(CourseEnrollment, CourseEnrollment.user_id == User.id)
        .outerjoin(
            StudentProfile,
            (StudentProfile.user_id == User.id)
            & (StudentProfile.course_id == course_id),
        )
        .where(CourseEnrollment.course_id == course_id)
        .order_by(User.name)
    )
    result = await db.execute(stmt)
    rows = result.all()

    students = [
        {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "overall_mastery": profile.overall_mastery if profile else 0.0,
            "risk_level": profile.risk_level if profile else "normal",
        }
        for user, profile in rows
    ]

    return {"students": students}
