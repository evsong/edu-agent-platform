"""SSE streaming chat endpoint — the primary user-facing Agent interface."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_optional
from app.database import get_db
from app.orchestration.events import AgentEnd, AgentStart, Done, Error, TextDelta

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


# ── Request schema ───────────────────────────────────────────────────────


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    course_id: str = Field(..., min_length=1)


# ── Service factories ───────────────────────────────────────────────────
# These are lazily created per-request to avoid import-time side effects
# from external connections (Milvus, Neo4j, etc.).


def _get_llm_client():
    from app.services.llm import LLMClient

    return LLMClient()


def _get_knowledge_service(llm):
    from app.services.knowledge import KnowledgeService

    return KnowledgeService(llm)


def _get_grading_service(llm):
    from app.services.grading import GradingService

    return GradingService(llm)


def _get_analytics_service(llm):
    from app.services.analytics import AnalyticsService

    return AnalyticsService(llm)


def _get_platform_service(llm):
    from app.services.platform import PlatformService

    return PlatformService(llm)


# ── Endpoint ─────────────────────────────────────────────────────────────


@router.post("/")
async def chat(
    request: ChatRequest,
    current_user=Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """SSE streaming chat endpoint.

    Accepts a user message and course_id, runs the LangGraph Director Graph,
    and streams back SSE events (AgentStart, TextDelta, Action, AgentEnd, Done).

    If the full LangGraph pipeline fails (e.g., Milvus/Neo4j unavailable),
    falls back to a direct LLM call for demo purposes.
    """
    user_id = str(current_user.id) if current_user else "anonymous"

    # ── Try full LangGraph pipeline first ────────────────────────
    try:
        from app.agents.base import AgentContext, AgentRegistry
        from app.orchestration.graph import create_agent_graph
        from langchain_core.messages import HumanMessage

        if not AgentRegistry.all():
            raise RuntimeError("No agents registered in the system.")

        async def event_generator():
            llm = _get_llm_client()
            ctx = AgentContext(
                user_id=user_id,
                course_id=request.course_id,
                knowledge_service=_get_knowledge_service(llm),
                grading_service=_get_grading_service(llm),
                analytics_service=_get_analytics_service(llm),
                platform_service=_get_platform_service(llm),
                llm_client=llm,
                db_session=db,
            )

            initial_state = {
                "messages": [HumanMessage(content=request.message)],
                "user_id": user_id,
                "course_id": request.course_id,
                "current_agent_id": None,
                "turn_count": 0,
                "max_turns": 5,
                "should_end": False,
                "agent_responses": [],
            }

            events_queue: asyncio.Queue = asyncio.Queue()

            async def writer(event):
                await events_queue.put(event)

            agent_count = 0

            async def run_graph():
                nonlocal agent_count
                try:
                    graph = create_agent_graph()
                    result = await graph.ainvoke(
                        initial_state,
                        config={
                            "configurable": {
                                "agent_context": ctx,
                                "llm_client": llm,
                                "writer": writer,
                            },
                        },
                    )
                    agent_count = len(result.get("agent_responses", []))
                except Exception:
                    logger.exception("Agent graph execution failed")
                    await events_queue.put(
                        Error(message="Agent 执行出错，请稍后重试。")
                    )
                finally:
                    await events_queue.put(None)  # sentinel

            task = asyncio.create_task(run_graph())

            try:
                while True:
                    event = await events_queue.get()
                    if event is None:
                        yield Done(total_agents=agent_count).to_sse()
                        break
                    yield event.to_sse()
            except asyncio.CancelledError:
                task.cancel()
                raise
            finally:
                if not task.done():
                    task.cancel()
                    try:
                        await task
                    except (asyncio.CancelledError, Exception):
                        pass

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except Exception as graph_init_err:
        logger.warning(
            "LangGraph pipeline unavailable, falling back to direct LLM: %s",
            graph_init_err,
        )

    # ── Fallback: direct LLM call honoring per-course Agent config ──
    from app.api.agents import get_active_agent

    agent_cfg = await get_active_agent(db, request.course_id, "qa") if request.course_id else None
    agent_name = agent_cfg.name if agent_cfg else "智能答疑 Agent"
    system_prompt = (
        agent_cfg.system_prompt
        if agent_cfg and agent_cfg.system_prompt
        else (
            "你是EduAgent智能助教，专注于高等数学和大学物理的教学辅助。"
            "请用中文回答学生的问题。回答要准确、有条理，适当使用公式。"
        )
    )
    agent_model = agent_cfg.model if agent_cfg else None
    agent_temperature = agent_cfg.temperature if agent_cfg else None
    agent_stopped = agent_cfg.status == "stopped" if agent_cfg else False

    async def fallback_stream():
        yield AgentStart(agent_id="qa", agent_name=agent_name).to_sse()
        if agent_stopped:
            yield Error(message="该课程的答疑 Agent 当前已停用，请联系教师启用。").to_sse()
            yield AgentEnd(agent_id="qa").to_sse()
            yield Done(total_agents=1).to_sse()
            return
        try:
            llm = _get_llm_client()
            async for chunk in llm.stream(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": request.message},
                ],
                model=agent_model,
                temperature=agent_temperature,
            ):
                yield TextDelta(content=chunk).to_sse()
        except Exception as llm_error:
            logger.exception("Fallback LLM call failed")
            yield Error(message=f"LLM 调用失败: {llm_error}").to_sse()
        yield AgentEnd(agent_id="qa").to_sse()
        yield Done(total_agents=1).to_sse()

    return StreamingResponse(
        fallback_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
