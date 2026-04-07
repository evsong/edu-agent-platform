"""AgentConfig model — per-course AI agent configuration."""

import uuid

from sqlalchemy import String, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AgentConfig(Base):
    __tablename__ = "agent_configs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    agent_id: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # qa, grader, tutor, analyst, meta
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="stopped"
    )
    model: Mapped[str] = mapped_column(
        String(100), nullable=False, default="GPT-5.4"
    )
    temperature: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.3
    )
    knowledge_base: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    grading_rules: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    icon: Mapped[str | None] = mapped_column(
        String(100), nullable=True, default="ri-robot-2-line"
    )

    # Relationships
    course = relationship("Course", lazy="selectin")
