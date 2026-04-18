"""Seed das tabelas de referência globais do cadastro de paciente.

Fonte: DATASUS / e-SUS APS (códigos oficiais) + ampliações locais.
Os dados vivem nas migrations Alembic (``0012``, ``0013``, ``0014``) e
são importados via ``_loader.load_migration_module`` pra não duplicar.

Idempotente — faz upsert por ``codigo`` em cada tabela.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.dialect import get_adapter
from app.db.seeds._loader import load_migration_module
from app.db.types import new_uuid7
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


async def _upsert_ref(
    session: AsyncSession,
    model: type,
    rows: list[tuple[str, str]],
    *,
    is_system: bool = True,
) -> int:
    """Upsert genérico para tabelas de referência (codigo, descricao)."""
    adapter = get_adapter(session.bind.dialect.name)
    values = [
        {
            "id": new_uuid7(),
            "codigo": codigo,
            "descricao": descricao,
            "is_system": is_system,
            "active": True,
        }
        for codigo, descricao in rows
    ]
    if not values:
        return 0
    await adapter.execute_upsert(
        session,
        model,
        values,
        index_elements=["codigo"],
        update_columns=["descricao", "is_system", "active"],
    )
    return len(values)


async def apply(session: AsyncSession) -> int:
    """Aplica todos os seeds de referência. Retorna contagem total."""
    total = 0

    # Migration 0012 — nacionalidades, raças, logradouros
    m12 = load_migration_module("20260416_0012_reference_tables.py")
    total += await _upsert_ref(session, RefNacionalidade, m12.NACIONALIDADES)
    total += await _upsert_ref(session, RefRaca, m12.RACAS)
    total += await _upsert_ref(session, RefLogradouro, m12.LOGRADOUROS)

    # Migration 0013 — etnias
    m13 = load_migration_module("20260416_0013_seed_etnias.py")
    total += await _upsert_ref(session, RefEtnia, m13.ETNIAS)

    # Migration 0014 — ampliações (tipos doc, estado civil, etc)
    m14 = load_migration_module("20260416_0014_reference_tables_expand.py")
    # Após 0015, CPF deixa de ser tipo de documento (campo separado em patients).
    tipos_doc = [t for t in m14.TIPOS_DOCUMENTO if t[0] != "CPF"]
    # Adições de 0015 (NIS, TIT, CADU, CN, CC)
    tipos_doc_extra = [
        ("NIS", "Número de Identificação Social (NIS/PIS/PASEP)"),
        ("TIT", "Título de Eleitor"),
        ("CADU", "Cadastro Único (CadÚnico)"),
        ("CN", "Certidão de Nascimento"),
        ("CC", "Certidão de Casamento"),
    ]
    total += await _upsert_ref(session, RefTipoDocumento, tipos_doc + tipos_doc_extra)

    total += await _upsert_ref(session, RefEstadoCivil, m14.ESTADOS_CIVIS)
    total += await _upsert_ref(session, RefEscolaridade, m14.ESCOLARIDADES)
    total += await _upsert_ref(session, RefReligiao, m14.RELIGIOES)
    total += await _upsert_ref(session, RefTipoSanguineo, m14.TIPOS_SANGUINEOS)
    total += await _upsert_ref(session, RefPovoTradicional, m14.POVOS_TRADICIONAIS)
    total += await _upsert_ref(session, RefDeficiencia, m14.DEFICIENCIAS)
    total += await _upsert_ref(session, RefParentesco, m14.PARENTESCOS)
    total += await _upsert_ref(session, RefOrientacaoSexual, m14.ORIENTACOES_SEXUAIS)
    total += await _upsert_ref(session, RefIdentidadeGenero, m14.IDENTIDADES_GENERO)

    return total
