from __future__ import annotations

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select

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


@router.get("/cbo", response_model=Page[CboOut])
async def search_cbos(
    db: DB,
    ctx: CurrentContextDep,
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[CboOut]:
    pp = PageParams(page=page, page_size=page_size)

    base = select(SigtapCbo)
    if search:
        term = f"%{search}%"
        base = base.where(or_(SigtapCbo.codigo.ilike(term), SigtapCbo.descricao.ilike(term)))

    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    rows = (await db.scalars(base.order_by(SigtapCbo.codigo).offset(pp.offset).limit(pp.limit))).all()

    return Page(items=[CboOut.model_validate(r) for r in rows], total=total or 0, page=page, page_size=page_size)


@router.get("/cid", response_model=Page[CidOut])
async def search_cids(
    db: DB,
    ctx: CurrentContextDep,
    search: str | None = None,
    sexo: str | None = None,
    agravo: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[CidOut]:
    pp = PageParams(page=page, page_size=page_size)

    base = select(SigtapCid)
    if search:
        term = f"%{search}%"
        base = base.where(or_(SigtapCid.codigo.ilike(term), SigtapCid.descricao.ilike(term)))
    if sexo:
        base = base.where(SigtapCid.sexo == sexo)
    if agravo:
        base = base.where(SigtapCid.agravo == agravo)

    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    rows = (await db.scalars(base.order_by(SigtapCid.codigo).offset(pp.offset).limit(pp.limit))).all()

    return Page(items=[CidOut.model_validate(r) for r in rows], total=total or 0, page=page, page_size=page_size)


@router.get("/procedimentos", response_model=Page[ProcedimentoOut])
async def search_procedimentos(
    db: DB,
    ctx: CurrentContextDep,
    search: str | None = None,
    complexidade: str | None = None,
    sexo: str | None = None,
    revogado: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[ProcedimentoOut]:
    pp = PageParams(page=page, page_size=page_size)

    base = select(SigtapProcedure).where(SigtapProcedure.revogado == revogado)
    if search:
        term = f"%{search}%"
        base = base.where(or_(SigtapProcedure.codigo.ilike(term), SigtapProcedure.nome.ilike(term)))
    if complexidade:
        base = base.where(SigtapProcedure.complexidade == complexidade)
    if sexo:
        base = base.where(SigtapProcedure.sexo == sexo)

    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    rows = (await db.scalars(base.order_by(SigtapProcedure.codigo).offset(pp.offset).limit(pp.limit))).all()

    return Page(items=[ProcedimentoOut.model_validate(r) for r in rows], total=total or 0, page=page, page_size=page_size)


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
        base = base.where(SigtapProcedure.nome.ilike(f"%{search}%"))

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
        base = base.where(SigtapProcedure.nome.ilike(f"%{search}%"))

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
