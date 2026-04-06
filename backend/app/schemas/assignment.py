"""Assignment and Submission Pydantic schemas."""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class AssignmentCreate(BaseModel):
    course_id: uuid.UUID
    title: str = Field(..., min_length=1, max_length=500)
    content: Optional[str] = None
    due_date: Optional[datetime] = None
    grading_rules: Optional[dict[str, Any]] = None


class SubmissionCreate(BaseModel):
    assignment_id: uuid.UUID
    content: str


class SubmissionResponse(BaseModel):
    id: uuid.UUID
    assignment_id: uuid.UUID
    student_id: uuid.UUID
    content: Optional[str]
    status: str
    score: Optional[float]
    annotations: Optional[dict[str, Any]]
    created_at: datetime

    model_config = {"from_attributes": True}
