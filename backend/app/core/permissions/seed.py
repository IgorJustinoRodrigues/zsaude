"""Sincroniza catálogo de permissões e provisiona SYSTEM roles base.

- ``sync_permissions(session)`` — upsert de ``app.permissions`` a partir do
  registry in-memory (code é a PK natural). Chamado no lifespan do app e no
  seed.
- ``ensure_system_base_roles(session)`` — cria (se não existir) os roles
  globais ``system_admin``, ``municipality_admin``, e um conjunto de perfis
  clínicos/administrativos base. Cada município novo ganha acesso a eles
  por referência (SYSTEM roles são visíveis de todos os municípios).
"""

from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.dialect import get_adapter

# Importa o catálogo para popular o registry antes do sync.
from app.core.permissions import catalog  # noqa: F401  - side effect
from app.core.permissions.registry import all_permissions
from app.modules.permissions.models import (
    Permission,
    Role,
    RolePermission,
    RoleScope,
)

# Namespace fixo para UUIDs determinísticos de SYSTEM roles (assim o seed é
# idempotente e re-rodar não duplica).
_SYS_ROLE_NS = uuid.UUID("b2b82f8f-0000-5000-8000-5f5f5f5f5f5f")


def _system_role_id(code: str) -> uuid.UUID:
    return uuid.uuid5(_SYS_ROLE_NS, f"system:{code}")


async def sync_permissions(session: AsyncSession) -> int:
    """Upsert do catálogo em ``app.permissions`` + **remove** o que sumiu.

    A remoção CASCADE apaga automaticamente:
    - linhas em ``role_permissions`` com o código deletado;
    - linhas em ``facility_access_permission_overrides`` com o código.

    Retorna o total que ficou no catálogo.
    """
    perms = all_permissions()
    catalog_codes = {p.code for p in perms}

    # 1. Remove do DB as que sumiram do catálogo (CASCADE limpa RP/overrides).
    existing = set((await session.scalars(select(Permission.code))).all())
    stale = existing - catalog_codes
    if stale:
        await session.execute(delete(Permission).where(Permission.code.in_(stale)))

    # 2. Upsert das que existem.
    if perms:
        adapter = get_adapter(session.bind.dialect.name)
        await adapter.execute_upsert(
            session,
            Permission,
            [
                {
                    "code": p.code,
                    "module": p.module,
                    "resource": p.resource,
                    "action": p.action,
                    "description": p.description,
                }
                for p in perms
            ],
            index_elements=["code"],
            update_columns=["module", "resource", "action", "description"],
        )

    return len(perms)


# ─── SYSTEM roles base ──────────────────────────────────────────────────────

# (code, name, description, [permission_codes])
#
# Perfis = função no SISTEMA (UI/fluxos). Função clínica vem do CBO do
# binding CNES (abilities). Esse catálogo é deliberadamente enxuto — o
# mesmo usuário pode ter perfis diferentes por vínculo CBO, e a competência
# profissional (prescrever, dispensar, etc.) vem do CBO, não do perfil.
_SYSTEM_BASE_ROLES: list[tuple[str, str, str, list[str]]] = [
    (
        "system_admin",
        "Administrador do Sistema",
        "Acesso total à plataforma (MASTER).",
        # MASTER ignora permissions em tempo de resolução (is_root=true).
        [],
    ),
    (
        "municipality_admin",
        "Administrador do Município",
        "Gestão completa do município: usuários, perfis, relatórios e auditoria.",
        [
            "roles.role.view", "roles.role.create", "roles.role.edit",
            "roles.role.archive", "roles.permission.assign",
            "roles.override.manage",
            "users.user.view", "users.user.create", "users.user.edit",
            "users.user.archive", "users.user.reset_password",
            "users.access.view", "users.access.manage",
            "audit.log.view",
            "ops.session.view", "ops.report.view", "ops.report.export",
            "ops.import.execute", "ops.import.view",
        ],
    ),
    (
        "operator_base",
        "Operador",
        "Executa o dia-a-dia assistencial: cadastra e atende paciente, "
        "solicita exame, registra evolução. Competência profissional vem "
        "do CBO do vínculo CNES.",
        [
            "hsp.patient.view", "hsp.patient.create", "hsp.patient.edit",
            "hsp.patient_history.view",
            "hsp.patient_photo.view", "hsp.patient_photo.upload",
            "dgn.exam.view", "dgn.exam.request",
        ],
    ),
    (
        "coordinator_base",
        "Coordenador de Unidade",
        "Operador + visão gerencial local: relatórios da unidade, sessões, "
        "aprovações de escala.",
        [
            "hsp.patient.view", "hsp.patient.create", "hsp.patient.edit",
            "hsp.patient_history.view",
            "hsp.patient_photo.view", "hsp.patient_photo.upload",
            "dgn.exam.view", "dgn.exam.request",
            "users.user.view", "users.access.view",
            "ops.session.view", "ops.report.view", "ops.report.export",
        ],
    ),
    (
        "auditor_base",
        "Auditor",
        "Leitura ampla + exportações: logs, relatórios, produção. Não "
        "executa fluxos assistenciais.",
        [
            "hsp.patient.view", "hsp.patient_history.view",
            "dgn.exam.view",
            "users.user.view", "users.access.view",
            "audit.log.view",
            "ops.session.view", "ops.report.view", "ops.report.export",
        ],
    ),
    (
        "viewer_base",
        "Visualizador",
        "Consulta mínima. Útil para estágio, auditoria externa ou visão "
        "restrita por demanda.",
        [
            "hsp.patient.view",
            "dgn.exam.view",
        ],
    ),
]

# Roles antigos (clinicos) que foram substituídos pelos enxutos. O seed
# os arquiva (``archived=True``) pra evitar que apareçam em novos
# cadastros, sem quebrar FacilityAccess já vinculados.
_LEGACY_CODES_TO_ARCHIVE: set[str] = {
    "receptionist_base",
    "nurse_base",
    "doctor_base",
    "lab_tech_base",
    "manager_base",
    "visa_agent_base",
}


async def ensure_system_base_roles(session: AsyncSession) -> int:
    """Idempotente. Cria os SYSTEM roles base que ainda não existam.

    Também sincroniza as permissions deles (grant=true) e recria eventuais
    linhas faltando em role_permissions. Permissões removidas do catálogo
    de um role são removidas; adicionadas são criadas.

    Roles legados (``_LEGACY_CODES_TO_ARCHIVE``) são marcados como
    ``archived=True`` — FacilityAccess antigos continuam válidos, mas o
    role não aparece em novos cadastros.
    """
    created_or_updated = 0
    for code, name, description, perm_codes in _SYSTEM_BASE_ROLES:
        role = await _upsert_system_role(session, code, name, description)
        await _sync_role_permissions(session, role_id=role.id, perm_codes=perm_codes)
        created_or_updated += 1

    # Arquiva legados sem apagar (preserva referências históricas).
    if _LEGACY_CODES_TO_ARCHIVE:
        legacy_rows = await session.scalars(
            select(Role).where(
                Role.code.in_(_LEGACY_CODES_TO_ARCHIVE),
                Role.scope == RoleScope.SYSTEM,
            )
        )
        for r in legacy_rows.all():
            if not r.archived:
                r.archived = True
                r.version = r.version + 1

    return created_or_updated


async def _upsert_system_role(
    session: AsyncSession, code: str, name: str, description: str
) -> Role:
    role_id = _system_role_id(code)
    existing = await session.scalar(select(Role).where(Role.id == role_id))
    if existing is None:
        role = Role(
            id=role_id,
            code=code,
            name=name,
            description=description,
            scope=RoleScope.SYSTEM,
            municipality_id=None,
            parent_id=None,
            is_system_base=True,
            archived=False,
        )
        session.add(role)
        await session.flush()
        return role

    # Atualiza metadados (name/description) se mudaram, preserva parent/archived.
    changed = False
    if existing.name != name:
        existing.name = name
        changed = True
    if existing.description != description:
        existing.description = description
        changed = True
    if not existing.is_system_base:
        existing.is_system_base = True
        changed = True
    if changed:
        existing.version = existing.version + 1
    return existing


async def _sync_role_permissions(
    session: AsyncSession, *, role_id: uuid.UUID, perm_codes: list[str]
) -> None:
    desired = set(perm_codes)
    current_rows = list(
        (await session.scalars(
            select(RolePermission).where(RolePermission.role_id == role_id)
        )).all()
    )
    current = {rp.permission_code: rp for rp in current_rows}

    changed = False

    # Remove o que não está mais no catálogo.
    for code, rp in current.items():
        if code not in desired:
            await session.delete(rp)
            changed = True

    # Adiciona o que falta. Grants explícitos (granted=True).
    for code in desired:
        rp = current.get(code)
        if rp is None:
            session.add(RolePermission(
                role_id=role_id,
                permission_code=code,
                granted=True,
            ))
            changed = True
        elif not rp.granted:
            rp.granted = True
            changed = True

    if changed:
        # bumpa version do role pra invalidar cache de resolução
        role = await session.get(Role, role_id)
        if role is not None:
            role.version = role.version + 1
