"""Tutor Agent — BKT-based adaptive practice generation."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from typing import Any

from app.agents.base import AgentContext, AgentRegistry, BaseAgent
from app.orchestration.events import Action, TextDelta, Thinking

logger = logging.getLogger(__name__)


@AgentRegistry.register("tutor")
class TutorAgent(BaseAgent):
    """Generates targeted practice exercises based on student weaknesses."""

    agent_id = "tutor"
    name = "练习生成 Agent"
    description = "根据学生薄弱知识点生成针对性练习题"

    async def handle(
        self, message: str, ctx: AgentContext
    ) -> AsyncGenerator[Any, None]:
        import uuid as _uuid

        # ── Step 1: Select exercise via BKT ──────────────────────────
        yield Thinking(stage="analyzing_weaknesses")

        try:
            user_uuid = _uuid.UUID(ctx.user_id)
            course_uuid = _uuid.UUID(ctx.course_id)
        except ValueError:
            yield TextDelta(content="无效的用户或课程 ID，无法生成练习。")
            return

        try:
            exercise = await ctx.analytics.select_exercise(
                db=ctx.db,
                user_id=user_uuid,
                course_id=course_uuid,
            )
        except Exception:
            logger.exception("Tutor Agent: exercise selection failed")
            exercise = None

        if exercise is None:
            yield TextDelta(
                content="恭喜！根据你当前的学习状态，暂无需要强化练习的薄弱知识点。\n"
                "继续保持学习节奏！"
            )
            return

        # ── Step 2: Present the exercise ─────────────────────────────
        yield Thinking(stage="preparing_exercise")

        source_label = "题库" if exercise.get("source") == "database" else "AI 生成"
        difficulty_map = {1: "基础", 2: "中等", 3: "进阶"}
        difficulty_label = difficulty_map.get(exercise.get("difficulty", 1), "基础")

        yield TextDelta(
            content=f"## 练习题 ({difficulty_label} · {source_label})\n\n"
        )
        yield TextDelta(content=f"{exercise.get('question', '')}\n\n")

        # Render options if present
        options = exercise.get("options")
        if isinstance(options, dict):
            for key in sorted(options.keys()):
                yield TextDelta(content=f"**{key}.** {options[key]}\n")
            yield TextDelta(content="\n")
        elif isinstance(options, list):
            for i, opt in enumerate(options):
                label = chr(ord("A") + i)
                yield TextDelta(content=f"**{label}.** {opt}\n")
            yield TextDelta(content="\n")

        yield TextDelta(content="请输入你的答案。\n")

        # ── Step 3: Emit exercise action ─────────────────────────────
        yield Action(
            name="exercise",
            params={
                "exercise_id": exercise.get("id"),
                "course_id": exercise.get("course_id"),
                "knowledge_point_id": exercise.get("knowledge_point_id"),
                "question": exercise.get("question", ""),
                "options": options,
                "difficulty": exercise.get("difficulty", 1),
                "source": exercise.get("source", "unknown"),
            },
        )
