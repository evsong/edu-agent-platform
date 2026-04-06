"""Meta Agent — course configuration and knowledge base management."""

from __future__ import annotations

import logging
import re
from collections.abc import AsyncGenerator
from typing import Any

from app.agents.base import AgentContext, AgentRegistry, BaseAgent
from app.orchestration.events import Action, TextDelta, Thinking

logger = logging.getLogger(__name__)

# Supported meta-commands (simple pattern matching)
_COMMANDS = {
    "list_agents": re.compile(r"(?:列出|查看|显示).*(agent|代理|智能体)", re.IGNORECASE),
    "get_graph": re.compile(r"(?:知识|图谱|knowledge).*(图|graph|结构)", re.IGNORECASE),
    "course_info": re.compile(r"(?:课程|course).*(信息|配置|设置|info|config)", re.IGNORECASE),
    "grading_rules": re.compile(r"(?:批改|评分|grading).*(规则|标准|rules)", re.IGNORECASE),
}


@AgentRegistry.register("meta")
class MetaAgent(BaseAgent):
    """Manages course configuration, agent settings, and knowledge base."""

    agent_id = "meta"
    name = "课程管理 Agent"
    description = "管理课程配置、Agent设置和知识库"

    async def handle(
        self, message: str, ctx: AgentContext
    ) -> AsyncGenerator[Any, None]:
        # ── Parse command ────────────────────────────────────────────
        yield Thinking(stage="parsing_command")

        command: str | None = None
        for cmd_name, pattern in _COMMANDS.items():
            if pattern.search(message):
                command = cmd_name
                break

        # ── Dispatch ─────────────────────────────────────────────────
        if command == "list_agents":
            handler = self._handle_list_agents(ctx)
        elif command == "get_graph":
            handler = self._handle_get_graph(ctx)
        elif command == "course_info":
            handler = self._handle_course_info(ctx)
        elif command == "grading_rules":
            handler = self._handle_grading_rules(ctx)
        else:
            handler = self._handle_general(message, ctx)

        async for event in handler:
            yield event

    # ── Sub-handlers ─────────────────────────────────────────────────

    async def _handle_list_agents(
        self, ctx: AgentContext
    ) -> AsyncGenerator[Any, None]:
        from app.agents.base import AgentRegistry

        yield TextDelta(content="## 当前可用 Agent\n\n")
        for aid, agent in AgentRegistry.all().items():
            yield TextDelta(
                content=f"- **{agent.name}** (`{aid}`): {agent.description}\n"
            )
        yield TextDelta(content="\n共 {} 个 Agent 已注册。\n".format(len(AgentRegistry.all())))

    async def _handle_get_graph(
        self, ctx: AgentContext
    ) -> AsyncGenerator[Any, None]:
        yield Thinking(stage="loading_knowledge_graph")

        try:
            graph_data = await ctx.knowledge.get_graph(course_id=ctx.course_id)
        except Exception:
            logger.exception("Meta Agent: knowledge graph retrieval failed")
            yield TextDelta(content="获取知识图谱时出错，请稍后重试。")
            return

        nodes = graph_data.get("nodes", [])
        edges = graph_data.get("edges", [])

        yield TextDelta(
            content=f"## 知识图谱概览\n\n"
            f"- 知识点节点: {len(nodes)} 个\n"
            f"- 关系边: {len(edges)} 条\n\n"
        )

        if nodes:
            yield TextDelta(content="### 知识点列表\n")
            for node in nodes[:20]:  # cap display at 20
                yield TextDelta(
                    content=f"- {node.get('name', 'N/A')} (难度: {node.get('difficulty', '?')})\n"
                )
            if len(nodes) > 20:
                yield TextDelta(content=f"\n... 还有 {len(nodes) - 20} 个知识点\n")

        yield Action(name="graph", params=graph_data)

    async def _handle_course_info(
        self, ctx: AgentContext
    ) -> AsyncGenerator[Any, None]:
        yield TextDelta(
            content=f"## 课程信息\n\n"
            f"- 课程 ID: `{ctx.course_id}`\n"
            f"- 当前用户: `{ctx.user_id}`\n\n"
            f"如需修改课程配置，请通过教师管理面板操作。\n"
        )

    async def _handle_grading_rules(
        self, ctx: AgentContext
    ) -> AsyncGenerator[Any, None]:
        yield Thinking(stage="loading_grading_rules")

        try:
            rules = await ctx.grading.get_grading_rules(ctx.course_id, ctx.db)
        except Exception:
            logger.exception("Meta Agent: grading rules retrieval failed")
            yield TextDelta(content="获取批改规则时出错。")
            return

        if rules:
            yield TextDelta(content="## 当前批改规则\n\n```json\n")
            import json

            yield TextDelta(content=json.dumps(rules, ensure_ascii=False, indent=2))
            yield TextDelta(content="\n```\n")
        else:
            yield TextDelta(content="当前课程未设置自定义批改规则，使用默认配置。\n")

        yield Action(name="grading_rules", params={"rules": rules})

    async def _handle_general(
        self, message: str, ctx: AgentContext
    ) -> AsyncGenerator[Any, None]:
        """Fallback: use LLM to handle unrecognized management queries."""
        yield TextDelta(content="## 课程管理助手\n\n")

        system_prompt = (
            "你是 EduAgent 课程管理助手，帮助教师管理课程配置。\n"
            "可用功能: 查看Agent列表、知识图谱、课程信息、批改规则。\n"
            "如果用户的请求不在你的能力范围内，请建议合适的操作方式。"
        )

        try:
            async for chunk in ctx.llm.stream(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message},
                ],
            ):
                yield TextDelta(content=chunk)
        except Exception:
            logger.exception("Meta Agent: LLM stream failed")
            yield TextDelta(content="处理请求时出错，请稍后重试。")
