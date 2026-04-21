"""Endpoints de branding.

- ``GET/PATCH  /admin/branding/municipalities/{id}`` — admin da cidade
- ``GET/PATCH  /admin/branding/facilities/{id}``    — admin da unidade
- ``POST       /admin/branding/{scope}/{id}/logo``  — upload
- ``DELETE     /admin/branding/{scope}/{id}/logo``  — remove logo
- ``GET        /branding/effective``                — user autenticado
- ``GET        /branding/logo/{file_id}``           — proxy de logo autenticado
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import select

from app.core.deps import DB, CurrentUserDep, MasterDep
from app.db.file_model import AppFile
from app.modules.branding.models import BrandingScope
from app.modules.branding.schemas import (
    BrandingRead,
    BrandingUpdate,
    EffectiveBranding,
    LogoUploadResponse,
)
from app.modules.branding.service import BrandingService
from app.modules.users.service import UserService
from app.services.storage import get_storage

router = APIRouter(prefix="/branding", tags=["branding"])
admin_router = APIRouter(prefix="/admin/branding", tags=["branding-admin"])


# ─── Admin: CRUD por escopo ────────────────────────────────────────────────────

@admin_router.get("/municipalities/{municipality_id}", response_model=BrandingRead)
async def get_municipality_branding(
    municipality_id: UUID, db: DB, _: MasterDep,
) -> BrandingRead:
    cfg = await BrandingService(db).get_or_create(
        BrandingScope.MUNICIPALITY, municipality_id,
    )
    return BrandingRead.model_validate(cfg)


@admin_router.patch("/municipalities/{municipality_id}", response_model=BrandingRead)
async def update_municipality_branding(
    municipality_id: UUID, payload: BrandingUpdate, db: DB, _: MasterDep,
) -> BrandingRead:
    cfg = await BrandingService(db).update(
        BrandingScope.MUNICIPALITY, municipality_id, payload,
    )
    return BrandingRead.model_validate(cfg)


@admin_router.get("/facilities/{facility_id}", response_model=BrandingRead)
async def get_facility_branding(
    facility_id: UUID, db: DB, _: MasterDep,
) -> BrandingRead:
    cfg = await BrandingService(db).get_or_create(
        BrandingScope.FACILITY, facility_id,
    )
    return BrandingRead.model_validate(cfg)


@admin_router.patch("/facilities/{facility_id}", response_model=BrandingRead)
async def update_facility_branding(
    facility_id: UUID, payload: BrandingUpdate, db: DB, _: MasterDep,
) -> BrandingRead:
    cfg = await BrandingService(db).update(
        BrandingScope.FACILITY, facility_id, payload,
    )
    return BrandingRead.model_validate(cfg)


# ─── Admin: upload/remoção de logo ─────────────────────────────────────────────

@admin_router.post(
    "/{scope}/{scope_id}/logo",
    response_model=LogoUploadResponse,
    status_code=201,
)
async def upload_branding_logo(
    scope: BrandingScope,
    scope_id: UUID,
    db: DB,
    user: CurrentUserDep,
    _: MasterDep,
    file: Annotated[UploadFile, File(description="Logo JPEG/PNG/WEBP/SVG — máx. 5 MB")],
) -> LogoUploadResponse:
    content = await file.read()
    mime = (file.content_type or "").lower()
    user_record = await UserService(db).get_or_404(user.id)

    cfg = await BrandingService(db).upload_logo(
        scope, scope_id,
        content=content, mime=mime,
        original_name=file.filename or "",
        actor_user_id=user.id,
        actor_user_name=user_record.name,
    )
    assert cfg.logo_file_id is not None
    return LogoUploadResponse(
        logo_file_id=cfg.logo_file_id,
        logo_url=f"/api/v1/branding/logo/{cfg.logo_file_id}",
    )


@admin_router.delete("/{scope}/{scope_id}/logo", status_code=204)
async def delete_branding_logo(
    scope: BrandingScope, scope_id: UUID, db: DB, _: MasterDep,
) -> Response:
    await BrandingService(db).delete_logo(scope, scope_id)
    return Response(status_code=204)


# ─── Consumo (qualquer usuário autenticado) ────────────────────────────────────

@router.get("/effective", response_model=EffectiveBranding)
async def effective_branding(
    db: DB,
    user: CurrentUserDep,
    facility_id: Annotated[UUID | None, Query(alias="facilityId")] = None,
    municipality_id: Annotated[UUID | None, Query(alias="municipalityId")] = None,
) -> EffectiveBranding:
    """Retorna a identidade visual efetiva.

    Sem query params → usa o work-context do usuário (se disponível).
    Se o usuário for MASTER sem contexto, retorna os defaults do sistema.
    """
    svc = BrandingService(db)

    # Prioriza parâmetros explícitos (útil pra MASTER inspecionar).
    if facility_id is not None and municipality_id is not None:
        return await svc.effective_for_facility(facility_id, municipality_id)
    if municipality_id is not None:
        return await svc.effective_for_municipality(municipality_id)

    # Tenta extrair do work context do usuário. O backend tem o JWT de
    # contexto no header ``X-Work-Context`` — o user object já traz o
    # contexto resolvido via dependency.
    from app.core.audit import get_audit_context
    ctx = get_audit_context()
    if ctx.facility_id and ctx.municipality_id:
        return await svc.effective_for_facility(ctx.facility_id, ctx.municipality_id)
    if ctx.municipality_id:
        return await svc.effective_for_municipality(ctx.municipality_id)

    # Sem contexto — defaults do sistema (logo_url=None, display_name=zSaúde, etc.)
    return await svc.effective_for_municipality(user.id)  # scope_id inexistente = só defaults


# ─── Proxy do arquivo de logo ──────────────────────────────────────────────────

@router.get("/logo/{file_id}")
async def serve_logo(file_id: UUID, db: DB, _user: CurrentUserDep) -> Response:
    """Proxy autenticado do arquivo da logo.

    Logos são pequenos e poucos — ok servir via backend. Content-Type
    vem do ``AppFile.mime_type``. ``Cache-Control: private, max-age=3600``
    para evitar reload a cada request.
    """
    file_row = await db.scalar(
        select(AppFile).where(
            AppFile.id == file_id,
            AppFile.category == "branding_logo",
        )
    )
    if file_row is None:
        raise HTTPException(status_code=404, detail="Logo não encontrada.")
    data = await get_storage().download(file_row.storage_key)
    return Response(
        content=data,
        media_type=file_row.mime_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )
