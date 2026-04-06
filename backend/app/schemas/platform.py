"""Platform integration schemas: LTI, DingTalk, xAPI."""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class LTILaunchData(BaseModel):
    iss: str
    sub: str
    aud: str
    name: Optional[str] = None
    email: Optional[str] = None
    roles: list[str] = []
    context_id: Optional[str] = None
    context_title: Optional[str] = None
    resource_link_id: Optional[str] = None


class DingTalkMessage(BaseModel):
    msgtype: str = "text"
    text: Optional[dict[str, str]] = None
    markdown: Optional[dict[str, str]] = None
    at: Optional[dict[str, Any]] = None


class XAPIStatement(BaseModel):
    user_id: uuid.UUID
    verb: str
    object_type: str
    object_id: str
    result_score: Optional[float] = None
    result_success: Optional[bool] = None
    context: Optional[dict[str, Any]] = None
    timestamp: Optional[datetime] = None
