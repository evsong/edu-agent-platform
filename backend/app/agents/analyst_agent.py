"""Analyst Agent — learning analytics, ability profiles, and class reports."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from typing import Any

from app.agents.base import AgentContext, AgentRegistry, BaseAgent
from app.orchestration.events import Action, TextDelta, Thinking

logger = logging.getLogger(__name__)

_ANALYSIS_SYSTEM_PROMPT = """\
你是 EduAgent 学情分析专家。根据以下学生能力画像数据，生成简洁的学情分析报告。

要求：
1. 分析各知识点的掌握程度，重点列出薄弱环节（掌握率<50%的）。
2. 给出学习优先级建议。
3. 以鼓励为主，帮助学生建立信心。
4. 用清晰的中文回答。
5. 保持简洁，控制在 300 字以内。

重要：你只负责学情分析，不要出练习题。练习题会由专门的练习生成 Agent 负责。

学生画像数据:
{profile_data}\
"""


@AgentRegistry.register("analyst")
class AnalystAgent(BaseAgent):
    """Analyzes student learning data and generates ability profiles."""

    agent_id = "analyst"
    name = "学情分析 Agent"
    description = "分析学生学习情况，生成能力画像和学情报告"

    async def handle(
        self, message: str, ctx: AgentContext
    ) -> AsyncGenerator[Any, None]:
        import uuid as _uuid

        # ── Step 1: Load student profile ─────────────────────────────
        yield Thinking(stage="loading_profile")

        try:
            user_uuid = _uuid.UUID(ctx.user_id)
            course_uuid = _uuid.UUID(ctx.course_id)
        except ValueError:
            yield TextDelta(content="无效的用户或课程 ID，无法生成分析报告。")
            return

        try:
            profile = await ctx.analytics.get_profile(
                db=ctx.db,
                user_id=user_uuid,
                course_id=course_uuid,
            )
        except Exception:
            logger.exception("Analyst Agent: profile loading failed")
            yield TextDelta(content="加载学生画像时出错，请稍后重试。")
            return

        # ── Step 2: Build profile summary ────────────────────────────
        bkt_states = profile.bkt_states or {}
        overall_mastery = profile.overall_mastery or 0.0
        risk_level = profile.risk_level or "normal"

        # Prepare radar-chart data for the frontend
        radar_data: list[dict[str, Any]] = []
        for kp_id, params in bkt_states.items():
            mastery = params.get("probMastery", 0.3)
            radar_data.append({
                "kp_id": kp_id,
                "mastery": round(mastery, 4),
            })

        profile_summary = (
            f"整体掌握度: {overall_mastery:.1%}\n"
            f"风险等级: {risk_level}\n"
            f"知识点状态:\n"
        )
        for item in radar_data:
            mastery_pct = f"{item['mastery']:.1%}"
            status = "✓ 已掌握" if item["mastery"] >= 0.8 else (
                "△ 进行中" if item["mastery"] >= 0.5 else "✗ 薄弱"
            )
            profile_summary += f"  - {item['kp_id']}: {mastery_pct} ({status})\n"

        # ── Step 3: Stream LLM analysis ──────────────────────────────
        yield Thinking(stage="generating_analysis")

        system_prompt = _ANALYSIS_SYSTEM_PROMPT.format(profile_data=profile_summary)

        try:
            async for chunk in ctx.llm.stream(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message},
                ],
            ):
                yield TextDelta(content=chunk)
        except Exception:
            logger.exception("Analyst Agent: LLM stream failed")
            yield TextDelta(content="\n\n生成分析报告时出错，请稍后重试。")

        # ── Step 4: Emit profile action ──────────────────────────────
        yield Action(
            name="profile",
            params={
                "overall_mastery": round(overall_mastery, 4),
                "risk_level": risk_level,
                "radar_data": radar_data,
            },
        )
