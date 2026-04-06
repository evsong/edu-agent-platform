"""Grading-related Pydantic schemas."""

from typing import Any, Optional

from pydantic import BaseModel, Field


class AnnotationSchema(BaseModel):
    paragraph_id: str
    char_start: int
    char_end: int
    original_text: str
    type: str = Field(..., description="e.g. grammar, logic, knowledge, style")
    severity: str = Field(default="info", pattern="^(info|warning|error)$")
    comment: str
    correction: Optional[str] = None
    knowledge_point: Optional[str] = None


class GradingRules(BaseModel):
    rubric: Optional[dict[str, Any]] = None
    max_score: float = 100.0
    annotation_types: list[str] = Field(
        default=["grammar", "logic", "knowledge", "style"]
    )
    strictness: str = Field(default="normal", pattern="^(lenient|normal|strict)$")


class GradingResult(BaseModel):
    score: float
    annotations: list[AnnotationSchema]
    summary: str
    knowledge_points_tested: list[str] = []
