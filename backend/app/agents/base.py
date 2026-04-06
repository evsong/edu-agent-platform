"""BaseAgent SDK — abstract agent, injected context, and global registry."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.analytics import AnalyticsService
from app.services.grading import GradingService
from app.services.knowledge import KnowledgeService
from app.services.llm import LLMClient
from app.services.platform import PlatformService

logger = logging.getLogger(__name__)


# ── Agent Context ────────────────────────────────────────────────────────


class AgentContext:
    """Injected dependencies available to every agent during ``handle()``.

    Attributes
    ----------
    user_id : str
        Authenticated user ID.
    course_id : str
        Active course context.
    knowledge : KnowledgeService
        RAG + knowledge graph operations.
    grading : GradingService
        Position-level annotation pipeline.
    analytics : AnalyticsService
        BKT tracking, profiles, exercise selection.
    platform : PlatformService
        LTI + DingTalk integration.
    llm : LLMClient
        Shared LLM client (chat / stream / embed).
    db : AsyncSession
        Database session for the current request.
    session : dict
        Ephemeral per-conversation state that agents can read/write.
    """

    def __init__(
        self,
        user_id: str,
        course_id: str,
        knowledge_service: KnowledgeService,
        grading_service: GradingService,
        analytics_service: AnalyticsService,
        platform_service: PlatformService,
        llm_client: LLMClient,
        db_session: AsyncSession,
    ) -> None:
        self.user_id = user_id
        self.course_id = course_id
        self.knowledge = knowledge_service
        self.grading = grading_service
        self.analytics = analytics_service
        self.platform = platform_service
        self.llm = llm_client
        self.db = db_session
        self.session: dict[str, Any] = {}


# ── Base Agent ───────────────────────────────────────────────────────────


class BaseAgent(ABC):
    """Abstract base class for all EduAgent agents.

    Subclasses **must** define ``agent_id``, ``name``, ``description`` as
    class attributes and implement the async generator ``handle()``.
    """

    agent_id: str
    name: str
    description: str  # used by the Director for routing decisions

    @abstractmethod
    async def handle(
        self, message: str, ctx: AgentContext
    ) -> AsyncGenerator[Any, None]:
        """Process *message* and yield SSE event objects (TextDelta, Action, …).

        This is an async generator — use ``yield`` to emit events.
        """
        ...  # pragma: no cover
        # Make it a valid async generator so the ABC is happy
        if False:
            yield  # type: ignore[misc]


# ── Agent Registry ───────────────────────────────────────────────────────


class AgentRegistry:
    """Global registry of available agents.

    Use the ``@AgentRegistry.register("agent_id")`` decorator on agent
    subclasses to automatically register them at import time.
    """

    _agents: dict[str, BaseAgent] = {}

    @classmethod
    def register(cls, agent_id: str):
        """Class decorator that instantiates and registers an agent."""

        def wrapper(agent_cls: type[BaseAgent]):
            instance = agent_cls()
            cls._agents[agent_id] = instance
            logger.info("Registered agent: %s (%s)", agent_id, instance.name)
            return agent_cls

        return wrapper

    @classmethod
    def get(cls, agent_id: str) -> BaseAgent:
        """Retrieve a registered agent by ID. Raises ``KeyError`` if missing."""
        return cls._agents[agent_id]

    @classmethod
    def all(cls) -> dict[str, BaseAgent]:
        """Return the full registry mapping."""
        return cls._agents

    @classmethod
    def descriptions_for_director(cls) -> str:
        """Format agent descriptions for injection into the Director prompt."""
        lines: list[str] = []
        for aid, agent in cls._agents.items():
            lines.append(f"- {aid}: {agent.name} — {agent.description}")
        return "\n".join(lines)
