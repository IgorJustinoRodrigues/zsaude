"""Serviço dos totens lógicos."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tenants.models import Facility
from app.modules.totens.models import Totem
from app.modules.totens.schemas import (
    AvailableTotem,
    TotemCreate,
    TotemRead,
    TotemUpdate,
)


class TotemService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_scope(
        self, scope_type: str, scope_id: UUID, include_archived: bool = False,
    ) -> list[TotemRead]:
        stmt = select(Totem).where(
            and_(Totem.scope_type == scope_type, Totem.scope_id == scope_id)
        ).order_by(Totem.archived, Totem.name)
        if not include_archived:
            stmt = stmt.where(Totem.archived == False)  # noqa: E712
        rows = (await self.db.scalars(stmt)).all()
        return [TotemRead.model_validate(r) for r in rows]

    async def available_for_facility(self, facility_id: UUID) -> list[AvailableTotem]:
        fac = await self._get_facility_or_404(facility_id)
        own = await self.list_scope("facility", facility_id)
        mun = await self.list_scope("municipality", fac.municipality_id)
        out: list[AvailableTotem] = []
        for t in own:
            out.append(AvailableTotem(**t.model_dump(), inherited=False))
        for t in mun:
            out.append(AvailableTotem(**t.model_dump(), inherited=True))
        return out

    async def create(
        self, scope_type: str, scope_id: UUID, payload: TotemCreate,
    ) -> TotemRead:
        self._assert_scope(scope_type)
        dup = await self.db.scalar(
            select(Totem.id).where(
                and_(
                    Totem.scope_type == scope_type,
                    Totem.scope_id == scope_id,
                    Totem.name == payload.name,
                )
            )
        )
        if dup is not None:
            raise HTTPException(
                status_code=409,
                detail=f"Já existe um totem com o nome {payload.name!r} neste escopo.",
            )
        row = Totem(
            scope_type=scope_type,
            scope_id=scope_id,
            name=payload.name,
            capture=payload.capture.model_dump(),
            priority_prompt=payload.priority_prompt,
        )
        self.db.add(row)
        await self.db.flush()
        return TotemRead.model_validate(row)

    async def update(self, totem_id: UUID, payload: TotemUpdate) -> TotemRead:
        row = await self._get_or_404(totem_id)

        if payload.name is not None and payload.name != row.name:
            dup = await self.db.scalar(
                select(Totem.id).where(
                    and_(
                        Totem.scope_type == row.scope_type,
                        Totem.scope_id == row.scope_id,
                        Totem.name == payload.name,
                        Totem.id != totem_id,
                    )
                )
            )
            if dup is not None:
                raise HTTPException(
                    status_code=409,
                    detail=f"Já existe um totem com o nome {payload.name!r} neste escopo.",
                )
            row.name = payload.name
        if payload.capture is not None:
            row.capture = payload.capture.model_dump()
        if payload.priority_prompt is not None:
            row.priority_prompt = payload.priority_prompt
        if payload.archived is not None:
            row.archived = payload.archived
        await self.db.flush()
        return TotemRead.model_validate(row)

    async def delete(self, totem_id: UUID) -> None:
        row = await self._get_or_404(totem_id)
        await self.db.delete(row)
        await self.db.flush()

    @staticmethod
    def _assert_scope(scope_type: str) -> None:
        if scope_type not in ("municipality", "facility"):
            raise HTTPException(status_code=400, detail=f"Escopo inválido: {scope_type}")

    async def _get_or_404(self, totem_id: UUID) -> Totem:
        row = await self.db.get(Totem, totem_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Totem não encontrado.")
        return row

    async def _get_facility_or_404(self, facility_id: UUID) -> Facility:
        fac = await self.db.get(Facility, facility_id)
        if fac is None:
            raise HTTPException(status_code=404, detail="Unidade não encontrada.")
        return fac
