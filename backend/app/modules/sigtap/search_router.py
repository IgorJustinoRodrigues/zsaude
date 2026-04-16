from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.sql import expression

from app.core.deps import DB, CurrentContextDep
from app.core.pagination import Page, PageParams
from app.modules.sigtap.models import (
    SigtapCbo,
    SigtapCid,
    SigtapFormaOrganizacao,
    SigtapHabilitacao,
    SigtapProcedure,
    SigtapProcedureCbo,
    SigtapProcedureCid,
    SigtapProcedureCompatibilidade,
    SigtapProcedureDescription,
    SigtapProcedureHabilitacao,
    SigtapProcedureServico,
    SigtapService,
    SigtapServiceClassification,
)
from app.modules.sigtap.search_schemas import (
    CboOut,
    CboProcedimentoOut,
    CidOut,
    CidProcedimentoOut,
    CompatibilidadeOut,
    FormaOrganizacaoOut,
    HabilitacaoOut,
    HabilitacaoProcedimentoOut,
    ProcedimentoComCompatOut,
    ProcedimentoDescricaoOut,
    ProcedimentoOut,
    ServicoProcedimentoOut,
    ServicoOut,
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


# ── Serviços ────────────────────────────────────────────────────────────

_SERVICO_SORT_COLS: dict[str, Any] = {
    "codigo": SigtapService.codigo,
    "descricao": SigtapService.descricao,
}


@router.get("/servicos", response_model=Page[ServicoOut])
async def search_servicos(
    db: DB,
    ctx: CurrentContextDep,
    search: str | None = None,
    sort: str = "codigo",
    dir: str = Query(default="asc", alias="dir"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[ServicoOut]:
    pp = PageParams(page=page, page_size=page_size)

    class_count = (
        select(func.count())
        .where(SigtapServiceClassification.codigo_servico == SigtapService.codigo)
        .correlate(SigtapService)
        .scalar_subquery()
        .label("total_classificacoes")
    )
    proc_count = (
        select(func.count())
        .where(SigtapProcedureServico.codigo_servico == SigtapService.codigo)
        .correlate(SigtapService)
        .scalar_subquery()
        .label("total_procedimentos")
    )

    filters = []
    if search:
        filters.append(or_(_unaccent_ilike(SigtapService.codigo, search), _unaccent_ilike(SigtapService.descricao, search)))

    base = select(SigtapService, class_count, proc_count)
    if filters:
        base = base.where(*filters)

    count_base = select(func.count()).select_from(SigtapService)
    if filters:
        count_base = count_base.where(*filters)
    total = await db.scalar(count_base) or 0

    order_col = _SERVICO_SORT_COLS.get(sort)
    if sort == "totalClassificacoes":
        order_col = class_count
    elif sort == "totalProcedimentos":
        order_col = proc_count
    if order_col is None:
        order_col = SigtapService.codigo

    rows = (await db.execute(base.order_by(_order(order_col, dir)).offset(pp.offset).limit(pp.limit))).all()

    items = [
        ServicoOut(
            codigo=r.SigtapService.codigo,
            descricao=r.SigtapService.descricao,
            competencia=r.SigtapService.competencia,
            total_classificacoes=r.total_classificacoes,
            total_procedimentos=r.total_procedimentos,
        )
        for r in rows
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)


# ── Serviço × Procedimentos ────────────────────────────────────────────


@router.get("/servico-procedimentos", response_model=Page[ServicoProcedimentoOut])
async def search_servico_procedimentos(
    db: DB,
    ctx: CurrentContextDep,
    codigo_servico: str = Query(..., alias="codigoServico"),
    codigo_classificacao: str | None = Query(default=None, alias="codigoClassificacao"),
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[ServicoProcedimentoOut]:
    pp = PageParams(page=page, page_size=page_size)

    base = (
        select(SigtapProcedureServico, SigtapProcedure)
        .join(SigtapProcedure, SigtapProcedureServico.codigo_procedimento == SigtapProcedure.codigo)
        .where(SigtapProcedureServico.codigo_servico == codigo_servico)
        .where(SigtapProcedure.revogado == False)  # noqa: E712
    )
    if codigo_classificacao:
        base = base.where(SigtapProcedureServico.codigo_classificacao == codigo_classificacao)
    if search:
        base = base.where(_unaccent_ilike(SigtapProcedure.nome, search))

    total = await db.scalar(select(func.count()).select_from(base.subquery()))

    rows = (await db.execute(
        base.order_by(SigtapProcedure.codigo).offset(pp.offset).limit(pp.limit)
    )).all()

    items = [
        ServicoProcedimentoOut(
            codigo_procedimento=proc.codigo,
            nome_procedimento=proc.nome,
            complexidade=proc.complexidade,
            codigo_classificacao=rel.codigo_classificacao,
            valor_sh=proc.valor_sh,
            valor_sa=proc.valor_sa,
            valor_sp=proc.valor_sp,
            competencia=rel.competencia,
        )
        for rel, proc in rows
    ]
    return Page(items=items, total=total or 0, page=page, page_size=page_size)


# ── Habilitações ────────────────────────────────────────────────────────

_HAB_SORT_COLS: dict[str, Any] = {
    "codigo": SigtapHabilitacao.codigo,
    "descricao": SigtapHabilitacao.descricao,
}


@router.get("/habilitacoes", response_model=Page[HabilitacaoOut])
async def search_habilitacoes(
    db: DB,
    ctx: CurrentContextDep,
    search: str | None = None,
    sort: str = "codigo",
    dir: str = Query(default="asc", alias="dir"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[HabilitacaoOut]:
    pp = PageParams(page=page, page_size=page_size)

    proc_count = (
        select(func.count())
        .where(SigtapProcedureHabilitacao.codigo_habilitacao == SigtapHabilitacao.codigo)
        .correlate(SigtapHabilitacao)
        .scalar_subquery()
        .label("total_procedimentos")
    )

    filters = []
    if search:
        filters.append(or_(_unaccent_ilike(SigtapHabilitacao.codigo, search), _unaccent_ilike(SigtapHabilitacao.descricao, search)))

    base = select(SigtapHabilitacao, proc_count)
    if filters:
        base = base.where(*filters)

    count_base = select(func.count()).select_from(SigtapHabilitacao)
    if filters:
        count_base = count_base.where(*filters)
    total = await db.scalar(count_base) or 0

    order_col = _HAB_SORT_COLS.get(sort)
    if sort == "totalProcedimentos":
        order_col = proc_count
    if order_col is None:
        order_col = SigtapHabilitacao.codigo

    rows = (await db.execute(base.order_by(_order(order_col, dir)).offset(pp.offset).limit(pp.limit))).all()

    items = [
        HabilitacaoOut(
            codigo=r.SigtapHabilitacao.codigo,
            descricao=r.SigtapHabilitacao.descricao,
            competencia=r.SigtapHabilitacao.competencia,
            total_procedimentos=r.total_procedimentos,
        )
        for r in rows
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)


# ── Habilitação × Procedimentos ────────────────────────────────────────


@router.get("/habilitacao-procedimentos", response_model=Page[HabilitacaoProcedimentoOut])
async def search_habilitacao_procedimentos(
    db: DB,
    ctx: CurrentContextDep,
    codigo_habilitacao: str = Query(..., alias="codigoHabilitacao"),
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[HabilitacaoProcedimentoOut]:
    pp = PageParams(page=page, page_size=page_size)

    base = (
        select(SigtapProcedureHabilitacao, SigtapProcedure)
        .join(SigtapProcedure, SigtapProcedureHabilitacao.codigo_procedimento == SigtapProcedure.codigo)
        .where(SigtapProcedureHabilitacao.codigo_habilitacao == codigo_habilitacao)
        .where(SigtapProcedure.revogado == False)  # noqa: E712
    )
    if search:
        base = base.where(_unaccent_ilike(SigtapProcedure.nome, search))

    total = await db.scalar(select(func.count()).select_from(base.subquery()))

    rows = (await db.execute(
        base.order_by(SigtapProcedure.codigo).offset(pp.offset).limit(pp.limit)
    )).all()

    items = [
        HabilitacaoProcedimentoOut(
            codigo_procedimento=proc.codigo,
            nome_procedimento=proc.nome,
            complexidade=proc.complexidade,
            codigo_grupo_habilitacao=rel.codigo_grupo_habilitacao,
            valor_sh=proc.valor_sh,
            valor_sa=proc.valor_sa,
            valor_sp=proc.valor_sp,
            competencia=rel.competencia,
        )
        for rel, proc in rows
    ]
    return Page(items=items, total=total or 0, page=page, page_size=page_size)


# ── Procedimentos COM compatibilidades (listagem) ─────────────────────────

_PROC_COMPAT_SORT_COLS: dict[str, Any] = {
    "codigo": SigtapProcedure.codigo,
    "nome": SigtapProcedure.nome,
    "complexidade": SigtapProcedure.complexidade,
}


@router.get("/procedimentos-com-compatibilidades", response_model=Page[ProcedimentoComCompatOut])
async def search_procedimentos_com_compatibilidades(
    db: DB,
    ctx: CurrentContextDep,
    search: str | None = None,
    sort: str = "codigo",
    dir: str = Query(default="asc", alias="dir"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[ProcedimentoComCompatOut]:
    pp = PageParams(page=page, page_size=page_size)

    compat_count = (
        select(func.count())
        .where(SigtapProcedureCompatibilidade.codigo_procedimento == SigtapProcedure.codigo)
        .correlate(SigtapProcedure)
        .scalar_subquery()
        .label("total_compatibilidades")
    )

    # Só procedimentos ativos que TÊM ao menos uma compatibilidade.
    filters = [
        SigtapProcedure.revogado == False,  # noqa: E712
        SigtapProcedure.codigo.in_(
            select(SigtapProcedureCompatibilidade.codigo_procedimento).distinct()
        ),
    ]
    if search:
        filters.append(or_(
            _unaccent_ilike(SigtapProcedure.codigo, search),
            _unaccent_ilike(SigtapProcedure.nome, search),
        ))

    base = select(SigtapProcedure, compat_count).where(*filters)
    count_base = select(func.count()).select_from(SigtapProcedure).where(*filters)
    total = await db.scalar(count_base) or 0

    order_col = _PROC_COMPAT_SORT_COLS.get(sort)
    if sort == "totalCompatibilidades":
        order_col = compat_count
    if order_col is None:
        order_col = SigtapProcedure.codigo

    rows = (await db.execute(base.order_by(_order(order_col, dir)).offset(pp.offset).limit(pp.limit))).all()

    items = [
        ProcedimentoComCompatOut(
            codigo=r.SigtapProcedure.codigo,
            nome=r.SigtapProcedure.nome,
            complexidade=r.SigtapProcedure.complexidade,
            total_compatibilidades=r.total_compatibilidades,
        )
        for r in rows
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)


# ── Compatibilidades ───────────────────────────────────────────────────


@router.get("/compatibilidades", response_model=Page[CompatibilidadeOut])
async def search_compatibilidades(
    db: DB,
    ctx: CurrentContextDep,
    codigo_procedimento: str = Query(..., alias="codigoProcedimento"),
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[CompatibilidadeOut]:
    pp = PageParams(page=page, page_size=page_size)

    proc_sec = SigtapProcedure
    base = (
        select(SigtapProcedureCompatibilidade, proc_sec)
        .join(proc_sec, SigtapProcedureCompatibilidade.codigo_procedimento_secundario == proc_sec.codigo)
        .where(SigtapProcedureCompatibilidade.codigo_procedimento == codigo_procedimento)
        .where(proc_sec.revogado == False)  # noqa: E712
    )
    if search:
        base = base.where(_unaccent_ilike(proc_sec.nome, search))

    total = await db.scalar(select(func.count()).select_from(base.subquery()))

    rows = (await db.execute(
        base.order_by(proc_sec.codigo).offset(pp.offset).limit(pp.limit)
    )).all()

    items = [
        CompatibilidadeOut(
            codigo_procedimento=rel.codigo_procedimento,
            codigo_procedimento_secundario=rel.codigo_procedimento_secundario,
            nome_procedimento_secundario=proc.nome,
            registro_principal=rel.registro_principal,
            registro_secundario=rel.registro_secundario,
            tipo_compatibilidade=rel.tipo_compatibilidade,
            quantidade_permitida=rel.quantidade_permitida,
            competencia=rel.competencia,
        )
        for rel, proc in rows
    ]
    return Page(items=items, total=total or 0, page=page, page_size=page_size)


# ── Formas de Organização ──────────────────────────────────────────────

_FORMA_SORT_COLS: dict[str, Any] = {
    "codigoGrupo": SigtapFormaOrganizacao.codigo_grupo,
    "descricao": SigtapFormaOrganizacao.descricao,
}


@router.get("/formas-organizacao", response_model=Page[FormaOrganizacaoOut])
async def search_formas_organizacao(
    db: DB,
    ctx: CurrentContextDep,
    search: str | None = None,
    sort: str = "codigoGrupo",
    dir: str = Query(default="asc", alias="dir"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[FormaOrganizacaoOut]:
    pp = PageParams(page=page, page_size=page_size)

    filters = []
    if search:
        filters.append(or_(
            _unaccent_ilike(SigtapFormaOrganizacao.codigo_grupo, search),
            _unaccent_ilike(SigtapFormaOrganizacao.descricao, search),
        ))

    base = select(SigtapFormaOrganizacao)
    if filters:
        base = base.where(*filters)

    total = await db.scalar(select(func.count()).select_from(base.subquery()))

    order_col = _FORMA_SORT_COLS.get(sort)
    if order_col is None:
        order_col = SigtapFormaOrganizacao.codigo_grupo

    rows = (await db.scalars(base.order_by(_order(order_col, dir)).offset(pp.offset).limit(pp.limit))).all()

    items = [
        FormaOrganizacaoOut(
            codigo_grupo=r.codigo_grupo,
            codigo_subgrupo=r.codigo_subgrupo,
            codigo_forma=r.codigo_forma,
            descricao=r.descricao,
            competencia=r.competencia,
        )
        for r in rows
    ]
    return Page(items=items, total=total or 0, page=page, page_size=page_size)


# ── Procedimento Descrição ─────────────────────────────────────────────


@router.get("/procedimento-descricao/{codigo}", response_model=ProcedimentoDescricaoOut)
async def get_procedimento_descricao(
    db: DB,
    ctx: CurrentContextDep,
    codigo: str,
) -> ProcedimentoDescricaoOut:
    row = await db.scalar(
        select(SigtapProcedureDescription)
        .where(SigtapProcedureDescription.codigo_procedimento == codigo)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Descrição do procedimento não encontrada")
    return ProcedimentoDescricaoOut(
        codigo_procedimento=row.codigo_procedimento,
        descricao=row.descricao,
        competencia=row.competencia,
    )
