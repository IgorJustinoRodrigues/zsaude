"""Serviço de setores (scoped: município ou unidade)."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.sectors.models import Sector
from app.modules.sectors.schemas import (
    SYSTEM_DEFAULT_SECTORS,
    EffectiveSectorsOutput,
    SectorCreate,
    SectorRead,
    SectorReorder,
    SectorUpdate,
)
from app.modules.tenants.models import Facility


class SectorService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Seeding ────────────────────────────────────────────────────────

    async def ensure_municipality_defaults(self, municipality_id: UUID) -> int:
        """Cria os setores default do sistema pro município se ainda não
        tiver nenhum. Retorna quantos foram criados."""
        existing = await self.db.scalar(
            select(Sector.id).where(
                and_(
                    Sector.scope_type == "municipality",
                    Sector.scope_id == municipality_id,
                )
            ).limit(1)
        )
        if existing is not None:
            return 0
        for i, s in enumerate(SYSTEM_DEFAULT_SECTORS):
            self.db.add(Sector(
                scope_type="municipality",
                scope_id=municipality_id,
                name=s["name"],
                abbreviation=s["abbreviation"],
                display_order=i,
            ))
        await self.db.flush()
        return len(SYSTEM_DEFAULT_SECTORS)

    # ── Listagem bruta por escopo ──────────────────────────────────────

    async def list_scope(
        self, scope_type: str, scope_id: UUID, include_archived: bool = False,
    ) -> list[SectorRead]:
        stmt = select(Sector).where(
            and_(Sector.scope_type == scope_type, Sector.scope_id == scope_id)
        ).order_by(Sector.archived, Sector.display_order, Sector.name)
        if not include_archived:
            stmt = stmt.where(Sector.archived == False)  # noqa: E712
        rows = (await self.db.scalars(stmt)).all()
        return [SectorRead.model_validate(r) for r in rows]

    # ── Efetivo (pra unidade) ──────────────────────────────────────────

    async def effective_for_facility(self, facility_id: UUID) -> EffectiveSectorsOutput:
        fac = await self._get_facility_or_404(facility_id)
        if fac.custom_sectors:
            return EffectiveSectorsOutput(
                sectors=await self.list_scope("facility", facility_id),
                source="facility",
                facility_uses_custom=True,
            )
        return EffectiveSectorsOutput(
            sectors=await self.list_scope("municipality", fac.municipality_id),
            source="municipality",
            facility_uses_custom=False,
        )

    # ── CRUD ───────────────────────────────────────────────────────────

    async def create(
        self, scope_type: str, scope_id: UUID, payload: SectorCreate,
    ) -> SectorRead:
        self._assert_scope_valid(scope_type)
        # display_order = próximo ao fim se não informado
        if payload.display_order == 0:
            current_max = await self.db.scalar(
                select(Sector.display_order).where(
                    and_(
                        Sector.scope_type == scope_type,
                        Sector.scope_id == scope_id,
                    )
                ).order_by(Sector.display_order.desc()).limit(1)
            )
            payload = payload.model_copy(update={
                "display_order": (current_max or 0) + 1,
            })
        # Duplicado?
        dup = await self.db.scalar(
            select(Sector.id).where(
                and_(
                    Sector.scope_type == scope_type,
                    Sector.scope_id == scope_id,
                    Sector.name == payload.name,
                )
            )
        )
        if dup is not None:
            raise HTTPException(
                status_code=409,
                detail=f"Já existe um setor com o nome {payload.name!r} neste escopo.",
            )
        row = Sector(
            scope_type=scope_type,
            scope_id=scope_id,
            name=payload.name,
            abbreviation=payload.abbreviation,
            display_order=payload.display_order,
        )
        self.db.add(row)
        await self.db.flush()
        return SectorRead.model_validate(row)

    async def update(self, sector_id: UUID, payload: SectorUpdate) -> SectorRead:
        row = await self._get_or_404(sector_id)

        if payload.name is not None and payload.name != row.name:
            dup = await self.db.scalar(
                select(Sector.id).where(
                    and_(
                        Sector.scope_type == row.scope_type,
                        Sector.scope_id == row.scope_id,
                        Sector.name == payload.name,
                        Sector.id != sector_id,
                    )
                )
            )
            if dup is not None:
                raise HTTPException(
                    status_code=409,
                    detail=f"Já existe um setor com o nome {payload.name!r} neste escopo.",
                )
            row.name = payload.name
        if payload.abbreviation is not None:
            row.abbreviation = payload.abbreviation
        if payload.display_order is not None:
            row.display_order = payload.display_order
        if payload.archived is not None:
            row.archived = payload.archived
        await self.db.flush()
        return SectorRead.model_validate(row)

    async def reorder(
        self, scope_type: str, scope_id: UUID, payload: SectorReorder,
    ) -> list[SectorRead]:
        """Reordena: ``ids`` na ordem nova. Só aceita ids do escopo
        informado (erros 400 se houver id estranho)."""
        rows = (await self.db.scalars(
            select(Sector).where(
                and_(
                    Sector.scope_type == scope_type,
                    Sector.scope_id == scope_id,
                    Sector.id.in_(payload.ids),
                )
            )
        )).all()
        if len(rows) != len(payload.ids):
            raise HTTPException(
                status_code=400,
                detail="Alguns ids não pertencem ao escopo informado.",
            )
        by_id = {r.id: r for r in rows}
        for i, sid in enumerate(payload.ids):
            by_id[sid].display_order = i
        await self.db.flush()
        return await self.list_scope(scope_type, scope_id)

    async def delete(self, sector_id: UUID) -> None:
        row = await self._get_or_404(sector_id)
        await self.db.delete(row)
        await self.db.flush()

    # ── Herança solta: unidade personaliza ────────────────────────────

    async def start_customize_facility(self, facility_id: UUID) -> EffectiveSectorsOutput:
        """Marca ``facility.custom_sectors=true`` e **clona** os setores
        do município pra facility. Idempotente — se já tá custom, no-op."""
        fac = await self._get_facility_or_404(facility_id)
        if fac.custom_sectors:
            return await self.effective_for_facility(facility_id)

        # Clone município → facility
        municipality_sectors = await self.list_scope(
            "municipality", fac.municipality_id, include_archived=False,
        )
        for s in municipality_sectors:
            self.db.add(Sector(
                scope_type="facility",
                scope_id=facility_id,
                name=s.name,
                abbreviation=s.abbreviation,
                display_order=s.display_order,
            ))
        fac.custom_sectors = True
        await self.db.flush()
        return await self.effective_for_facility(facility_id)

    async def stop_customize_facility(self, facility_id: UUID) -> EffectiveSectorsOutput:
        """Volta a herdar. Apaga todas as linhas de ``sectors`` com
        scope=facility."""
        fac = await self._get_facility_or_404(facility_id)
        if not fac.custom_sectors:
            return await self.effective_for_facility(facility_id)

        await self.db.execute(
            delete(Sector).where(
                and_(
                    Sector.scope_type == "facility",
                    Sector.scope_id == facility_id,
                )
            )
        )
        fac.custom_sectors = False
        await self.db.flush()
        return await self.effective_for_facility(facility_id)

    # ── Internos ───────────────────────────────────────────────────────

    @staticmethod
    def _assert_scope_valid(scope_type: str) -> None:
        if scope_type not in ("municipality", "facility"):
            raise HTTPException(status_code=400, detail=f"Escopo inválido: {scope_type}")

    async def _get_or_404(self, sector_id: UUID) -> Sector:
        row = await self.db.get(Sector, sector_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Setor não encontrado.")
        return row

    async def _get_facility_or_404(self, facility_id: UUID) -> Facility:
        fac = await self.db.get(Facility, facility_id)
        if fac is None:
            raise HTTPException(status_code=404, detail="Unidade não encontrada.")
        return fac
