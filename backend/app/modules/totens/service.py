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


def _to_read(t: Totem) -> TotemRead:
    return TotemRead.model_validate({
        "id": t.id,
        "scopeType": t.scope_type,
        "scopeId": t.scope_id,
        "name": t.name,
        "capture": t.capture,
        "priorityPrompt": t.priority_prompt,
        "archived": t.archived,
        "numbering": {
            "ticketPrefixNormal": t.ticket_prefix_normal,
            "ticketPrefixPriority": t.ticket_prefix_priority,
            "resetStrategy": t.reset_strategy,
            "numberPadding": t.number_padding,
        },
        "defaultSectorName": t.default_sector_name,
    })


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
        return [_to_read(r) for r in rows]

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
        n = payload.numbering
        row = Totem(
            scope_type=scope_type,
            scope_id=scope_id,
            name=payload.name,
            capture=payload.capture.model_dump(),
            priority_prompt=payload.priority_prompt,
            ticket_prefix_normal=n.ticket_prefix_normal,
            ticket_prefix_priority=n.ticket_prefix_priority,
            reset_strategy=n.reset_strategy,
            number_padding=n.number_padding,
            default_sector_name=payload.default_sector_name,
        )
        self.db.add(row)
        await self.db.flush()
        return _to_read(row)

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
        if payload.numbering is not None:
            n = payload.numbering
            row.ticket_prefix_normal = n.ticket_prefix_normal
            row.ticket_prefix_priority = n.ticket_prefix_priority
            row.reset_strategy = n.reset_strategy
            row.number_padding = n.number_padding
        # ``default_sector_name`` aceita None (=desativar): usa ``model_fields_set``
        # pra distinguir "não enviado" de "enviado como null".
        if "default_sector_name" in payload.model_fields_set:
            row.default_sector_name = payload.default_sector_name
        await self.db.flush()
        return _to_read(row)

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
