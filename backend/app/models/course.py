"""Course and CourseEnrollment models."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    teacher = relationship("User", back_populates="taught_courses", lazy="selectin")
    enrollments = relationship("CourseEnrollment", back_populates="course", lazy="selectin")
    assignments = relationship("Assignment", back_populates="course", lazy="selectin")
    knowledge_points = relationship("KnowledgePoint", back_populates="course", lazy="selectin")
    exercises = relationship("Exercise", back_populates="course", lazy="selectin")
    student_profiles = relationship("StudentProfile", back_populates="course", lazy="selectin")


class CourseEnrollment(Base):
    __tablename__ = "course_enrollments"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id"), primary_key=True
    )
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    user = relationship("User", back_populates="enrollments", lazy="selectin")
    course = relationship("Course", back_populates="enrollments", lazy="selectin")
