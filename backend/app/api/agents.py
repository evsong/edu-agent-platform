"""Agents API — CRUD for AgentConfig + status toggle."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.agent_config import AgentConfig

router = APIRouter(prefix="/api/agents", tags=["agents"])


# ── Request / Response schemas ────────────────────────────────


class AgentConfigCreate(BaseModel):
    name: str
    course_id: uuid.UUID
    agent_id: str
    model: str = "GPT-5.4"
    temperature: float = 0.3
    knowledge_base: Optional[str] = None
    grading_rules: Optional[str] = None
    icon: Optional[str] = "ri-robot-2-line"


class AgentConfigUpdate(BaseModel):
    name: Optional[str] = None
    course_id: Optional[uuid.UUID] = None
    agent_id: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    knowledge_base: Optional[str] = None
    grading_rules: Optional[str] = None
    icon: Optional[str] = None
    status: Optional[str] = None


# ── Helper ────────────────────────────────────────────────────


def _serialize(agent: AgentConfig) -> dict:
    """Convert an AgentConfig (with joined course) to API response dict."""
    return {
        "id": str(agent.id),
        "agent_id": agent.agent_id,
        "name": agent.name,
        "course_id": str(agent.course_id),
        "course_name": agent.course.name if agent.course else None,
        "status": agent.status,
        "model": agent.model,
        "temperature": agent.temperature,
        "knowledge_base": agent.knowledge_base,
        "grading_rules": agent.grading_rules,
        "icon": agent.icon,
    }


# ── Endpoints ─────────────────────────────────────────────────


@router.get("")
async def list_agents(db: AsyncSession = Depends(get_db)):
    """List all agent configs with course name."""
    result = await db.execute(select(AgentConfig))
    agents = result.scalars().all()
    return [_serialize(a) for a in agents]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_agent(payload: AgentConfigCreate, db: AsyncSession = Depends(get_db)):
    """Create a new agent config."""
    agent = AgentConfig(
        agent_id=payload.agent_id,
        name=payload.name,
        course_id=payload.course_id,
        model=payload.model,
        temperature=payload.temperature,
        knowledge_base=payload.knowledge_base,
        grading_rules=payload.grading_rules,
        icon=payload.icon,
    )
    db.add(agent)
    await db.flush()
    await db.refresh(agent)
    return _serialize(agent)


@router.put("/{agent_config_id}")
async def update_agent(
    agent_config_id: uuid.UUID,
    payload: AgentConfigUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing agent config."""
    result = await db.execute(
        select(AgentConfig).where(AgentConfig.id == agent_config_id)
    )
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent config not found",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(agent, field, value)

    await db.flush()
    await db.refresh(agent)
    return _serialize(agent)


@router.delete("/{agent_config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_config_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete an agent config."""
    result = await db.execute(
        select(AgentConfig).where(AgentConfig.id == agent_config_id)
    )
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent config not found",
        )

    await db.delete(agent)
    await db.flush()


@router.post("/{agent_config_id}/toggle")
async def toggle_agent(
    agent_config_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Flip agent status between 'running' and 'stopped'."""
    result = await db.execute(
        select(AgentConfig).where(AgentConfig.id == agent_config_id)
    )
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent config not found",
        )

    agent.status = "stopped" if agent.status == "running" else "running"
    await db.flush()
    await db.refresh(agent)
    return _serialize(agent)
