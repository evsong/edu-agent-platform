"""Course-related Pydantic schemas."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CourseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)


class CourseResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    teacher_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}
