"""Director node — LLM-powered routing for the Director Graph."""

from __future__ import annotations

import logging
import re

from langchain_core.messages import HumanMessage

from app.agents.base import AgentRegistry
from app.orchestration.events import Thinking
from app.orchestration.state import DirectorState
from app.services.llm import LLMClient

logger = logging.getLogger(__name__)

# ── Director Prompt Template ─────────────────────────────────────────────

_DIRECTOR_PROMPT = """\
你是 EduAgent 的调度中心。根据用户消息，选择最合适的 Agent 处理。

可用 Agent:
{agent_descriptions}

用户消息: {message}

回复格式: 只输出 agent_id（如 "qa"）或 "END"（无需处理时）。
如果用户意图涉及多个步骤（如"批改作业然后出题"），先选第一步的 Agent。\
"""


async def director_node(state: DirectorState, config: dict) -> dict:
    """LangGraph node: decide which agent should handle the current turn.

    Returns partial state updates:
    - ``current_agent_id`` — the chosen agent (or ``None``).
    - ``turn_count`` — incremented by 1.
    - ``should_end`` — ``True`` when the loop should terminate.
    """
    turn_count: int = state.get("turn_count", 0)
    max_turns: int = state.get("max_turns", 5)

    # ── Safety: enforce turn cap ─────────────────────────────────────
    if turn_count >= max_turns:
        logger.info("Director: max turns (%d) reached — ending", max_turns)
        return {"should_end": True, "current_agent_id": None}

    # ── Extract latest user message ──────────────────────────────────
    messages = state.get("messages", [])
    latest_message = ""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            latest_message = msg.content
            break
        # Handle dict-style messages from raw state
        if isinstance(msg, dict) and msg.get("role") == "user":
            latest_message = msg.get("content", "")
            break
        # LangGraph BaseMessage with type attribute
        if hasattr(msg, "type") and msg.type == "human":
            latest_message = msg.content
            break

    if not latest_message:
        logger.warning("Director: no user message found — ending")
        return {"should_end": True, "current_agent_id": None}

    # ── Shortcut: single agent registered → skip LLM ────────────────
    registered = AgentRegistry.all()
    if len(registered) == 1:
        agent_id = next(iter(registered))
        logger.info("Director: only one agent registered — routing to %s", agent_id)
        return {
            "current_agent_id": agent_id,
            "turn_count": turn_count + 1,
        }

    # ── Emit thinking event ──────────────────────────────────────────
    writer = config.get("configurable", {}).get("writer")
    if writer:
        await writer(Thinking(stage="routing"))

    # ── Build Director prompt and call LLM ───────────────────────────
    agent_descriptions = AgentRegistry.descriptions_for_director()
    prompt_text = _DIRECTOR_PROMPT.format(
        agent_descriptions=agent_descriptions,
        message=latest_message,
    )

    llm_client: LLMClient = config["configurable"]["llm_client"]
    try:
        raw_response = await llm_client.chat(
            messages=[{"role": "user", "content": prompt_text}],
        )
    except Exception:
        logger.exception("Director: LLM call failed — fallback to 'qa'")
        raw_response = "qa"

    # ── Parse response ───────────────────────────────────────────────
    cleaned = raw_response.strip().strip('"').strip("'").lower()

    # Check for explicit END
    if cleaned == "end":
        logger.info("Director: LLM returned END — stopping")
        return {"should_end": True, "current_agent_id": None}

    # Try to match a registered agent_id
    agent_id: str | None = None

    # Exact match first
    if cleaned in registered:
        agent_id = cleaned

    # Regex fallback: find any registered ID in the response
    if agent_id is None:
        for aid in registered:
            if re.search(rf"\b{re.escape(aid)}\b", cleaned):
                agent_id = aid
                break

    # Ultimate fallback: route to "qa"
    if agent_id is None:
        logger.warning(
            "Director: could not parse agent_id from '%s' — fallback to 'qa'",
            raw_response[:100],
        )
        agent_id = "qa" if "qa" in registered else next(iter(registered))

    logger.info("Director: routing to agent '%s' (turn %d)", agent_id, turn_count + 1)
    return {
        "current_agent_id": agent_id,
        "turn_count": turn_count + 1,
    }
