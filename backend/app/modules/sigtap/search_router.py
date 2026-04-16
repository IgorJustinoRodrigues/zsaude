from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.sql import expression

from app.core.deps import DB, CurrentContextDep
from app.core.pagination import Page, PageParams
from app.modules.sigtap.models import (
    SigtapCbo,
    SigtapCid,
    SigtapProcedure,
    SigtapProcedureCbo,
    SigtapProcedureCid,
)
from app.modules.sigtap.search_schemas import (
    CboOut,
    CboProcedimentoOut,
    CidOut,
    CidProcedimentoOut,
    ProcedimentoOut,
)

router = APIRouter(prefix="/sigtap/search", tags=["sigtap-search"])


def _unaccent_ilike(column: expression.ColumnElement, term: str) -> expression.ColumnElement:
    return func.unaccent(func.lower(column)).ilike(func.unaccent(func.lower(f"%{term}%")))


def _order(col: Any, direction: str) -> Any:
    return desc(col) if direction == "desc" else asc(col)


# ── CBO ──────────────────────────────────────────────────────────────────────

_CBO_SORT_COLS: dict[str, Any] = {
    "codigo": SigtapCbo.codigo,
    "descricao": SigtapCbo.descricao,
}


@router.get("/cbo", response_model=Page[CboOut])
async def search_cbos(
    db: DB,
    ctx: CurrentContextDep,
    search: str | None = None,
    sort: str = "codigo",
    dir: str = Query(default="asc", alias="dir"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[CboOut]:
    pp = PageParams(page=page, page_size=page_size)

    proc_count = (
        select(func.count())
        .where(SigtapProcedureCbo.codigo_cbo == SigtapCbo.codigo)
        .correlate(SigtapCbo)
        .scalar_subquery()
        .label("total_procedimentos")
    )

    filters = []
    if search:
        filters.append(or_(_unaccent_ilike(SigtapCbo.codigo, search), _unaccent_ilike(SigtapCbo.descricao, search)))

    base = select(SigtapCbo, proc_count)
    if filters:
        base = base.where(*filters)

    count_base = select(func.count()).select_from(SigtapCbo)
    if filters:
        count_base = count_base.where(*filters)
    total = await db.scalar(count_base) or 0

    order_col = _CBO_SORT_COLS.get(sort)
    if sort == "totalProcedimentos":
        order_col = proc_count
    if order_col is None:
        order_col = SigtapCbo.codigo

    rows = (await db.execute(base.order_by(_order(order_col, dir)).offset(pp.offset).limit(pp.limit))).all()

    items = [
        CboOut(codigo=r.SigtapCbo.codigo, descricao=r.SigtapCbo.descricao, total_procedimentos=r.total_procedimentos)
        for r in rows
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)


# ── CID ──────────────────────────────────────────────────────────────────────

_CID_SORT_COLS: dict[str, Any] = {
    "codigo": SigtapCid.codigo,
    "descricao": SigtapCid.descricao,
    "sexo": SigtapCid.sexo,
    "agravo": SigtapCid.agravo,
}


@router.get("/cid", response_model=Page[CidOut])
async def search_cids(
    db: DB,
    ctx: CurrentContextDep,
    search: str | None = None,
    sexo: str | None = None,
    agravo: str | None = None,
    sort: str = "codigo",
    dir: str = Query(default="asc", alias="dir"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[CidOut]:
    pp = PageParams(page=page, page_size=page_size)

    proc_count = (
        select(func.count())
        .where(SigtapProcedureCid.codigo_cid == SigtapCid.codigo)
        .correlate(SigtapCid)
        .scalar_subquery()
        .label("total_procedimentos")
    )

    filters = []
    if search:
        filters.append(or_(_unaccent_ilike(SigtapCid.codigo, search), _unaccent_ilike(SigtapCid.descricao, search)))
    if sexo:
        filters.append(SigtapCid.sexo == sexo)
    if agravo:
        filters.append(SigtapCid.agravo == agravo)

    base = select(SigtapCid, proc_count)
    if filters:
        base = base.where(*filters)

    count_base = select(func.count()).select_from(SigtapCid)
    if filters:
        count_base = count_base.where(*filters)
    total = await db.scalar(count_base) or 0

    order_col = _CID_SORT_COLS.get(sort)
    if sort == "totalProcedimentos":
        order_col = proc_count
    if order_col is None:
        order_col = SigtapCid.codigo

    rows = (await db.execute(base.order_by(_order(order_col, dir)).offset(pp.offset).limit(pp.limit))).all()

    items = [
        CidOut(
            codigo=r.SigtapCid.codigo, descricao=r.SigtapCid.descricao,
            agravo=r.SigtapCid.agravo, sexo=r.SigtapCid.sexo,
            total_procedimentos=r.total_procedimentos,
        )
        for r in rows
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)


# ── Procedimentos ────────────────────────────────────────────────────────────

_PROC_SORT_COLS: dict[str, Any] = {
    "codigo": SigtapProcedure.codigo,
    "nome": SigtapProcedure.nome,
    "complexidade": SigtapProcedure.complexidade,
}


@router.get("/procedimentos", response_model=Page[ProcedimentoOut])
async def search_procedimentos(
    db: DB,
    ctx: CurrentContextDep,
    search: str | None = None,
    complexidade: str | None = None,
    sexo: str | None = None,
    revogado: bool = False,
    sort: str = "codigo",
    dir: str = Query(default="asc", alias="dir"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[ProcedimentoOut]:
    pp = PageParams(page=page, page_size=page_size)

    base = select(SigtapProcedure).where(SigtapProcedure.revogado == revogado)
    if search:
        base = base.where(or_(_unaccent_ilike(SigtapProcedure.codigo, search), _unaccent_ilike(SigtapProcedure.nome, search)))
    if complexidade:
        base = base.where(SigtapProcedure.complexidade == complexidade)
    if sexo:
        base = base.where(SigtapProcedure.sexo == sexo)

    total = await db.scalar(select(func.count()).select_from(base.subquery()))

    order_col = _PROC_SORT_COLS.get(sort)
    if sort == "valorTotal":
        order_col = SigtapProcedure.valor_sh + SigtapProcedure.valor_sa + SigtapProcedure.valor_sp
    if order_col is None:
        order_col = SigtapProcedure.codigo

    rows = (await db.scalars(base.order_by(_order(order_col, dir)).offset(pp.offset).limit(pp.limit))).all()

    return Page(items=[ProcedimentoOut.model_validate(r) for r in rows], total=total or 0, page=page, page_size=page_size)


# ── CBO × Procedimentos ─────────────────────────────────────────────────────


@router.get("/cbo-procedimentos", response_model=Page[CboProcedimentoOut])
async def search_cbo_procedimentos(
    db: DB,
    ctx: CurrentContextDep,
    codigo_cbo: str = Query(..., alias="codigoCbo"),
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[CboProcedimentoOut]:
    pp = PageParams(page=page, page_size=page_size)

    base = (
        select(SigtapProcedureCbo, SigtapProcedure)
        .join(SigtapProcedure, SigtapProcedureCbo.codigo_procedimento == SigtapProcedure.codigo)
        .where(SigtapProcedureCbo.codigo_cbo == codigo_cbo)
        .where(SigtapProcedure.revogado == False)  # noqa: E712
    )
    if search:
        base = base.where(_unaccent_ilike(SigtapProcedure.nome, search))

    total = await db.scalar(select(func.count()).select_from(base.subquery()))

    rows = (await db.execute(
        base.order_by(SigtapProcedure.codigo).offset(pp.offset).limit(pp.limit)
    )).all()

    items = [
        CboProcedimentoOut(
            codigo_procedimento=proc.codigo,
            nome_procedimento=proc.nome,
            complexidade=proc.complexidade,
            valor_sh=proc.valor_sh,
            valor_sa=proc.valor_sa,
            valor_sp=proc.valor_sp,
            competencia=rel.competencia,
        )
        for rel, proc in rows
    ]
    return Page(items=items, total=total or 0, page=page, page_size=page_size)


# ── CID × Procedimentos ─────────────────────────────────────────────────────


@router.get("/cid-procedimentos", response_model=Page[CidProcedimentoOut])
async def search_cid_procedimentos(
    db: DB,
    ctx: CurrentContextDep,
    codigo_cid: str = Query(..., alias="codigoCid"),
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[CidProcedimentoOut]:
    pp = PageParams(page=page, page_size=page_size)

    base = (
        select(SigtapProcedureCid, SigtapProcedure)
        .join(SigtapProcedure, SigtapProcedureCid.codigo_procedimento == SigtapProcedure.codigo)
        .where(SigtapProcedureCid.codigo_cid == codigo_cid)
        .where(SigtapProcedure.revogado == False)  # noqa: E712
    )
    if search:
        base = base.where(_unaccent_ilike(SigtapProcedure.nome, search))

    total = await db.scalar(select(func.count()).select_from(base.subquery()))

    rows = (await db.execute(
        base.order_by(SigtapProcedure.codigo).offset(pp.offset).limit(pp.limit)
    )).all()

    items = [
        CidProcedimentoOut(
            codigo_procedimento=proc.codigo,
            nome_procedimento=proc.nome,
            complexidade=proc.complexidade,
            principal=rel.principal,
            valor_sh=proc.valor_sh,
            valor_sa=proc.valor_sa,
            valor_sp=proc.valor_sp,
            competencia=rel.competencia,
        )
        for rel, proc in rows
    ]
    return Page(items=items, total=total or 0, page=page, page_size=page_size)
