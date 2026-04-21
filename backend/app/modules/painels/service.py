"""Serviço dos painéis lógicos."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.painels.models import Painel
from app.modules.painels.schemas import (
    AvailablePainel,
    PainelCreate,
    PainelRead,
    PainelUpdate,
)
from app.modules.tenants.models import Facility


class PainelService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Listagem bruta ─────────────────────────────────────────────────

    async def list_scope(
        self, scope_type: str, scope_id: UUID, include_archived: bool = False,
    ) -> list[PainelRead]:
        stmt = select(Painel).where(
            and_(Painel.scope_type == scope_type, Painel.scope_id == scope_id)
        ).order_by(Painel.archived, Painel.name)
        if not include_archived:
            stmt = stmt.where(Painel.archived == False)  # noqa: E712
        rows = (await self.db.scalars(stmt)).all()
        return [PainelRead.model_validate(r) for r in rows]

    # ── Disponíveis pra facility (próprios + herdados do município) ───

    async def available_for_facility(
        self, facility_id: UUID,
    ) -> list[AvailablePainel]:
        fac = await self._get_facility_or_404(facility_id)
        own = await self.list_scope("facility", facility_id)
        mun = await self.list_scope("municipality", fac.municipality_id)
        out: list[AvailablePainel] = []
        for p in own:
            out.append(AvailablePainel(**p.model_dump(), inherited=False))
        for p in mun:
            out.append(AvailablePainel(**p.model_dump(), inherited=True))
        return out

    # ── CRUD ───────────────────────────────────────────────────────────

    async def create(
        self, scope_type: str, scope_id: UUID, payload: PainelCreate,
    ) -> PainelRead:
        self._assert_scope(scope_type)
        dup = await self.db.scalar(
            select(Painel.id).where(
                and_(
                    Painel.scope_type == scope_type,
                    Painel.scope_id == scope_id,
                    Painel.name == payload.name,
                )
            )
        )
        if dup is not None:
            raise HTTPException(
                status_code=409,
                detail=f"Já existe um painel com o nome {payload.name!r} neste escopo.",
            )
        row = Painel(
            scope_type=scope_type,
            scope_id=scope_id,
            name=payload.name,
            mode=payload.mode,
            announce_audio=payload.announce_audio,
            sector_names=list(payload.sector_names),
        )
        self.db.add(row)
        await self.db.flush()
        return PainelRead.model_validate(row)

    async def update(self, painel_id: UUID, payload: PainelUpdate) -> PainelRead:
        row = await self._get_or_404(painel_id)

        if payload.name is not None and payload.name != row.name:
            dup = await self.db.scalar(
                select(Painel.id).where(
                    and_(
                        Painel.scope_type == row.scope_type,
                        Painel.scope_id == row.scope_id,
                        Painel.name == payload.name,
                        Painel.id != painel_id,
                    )
                )
            )
            if dup is not None:
                raise HTTPException(
                    status_code=409,
                    detail=f"Já existe um painel com o nome {payload.name!r} neste escopo.",
                )
            row.name = payload.name
        if payload.mode is not None:
            row.mode = payload.mode
        if payload.announce_audio is not None:
            row.announce_audio = payload.announce_audio
        if payload.sector_names is not None:
            row.sector_names = list(payload.sector_names)
        if payload.archived is not None:
            row.archived = payload.archived
        await self.db.flush()
        return PainelRead.model_validate(row)

    async def delete(self, painel_id: UUID) -> None:
        row = await self._get_or_404(painel_id)
        await self.db.delete(row)
        await self.db.flush()

    # ── Internos ───────────────────────────────────────────────────────

    @staticmethod
    def _assert_scope(scope_type: str) -> None:
        if scope_type not in ("municipality", "facility"):
            raise HTTPException(status_code=400, detail=f"Escopo inválido: {scope_type}")

    async def _get_or_404(self, painel_id: UUID) -> Painel:
        row = await self.db.get(Painel, painel_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Painel não encontrado.")
        return row

    async def _get_facility_or_404(self, facility_id: UUID) -> Facility:
        fac = await self.db.get(Facility, facility_id)
        if fac is None:
            raise HTTPException(status_code=404, detail="Unidade não encontrada.")
        return fac
