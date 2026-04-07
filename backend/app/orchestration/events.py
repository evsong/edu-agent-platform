"""SSE event dataclasses for the Agent streaming protocol."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class AgentStart:
    """Emitted when an agent begins processing."""

    agent_id: str
    agent_name: str
    type: str = field(default="agent_start", init=False)

    def to_sse(self) -> str:
        return f"data: {json.dumps(asdict(self), ensure_ascii=False)}\n\n"


@dataclass
class TextDelta:
    """Incremental text chunk from an agent's LLM stream."""

    content: str
    type: str = field(default="text_delta", init=False)

    def to_sse(self) -> str:
        return f"data: {json.dumps(asdict(self), ensure_ascii=False)}\n\n"


@dataclass
class Action:
    """Structured action payload (citations, annotations, exercises, etc.)."""

    name: str
    params: dict[str, Any]
    type: str = field(default="action", init=False)

    def to_sse(self) -> str:
        return f"data: {json.dumps(asdict(self), ensure_ascii=False)}\n\n"


@dataclass
class AgentEnd:
    """Emitted when an agent finishes processing."""

    agent_id: str
    type: str = field(default="agent_end", init=False)

    def to_sse(self) -> str:
        return f"data: {json.dumps(asdict(self), ensure_ascii=False)}\n\n"


@dataclass
class Thinking:
    """Emitted to signal intermediate processing stages."""

    stage: str
    type: str = field(default="thinking", init=False)

    def to_sse(self) -> str:
        return f"data: {json.dumps(asdict(self), ensure_ascii=False)}\n\n"


@dataclass
class Done:
    """Emitted as the final event when the graph completes."""

    total_agents: int
    type: str = field(default="done", init=False)

    def to_sse(self) -> str:
        return f"data: {json.dumps(asdict(self), ensure_ascii=False)}\n\n"


@dataclass
class Error:
    """Emitted when an unrecoverable error occurs."""

    message: str
    type: str = field(default="error", init=False)

    def to_sse(self) -> str:
        return f"data: {json.dumps(asdict(self), ensure_ascii=False)}\n\n"
