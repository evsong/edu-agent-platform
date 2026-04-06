"""Analytics / BKT / Practice Pydantic schemas."""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class BKTState(BaseModel):
    knowledge_point_id: str
    p_known: float = Field(ge=0.0, le=1.0)
    p_transit: float = Field(ge=0.0, le=1.0, default=0.1)
    p_slip: float = Field(ge=0.0, le=1.0, default=0.1)
    p_guess: float = Field(ge=0.0, le=1.0, default=0.2)


class StudentProfileResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    course_id: uuid.UUID
    bkt_states: Optional[dict[str, Any]]
    overall_mastery: float
    risk_level: str
    last_active: Optional[datetime]

    model_config = {"from_attributes": True}


class ExerciseResponse(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    knowledge_point_id: Optional[uuid.UUID]
    question: str
    options: Optional[dict[str, Any]]
    difficulty: int
    explanation: Optional[str] = None

    model_config = {"from_attributes": True}


class PracticeAnswerRequest(BaseModel):
    exercise_id: uuid.UUID
    answer: str
