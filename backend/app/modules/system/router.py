"""Endpoints de configurações globais (MASTER only)."""

from __future__ import annotations

from sqlalchemy import select

from fastapi import APIRouter, HTTPException

from app.core.deps import DB, MasterDep
from app.modules.audit.writer import write_audit
from app.modules.system.models import SystemSetting
from app.modules.system.schemas import SettingRead, SettingUpdate
from app.modules.system.service import SettingsService

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/settings", response_model=list[SettingRead])
async def list_settings(db: DB, _: MasterDep) -> list[SettingRead]:
    rows = (await db.scalars(select(SystemSetting).order_by(SystemSetting.key))).all()
    return [SettingRead.model_validate(r) for r in rows]


@router.get("/settings/{key}", response_model=SettingRead)
async def get_setting(key: str, db: DB, _: MasterDep) -> SettingRead:
    s = await db.scalar(select(SystemSetting).where(SystemSetting.key == key))
    if s is None:
        raise HTTPException(status_code=404, detail="Configuração não encontrada.")
    return SettingRead.model_validate(s)


@router.patch("/settings/{key}", response_model=SettingRead)
async def update_setting(
    key: str, payload: SettingUpdate, db: DB, _: MasterDep
) -> SettingRead:
    prev = await db.scalar(select(SystemSetting).where(SystemSetting.key == key))
    if prev is None:
        raise HTTPException(status_code=404, detail="Configuração não encontrada.")
    previous_value = prev.value

    updated = await SettingsService(db).set_value(key, payload.value)

    await write_audit(
        db,
        module="sys",
        action="setting_update",
        severity="warning",
        resource="system_setting",
        resource_id=key,
        description=f"Configuração {key} atualizada",
        details={"key": key, "from": previous_value, "to": payload.value},
    )

    return SettingRead.model_validate(updated)
