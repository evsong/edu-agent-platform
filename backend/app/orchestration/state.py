"""DirectorState — LangGraph state schema for the Director Graph."""

from __future__ import annotations

from typing import Annotated, Optional, TypedDict

from langgraph.graph import add_messages


class DirectorState(TypedDict):
    """State for the LangGraph Director Graph.

    Uses ``add_messages`` reducer so LangGraph correctly appends new
    messages instead of overwriting the list.

    Fields
    ------
    messages : list
        Conversation history (uses LangGraph ``add_messages`` reducer).
    user_id : str
        ID of the authenticated user.
    course_id : str
        ID of the active course context.
    current_agent_id : str | None
        Which agent the Director routed to this turn.
    turn_count : int
        How many Director→Agent cycles have executed.
    max_turns : int
        Safety cap on routing cycles (default 5).
    should_end : bool
        Set to ``True`` when the graph should terminate.
    agent_responses : list
        Accumulated ``{agent_id, content}`` dicts from each agent turn.
    """

    messages: Annotated[list, add_messages]
    user_id: str
    course_id: str
    current_agent_id: Optional[str]
    turn_count: int
    max_turns: int
    should_end: bool
    agent_responses: list
