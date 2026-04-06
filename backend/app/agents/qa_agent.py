"""QA Agent — RAG-based question answering over course knowledge."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from typing import Any

from app.agents.base import AgentContext, AgentRegistry, BaseAgent
from app.orchestration.events import Action, TextDelta, Thinking

logger = logging.getLogger(__name__)

_QA_SYSTEM_PROMPT = """\
你是 EduAgent 智能答疑助手。根据以下检索到的课程资料回答学生问题。

要求：
1. 答案必须基于提供的参考资料，不要编造内容。
2. 如果资料不足以回答，请诚实告知并建议学生询问老师。
3. 用清晰、简洁的中文回答。
4. 在回答末尾标注引用来源。

参考资料:
{context}

跨课程关联知识点:
{cross_hints}\
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
        system_prompt = _QA_SYSTEM_PROMPT.format(
            context=context_text,
            cross_hints=cross_hints_text,
        )

        yield Thinking(stage="generating_answer")

        try:
            async for chunk in ctx.llm.stream(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message},
                ],
            ):
                yield TextDelta(content=chunk)
        except Exception:
            logger.exception("QA Agent: LLM stream failed")
            yield TextDelta(content="\n\n抱歉，生成回答时出错，请稍后重试。")

        # ── Step 4: Emit citation action ─────────────────────────────
        if sources:
            yield Action(name="cite", params={"sources": sources})
