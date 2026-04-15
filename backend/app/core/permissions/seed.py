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

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

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
    """Upsert do catálogo em ``app.permissions``. Retorna o total escrito.

    Não remove linhas: permissões deprecadas ficam no banco até migration
    manual. Isso evita FK violation em role_permissions antigos.
    """
    perms = all_permissions()
    if not perms:
        return 0

    stmt = pg_insert(Permission).values(
        [
            {
                "code": p.code,
                "module": p.module,
                "resource": p.resource,
                "action": p.action,
                "description": p.description,
            }
            for p in perms
        ]
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[Permission.code],
        set_={
            "module": stmt.excluded.module,
            "resource": stmt.excluded.resource,
            "action": stmt.excluded.action,
            "description": stmt.excluded.description,
        },
    )
    await session.execute(stmt)
    return len(perms)


# ─── SYSTEM roles base ──────────────────────────────────────────────────────

# (code, name, description, [permission_codes])
_SYSTEM_BASE_ROLES: list[tuple[str, str, str, list[str]]] = [
    (
        "system_admin",
        "Administrador do Sistema",
        "Acesso total à plataforma (MASTER).",
        # Deixa vazio — resolução MASTER ignora permissions e libera tudo.
        # Mantemos o role existindo para consistência no FacilityAccess.
        [],
    ),
    (
        "municipality_admin",
        "Administrador do Município",
        "Gerencia usuários, unidades e perfis dentro do município.",
        [
            "users.user.view", "users.user.create", "users.user.edit",
            "users.user.archive", "users.user.reset_password",
            "users.access.view", "users.access.manage",
            "roles.role.view", "roles.role.create", "roles.role.edit",
            "roles.role.archive", "roles.permission.assign",
            "roles.override.manage",
            "audit.log.view",
            "ops.session.view",
            "ops.report.view", "ops.report.export",
        ],
    ),
    (
        "receptionist_base",
        "Recepcionista",
        "Atendimento na recepção: cadastro de pacientes e agenda.",
        [
            "cln.patient.view", "cln.patient.create", "cln.patient.edit",
            "cln.appointment.view", "cln.appointment.create",
            "cln.appointment.edit", "cln.appointment.cancel",
            "cln.queue.view",
        ],
    ),
    (
        "nurse_base",
        "Enfermagem",
        "Triagem, fila e acompanhamento clínico.",
        [
            "cln.patient.view",
            "cln.appointment.view",
            "cln.queue.view", "cln.queue.manage",
            "cln.consultation.view",
        ],
    ),
    (
        "doctor_base",
        "Médico",
        "Consulta clínica e prescrição.",
        [
            "cln.patient.view", "cln.patient.edit",
            "cln.appointment.view",
            "cln.queue.view", "cln.queue.manage",
            "cln.consultation.view", "cln.consultation.create",
            "cln.consultation.edit",
            # Diagnóstico: médico pode solicitar e ver resultado, mas não coletar/liberar.
            "dgn.exam.view", "dgn.exam.request",
        ],
    ),
    (
        "lab_tech_base",
        "Técnico de Laboratório",
        "Coleta e liberação de exames laboratoriais.",
        [
            "cln.patient.view",
            "dgn.exam.view", "dgn.exam.collect", "dgn.exam.release",
        ],
    ),
    (
        "manager_base",
        "Gestor",
        "Relatórios operacionais e visão gerencial.",
        [
            "ops.report.view", "ops.report.export",
            "ops.session.view",
            "users.user.view",
            "audit.log.view",
        ],
    ),
    (
        "visa_agent_base",
        "Fiscal Sanitário",
        "Inspeções e gestão de estabelecimentos fiscalizados.",
        [
            "fsc.establishment.view", "fsc.establishment.manage",
            "fsc.inspection.view", "fsc.inspection.create",
        ],
    ),
]


async def ensure_system_base_roles(session: AsyncSession) -> int:
    """Idempotente. Cria os SYSTEM roles base que ainda não existam.

    Também sincroniza as permissions deles (grant=true) e recria eventuais
    linhas faltando em role_permissions. Permissões removidas do catálogo
    de um role são removidas; adicionadas são criadas.
    """
    created_or_updated = 0
    for code, name, description, perm_codes in _SYSTEM_BASE_ROLES:
        role = await _upsert_system_role(session, code, name, description)
        await _sync_role_permissions(session, role_id=role.id, perm_codes=perm_codes)
        created_or_updated += 1
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
