"""Platform integration schemas: LTI, DingTalk, xAPI."""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class LTILaunchData(BaseModel):
    """Payload forwarded from the ltijs LTI provider on successful launch."""

    user_id: str
    course_id: str = "unknown"
    roles: list[str] = []
    name: str = "Unknown"
    email: str = ""
    platform_info: Optional[dict[str, Any]] = None


class LTIGradeRequest(BaseModel):
    """Request body for LTI grade passback."""

    user_id: str
    score: float
    comment: str = ""


class DingTalkMessage(BaseModel):
    msgtype: str = "text"
    text: Optional[dict[str, str]] = None
    markdown: Optional[dict[str, str]] = None
    at: Optional[dict[str, Any]] = None


class DingTalkNotifyRequest(BaseModel):
    """Request body for sending a DingTalk notification."""

    webhook_url: str
    content: str


class PlatformUserResolveRequest(BaseModel):
    """Query params for resolving a platform user."""

    platform: str
    platform_user_id: str


class XAPIStatementSchema(BaseModel):
    user_id: uuid.UUID
    verb: str
    object_type: str
    object_id: str
    result_score: Optional[float] = None
    result_success: Optional[bool] = None
    context: Optional[dict[str, Any]] = None
    timestamp: Optional[datetime] = None
