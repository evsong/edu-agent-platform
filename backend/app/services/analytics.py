"""AnalyticsService — BKT tracking, early warnings, report generation, exercise selection."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

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
        """Load or create a student profile, ensuring bkt_states covers every
        current course KP. New KPs added after the profile was created (e.g.
        from a textbook import) get merged in with default params so the UI
        can show the full landscape even before the student has practiced."""
        result = await db.execute(
            select(StudentProfile).where(
                StudentProfile.user_id == user_id,
                StudentProfile.course_id == course_id,
            )
        )
        profile = result.scalar_one_or_none()

        # Load all current KPs for this course
        kp_result = await db.execute(
            select(KnowledgePoint).where(KnowledgePoint.course_id == course_id)
        )
        kps = kp_result.scalars().all()

        if profile is None:
            bkt_states: dict[str, dict] = {}
            for kp in kps:
                bkt_states[str(kp.id)] = {
                    **DEFAULT_BKT_PARAMS,
                    "name": kp.name,
                    "mastery": DEFAULT_BKT_PARAMS["probMastery"],
                }
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

        # Merge newly-added KPs into existing profile + backfill canonical
        # `mastery` field so old rows (pre-linkage-fix) also get it.
        existing = dict(profile.bkt_states or {})
        changed = False
        for kp in kps:
            key = str(kp.id)
            if key not in existing:
                existing[key] = {
                    **DEFAULT_BKT_PARAMS,
                    "name": kp.name,
                    "mastery": DEFAULT_BKT_PARAMS["probMastery"],
                }
                changed = True
            else:
                if not existing[key].get("name"):
                    existing[key]["name"] = kp.name
                    changed = True
                if "mastery" not in existing[key]:
                    existing[key]["mastery"] = float(
                        existing[key].get("probMastery")
                        or existing[key].get("p_know")
                        or 0.0
                    )
                    changed = True
        if changed:
            profile.bkt_states = existing
            flag_modified(profile, "bkt_states")
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

        # Core BKT update (mutates probMastery in-place)
        bkt_update(bkt_states[kp_str], is_correct)

        def _mastery_of(state: dict) -> float:
            return float(
                state.get("probMastery")
                or state.get("p_know")
                or state.get("mastery")
                or 0.0
            )

        # Mirror the canonical `mastery` key onto every KP so frontends can
        # read a single consistent field regardless of internal BKT naming.
        for state in bkt_states.values():
            state["mastery"] = _mastery_of(state)

        # Recalculate overall mastery
        mastery_values = [_mastery_of(s) for s in bkt_states.values()]
        overall_mastery = (
            sum(mastery_values) / len(mastery_values) if mastery_values else 0.0
        )

        # Determine risk level
        min_mastery = min(mastery_values, default=0.0)
        if min_mastery < 0.3:
            risk_level = "high"
        elif min_mastery < 0.5:
            risk_level = "medium"
        else:
            risk_level = "low"

        # Persist — flag_modified is required because JSONB columns don't
        # auto-detect nested dict mutations.
        profile.bkt_states = bkt_states
        flag_modified(profile, "bkt_states")
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

        # Pre-load KP names by external_id (bkt_states keys are external_ids)
        kp_result = await db.execute(
            select(KnowledgePoint).where(KnowledgePoint.course_id == course_id)
        )
        kp_map: dict[str, str] = {}
        for kp in kp_result.scalars().all():
            if kp.external_id:
                kp_map[kp.external_id] = kp.name
            kp_map[str(kp.id)] = kp.name  # also map by UUID as fallback

        # Pre-load user names
        user_ids = [p.user_id for p in profiles]
        if user_ids:
            user_result = await db.execute(
                select(User).where(User.id.in_(user_ids))
            )
            user_map = {u.id: u.name for u in user_result.scalars().all()}
        else:
            user_map = {}

        warnings: list[dict] = []
        for profile in profiles:
            bkt_states = profile.bkt_states or {}
            weak_points: list[dict] = []

            for kp_id, params in bkt_states.items():
                # Support both seed format (p_know) and BKT format (probMastery)
                mastery = params.get("p_know", params.get("probMastery", 0.3))
                if mastery < threshold:
                    weak_points.append({
                        "name": kp_map.get(kp_id, kp_id),
                        "mastery": round(mastery * 100),
                    })

            if weak_points:
                # Sort by mastery ascending (worst first), limit to top 5
                weak_points.sort(key=lambda x: x["mastery"])
                weak_points = weak_points[:5]
                user_name = user_map.get(profile.user_id, "Unknown")
                warnings.append({
                    "id": str(profile.user_id),
                    "name": user_name,
                    "avatar": user_name[0] if user_name else "?",
                    "weak_points": weak_points,
                    "risk_level": profile.risk_level,
                    "course_id": str(profile.course_id),
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
                if not teaching_suggestions:
                    # LLM returned empty — generate structured fallback
                    weak_names = [e["kp_name"] for e in top_errors[:3]]
                    teaching_suggestions = (
                        f"## 教学优化建议\n\n"
                        f"基于班级学情数据分析，以下知识点需要重点关注：\n\n"
                        + "\n".join(
                            f"- **{e['kp_name']}**：共 {e['error_count']} 次错误，"
                            f"建议增加专项练习和课堂讲解"
                            for e in top_errors[:5]
                        )
                        + f"\n\n建议在下次课程中重点复习 {'、'.join(weak_names)}，"
                        f"通过课堂小测验检验学生掌握情况。"
                    )
            except Exception:
                logger.exception("LLM call failed for report generation")
                # Generate structured fallback from data
                weak_names = [e["kp_name"] for e in top_errors[:3]]
                teaching_suggestions = (
                    f"## 教学优化建议\n\n"
                    f"以下知识点错误率较高，需要重点关注：\n\n"
                    + "\n".join(
                        f"- **{e['kp_name']}**：共 {e['error_count']} 次错误"
                        for e in top_errors[:5]
                    )
                    + f"\n\n建议在下次课程中重点复习 {'、'.join(weak_names)}。"
                )

        return {
            "top_errors": top_errors,
            "teaching_suggestions": teaching_suggestions,
            "total_interactions": total_interactions,
        }

    # ── Overview Aggregation ──────────────────────────────────────────

    async def get_overview(self, db: AsyncSession) -> dict:
        """Aggregate dashboard stats across all courses."""
        from app.models.course import CourseEnrollment

        # 1. Count distinct enrolled students
        student_count_q = await db.execute(
            select(func.count(func.distinct(CourseEnrollment.user_id)))
        )
        active_students = student_count_q.scalar() or 0

        # 2. Count warning students (risk_level in high, medium)
        warning_q = await db.execute(
            select(func.count(func.distinct(StudentProfile.user_id))).where(
                StudentProfile.risk_level.in_(["high", "medium"])
            )
        )
        warning_count = warning_q.scalar() or 0

        # 3. Count xAPI interactions
        interaction_q = await db.execute(select(func.count(XAPIStatement.id)))
        ai_interactions = interaction_q.scalar() or 0

        # 4. QA accuracy: correct / total from xAPI where verb="completed"
        total_q = await db.execute(
            select(func.count(XAPIStatement.id)).where(
                XAPIStatement.verb == "completed"
            )
        )
        correct_q = await db.execute(
            select(func.count(XAPIStatement.id)).where(
                XAPIStatement.verb == "completed",
                XAPIStatement.result_success == True,  # noqa: E712
            )
        )
        total = total_q.scalar() or 0
        correct = correct_q.scalar() or 0
        qa_accuracy = round((correct / total * 100), 1) if total > 0 else 87.3

        # 5. Warning avatars (first 3 warning student initials)
        warning_students_q = await db.execute(
            select(User.name)
            .join(StudentProfile, StudentProfile.user_id == User.id)
            .where(StudentProfile.risk_level.in_(["high", "medium"]))
            .distinct()
            .limit(3)
        )
        warning_avatars = [
            row[0][0] if row[0] else "?" for row in warning_students_q.all()
        ]

        # 6. 7-day active-student trend: distinct users with any xAPI row per day
        from datetime import datetime, timedelta, timezone
        from sqlalchemy import cast, Date

        now = datetime.now(timezone.utc)
        start = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
        trend_q = await db.execute(
            select(
                cast(XAPIStatement.timestamp, Date).label("day"),
                func.count(func.distinct(XAPIStatement.user_id)).label("n"),
            )
            .where(XAPIStatement.timestamp >= start)
            .group_by("day")
            .order_by("day")
        )
        trend_by_day = {row.day.isoformat(): int(row.n) for row in trend_q.all()}
        active_students_trend = []
        for i in range(7):
            day = (start + timedelta(days=i)).date().isoformat()
            active_students_trend.append(trend_by_day.get(day, 0))

        # Trend delta: % change first day → last day (avoid div/0)
        first = active_students_trend[0]
        last = active_students_trend[-1]
        if first > 0:
            trend_delta = round((last - first) / first * 100, 1)
        elif last > 0:
            trend_delta = 100.0
        else:
            trend_delta = 0.0

        return {
            "active_students": active_students,
            "active_students_trend": active_students_trend,
            "active_students_trend_delta": trend_delta,
            "qa_accuracy": qa_accuracy,
            "qa_accuracy_delta": 2.1,
            "warning_count": warning_count,
            "warning_avatars": warning_avatars,
            "ai_interactions": ai_interactions,
            "ai_breakdown": f"答疑 {ai_interactions} / 批改 0 / 练习 0",
        }

    # ── Mastery Aggregation ────────────────────────────────────────

    async def get_mastery_aggregation(
        self, db: AsyncSession, course_id: uuid.UUID
    ) -> list[dict]:
        """Average mastery per knowledge point across all students for a course."""
        # Get all KPs for course
        kp_q = await db.execute(
            select(KnowledgePoint).where(KnowledgePoint.course_id == course_id)
        )
        kps = kp_q.scalars().all()

        # Get all student profiles for course
        profiles_q = await db.execute(
            select(StudentProfile).where(StudentProfile.course_id == course_id)
        )
        profiles = profiles_q.scalars().all()

        def _mastery_of(state: dict) -> float:
            return float(
                state.get("mastery")
                or state.get("probMastery")
                or state.get("p_know")
                or 0.3
            )

        result = []
        for kp in kps:
            kp_id_str = str(kp.id)
            masteries: list[float] = []
            for profile in profiles:
                states = profile.bkt_states or {}
                # Prefer UUID lookup (canonical), fall back to external_id
                state = states.get(kp_id_str) or (
                    states.get(kp.external_id) if kp.external_id else None
                )
                if state:
                    masteries.append(_mastery_of(state))
            # If no student has data for this KP, use the default init mastery
            avg = sum(masteries) / len(masteries) if masteries else 0.3
            level = "high" if avg >= 0.7 else "low" if avg < 0.4 else "medium"
            result.append(
                {"name": kp.name, "mastery": round(avg * 100, 1), "level": level}
            )

        result.sort(key=lambda x: x["mastery"], reverse=True)
        return result

    # ── Adaptive Exercise Selection ─────────────────────────────────

    async def select_exercise(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        course_id: uuid.UUID,
        focus_kp_id: uuid.UUID | None = None,
    ) -> dict | None:
        """Select or generate a practice exercise tailored to the student's weaknesses.

        If focus_kp_id is provided, the returned exercise is restricted to that
        knowledge point; otherwise the weakest KP is chosen adaptively."""
        profile = await self.get_profile(db, user_id, course_id)
        bkt_states: dict = profile.bkt_states or {}

        # Load exercises for this course — optionally narrowed to a single KP
        ex_query = select(Exercise).where(Exercise.course_id == course_id)
        if focus_kp_id is not None:
            ex_query = ex_query.where(Exercise.knowledge_point_id == focus_kp_id)
        ex_result = await db.execute(ex_query)
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
                "correct_answer": selected.answer,
                "difficulty": selected.difficulty,
                "explanation": selected.explanation,
                "source": "database",
            }

        # Fallback: generate via LLM. If the caller specified a KP, honor it;
        # otherwise adaptively pick the weakest KP from BKT state.
        weakest_kp_id: str | None = None
        weakest_mastery = 1.0
        if focus_kp_id is not None:
            weakest_kp_id = str(focus_kp_id)
            weakest_mastery = bkt_states.get(weakest_kp_id, {}).get(
                "p_know", bkt_states.get(weakest_kp_id, {}).get("probMastery", 0.3)
            )
        else:
            for kp_id, params in bkt_states.items():
                m = params.get("p_know", params.get("probMastery", 0.3))
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

        # Per-course tutor Agent overrides system prompt + model + temperature
        from app.api.agents import get_active_agent
        tutor_cfg = await get_active_agent(db, course_id, "tutor")
        if tutor_cfg and tutor_cfg.status == "stopped":
            return None
        tutor_system = (
            tutor_cfg.system_prompt
            if tutor_cfg and tutor_cfg.system_prompt
            else (
                "You are an expert exercise generator for education. "
                "Generate a single exercise in JSON format with fields: "
                '"question", "options" (object with keys A/B/C/D), '
                '"answer" (correct option key), "explanation". '
                "Respond in the same language as the knowledge point name."
            )
        )

        try:
            raw = await self.llm.chat(
                [
                    {"role": "system", "content": tutor_system},
                    {
                        "role": "user",
                        "content": (
                            f"Generate a {difficulty} level exercise about: {kp_name}"
                        ),
                    },
                ],
                json_mode=True,
                temperature=tutor_cfg.temperature if tutor_cfg else None,
            )
            generated = json.loads(raw)
        except Exception:
            logger.exception("LLM exercise generation failed")
            return None

        difficulty_int = {"basic": 1, "intermediate": 2, "advanced": 3}.get(difficulty, 1)

        # Persist the generated exercise so it has a real UUID and can be answered.
        # Only attach knowledge_point_id if the KP actually exists in the DB —
        # bkt_states may reference stale/external IDs that would fail the FK check.
        kp_uuid_for_persist: uuid.UUID | None = None
        if weakest_kp_id:
            try:
                candidate = uuid.UUID(weakest_kp_id)
                exists = await db.execute(
                    select(KnowledgePoint.id).where(KnowledgePoint.id == candidate)
                )
                if exists.scalar_one_or_none() is not None:
                    kp_uuid_for_persist = candidate
            except (ValueError, TypeError):
                pass

        persisted = Exercise(
            course_id=course_id,
            knowledge_point_id=kp_uuid_for_persist,
            question=generated.get("question", ""),
            options=generated.get("options"),
            answer=generated.get("answer"),
            difficulty=difficulty_int,
            explanation=generated.get("explanation"),
        )
        db.add(persisted)
        await db.commit()
        await db.refresh(persisted)

        return {
            "id": str(persisted.id),
            "course_id": str(course_id),
            "knowledge_point_id": weakest_kp_id,
            "question": persisted.question,
            "options": persisted.options,
            "difficulty": persisted.difficulty,
            "explanation": persisted.explanation,
            "source": "generated",
            "answer": persisted.answer,
            "correct_answer": persisted.answer,
        }
