"""LangGraph StateGraph assembly — Director → Agent loop."""

from __future__ import annotations

import logging
from typing import Any

from langgraph.graph import END, START, StateGraph

from app.agents.base import AgentRegistry
from app.agents.director import director_node
from app.orchestration.events import AgentEnd, AgentStart, TextDelta
from app.orchestration.state import DirectorState

logger = logging.getLogger(__name__)


# ── Routing predicate ────────────────────────────────────────────────────


def should_continue(state: DirectorState) -> str:
    """Decide whether to dispatch to an agent or terminate the graph."""
    if state.get("should_end") or not state.get("current_agent_id"):
        return "end"
    return "agent"


# ── Agent execution node ─────────────────────────────────────────────────


async def agent_generate_node(state: DirectorState, config: dict) -> dict:
    """Execute the agent selected by the Director and collect its output.

    Streams SSE events via the ``writer`` callback if provided.
    """
    agent_id: str = state["current_agent_id"]

    try:
        agent = AgentRegistry.get(agent_id)
    except KeyError:
        logger.error("Agent '%s' not found in registry — skipping", agent_id)
        return {"current_agent_id": None}

    ctx = config["configurable"]["agent_context"]
    writer = config.get("configurable", {}).get("writer")

    # Extract the latest message content
    messages = state.get("messages", [])
    message = ""
    if messages:
        last_msg = messages[-1]
        if hasattr(last_msg, "content"):
            message = last_msg.content
        elif isinstance(last_msg, dict):
            message = last_msg.get("content", "")

    # Notify: agent started
    if writer:
        await writer(AgentStart(agent_id=agent_id, agent_name=agent.name))

    # Collect text chunks for the accumulated response
    text_chunks: list[str] = []

    try:
        async for event in agent.handle(message, ctx):
            if writer:
                await writer(event)
            if isinstance(event, TextDelta):
                text_chunks.append(event.content)
    except Exception:
        logger.exception("Agent '%s' raised an exception during handle()", agent_id)

    # Notify: agent ended
    if writer:
        await writer(AgentEnd(agent_id=agent_id))

    return {
        "agent_responses": [
            {"agent_id": agent_id, "content": "".join(text_chunks)}
        ],
        "current_agent_id": None,
        "should_end": True,  # One agent response per user message — no loop
    }


# ── Graph factory ────────────────────────────────────────────────────────


def create_agent_graph() -> Any:
    """Build and compile the Director → Agent LangGraph StateGraph.

    Graph topology::

        START → director → (should_continue) ──┬── "agent" → agent_generate → director
                                                └── "end"  → END
    """
    graph = StateGraph(DirectorState)

    # Nodes
    graph.add_node("director", director_node)
    graph.add_node("agent_generate", agent_generate_node)

    # Edges
    graph.add_edge(START, "director")
    graph.add_conditional_edges(
        "director",
        should_continue,
        {"agent": "agent_generate", "end": END},
    )
    graph.add_edge("agent_generate", "director")

    return graph.compile()
