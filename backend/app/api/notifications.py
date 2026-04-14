"""Notifications API — role-aware notification feed derived from real data."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.assignment import Assignment, Submission
from app.models.course import Course, CourseEnrollment
from app.models.student_profile import StudentProfile
from app.models.user import User

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class NotificationItem(BaseModel):
    id: str
    type: Literal["grading", "assignment", "warning", "submission"]
    text: str
    link: str
    timestamp: datetime
    read: bool


def _relative_time(ts: datetime) -> str:
    """Format a timestamp as a short relative-time label in Chinese."""
    now = datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    delta = now - ts
    secs = int(delta.total_seconds())
    if secs < 60:
        return "刚刚"
    if secs < 3600:
        return f"{secs // 60} 分钟前"
    if secs < 86400:
        return f"{secs // 3600} 小时前"
    if secs < 86400 * 7:
        return f"{secs // 86400} 天前"
    return ts.strftime("%m-%d")


@router.get("")
async def list_notifications(
    since: datetime | None = Query(
        None,
        description="Items with timestamp > since are marked unread",
    ),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return a role-scoped feed of recent notifications.

    Unread logic: items after `since` are unread. The client tracks
    `since` in localStorage (a `notifications_last_seen` timestamp).
    """
    items: list[dict] = []
    now = datetime.now(timezone.utc)

    if user.role == "student":
        # Enrolled courses scope
        enrolled_q = await db.execute(
            select(CourseEnrollment.course_id).where(
                CourseEnrollment.user_id == user.id
            )
        )
        course_ids = {row[0] for row in enrolled_q.all()}

        # Recently graded submissions for this student
        graded_q = await db.execute(
            select(Submission, Assignment)
            .join(Assignment, Assignment.id == Submission.assignment_id)
            .where(
                Submission.student_id == user.id,
                Submission.status.in_(["graded", "ai_graded", "teacher_graded"]),
                Submission.created_at >= now - timedelta(days=14),
            )
            .order_by(Submission.created_at.desc())
            .limit(10)
        )
        for sub, asgn in graded_q.all():
            ts = sub.created_at or now
            items.append(
                {
                    "id": f"grading:{sub.id}",
                    "type": "grading",
                    "text": f"《{asgn.title}》已批改完成 · {int(sub.score or 0)}分",
                    "link": f"/s/assignments/{sub.id}",
                    "timestamp": ts,
                }
            )

        # New unfinished assignments the student hasn't submitted yet
        if course_ids:
            asgn_q = await db.execute(
                select(Assignment)
                .where(
                    Assignment.course_id.in_(course_ids),
                    Assignment.created_at >= now - timedelta(days=14),
                )
                .order_by(Assignment.created_at.desc())
                .limit(10)
            )
            for asgn in asgn_q.scalars().all():
                # Skip assignments the student already submitted
                exists_q = await db.execute(
                    select(Submission.id).where(
                        Submission.assignment_id == asgn.id,
                        Submission.student_id == user.id,
                    )
                )
                if exists_q.scalar_one_or_none() is not None:
                    continue
                ts = asgn.created_at or now
                items.append(
                    {
                        "id": f"assignment:{asgn.id}",
                        "type": "assignment",
                        "text": f"新作业《{asgn.title}》已发布",
                        "link": f"/s/assignments/{asgn.id}",
                        "timestamp": ts,
                    }
                )
    else:
        # Teacher / admin: pending submissions + high-risk warnings
        # Pending submissions queue — courses this teacher owns
        owned_q = await db.execute(
            select(Course.id).where(Course.teacher_id == user.id)
        )
        owned_ids = {row[0] for row in owned_q.all()}

        if owned_ids:
            pending_q = await db.execute(
                select(Submission, Assignment, User)
                .join(Assignment, Assignment.id == Submission.assignment_id)
                .join(User, User.id == Submission.student_id)
                .where(
                    Assignment.course_id.in_(owned_ids),
                    Submission.status.in_(["submitted", "pending"]),
                    Submission.created_at >= now - timedelta(days=14),
                )
                .order_by(Submission.created_at.desc())
                .limit(10)
            )
            for sub, asgn, student in pending_q.all():
                ts = sub.created_at or now
                items.append(
                    {
                        "id": f"submission:{sub.id}",
                        "type": "submission",
                        "text": f"{student.name} 提交了《{asgn.title}》，待批改",
                        "link": f"/teacher/grading/{sub.id}",
                        "timestamp": ts,
                    }
                )

        # High-risk warnings on courses this teacher owns
        if owned_ids:
            warning_q = await db.execute(
                select(StudentProfile, User)
                .join(User, User.id == StudentProfile.user_id)
                .where(
                    StudentProfile.course_id.in_(owned_ids),
                    StudentProfile.risk_level == "high",
                )
                .order_by(StudentProfile.last_active.desc().nullslast())
                .limit(5)
            )
            for profile, student in warning_q.all():
                ts = profile.last_active or now
                items.append(
                    {
                        "id": f"warning:{profile.user_id}:{profile.course_id}",
                        "type": "warning",
                        "text": f"{student.name} 掌握度低于 30%，请关注",
                        "link": "/teacher/warnings",
                        "timestamp": ts,
                    }
                )

    # Sort all items by timestamp desc and mark unread relative to `since`
    items.sort(key=lambda i: i["timestamp"], reverse=True)
    items = items[:15]
    for i in items:
        i["read"] = bool(since) and i["timestamp"] <= since
        i["time"] = _relative_time(i["timestamp"])
        i["timestamp"] = i["timestamp"].isoformat()

    unread_count = sum(1 for i in items if not i["read"])
    return {"items": items, "unread_count": unread_count}
