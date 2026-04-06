"""Exercise model."""

import uuid

from sqlalchemy import String, Integer, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False
    )
    knowledge_point_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge_points.id"), nullable=True
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    answer: Mapped[str | None] = mapped_column(String(500), nullable=True)
    difficulty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    course = relationship("Course", back_populates="exercises", lazy="selectin")
    knowledge_point = relationship("KnowledgePoint", back_populates="exercises", lazy="selectin")
