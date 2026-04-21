"""Endpoints de leitura de diretório (municípios e unidades).

Por padrão lista tudo. Com `scope=actor`, restringe ao escopo do ator
(ADMIN vê só seus municípios; MASTER sempre vê tudo).
"""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.core.deps import DB, CurrentUserDep
from app.modules.tenants.models import Facility, Municipality, MunicipalityAccess
from app.modules.tenants.schemas import FacilityRead, MunicipalityRead
from app.modules.users.models import User, UserLevel

router = APIRouter(tags=["directory"])


async def _actor_scope(db, actor_id: UUID) -> set[UUID] | None:
    """Retorna IDs dos municípios do ator. MASTER → None (tudo)."""
    u = await db.scalar(select(User).where(User.id == actor_id))
    if u is None or u.level == UserLevel.MASTER:
        return None
    rows = await db.scalars(
        select(MunicipalityAccess.municipality_id).where(MunicipalityAccess.user_id == actor_id)
    )
    return set(rows.all())


@router.get("/municipalities", response_model=list[MunicipalityRead])
async def list_municipalities(
    db: DB,
    user: CurrentUserDep,
    scope: Annotated[Literal["all", "actor"] | None, Query()] = None,
) -> list[MunicipalityRead]:
    stmt = select(Municipality).order_by(Municipality.name)
    if scope == "actor":
        actor_scope = await _actor_scope(db, user.id)
        if actor_scope is not None:
            if not actor_scope:
                return []
            stmt = stmt.where(Municipality.id.in_(actor_scope))
    rows = (await db.scalars(stmt)).all()
    return [MunicipalityRead.model_validate(r) for r in rows]


@router.get("/facilities", response_model=list[FacilityRead])
async def list_facilities(
    db: DB,
    user: CurrentUserDep,
    municipality_id: Annotated[UUID | None, Query(alias="municipalityId")] = None,
    scope: Annotated[Literal["all", "actor"] | None, Query()] = None,
    include_archived: Annotated[bool, Query(alias="includeArchived")] = False,
) -> list[FacilityRead]:
    """Listagem read-only de unidades para selects/dropdowns.

    Por padrão retorna só unidades **ativas** (``archived=False``) — selects
    não devem oferecer unidades arquivadas. Passe ``includeArchived=true``
    quando precisar de todas (ex.: tela de administração de unidades).
    """
    stmt = select(Facility).order_by(Facility.name)
    if municipality_id is not None:
        stmt = stmt.where(Facility.municipality_id == municipality_id)
    if not include_archived:
        stmt = stmt.where(Facility.archived.is_(False))
    if scope == "actor":
        actor_scope = await _actor_scope(db, user.id)
        if actor_scope is not None:
            if not actor_scope:
                return []
            stmt = stmt.where(Facility.municipality_id.in_(actor_scope))
    rows = (await db.scalars(stmt)).all()
    return [FacilityRead.model_validate(r) for r in rows]
