"""SSE streaming chat endpoint — the primary user-facing Agent interface."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.orchestration.events import Done, Error

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
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """SSE streaming chat endpoint.

    Accepts a user message and course_id, runs the LangGraph Director Graph,
    and streams back SSE events (AgentStart, TextDelta, Action, AgentEnd, Done).
    """
    # Import here to ensure agent modules have been registered
    from app.agents.base import AgentContext, AgentRegistry
    from app.orchestration.graph import create_agent_graph

    # Ensure at least one agent is registered
    if not AgentRegistry.all():
        raise HTTPException(
            status_code=500, detail="No agents registered in the system."
        )

    async def event_generator():
        # ── Build services ───────────────────────────────────────
        llm = _get_llm_client()
        ctx = AgentContext(
            user_id=str(current_user.id),
            course_id=request.course_id,
            knowledge_service=_get_knowledge_service(llm),
            grading_service=_get_grading_service(llm),
            analytics_service=_get_analytics_service(llm),
            platform_service=_get_platform_service(llm),
            llm_client=llm,
            db_session=db,
        )

        # ── Initial state ────────────────────────────────────────
        initial_state = {
            "messages": [HumanMessage(content=request.message)],
            "user_id": str(current_user.id),
            "course_id": request.course_id,
            "current_agent_id": None,
            "turn_count": 0,
            "max_turns": 5,
            "should_end": False,
            "agent_responses": [],
        }

        # ── Event queue for bridging graph ↔ SSE ─────────────────
        events_queue: asyncio.Queue = asyncio.Queue()

        async def writer(event):
            await events_queue.put(event)

        # ── Run graph in background task ─────────────────────────
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

        # ── Yield SSE events ─────────────────────────────────────
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
