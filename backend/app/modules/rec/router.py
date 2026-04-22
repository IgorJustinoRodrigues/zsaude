"""Router do módulo Recepção.

- ``GET  /rec/ping`` — sanity check do módulo.
- ``GET  /rec/config/effective`` — config efetiva pro runtime (totem,
  painel, console). Aceita ``facilityId`` ou ``municipalityId`` em query
  (senão usa o work-context do usuário autenticado).

Admin (MASTER):
- ``GET/PATCH /admin/rec/config/municipalities/{id}``
- ``GET/PATCH /admin/rec/config/facilities/{id}``
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.core.audit import get_audit_context
from app.core.deps import DB, CurrentContextDep, CurrentUserDep, MasterDep, Valkey
from app.core.schema_base import CamelModel
from app.modules.devices.hub import publish_facility_event
from app.modules.rec.schemas import (
    EffectiveRecConfig,
    RecConfigRead,
    RecConfigUpdate,
)
from app.modules.rec.service import RecConfigService
from app.modules.tenants.models import Facility

router = APIRouter(prefix="/rec", tags=["rec"])
admin_router = APIRouter(prefix="/admin/rec", tags=["rec-admin"])


# ─── Sanity check ────────────────────────────────────────────────────────────

@router.get("/ping")
async def ping(ctx: CurrentContextDep) -> dict[str, str]:
    return {
        "module": "rec",
        "municipality_ibge": ctx.municipality_ibge,
        "facility_id": str(ctx.facility_id),
    }


# ─── Admin: config do município ──────────────────────────────────────────────

@admin_router.get(
    "/config/municipalities/{municipality_id}",
    response_model=RecConfigRead,
)
async def get_municipality_rec_config(
    municipality_id: UUID, db: DB, _: MasterDep,
) -> RecConfigRead:
    return await RecConfigService(db).get_for_municipality(municipality_id)


@admin_router.patch(
    "/config/municipalities/{municipality_id}",
    response_model=RecConfigRead,
)
async def update_municipality_rec_config(
    municipality_id: UUID, payload: RecConfigUpdate, db: DB, _: MasterDep,
) -> RecConfigRead:
    return await RecConfigService(db).update_for_municipality(municipality_id, payload)


@admin_router.delete(
    "/config/municipalities/{municipality_id}/{section}",
    response_model=RecConfigRead,
)
async def clear_municipality_rec_section(
    municipality_id: UUID, section: str, db: DB, _: MasterDep,
) -> RecConfigRead:
    """Limpa uma seção (``totem``, ``painel`` ou ``recepcao``) — volta a
    herdar aquela seção dos defaults do sistema."""
    return await RecConfigService(db).clear_section_municipality(municipality_id, section)


# ─── Admin: config da unidade ────────────────────────────────────────────────

@admin_router.get(
    "/config/facilities/{facility_id}",
    response_model=RecConfigRead,
)
async def get_facility_rec_config(
    facility_id: UUID, db: DB, _: MasterDep,
) -> RecConfigRead:
    return await RecConfigService(db).get_for_facility(facility_id)


@admin_router.patch(
    "/config/facilities/{facility_id}",
    response_model=RecConfigRead,
)
async def update_facility_rec_config(
    facility_id: UUID, payload: RecConfigUpdate, db: DB, _: MasterDep,
) -> RecConfigRead:
    return await RecConfigService(db).update_for_facility(facility_id, payload)


@admin_router.delete(
    "/config/facilities/{facility_id}/{section}",
    response_model=RecConfigRead,
)
async def clear_facility_rec_section(
    facility_id: UUID, section: str, db: DB, _: MasterDep,
) -> RecConfigRead:
    """Limpa uma seção — volta a herdar do município."""
    return await RecConfigService(db).clear_section_facility(facility_id, section)


# ─── Runtime: config efetiva ─────────────────────────────────────────────────

@router.get("/config/effective", response_model=EffectiveRecConfig)
async def effective_rec_config(
    db: DB,
    _user: CurrentUserDep,
    facility_id: Annotated[UUID | None, Query(alias="facilityId")] = None,
    municipality_id: Annotated[UUID | None, Query(alias="municipalityId")] = None,
) -> EffectiveRecConfig:
    """Config efetiva (defaults → município → unidade).

    Sem parâmetros → deduz do work-context do usuário. MASTER pode
    passar ``facilityId`` / ``municipalityId`` explicitamente pra
    inspecionar qualquer escopo.
    """
    svc = RecConfigService(db)

    # Parâmetros explícitos — prioridade.
    if facility_id is not None:
        fac = await db.get(Facility, facility_id)
        if fac is None:
            raise HTTPException(status_code=404, detail="Unidade não encontrada.")
        return await svc.effective_for_facility(facility_id, fac.municipality_id)
    if municipality_id is not None:
        return await svc.effective_for_municipality(municipality_id)

    # Fallback — work context.
    ctx = get_audit_context()
    if ctx.facility_id and ctx.municipality_id:
        return await svc.effective_for_facility(ctx.facility_id, ctx.municipality_id)
    if ctx.municipality_id:
        return await svc.effective_for_municipality(ctx.municipality_id)

    raise HTTPException(
        status_code=400,
        detail="Sem contexto — informe facilityId ou municipalityId.",
    )


# ─── Chamada de senha (publicada no painel) ──────────────────────────────────

class CallInput(CamelModel):
    ticket: str
    # Opcional — muitas unidades têm só 1 ponto de atendimento. Quando
    # null, o painel não mostra linha de "guichê".
    counter: str | None = None
    patient_name: str | None = None
    priority: bool = False


@router.post("/calls", status_code=204)
async def publish_call(
    payload: CallInput, valkey: Valkey, ctx: CurrentContextDep,
) -> None:
    """Chamada disparada pelo console do balcão. Publica o evento
    ``painel:call`` no canal da unidade — todo painel conectado recebe
    via WS."""
    await publish_facility_event(
        valkey, ctx.facility_id,
        "painel:call",
        {
            "ticket": payload.ticket,
            "counter": payload.counter,
            "patientName": payload.patient_name,
            "priority": payload.priority,
            "at": datetime_now_iso(),
        },
    )


def datetime_now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
