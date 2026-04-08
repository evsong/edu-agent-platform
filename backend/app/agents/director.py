"""Director node — LLM-powered routing for the Director Graph.

Supports multi-agent chaining: after each agent completes, Director
reviews the conversation context and decides whether to route to
another agent or terminate.
"""

from __future__ import annotations

import logging
import re

from langchain_core.messages import HumanMessage

from app.agents.base import AgentRegistry
from app.orchestration.events import Thinking
from app.orchestration.state import DirectorState
from app.services.llm import LLMClient

logger = logging.getLogger(__name__)

# ── Director Prompt Templates ────────────────────────────────────────────

_FIRST_TURN_PROMPT = """\
你是 EduAgent 的调度中心。根据用户消息，选择最合适的 Agent 处理。

可用 Agent:
{agent_descriptions}

用户消息: {message}

回复格式: 只输出 agent_id（如 "qa"）或 "END"（无需处理时）。
如果用户意图涉及多个步骤（如"批改作业然后出练习题"），先选第一步的 Agent。\
"""

_CONTINUATION_PROMPT = """\
你是 EduAgent 的调度中心。上一轮已有 Agent 完成了工作，请判断是否需要继续调度下一个 Agent。

可用 Agent:
{agent_descriptions}

用户原始消息: {message}

已完成的 Agent:
{completed_summary}

请判断：用户的请求是否还有未完成的部分？
- 如果还需要其他 Agent 处理，输出该 agent_id
- 如果所有步骤已完成，输出 "END"

只输出 agent_id 或 "END"，不要解释。\
"""


async def director_node(state: DirectorState, config: dict) -> dict:
    """LangGraph node: decide which agent should handle the current turn.

    On the first turn, routes based on user message.
    On subsequent turns, reviews completed agents and decides next step.
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
        if isinstance(msg, dict) and msg.get("role") == "user":
            latest_message = msg.get("content", "")
            break
        if hasattr(msg, "type") and msg.type == "human":
            latest_message = msg.content
            break

    if not latest_message:
        logger.warning("Director: no user message found — ending")
        return {"should_end": True, "current_agent_id": None}

    # ── Shortcut: single agent registered → skip LLM ────────────────
    registered = AgentRegistry.all()
    if len(registered) == 1:
        if turn_count == 0:
            agent_id = next(iter(registered))
            logger.info("Director: only one agent registered — routing to %s", agent_id)
            return {"current_agent_id": agent_id, "turn_count": turn_count + 1}
        else:
            return {"should_end": True, "current_agent_id": None}

    # ── Emit thinking event ──────────────────────────────────────────
    writer = config.get("configurable", {}).get("writer")
    if writer:
        await writer(Thinking(stage="routing"))

    # ── Build prompt ─────────────────────────────────────────────────
    agent_descriptions = AgentRegistry.descriptions_for_director()
    agent_responses = state.get("agent_responses", [])

    if not agent_responses:
        # First turn: route based on user message
        prompt_text = _FIRST_TURN_PROMPT.format(
            agent_descriptions=agent_descriptions,
            message=latest_message,
        )
    else:
        # Continuation: review completed agents, decide next step
        completed_summary = "\n".join(
            f"- {r['agent_id']}: 已完成（输出 {len(r.get('content', ''))} 字）"
            for r in agent_responses
        )
        prompt_text = _CONTINUATION_PROMPT.format(
            agent_descriptions=agent_descriptions,
            message=latest_message,
            completed_summary=completed_summary,
        )

    # ── Call LLM ─────────────────────────────────────────────────────
    llm_client: LLMClient = config["configurable"]["llm_client"]
    try:
        raw_response = await llm_client.chat(
            messages=[
                {
                    "role": "system",
                    "content": "你是一个路由器。只输出一个 agent_id 或 END。不要输出其他内容。",
                },
                {"role": "user", "content": prompt_text},
            ],
        )
    except Exception:
        logger.exception("Director: LLM call failed — fallback to 'qa'")
        raw_response = "qa" if not agent_responses else "end"

    logger.info("Director: LLM raw response = '%s'", raw_response[:100] if raw_response else "(empty)")

    # ── Parse response ───────────────────────────────────────────────
    cleaned = raw_response.strip().strip('"').strip("'").lower()
    completed_ids = {r["agent_id"] for r in agent_responses}

    # Try to match a registered agent_id from LLM response
    agent_id: str | None = None

    if cleaned != "end" and cleaned:
        # Exact match first
        if cleaned in registered:
            agent_id = cleaned
        # Regex fallback: find any registered ID in the response
        if agent_id is None:
            for aid in registered:
                if re.search(rf"\b{re.escape(aid)}\b", cleaned):
                    agent_id = aid
                    break

    # Keyword-based fallback — skip already-completed agents
    if agent_id is None:
        msg_lower = latest_message.lower()
        keyword_map = [
            (["批改", "批注", "评分", "打分"], "grader"),
            (["分析", "学情", "画像", "掌握"], "analyst"),
            (["练习", "出题", "做题", "习题"], "tutor"),
            (["配置", "设置", "管理", "agent"], "meta"),
        ]
        for keywords, aid in keyword_map:
            if aid in registered and aid not in completed_ids and any(k in msg_lower for k in keywords):
                agent_id = aid
                logger.info("Director: keyword fallback matched '%s' (skipping completed: %s)", aid, completed_ids)
                break

    # If continuation turn and no uncompleted agent found → done
    if agent_id is None and agent_responses:
        logger.info("Director: no uncompleted agent found — ending (completed: %s)", completed_ids)
        return {"should_end": True, "current_agent_id": None}

    # Check for explicit END only on first turn (continuation uses keyword fallback above)
    if agent_id is None and cleaned == "end":
        logger.info("Director: LLM returned END — stopping")
        return {"should_end": True, "current_agent_id": None}

    # Ultimate fallback (first turn only): route to "qa"
    if agent_id is None:
        logger.warning(
            "Director: could not parse agent_id from '%s' — fallback to 'qa'",
            raw_response[:100] if raw_response else "(empty)",
        )
        agent_id = "qa" if "qa" in registered else next(iter(registered))

    # Prevent routing to same agent twice in a row
    completed_ids = [r["agent_id"] for r in agent_responses]
    if agent_id in completed_ids:
        logger.info("Director: agent '%s' already completed — ending", agent_id)
        return {"should_end": True, "current_agent_id": None}

    logger.info(
        "Director: routing to agent '%s' (turn %d, completed: %s)",
        agent_id, turn_count + 1, completed_ids or "none",
    )
    return {
        "current_agent_id": agent_id,
        "turn_count": turn_count + 1,
    }
