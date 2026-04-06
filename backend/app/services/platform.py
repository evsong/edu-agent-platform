"""PlatformService — LTI launch handling, DingTalk webhook & notifications."""

from __future__ import annotations

import logging
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, hash_password
from app.models.platform_user import PlatformUser
from app.models.user import User
from app.services.llm import LLMClient

logger = logging.getLogger(__name__)

# LTI role URN prefixes that map to the "teacher" role
_INSTRUCTOR_ROLE_PREFIXES = (
    "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor",
    "http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor",
    "Instructor",
    "Teacher",
    "ContentDeveloper",
)


def _determine_role(lti_roles: list[str]) -> str:
    """Map LTI role URNs to internal roles (teacher / student)."""
    for role in lti_roles:
        for prefix in _INSTRUCTOR_ROLE_PREFIXES:
            if prefix in role:
                return "teacher"
    return "student"


class PlatformService:
    """Orchestrates LTI identity mapping, DingTalk messaging, and platform
    user resolution."""

    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm
        self.lti_url = "http://lti-provider:3000"

    # ── LTI Launch ──────────────────────────────────────────────────

    async def handle_lti_launch(self, db: AsyncSession, lti_data: dict) -> dict:
        """Process an LTI 1.3 launch forwarded from the ltijs provider.

        1. Look up existing platform_user for (chaoxing, user_id).
        2. If none, create a new User + PlatformUser mapping.
        3. Generate a JWT token for the resolved user.

        Returns ``{token, role, user_id}``.
        """
        platform = "chaoxing"
        platform_user_id: str = lti_data["user_id"]
        lti_roles: list[str] = lti_data.get("roles", [])
        name: str = lti_data.get("name", "Unknown")
        email: str = lti_data.get("email", "")

        # 1. Check existing mapping
        result = await db.execute(
            select(PlatformUser).where(
                PlatformUser.platform == platform,
                PlatformUser.platform_user_id == platform_user_id,
            )
        )
        pu = result.scalar_one_or_none()

        if pu is not None:
            # Existing mapping — load the user
            user_result = await db.execute(
                select(User).where(User.id == pu.user_id)
            )
            user = user_result.scalar_one()
        else:
            # 2. New user — determine role and create records
            role = _determine_role(lti_roles)

            # Build a unique email if none provided
            if not email:
                email = f"lti_{platform_user_id}@{platform}.local"

            # Check if a user with this email already exists (e.g. manual registration)
            existing_user_result = await db.execute(
                select(User).where(User.email == email)
            )
            user = existing_user_result.scalar_one_or_none()

            if user is None:
                user = User(
                    email=email,
                    name=name,
                    hashed_password=hash_password(uuid.uuid4().hex),  # random pwd
                    role=role,
                )
                db.add(user)
                await db.flush()

            # Create platform mapping
            pu = PlatformUser(
                user_id=user.id,
                platform=platform,
                platform_user_id=platform_user_id,
                metadata_={
                    "course_id": lti_data.get("course_id"),
                    "platform_info": lti_data.get("platform_info"),
                },
            )
            db.add(pu)
            await db.flush()

        # 3. Generate JWT
        token = create_access_token({"sub": str(user.id)})
        return {
            "token": token,
            "role": user.role,
            "user_id": str(user.id),
        }

    # ── LTI Grade Passback ──────────────────────────────────────────

    async def submit_lti_grade(
        self, user_id: str, score: float, comment: str = ""
    ) -> dict:
        """Forward a grade to the ltijs grade passback endpoint."""
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.lti_url}/grade",
                json={"score": score, "comment": comment},
            )
            resp.raise_for_status()
            return resp.json()

    # ── DingTalk Webhook ────────────────────────────────────────────

    async def handle_dingtalk_webhook(self, message_data: dict) -> str:
        """Process an incoming DingTalk robot message.

        Extracts the text content from the DingTalk message payload and responds
        using the LLM.  (Will later be wired to the full Agent framework.)
        """
        # DingTalk robot callback payload structure:
        #   { "msgtype": "text", "text": {"content": "..."}, "senderNick": "...", ... }
        text_content = ""
        if "text" in message_data and isinstance(message_data["text"], dict):
            text_content = message_data["text"].get("content", "").strip()

        if not text_content:
            return "请发送文字消息。"

        try:
            response = await self.llm.chat([
                {
                    "role": "system",
                    "content": (
                        "你是 EduAgent AI 助教，通过钉钉接收学生和老师的提问。"
                        "请用简洁、友好的中文回答。"
                    ),
                },
                {"role": "user", "content": text_content},
            ])
            return response
        except Exception:
            logger.exception("LLM call failed for DingTalk webhook")
            return "抱歉，AI 助教暂时无法回复，请稍后重试。"

    # ── DingTalk Notification ───────────────────────────────────────

    async def send_dingtalk_notification(
        self, webhook_url: str, content: str
    ) -> bool:
        """Send a text message to a DingTalk group via webhook URL."""
        payload = {
            "msgtype": "text",
            "text": {"content": content},
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(webhook_url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                if data.get("errcode", -1) != 0:
                    logger.warning("DingTalk webhook error: %s", data)
                    return False
                return True
        except Exception:
            logger.exception("Failed to send DingTalk notification")
            return False

    # ── Platform User Resolution ────────────────────────────────────

    async def resolve_user(
        self, db: AsyncSession, platform: str, platform_user_id: str
    ) -> dict | None:
        """Look up a platform_users record and return the mapped user info."""
        result = await db.execute(
            select(PlatformUser).where(
                PlatformUser.platform == platform,
                PlatformUser.platform_user_id == platform_user_id,
            )
        )
        pu = result.scalar_one_or_none()
        if pu is None:
            return None

        user_result = await db.execute(select(User).where(User.id == pu.user_id))
        user = user_result.scalar_one_or_none()
        if user is None:
            return None

        return {
            "user_id": str(user.id),
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "platform": pu.platform,
            "platform_user_id": pu.platform_user_id,
            "metadata": pu.metadata_,
        }
