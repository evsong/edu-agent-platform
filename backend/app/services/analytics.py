"""AnalyticsService — BKT tracking, early warnings, report generation, exercise selection."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise
from app.models.knowledge_point import KnowledgePoint
from app.models.student_profile import StudentProfile
from app.models.user import User
from app.models.xapi_statement import XAPIStatement
from app.services.bkt import DEFAULT_BKT_PARAMS, MASTERY_THRESHOLD, bkt_update, select_problem
from app.services.llm import LLMClient

logger = logging.getLogger(__name__)


class AnalyticsService:
    """Orchestrates BKT-based mastery tracking, early warnings, and adaptive practice."""

    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm

    # ── xAPI Recording ──────────────────────────────────────────────

    async def record_xapi(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        verb: str,
        object_type: str,
        object_id: str,
        result_score: float | None = None,
        result_success: bool | None = None,
        context: dict | None = None,
    ) -> uuid.UUID:
        """Insert a new xAPI statement and return its id."""
        stmt = XAPIStatement(
            user_id=user_id,
            verb=verb,
            object_type=object_type,
            object_id=object_id,
            result_score=result_score,
            result_success=result_success,
            context=context,
        )
        db.add(stmt)
        await db.flush()
        return stmt.id

    # ── Student Profile ─────────────────────────────────────────────

    async def get_profile(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        course_id: uuid.UUID,
    ) -> StudentProfile:
        """Load or create a student profile with default BKT params for each KP."""
        result = await db.execute(
            select(StudentProfile).where(
                StudentProfile.user_id == user_id,
                StudentProfile.course_id == course_id,
            )
        )
        profile = result.scalar_one_or_none()

        if profile is not None:
            return profile

        # Create with default BKT states for every KP in the course
        kp_result = await db.execute(
            select(KnowledgePoint).where(KnowledgePoint.course_id == course_id)
        )
        kps = kp_result.scalars().all()

        bkt_states: dict[str, dict] = {}
        for kp in kps:
            bkt_states[str(kp.id)] = {**DEFAULT_BKT_PARAMS}

        profile = StudentProfile(
            user_id=user_id,
            course_id=course_id,
            bkt_states=bkt_states,
            overall_mastery=0.0,
            risk_level="normal",
        )
        db.add(profile)
        await db.flush()
        return profile

    # ── BKT Update ──────────────────────────────────────────────────

    async def update_bkt(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        course_id: uuid.UUID,
        knowledge_point_id: uuid.UUID,
        is_correct: bool,
    ) -> dict:
        """Run one BKT update step and persist the result.

        Returns the updated profile as a dict.
        """
        profile = await self.get_profile(db, user_id, course_id)
        bkt_states: dict[str, dict] = dict(profile.bkt_states or {})

        kp_str = str(knowledge_point_id)

        # Init BKT params for this KP if missing
        if kp_str not in bkt_states:
            bkt_states[kp_str] = {**DEFAULT_BKT_PARAMS}

        # Core BKT update
        bkt_update(bkt_states[kp_str], is_correct)

        # Recalculate overall mastery
        if bkt_states:
            mastery_values = [s.get("probMastery", 0.3) for s in bkt_states.values()]
            overall_mastery = sum(mastery_values) / len(mastery_values)
        else:
            overall_mastery = 0.0

        # Determine risk level
        min_mastery = min(
            (s.get("probMastery", 0.3) for s in bkt_states.values()), default=0.0
        )
        if min_mastery < 0.3:
            risk_level = "high"
        elif min_mastery < 0.5:
            risk_level = "medium"
        else:
            risk_level = "low"

        # Persist
        profile.bkt_states = bkt_states
        profile.overall_mastery = overall_mastery
        profile.risk_level = risk_level
        profile.last_active = datetime.now(timezone.utc)
        await db.flush()

        # Record xAPI statement
        await self.record_xapi(
            db=db,
            user_id=user_id,
            verb="answered",
            object_type="knowledge_point",
            object_id=kp_str,
            result_success=is_correct,
            context={"course_id": str(course_id)},
        )

        return {
            "user_id": str(profile.user_id),
            "course_id": str(profile.course_id),
            "bkt_states": profile.bkt_states,
            "overall_mastery": profile.overall_mastery,
            "risk_level": profile.risk_level,
            "last_active": profile.last_active.isoformat() if profile.last_active else None,
        }

    # ── Early Warnings ──────────────────────────────────────────────

    async def get_warnings(
        self,
        db: AsyncSession,
        course_id: uuid.UUID,
        threshold: float = 0.3,
    ) -> list[dict]:
        """Scan all profiles for a course and flag students with weak KPs."""
        result = await db.execute(
            select(StudentProfile).where(StudentProfile.course_id == course_id)
        )
        profiles = result.scalars().all()

        # Pre-load KP names for readable output
        kp_result = await db.execute(
            select(KnowledgePoint).where(KnowledgePoint.course_id == course_id)
        )
        kp_map: dict[str, str] = {
            str(kp.id): kp.name for kp in kp_result.scalars().all()
        }

        warnings: list[dict] = []
        for profile in profiles:
            bkt_states = profile.bkt_states or {}
            weak_points: list[dict] = []

            for kp_id, params in bkt_states.items():
                mastery = params.get("probMastery", 0.3)
                if mastery < threshold:
                    weak_points.append({
                        "kp_id": kp_id,
                        "kp_name": kp_map.get(kp_id, kp_id),
                        "mastery": round(mastery, 4),
                    })

            if weak_points:
                user_name = profile.user.name if profile.user else "Unknown"
                warnings.append({
                    "user_id": str(profile.user_id),
                    "user_name": user_name,
                    "weak_points": weak_points,
                    "risk_level": profile.risk_level,
                })

        return warnings

    # ── Class Report ────────────────────────────────────────────────

    async def generate_report(
        self,
        db: AsyncSession,
        course_id: uuid.UUID,
    ) -> dict:
        """Generate a class-level analytics report with LLM teaching suggestions."""
        # Count errors per knowledge point from xAPI statements
        stmt = (
            select(
                XAPIStatement.object_id,
                func.count().label("error_count"),
            )
            .where(
                XAPIStatement.context["course_id"].as_string() == str(course_id),
                XAPIStatement.result_success.is_(False),
                XAPIStatement.object_type == "knowledge_point",
            )
            .group_by(XAPIStatement.object_id)
            .order_by(func.count().desc())
            .limit(5)
        )
        result = await db.execute(stmt)
        top_errors_raw = result.all()

        # Load KP names
        kp_ids = [row[0] for row in top_errors_raw]
        kp_map: dict[str, str] = {}
        if kp_ids:
            kp_uuids = []
            for kid in kp_ids:
                try:
                    kp_uuids.append(uuid.UUID(kid))
                except ValueError:
                    pass
            if kp_uuids:
                kp_result = await db.execute(
                    select(KnowledgePoint).where(KnowledgePoint.id.in_(kp_uuids))
                )
                kp_map = {str(kp.id): kp.name for kp in kp_result.scalars().all()}

        top_errors = [
            {
                "kp_id": row[0],
                "kp_name": kp_map.get(row[0], row[0]),
                "error_count": row[1],
            }
            for row in top_errors_raw
        ]

        # Total interactions
        total_result = await db.execute(
            select(func.count()).select_from(XAPIStatement).where(
                XAPIStatement.context["course_id"].as_string() == str(course_id),
            )
        )
        total_interactions = total_result.scalar() or 0

        # LLM teaching suggestions
        teaching_suggestions = ""
        if top_errors:
            error_summary = "\n".join(
                f"- {e['kp_name']}: {e['error_count']} errors"
                for e in top_errors
            )
            try:
                teaching_suggestions = await self.llm.chat([
                    {
                        "role": "system",
                        "content": (
                            "You are an expert education consultant. "
                            "Based on student error patterns, suggest concrete teaching improvements. "
                            "Respond in the same language as the knowledge point names."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Class error patterns (top 5 weakest knowledge points):\n"
                            f"{error_summary}\n\n"
                            f"Total student interactions: {total_interactions}\n\n"
                            f"Please suggest 3-5 specific teaching improvements."
                        ),
                    },
                ])
            except Exception:
                logger.exception("LLM call failed for report generation")
                teaching_suggestions = "Unable to generate suggestions at this time."

        return {
            "top_errors": top_errors,
            "teaching_suggestions": teaching_suggestions,
            "total_interactions": total_interactions,
        }

    # ── Adaptive Exercise Selection ─────────────────────────────────

    async def select_exercise(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        course_id: uuid.UUID,
    ) -> dict | None:
        """Select or generate a practice exercise tailored to the student's weaknesses."""
        profile = await self.get_profile(db, user_id, course_id)
        bkt_states: dict = profile.bkt_states or {}

        # Load exercises for this course
        ex_result = await db.execute(
            select(Exercise).where(Exercise.course_id == course_id)
        )
        exercises = ex_result.scalars().all()

        # Load completed exercise IDs from xAPI
        completed_result = await db.execute(
            select(XAPIStatement.object_id).where(
                XAPIStatement.user_id == user_id,
                XAPIStatement.verb == "completed",
                XAPIStatement.object_type == "exercise",
            )
        )
        completed_ids: set = set()
        for row in completed_result.scalars().all():
            try:
                completed_ids.add(uuid.UUID(row))
            except (ValueError, TypeError):
                completed_ids.add(row)

        # Try BKT-based selection from existing DB exercises
        selected = select_problem(exercises, bkt_states, completed_ids)

        if selected is not None:
            return {
                "id": str(selected.id),
                "course_id": str(selected.course_id),
                "knowledge_point_id": str(selected.knowledge_point_id) if selected.knowledge_point_id else None,
                "question": selected.question,
                "options": selected.options,
                "difficulty": selected.difficulty,
                "explanation": selected.explanation,
                "source": "database",
            }

        # Fallback: generate via LLM based on weakest KP
        weakest_kp_id, weakest_mastery = None, 1.0
        for kp_id, params in bkt_states.items():
            m = params.get("probMastery", 0.3)
            if m < weakest_mastery:
                weakest_mastery = m
                weakest_kp_id = kp_id

        if weakest_kp_id is None:
            return None

        # Load KP name
        try:
            kp_uuid = uuid.UUID(weakest_kp_id)
            kp_result = await db.execute(
                select(KnowledgePoint).where(KnowledgePoint.id == kp_uuid)
            )
            kp = kp_result.scalar_one_or_none()
            kp_name = kp.name if kp else weakest_kp_id
        except (ValueError, TypeError):
            kp_name = weakest_kp_id

        # Determine difficulty from mastery
        if weakest_mastery < 0.3:
            difficulty = "basic"
        elif weakest_mastery < 0.6:
            difficulty = "intermediate"
        else:
            difficulty = "advanced"

        try:
            raw = await self.llm.chat(
                [
                    {
                        "role": "system",
                        "content": (
                            "You are an expert exercise generator for education. "
                            "Generate a single exercise in JSON format with fields: "
                            '"question", "options" (object with keys A/B/C/D), '
                            '"answer" (correct option key), "explanation". '
                            "Respond in the same language as the knowledge point name."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Generate a {difficulty} level exercise about: {kp_name}"
                        ),
                    },
                ],
                json_mode=True,
            )
            generated = json.loads(raw)
        except Exception:
            logger.exception("LLM exercise generation failed")
            return None

        return {
            "id": None,
            "course_id": str(course_id),
            "knowledge_point_id": weakest_kp_id,
            "question": generated.get("question", ""),
            "options": generated.get("options"),
            "difficulty": {"basic": 1, "intermediate": 2, "advanced": 3}.get(difficulty, 1),
            "explanation": generated.get("explanation"),
            "source": "generated",
            "answer": generated.get("answer"),
        }
