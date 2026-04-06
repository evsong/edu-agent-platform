"""Grader Agent — position-level assignment annotation."""

from __future__ import annotations

import logging
import re
from collections.abc import AsyncGenerator
from typing import Any

from app.agents.base import AgentContext, AgentRegistry, BaseAgent
from app.orchestration.events import Action, TextDelta, Thinking

logger = logging.getLogger(__name__)


@AgentRegistry.register("grader")
class GraderAgent(BaseAgent):
    """Grades student submissions with position-level annotations."""

    agent_id = "grader"
    name = "作业批改 Agent"
    description = "批改学生作业，提供位置级精细化批注"

    async def handle(
        self, message: str, ctx: AgentContext
    ) -> AsyncGenerator[Any, None]:
        # ── Step 1: Parse submission_id from message ─────────────────
        yield Thinking(stage="parsing_submission")

        submission_id: str | None = None
        # Try to find a UUID-like string in the message
        uuid_match = re.search(
            r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
            message,
        )
        if uuid_match:
            submission_id = uuid_match.group()

        # Also try to find "submission_id: xxx" or "提交 xxx" patterns
        if submission_id is None:
            id_match = re.search(
                r"(?:submission_id|提交|作业)[:\s：]+([0-9a-fA-F-]+)",
                message,
            )
            if id_match:
                submission_id = id_match.group(1)

        if submission_id is None:
            yield TextDelta(
                content="请提供需要批改的作业提交 ID。\n"
                "格式示例: `请批改作业 550e8400-e29b-41d4-a716-446655440000`"
            )
            return

        # ── Step 2: Grade submission ─────────────────────────────────
        yield Thinking(stage="grading_submission")

        try:
            result = await ctx.grading.grade_submission(
                submission_id=submission_id,
                content=message,
                course_id=ctx.course_id,
                db=ctx.db,
            )
        except Exception:
            logger.exception("Grader Agent: grading failed for %s", submission_id)
            yield TextDelta(content="批改过程中出现错误，请稍后重试。")
            return

        # ── Step 3: Stream summary ───────────────────────────────────
        score = result.get("overall_score", 0)
        summary = result.get("summary", "批改完成。")
        strengths = result.get("strengths", [])
        improvements = result.get("improvements", [])

        yield TextDelta(content=f"## 批改结果\n\n**得分: {score}**\n\n")
        yield TextDelta(content=f"{summary}\n\n")

        if strengths:
            yield TextDelta(content="### 优点\n")
            for s in strengths:
                yield TextDelta(content=f"- {s}\n")
            yield TextDelta(content="\n")

        if improvements:
            yield TextDelta(content="### 改进建议\n")
            for imp in improvements:
                yield TextDelta(content=f"- {imp}\n")
            yield TextDelta(content="\n")

        # ── Step 4: Emit annotations action ──────────────────────────
        annotations = result.get("annotations", [])
        yield Action(
            name="annotations",
            params={
                "submission_id": submission_id,
                "score": score,
                "annotations": annotations,
            },
        )
