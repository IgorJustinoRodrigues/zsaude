"""Endpoints administrativos do CNES (MASTER/ADMIN).

Diferente do ``router`` principal — que depende de ``WorkContext`` pra
escopar no município ativo — aqui o ator escolhe o município por
``facility_id``/``municipality_id``. Usado pelo cadastro de usuário:
ao vincular CBO a um acesso-de-unidade, o admin pesquisa profissionais
no schema do município da unidade selecionada.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.deps import DB, AdminOrMasterDep, MasterDep
from app.core.schema_base import CamelModel
from app.modules.tenants.models import Facility, Municipality
from app.tenant_models.cnes import (
    CnesImport,
    CnesImportStatus,
    CnesProfessional,
    CnesProfessionalUnit,
    CnesUnit,
)

admin_router = APIRouter(prefix="/admin/cnes", tags=["cnes-admin"])


# ─── Schemas ──────────────────────────────────────────────────────────────


class CnesImportStatusOut(CamelModel):
    """Resumo do último import CNES de um município."""

    imported: bool
    last_import_at: datetime | None = None
    last_competencia: str | None = None
    last_status: str | None = None


class CnesProfessionalOption(CamelModel):
    """Opção do combobox de vínculo CNES."""

    cnes_professional_id: str  # id_profissional
    cpf: str
    nome: str
    cbo_id: str
    cbo_description: str
    unit_cnes: str          # cnes da unidade no CNES (lfces004)
    unit_name: str          # razão social / fantasia da unidade no CNES
    status: str             # 'Ativo' | 'Bloqueado'


# ─── Helpers ──────────────────────────────────────────────────────────────


async def _tenant_session_for_municipality(
    db: DB, municipality_id: UUID,
) -> tuple[AsyncSession, str]:
    """Abre uma nova AsyncSession apontando pro schema do município.

    Retorna ``(session, ibge)`` — caller é responsável por fechar via
    ``async with session:`` ou ``await session.close()``.
    """
    from app.db.dialect import adapter_for_engine
    from app.db.engine_registry import get_registry

    mun = await db.scalar(select(Municipality).where(Municipality.id == municipality_id))
    if mun is None:
        raise HTTPException(status_code=404, detail="Município não encontrado.")
    ibge = mun.ibge

    registry = get_registry()
    eng = registry.tenant_engine(ibge)
    adapter = adapter_for_engine(eng)
    session = async_sessionmaker(bind=eng, expire_on_commit=False)()
    conn = await session.connection()
    await adapter.set_search_path(conn, ibge)
    return session, ibge


# ─── Endpoints ────────────────────────────────────────────────────────────


@admin_router.get("/import-status", response_model=CnesImportStatusOut)
async def get_import_status(
    db: DB,
    _actor: AdminOrMasterDep,
    municipality_id: Annotated[UUID, Query(alias="municipalityId")],
) -> CnesImportStatusOut:
    """Diz se o município já tem CNES importado com sucesso.

    UI usa pra desabilitar o combo de vínculo + mostrar banner de "precisa
    importar" quando ``imported=false``.
    """
    session, _ibge = await _tenant_session_for_municipality(db, municipality_id)
    try:
        row = await session.scalar(
            select(CnesImport)
            .where(CnesImport.status.in_([
                CnesImportStatus.SUCCESS, CnesImportStatus.PARTIAL,
            ]))
            .order_by(desc(CnesImport.finished_at))
            .limit(1)
        )
    finally:
        await session.close()

    if row is None:
        return CnesImportStatusOut(imported=False)
    return CnesImportStatusOut(
        imported=True,
        last_import_at=row.finished_at,
        last_competencia=row.competencia,
        last_status=row.status.value if hasattr(row.status, "value") else str(row.status),
    )


@admin_router.get("/professionals", response_model=list[CnesProfessionalOption])
async def search_professionals(
    db: DB,
    _actor: AdminOrMasterDep,
    facility_id: Annotated[UUID, Query(alias="facilityId")],
    q: Annotated[str, Query(max_length=100)] = "",
    limit: Annotated[int, Query(ge=1, le=500)] = 20,
) -> list[CnesProfessionalOption]:
    """Busca profissionais ativos do CNES vinculados à unidade.

    Match: nome (ILIKE) OU CPF (prefixo). Retorna até ``limit`` opções
    com CBO e descrição já resolvidos.

    A unidade do zSaúde (``facilities.id``) se mapeia pro CNES por
    ``facilities.cnes`` → ``cnes_units.cnes``. Quando a ``facility`` não
    tem ``cnes`` cadastrado, retorna lista vazia.
    """
    fac = await db.scalar(select(Facility).where(Facility.id == facility_id))
    if fac is None:
        raise HTTPException(status_code=404, detail="Unidade não encontrada.")
    if not fac.cnes or not fac.cnes.strip():
        return []  # unidade sem CNES mapeado — nada a buscar

    session, _ibge = await _tenant_session_for_municipality(db, fac.municipality_id)
    try:
        # 1. Resolve o id_unidade do CNES a partir do código CNES da unidade.
        cnes_unit = await session.scalar(
            select(CnesUnit).where(CnesUnit.cnes == fac.cnes)
        )
        if cnes_unit is None:
            return []  # unidade não está no CNES importado ainda

        id_unidade = cnes_unit.id_unidade

        # 2. Busca vínculos profissional × unidade × CBO ativos.
        stmt = (
            select(CnesProfessionalUnit, CnesProfessional)
            .join(
                CnesProfessional,
                CnesProfessional.id_profissional == CnesProfessionalUnit.id_profissional,
            )
            .where(
                CnesProfessionalUnit.id_unidade == id_unidade,
                CnesProfessionalUnit.status == "Ativo",
            )
        )
        term = q.strip().lower()
        if term:
            # Tenta CPF puro (só dígitos) ou parte do nome (case-insensitive).
            digits = "".join(ch for ch in term if ch.isdigit())
            cpf_clause = (
                CnesProfessional.cpf.like(f"{digits}%") if digits else None
            )
            name_clause = CnesProfessional.nome.ilike(f"%{term}%")
            stmt = stmt.where(
                or_(cpf_clause, name_clause) if cpf_clause is not None else name_clause
            )
        stmt = stmt.order_by(CnesProfessional.nome).limit(limit)
        rows = (await session.execute(stmt)).all()

        # 3. Resolve descrições CBO em lote via SIGTAP (schema app).
        cbo_ids = {pu.id_cbo for pu, _ in rows if pu.id_cbo}
        cbo_desc_map: dict[str, str] = {}
        if cbo_ids:
            cbo_desc_map = await _load_cbo_descriptions(db, cbo_ids)

        unit_label = (cnes_unit.nome_fantasia or cnes_unit.razao_social or "").strip()

        return [
            CnesProfessionalOption(
                cnes_professional_id=prof.id_profissional,
                cpf=prof.cpf,
                nome=prof.nome,
                cbo_id=pu.id_cbo,
                cbo_description=cbo_desc_map.get(pu.id_cbo, ""),
                unit_cnes=fac.cnes or "",
                unit_name=unit_label,
                status=pu.status,
            )
            for pu, prof in rows
        ]
    finally:
        await session.close()


# ─── Upload/import pelo MASTER (sem work-context) ─────────────────────────


_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


@admin_router.post("/import", status_code=201)
async def import_cnes_master(
    file: Annotated[UploadFile, File(description="ZIP TXTPROC_<ibge>_<aaaamm>.zip")],
    db: DB,
    actor: MasterDep,
    municipality_id: Annotated[UUID, Query(alias="municipalityId")],
) -> dict:
    """Importa CNES pro município escolhido — sem precisar de WorkContext.

    Mesmo fluxo do endpoint ``/cnes/import`` (painel do município): extrai
    ZIP, valida IBGE, aplica transação no schema ``mun_<ibge>`` e registra
    histórico. A diferença aqui é só o scoping: MASTER escolhe o município
    por query param em vez de herdar do contexto ativo.
    """
    from app.core.audit import get_audit_context
    from app.core.exceptions import AppError
    from app.modules.audit.writer import write_audit
    from app.modules.cnes.service import CnesImportService
    from app.modules.users.models import User

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo muito grande (máx. {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB).",
        )

    session, ibge = await _tenant_session_for_municipality(db, municipality_id)
    try:
        user = await db.scalar(select(User).where(User.id == actor.id))
        svc = CnesImportService(
            session,
            expected_ibge=ibge,
            user_id=actor.id,
            user_name=user.name if user else "",
        )
        try:
            import_row = await svc.import_zip(raw, file.filename or "arquivo.zip")
        except AppError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"Falha na importação: {exc}") from exc
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()

    # Audit global (schema ``app``) — registra quem importou e qual município.
    actor_name = get_audit_context().user_name or (user.name if user else "MASTER")
    await write_audit(
        db,
        module="ops", action="cnes_import", severity="info",
        resource="cnes_import", resource_id=str(import_row.id),
        description=(
            f"{actor_name} importou CNES da competência {import_row.competencia} "
            f"(município IBGE {ibge} · {import_row.total_rows_processed} linhas · "
            f"status: {import_row.status.value})"
        ),
        details={
            "ibge": ibge,
            "municipalityId": str(municipality_id),
            "competencia": import_row.competencia,
            "status": import_row.status.value,
            "totalRows": import_row.total_rows_processed,
            "zipFilename": import_row.zip_filename,
            "via": "master",
        },
    )

    return {
        "id": str(import_row.id),
        "competencia": import_row.competencia,
        "status": import_row.status.value,
        "totalRowsProcessed": import_row.total_rows_processed,
        "zipFilename": import_row.zip_filename,
        "startedAt": import_row.started_at.isoformat(),
        "finishedAt": import_row.finished_at.isoformat() if import_row.finished_at else None,
    }


async def _load_cbo_descriptions(db: DB, cbo_ids: set[str]) -> dict[str, str]:
    """Consulta a descrição CBO no catálogo SIGTAP (schema ``app``).

    Usa o ``db`` principal (não o tenant) porque SIGTAP é global.
    Retorna mapa ``{cbo_id: descricao}`` — IDs sem match caem como ausentes.
    Se a SIGTAP ainda não foi importada, retorna vazio e o caller exibe
    apenas o código.
    """
    if not cbo_ids:
        return {}
    from app.modules.sigtap.models import SigtapCbo

    try:
        rows = await db.execute(
            select(SigtapCbo.codigo, SigtapCbo.descricao)
            .where(SigtapCbo.codigo.in_(cbo_ids))
        )
        return {str(c): str(d) for c, d in rows.all()}
    except Exception:
        return {}
