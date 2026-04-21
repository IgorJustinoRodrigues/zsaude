"""CRUD de tabelas de referência globais (MASTER-only)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.sql import expression

from app.core.audit import get_audit_context
from app.core.deps import DB, MasterDep
from app.core.pagination import Page, PageParams
from app.modules.audit.helpers import describe_change
from app.modules.audit.writer import write_audit
from app.modules.reference.models import (
    RefDeficiencia,
    RefEscolaridade,
    RefEstadoCivil,
    RefEtnia,
    RefIdentidadeGenero,
    RefLogradouro,
    RefNacionalidade,
    RefOrientacaoSexual,
    RefParentesco,
    RefPovoTradicional,
    RefRaca,
    RefReligiao,
    RefTipoDocumento,
    RefTipoSanguineo,
)
from app.modules.reference.schemas import RefCreate, RefOut, RefUpdate

router = APIRouter(prefix="/sys/reference", tags=["reference"])


# Catálogo de tabelas aceitas — mapeia slug da URL → (Model, audit_resource)
_TABLES: dict[str, tuple[Any, str]] = {
    "nacionalidades": (RefNacionalidade, "ref_nacionalidade"),
    "racas": (RefRaca, "ref_raca"),
    "etnias": (RefEtnia, "ref_etnia"),
    "logradouros": (RefLogradouro, "ref_logradouro"),
    "tipos-documento": (RefTipoDocumento, "ref_tipo_documento"),
    "estados-civis": (RefEstadoCivil, "ref_estado_civil"),
    "escolaridades": (RefEscolaridade, "ref_escolaridade"),
    "religioes": (RefReligiao, "ref_religiao"),
    "tipos-sanguineos": (RefTipoSanguineo, "ref_tipo_sanguineo"),
    "povos-tradicionais": (RefPovoTradicional, "ref_povo_tradicional"),
    "deficiencias": (RefDeficiencia, "ref_deficiencia"),
    "parentescos": (RefParentesco, "ref_parentesco"),
    "orientacoes-sexuais": (RefOrientacaoSexual, "ref_orientacao_sexual"),
    "identidades-genero": (RefIdentidadeGenero, "ref_identidade_genero"),
}


def _get_model(kind: str) -> tuple[Any, str]:
    if kind not in _TABLES:
        raise HTTPException(status_code=404, detail=f"Tabela de referência desconhecida: {kind!r}.")
    return _TABLES[kind]


# Label singular legível pro audit ("ref_etnia" → "etnia", "ref_tipo_sanguineo" → "tipo sanguíneo").
_RESOURCE_LABEL: dict[str, str] = {
    "ref_nacionalidade":      "nacionalidade",
    "ref_raca":               "raça",
    "ref_etnia":              "etnia",
    "ref_logradouro":         "tipo de logradouro",
    "ref_tipo_documento":     "tipo de documento",
    "ref_estado_civil":       "estado civil",
    "ref_escolaridade":       "escolaridade",
    "ref_religiao":           "religião",
    "ref_tipo_sanguineo":     "tipo sanguíneo",
    "ref_povo_tradicional":   "povo tradicional",
    "ref_deficiencia":        "deficiência",
    "ref_parentesco":         "parentesco",
    "ref_orientacao_sexual":  "orientação sexual",
    "ref_identidade_genero":  "identidade de gênero",
}


def _label(resource: str) -> str:
    return _RESOURCE_LABEL.get(resource, resource.replace("_", " "))


from app.db.query_helpers import unaccent_ilike as _unaccent_ilike


@router.get("/{kind}", response_model=Page[RefOut])
async def list_refs(
    kind: str,
    db: DB,
    user: MasterDep,
    search: str | None = None,
    active: bool | None = None,
    sort: str = "codigo",
    dir: str = Query(default="asc", alias="dir"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
) -> Page[RefOut]:
    Model, _ = _get_model(kind)
    pp = PageParams(page=page, page_size=page_size)

    filters: list[Any] = []
    if search:
        filters.append(or_(_unaccent_ilike(Model.codigo, search), _unaccent_ilike(Model.descricao, search)))
    if active is not None:
        filters.append(Model.active == active)

    base = select(Model)
    if filters:
        base = base.where(*filters)

    count_base = select(func.count()).select_from(Model)
    if filters:
        count_base = count_base.where(*filters)
    total = await db.scalar(count_base) or 0

    sort_cols: dict[str, Any] = {
        "codigo": Model.codigo,
        "descricao": Model.descricao,
        "active": Model.active,
        "isSystem": Model.is_system,
    }
    order_col = sort_cols.get(sort, Model.codigo)
    base = base.order_by(desc(order_col) if dir == "desc" else asc(order_col))

    rows = (await db.scalars(base.offset(pp.offset).limit(pp.limit))).all()

    return Page(items=[RefOut.model_validate(r, from_attributes=True) for r in rows],
                total=total, page=page, page_size=page_size)


@router.post("/{kind}", response_model=RefOut, status_code=201)
async def create_ref(kind: str, payload: RefCreate, db: DB, user: MasterDep) -> RefOut:
    Model, resource = _get_model(kind)

    existing = await db.scalar(select(Model).where(Model.codigo == payload.codigo))
    if existing is not None:
        raise HTTPException(status_code=409, detail=f"Código {payload.codigo!r} já existe.")

    row = Model(codigo=payload.codigo, descricao=payload.descricao, active=payload.active, is_system=False)
    db.add(row)
    await db.flush()

    actor = get_audit_context().user_name
    await write_audit(
        db, module="reference", action="reference_create", severity="info",
        resource=resource, resource_id=str(row.id),
        description=describe_change(
            actor=actor, verb="cadastrou",
            target_kind=_label(resource),
            target_name=f"{row.descricao} ({row.codigo})",
        ),
        details={"codigo": row.codigo, "descricao": row.descricao},
    )
    return RefOut.model_validate(row, from_attributes=True)


@router.patch("/{kind}/{ref_id}", response_model=RefOut)
async def update_ref(kind: str, ref_id: UUID, payload: RefUpdate, db: DB, user: MasterDep) -> RefOut:
    Model, resource = _get_model(kind)

    row = await db.scalar(select(Model).where(Model.id == ref_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Registro não encontrado.")

    changes: dict[str, Any] = {}
    if payload.descricao is not None:
        if row.is_system and payload.descricao != row.descricao:
            raise HTTPException(status_code=400, detail="Registros do sistema não permitem edição da descrição.")
        if payload.descricao != row.descricao:
            changes["descricao"] = {"from": row.descricao, "to": payload.descricao}
            row.descricao = payload.descricao
    if payload.active is not None and payload.active != row.active:
        changes["active"] = {"from": row.active, "to": payload.active}
        row.active = payload.active

    if changes:
        await db.flush()
        actor = get_audit_context().user_name
        field_labels = [{"descricao": "descrição", "active": "ativo"}.get(k, k) for k in changes]
        await write_audit(
            db, module="reference", action="reference_update", severity="info",
            resource=resource, resource_id=str(row.id),
            description=describe_change(
                actor=actor, verb="editou",
                target_kind=_label(resource),
                target_name=f"{row.descricao} ({row.codigo})",
                changed_fields=field_labels,
            ),
            details={"codigo": row.codigo, "changes": changes},
        )

    return RefOut.model_validate(row, from_attributes=True)


@router.delete("/{kind}/{ref_id}", status_code=204)
async def delete_ref(kind: str, ref_id: UUID, db: DB, user: MasterDep) -> None:
    Model, resource = _get_model(kind)

    row = await db.scalar(select(Model).where(Model.id == ref_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Registro não encontrado.")
    if row.is_system:
        raise HTTPException(status_code=400, detail="Registros do sistema não podem ser removidos. Use desativar.")

    await db.delete(row)
    await db.flush()

    actor = get_audit_context().user_name
    await write_audit(
        db, module="reference", action="reference_delete", severity="warning",
        resource=resource, resource_id=str(ref_id),
        description=describe_change(
            actor=actor, verb="removeu",
            target_kind=_label(resource),
            target_name=f"{row.descricao} ({row.codigo})",
        ),
        details={"codigo": row.codigo, "descricao": row.descricao},
    )
