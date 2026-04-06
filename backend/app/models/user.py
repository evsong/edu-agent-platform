"""User model."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(512), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="student")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    taught_courses = relationship("Course", back_populates="teacher", lazy="selectin")
    enrollments = relationship("CourseEnrollment", back_populates="user", lazy="selectin")
    submissions = relationship("Submission", back_populates="student", lazy="selectin")
    student_profiles = relationship("StudentProfile", back_populates="user", lazy="selectin")
    platform_users = relationship("PlatformUser", back_populates="user", lazy="selectin")
    xapi_statements = relationship("XAPIStatement", back_populates="user", lazy="selectin")
