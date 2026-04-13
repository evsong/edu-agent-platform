"""QA Agent — RAG-based question answering over course knowledge."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from typing import Any

from app.agents.base import AgentContext, AgentRegistry, BaseAgent
from app.orchestration.events import Action, TextDelta, Thinking

logger = logging.getLogger(__name__)

_QA_SYSTEM_PROMPT_WITH_RAG = """\
你是 EduAgent 智能答疑助手。根据以下检索到的课程资料回答学生问题。

要求：
1. 优先基于提供的参考资料回答。
2. 用清晰、简洁的中文回答，适合大学生理解。
3. 如果涉及公式，用规范的数学表达。
4. 在回答末尾标注引用来源。

参考资料:
{context}

跨课程关联知识点:
{cross_hints}\
"""

_QA_SYSTEM_PROMPT_GENERAL = """\
你是 EduAgent 智能答疑助手，专注于高等数学和大学物理的教学辅助。

要求：
1. 用清晰、准确的中文回答学生问题。
2. 适合大学本科生的理解水平。
3. 如果涉及公式，用规范的数学表达。
4. 可以举例说明帮助理解。
5. 回答要简洁但完整，不要重复啰嗦。\
"""


@AgentRegistry.register("qa")
class QAAgent(BaseAgent):
    """Answers student questions using RAG retrieval and knowledge graph."""

    agent_id = "qa"
    name = "智能答疑 Agent"
    description = "回答课程知识问题，基于RAG检索知识库和知识图谱"

    async def handle(
        self, message: str, ctx: AgentContext
    ) -> AsyncGenerator[Any, None]:
        # ── Step 1: RAG retrieval ────────────────────────────────────
        yield Thinking(stage="searching_knowledge_base")

        try:
            results = await ctx.knowledge.search(
                query=message,
                course_id=ctx.course_id,
                top_k=3,
            )
        except Exception:
            logger.exception("QA Agent: knowledge search failed")
            results = []

        # ── Step 2: Build context ────────────────────────────────────
        if results:
            context_parts: list[str] = []
            sources: list[dict] = []
            cross_hints_parts: list[str] = []

            for i, r in enumerate(results, 1):
                context_parts.append(f"[{i}] {r['text']}")
                sources.append({
                    "index": i,
                    "source": r.get("source", "unknown"),
                    "score": round(r.get("score", 0.0), 4),
                })
                for hint in r.get("cross_course_hints", []):
                    hint_text = f"- {hint.get('name', '')} (课程: {hint.get('course_id', '')})"
                    if hint_text not in cross_hints_parts:
                        cross_hints_parts.append(hint_text)

            context_text = "\n\n".join(context_parts)
            cross_hints_text = "\n".join(cross_hints_parts) if cross_hints_parts else "无"
        else:
            context_text = "未找到相关课程资料。"
            cross_hints_text = "无"
            sources = []

        # ── Step 3: Stream LLM response ──────────────────────────────
        # Per-course Agent config (system_prompt + model + temperature)
        agent_cfg = None
        try:
            from app.api.agents import get_active_agent

            db_session = getattr(ctx, "db", None)
            if db_session is not None and ctx.course_id:
                agent_cfg = await get_active_agent(db_session, ctx.course_id, "qa")
        except Exception:
            logger.exception("QA Agent: failed to load per-course config")

        if agent_cfg and agent_cfg.status == "stopped":
            yield TextDelta(
                content="该课程的答疑 Agent 当前已停用，请联系教师启用后再试。"
            )
            return

        if agent_cfg and agent_cfg.system_prompt:
            base_prompt = agent_cfg.system_prompt
            # Still inject RAG context if we have it
            if results:
                system_prompt = (
                    f"{base_prompt}\n\n参考资料:\n{context_text}\n\n"
                    f"跨课程关联知识点:\n{cross_hints_text}"
                )
            else:
                system_prompt = base_prompt
        elif results:
            system_prompt = _QA_SYSTEM_PROMPT_WITH_RAG.format(
                context=context_text,
                cross_hints=cross_hints_text,
            )
        else:
            system_prompt = _QA_SYSTEM_PROMPT_GENERAL

        yield Thinking(stage="generating_answer")

        try:
            async for chunk in ctx.llm.stream(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message},
                ],
                model=agent_cfg.model if agent_cfg else None,
                temperature=agent_cfg.temperature if agent_cfg else None,
            ):
                yield TextDelta(content=chunk)
        except Exception:
            logger.exception("QA Agent: LLM stream failed")
            yield TextDelta(content="\n\n抱歉，生成回答时出错，请稍后重试。")

        # ── Step 4: Emit citation action ─────────────────────────────
        if sources:
            yield Action(name="cite", params={"sources": sources})
