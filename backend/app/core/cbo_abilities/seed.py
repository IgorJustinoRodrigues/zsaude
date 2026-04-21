"""Seed das associações CBO → abilities.

Cada CBO da CBO2002 recebe o conjunto de abilities que a profissão tem
por competência legal. Associação é por **família CBO** (primeiros 4
dígitos) na maioria dos casos — cobre todos os CBOs terminais da
família sem enumerar um por um.

Exemplos de famílias usadas:
- ``2251`` Médicos (todas as especialidades)
- ``2232`` Cirurgião-dentista
- ``2235`` Enfermeiros (nível superior)
- ``3222`` Técnicos e auxiliares de enfermagem
- ``2234`` Farmacêutico
- ``2239`` Biomédico
- ``3241`` Técnico em patologia clínica
- ``2515`` Psicólogo
- ``2516`` Assistente social
- ``2237`` Nutricionista
- ``2236`` Fisioterapeuta
- ``2252`` Médico veterinário / sanitário (variações)
- ``5151`` Agente comunitário de saúde / endemias

Matching: prefixo. Assim ``225125`` (Médico clínico) pega tudo da
família 2251. CBOs específicos (ex.: regulador SAMU) podem ser
associados com o CBO completo.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.dialect import get_adapter
from app.modules.permissions.models import CboAbility

# Importa o catálogo p/ popular o registry antes de seedar.
from app.core.cbo_abilities import catalog  # noqa: F401 — side effect

# (prefixo_cbo_ou_cbo_completo, [ability_codes])
#
# Usar prefixo curto quando a ability vale para toda a família.
_CBO_PREFIX_ABILITIES: list[tuple[str, list[str]]] = [
    # Médicos — família 2251 (todas as especialidades clínicas)
    ("2251", [
        "clinical.prescribe",
        "clinical.prescribe_controlled",
        "clinical.release_lab_report",
        "clinical.release_imaging_report",
        "clinical.perform_procedure",
        "clinical.discharge",
        "clinical.declare_death",
        "clinical.screening",
    ]),
    # Cirurgião-dentista — 2232
    ("2232", [
        "clinical.prescribe",
        "clinical.prescribe_controlled",
        "clinical.perform_procedure",
    ]),
    # Enfermeiros — 2235 (nível superior)
    ("2235", [
        "clinical.prescribe",                # protocolos de enfermagem
        "clinical.screening",
        "clinical.execute_prescription",
    ]),
    # Técnicos e auxiliares de enfermagem — 3222
    ("3222", [
        "clinical.execute_prescription",
        "clinical.screening",
    ]),
    # Farmacêutico — 2234
    ("2234", [
        "pharmacy.dispense",
        "pharmacy.dispense_controlled",
    ]),
    # Biomédico — 2239 e Bioquímico (família 2030 Biólogos também usa lab)
    ("2239", [
        "clinical.release_lab_report",
    ]),
    ("2030", [
        "clinical.release_lab_report",
    ]),
    # Técnico de patologia clínica / laboratório — 3241
    ("3241", [
        # Executa o exame, mas NÃO libera laudo (fica só com o coleta).
    ]),
    # Técnico de radiologia — 3241-15 (prefixo 3241 já acima, cobre)
    # Psicólogo — 2515
    ("2515", [
        "clinical.psych_note",
    ]),
    # Assistente social — 2516
    ("2516", [
        "clinical.social_note",
    ]),
    # Nutricionista — 2237
    ("2237", [
        "clinical.nutrition_prescribe",
    ]),
    # Fisioterapeuta — 2236
    ("2236", [
        "clinical.physio_prescribe",
        "clinical.execute_prescription",
    ]),
    # Regulador médico / TARM — ambos estão em famílias distintas, usamos
    # CBO completo pra não misturar com médico assistencial.
    ("225320", [  # Médico regulador
        "regulation.dispatch",
        "regulation.bed_allocate",
    ]),
    ("422105", [  # Operador de rádio (TARM)
        "regulation.dispatch",
    ]),
]


async def seed_cbo_abilities(session: AsyncSession) -> int:
    """Aplica as associações CBO→ability na tabela ``cbo_abilities``.

    Lê os CBOs presentes no catálogo de referência (tabela ``cbos`` da
    referência, senão cai nos prefixos literais) — como esse catálogo
    pode não existir em ambientes frescos, a estratégia é:

    - Para cada (prefixo, abilities), pergunta ao banco quais CBOs
      existentes começam com o prefixo (via ``cbo_professionals``,
      fallback pra linhas já vinculadas). Se o CNES importou o CBO,
      ganha as abilities correspondentes.
    - Reexecutar é idempotente: upsert por PK composta (cbo_id, ability_code).

    Em ambientes sem CNES importado, o seed ainda popula os prefixos
    literais — servem como "CBO-pai" no registry.
    """
    # Coleta CBOs conhecidos (de profissionais CNES) pra expandir prefixos.
    # Usa uma query defensiva: se a tabela não existir ainda, ignora.
    known_cbos: set[str] = set()
    try:
        from app.tenant_models.cnes.professionals import CnesProfessional
        rows = await session.scalars(
            select(CnesProfessional.cbo_id).distinct()
        )
        known_cbos = {r for r in rows.all() if r}
    except Exception:  # noqa: BLE001
        known_cbos = set()

    # Expande prefixos → lista final de (cbo_id, ability_code)
    pairs: set[tuple[str, str]] = set()
    for prefix, abilities in _CBO_PREFIX_ABILITIES:
        # Inclui o prefixo literal (útil como "marcador de família").
        for ability in abilities:
            pairs.add((prefix, ability))
        # Expande para CBOs reais conhecidos que começam com o prefixo.
        for cbo in known_cbos:
            if cbo.startswith(prefix):
                for ability in abilities:
                    pairs.add((cbo, ability))

    if not pairs:
        return 0

    adapter = get_adapter(session.bind.dialect.name)
    await adapter.execute_upsert_do_nothing(
        session,
        CboAbility,
        [{"cbo_id": cbo, "ability_code": ab} for cbo, ab in pairs],
    )
    return len(pairs)
