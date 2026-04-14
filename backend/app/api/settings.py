"""System settings API — global platform-wide toggles for teachers/admins."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.system_setting import SystemSetting
from app.models.user import User

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTING_KEY = "platform"

DEFAULT_SETTINGS: dict = {
    "default_model": "GPT-5.4",
    "knowledge_graph_enabled": True,
    "bkt_tracking_enabled": True,
}


class SettingsUpdate(BaseModel):
    default_model: str | None = None
    knowledge_graph_enabled: bool | None = None
    bkt_tracking_enabled: bool | None = None


async def _get_or_create(db: AsyncSession) -> SystemSetting:
    row = await db.execute(
        select(SystemSetting).where(SystemSetting.key == SETTING_KEY)
    )
    setting = row.scalar_one_or_none()
    if setting is None:
        setting = SystemSetting(key=SETTING_KEY, value=dict(DEFAULT_SETTINGS))
        db.add(setting)
        await db.commit()
        await db.refresh(setting)
    return setting


@router.get("")
async def get_settings(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    setting = await _get_or_create(db)
    # Merge with defaults so a partial row still returns every key
    merged = {**DEFAULT_SETTINGS, **(setting.value or {})}
    return merged


@router.patch("")
async def update_settings(
    payload: SettingsUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Only teachers can edit settings")

    setting = await _get_or_create(db)
    current = dict(setting.value or {})
    updates = payload.model_dump(exclude_none=True)
    current.update(updates)
    setting.value = current
    # JSONB in-place mutation — force SQLAlchemy to flag it
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(setting, "value")
    await db.commit()
    return {**DEFAULT_SETTINGS, **current}
