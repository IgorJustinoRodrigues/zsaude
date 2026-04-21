"""Popula/atualiza o banco com um baseline de teste em Goianésia.

Idempotente — upserts por **chave natural** (IBGE, CNES/short_name,
login). Roda em cima de um banco limpo OU com dados já existentes sem
duplicar nem sobrescrever o que o usuário criou.

Executar:
    docker compose exec app uv run python -m scripts.seed

Reset total:
    docker compose down -v
    docker compose up -d
    alembic upgrade head
    scripts.seed

Senha padrão pra todos os usuários: ``Admin@123``.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from sqlalchemy import and_, delete, select

from app.core.security import hash_password
from app.db.session import dispose_engine, sessionmaker
from app.db.tenant_schemas import ensure_municipality_schema
from app.modules.permissions.models import Role
from app.modules.sectors.service import SectorService
from app.modules.tenants.models import (
    Facility,
    FacilityAccess,
    FacilityType,
    Municipality,
    MunicipalityAccess,
)
from app.modules.users.models import User, UserLevel, UserStatus

# Namespace pra gerar UUIDv5 determinísticos (novas entidades).
_NS = uuid.UUID("12345678-1234-5678-1234-567812345678")


def _fid(key: str) -> uuid.UUID:
    return uuid.uuid5(_NS, key)


DEFAULT_PASSWORD = "Admin@123"


# ─── Dados ────────────────────────────────────────────────────────────────────

# ``rec_config`` padrão — totem/painel/atendimento ativos, modo senha,
# pós-atendimento → triagem. Sobrescreve qualquer ``rec_config`` antigo
# inválido no banco pra deixar o teste começando limpo.
DEFAULT_REC_CONFIG: dict[str, Any] = {
    "totem": {
        "enabled": True,
        "capture": {"cpf": True, "cns": True, "face": False, "manual_name": True},
        "priority_prompt": True,
    },
    "painel": {"enabled": True, "mode": "senha", "announce_audio": True},
    "recepcao": {"enabled": True, "after_attendance": "triagem"},
}


MUNICIPALITIES: list[dict[str, Any]] = [
    {
        "key": "goianesia",
        "name": "Goianésia",
        "state": "GO",
        "ibge": "5208608",
        "timezone": "America/Sao_Paulo",
        "enabled_modules": None,  # None = todos os módulos habilitados
        "rec_config": DEFAULT_REC_CONFIG,
    },
]


FACILITIES: list[dict[str, Any]] = [
    # Unidade real — tem CNES importado vinculado.
    {
        "key": "cs_arturo", "mun": "goianesia",
        "name": "Centro de Saúde Arturo Bermudez Mayorga",
        "short": "CS Arturo", "type": FacilityType.UBS,
        "cnes": "2381516",
    },
    # Unidades de teste (sem CNES — pra simular cenários).
    {
        "key": "sms", "mun": "goianesia",
        "name": "Secretaria Municipal de Saúde",
        "short": "SMS Goianésia", "type": FacilityType.SMS, "cnes": None,
    },
    {
        "key": "ubs_central", "mun": "goianesia",
        "name": "UBS Central",
        "short": "UBS Central", "type": FacilityType.UBS, "cnes": None,
    },
    {
        "key": "upa", "mun": "goianesia",
        "name": "UPA Goianésia",
        "short": "UPA Goianésia", "type": FacilityType.UPA, "cnes": None,
    },
    {
        "key": "hospital", "mun": "goianesia",
        "name": "Hospital Municipal de Goianésia",
        "short": "HMG", "type": FacilityType.HOSPITAL, "cnes": None,
    },
]


USERS: list[dict[str, Any]] = [
    # ── Reais ────────────────────────────────────────────────────────
    {
        "key": "igor_master", "login": "igor@zsaude.gov.br",
        "email": "igor@zsaude.gov.br", "name": "Igor Santos",
        "cpf": None, "level": "master", "superuser": True,
        "primary_role": "Administrador do Sistema",
    },
    {
        "key": "igor_cpf", "login": "75696860125",
        "email": "igor98rodrigues@gmail.com", "name": "Igor",
        "cpf": "75696860125", "level": "user", "superuser": False,
        "primary_role": "Operador",
    },

    # ── Teste ────────────────────────────────────────────────────────
    {
        "key": "carla", "login": "carla.recep",
        "email": "carla.recep@test.gov.br", "name": "Carla Mendonça",
        "cpf": "12345678901", "level": "user",
        "primary_role": "Recepcionista",
    },
    {
        "key": "rafael", "login": "rafael.medico",
        "email": "rafael.medico@test.gov.br", "name": "Rafael Campos",
        "cpf": "23456789012", "level": "user",
        "primary_role": "Médico",
    },
    {
        "key": "simone", "login": "simone.enf",
        "email": "simone.enf@test.gov.br", "name": "Simone Araújo",
        "cpf": "34567890123", "level": "user",
        "primary_role": "Enfermeira",
    },
    {
        "key": "juliana", "login": "juliana.coord",
        "email": "juliana.coord@test.gov.br", "name": "Juliana Torres",
        "cpf": "45678901234", "level": "user",
        "primary_role": "Coordenadora de Unidade",
    },
    {
        "key": "beatriz", "login": "beatriz.audit",
        "email": "beatriz.audit@test.gov.br", "name": "Beatriz Nunes",
        "cpf": "56789012345", "level": "user",
        "primary_role": "Auditora",
    },
    {
        "key": "maria", "login": "maria.visual",
        "email": "maria.visual@test.gov.br", "name": "Maria Oliveira",
        "cpf": "67890123456", "level": "user",
        "primary_role": "Visualizadora",
    },
]


# Município → usuários. Todos os não-MASTER entram em Goianésia.
MUN_ACCESS: list[tuple[str, str]] = [
    ("igor_cpf",  "goianesia"),
    ("carla",     "goianesia"),
    ("rafael",    "goianesia"),
    ("simone",    "goianesia"),
    ("juliana",   "goianesia"),
    ("beatriz",   "goianesia"),
    ("maria",     "goianesia"),
]


# Unidade → usuário → role SYSTEM. MASTER não precisa aqui.
FAC_ACCESS: list[tuple[str, str, str]] = [
    # Igor (real) — operador da CS Arturo.
    ("igor_cpf",  "cs_arturo",    "operator_base"),

    # Carla — recepção em 2 UBSs.
    ("carla",     "cs_arturo",    "operator_base"),
    ("carla",     "ubs_central",  "operator_base"),

    # Rafael — médico na CS e no Hospital.
    ("rafael",    "cs_arturo",    "operator_base"),
    ("rafael",    "hospital",     "operator_base"),

    # Simone — enfermagem na UPA.
    ("simone",    "upa",          "operator_base"),

    # Juliana — coordenadora no hospital.
    ("juliana",   "hospital",     "coordinator_base"),

    # Beatriz — auditora no SMS.
    ("beatriz",   "sms",          "auditor_base"),

    # Maria — visualizadora na UBS Central.
    ("maria",     "ubs_central",  "viewer_base"),
]


# ─── Upserts ──────────────────────────────────────────────────────────────────

async def upsert_municipalities(session) -> dict[str, uuid.UUID]:
    """Retorna ``{key: id}`` pra uso nos próximos passos. Lookup por IBGE."""
    out: dict[str, uuid.UUID] = {}
    for m in MUNICIPALITIES:
        row = await session.scalar(
            select(Municipality).where(Municipality.ibge == m["ibge"])
        )
        if row is None:
            row = Municipality(
                id=_fid(f"mun:{m['key']}"),
                name=m["name"],
                state=m["state"],
                ibge=m["ibge"],
                timezone=m["timezone"],
                enabled_modules=m.get("enabled_modules"),
                rec_config=m.get("rec_config"),
            )
            session.add(row)
        else:
            row.name = m["name"]
            row.state = m["state"]
            row.timezone = m["timezone"]
            row.enabled_modules = m.get("enabled_modules")
            row.rec_config = m.get("rec_config")
        await session.flush()
        out[m["key"]] = row.id
    return out


async def upsert_facilities(
    session, mun_ids: dict[str, uuid.UUID],
) -> dict[str, uuid.UUID]:
    """Lookup por (municipality, CNES) se CNES informado; senão (municipality,
    short_name). Retorna ``{key: id}``."""
    out: dict[str, uuid.UUID] = {}
    for f in FACILITIES:
        mun_id = mun_ids[f["mun"]]
        row: Facility | None = None
        if f.get("cnes"):
            row = await session.scalar(
                select(Facility).where(
                    and_(
                        Facility.municipality_id == mun_id,
                        Facility.cnes == f["cnes"],
                    )
                )
            )
        if row is None:
            row = await session.scalar(
                select(Facility).where(
                    and_(
                        Facility.municipality_id == mun_id,
                        Facility.short_name == f["short"],
                        Facility.archived == False,  # noqa: E712
                    )
                )
            )
        if row is None:
            row = Facility(
                id=_fid(f"fac:{f['key']}"),
                municipality_id=mun_id,
                name=f["name"],
                short_name=f["short"],
                type=f["type"],
                cnes=f.get("cnes"),
                archived=False,
            )
            session.add(row)
        else:
            row.name = f["name"]
            row.short_name = f["short"]
            row.type = f["type"]
            if f.get("cnes"):
                row.cnes = f["cnes"]
            row.archived = False
        await session.flush()
        out[f["key"]] = row.id
    return out


async def upsert_users(session) -> dict[str, uuid.UUID]:
    """Lookup por login (unique). Senha padrão sempre reaplicada pra
    baseline previsível."""
    pwd_hash = hash_password(DEFAULT_PASSWORD)
    out: dict[str, uuid.UUID] = {}
    for u in USERS:
        row = await session.scalar(select(User).where(User.login == u["login"]))
        if row is None:
            row = User(
                id=_fid(f"user:{u['key']}"),
                login=u["login"],
                email=u["email"],
                name=u["name"],
                cpf=u["cpf"],
                phone=" ",
                password_hash=pwd_hash,
                status=UserStatus.ATIVO,
                is_active=True,
                is_superuser=u.get("superuser", False),
                primary_role=u.get("primary_role", ""),
                level=UserLevel(u["level"]),
            )
            session.add(row)
        else:
            row.email = u["email"]
            row.name = u["name"]
            row.cpf = u["cpf"]
            row.password_hash = pwd_hash
            row.status = UserStatus.ATIVO
            row.is_active = True
            row.is_superuser = u.get("superuser", False)
            row.primary_role = u.get("primary_role", "")
            row.level = UserLevel(u["level"])
        await session.flush()
        out[u["key"]] = row.id
    return out


async def upsert_mun_access(
    session, user_ids: dict[str, uuid.UUID], mun_ids: dict[str, uuid.UUID],
) -> None:
    for user_key, mun_key in MUN_ACCESS:
        uid, mid = user_ids[user_key], mun_ids[mun_key]
        exists = await session.scalar(
            select(MunicipalityAccess).where(
                and_(
                    MunicipalityAccess.user_id == uid,
                    MunicipalityAccess.municipality_id == mid,
                )
            )
        )
        if exists is None:
            session.add(MunicipalityAccess(user_id=uid, municipality_id=mid))


async def upsert_fac_access(
    session, user_ids: dict[str, uuid.UUID], fac_ids: dict[str, uuid.UUID],
) -> None:
    role_rows = await session.scalars(
        select(Role).where(and_(Role.municipality_id.is_(None), Role.archived == False))  # noqa: E712
    )
    role_by_code: dict[str, uuid.UUID] = {r.code: r.id for r in role_rows.all()}

    missing: list[str] = []
    for _user_key, _fac_key, code in FAC_ACCESS:
        if code not in role_by_code:
            missing.append(code)
    if missing:
        raise RuntimeError(
            f"Roles SYSTEM não encontrados: {sorted(set(missing))}. "
            f"Rode ``ensure_system_base_roles`` primeiro (acontece no startup do app)."
        )

    for user_key, fac_key, code in FAC_ACCESS:
        uid = user_ids[user_key]
        fid_ = fac_ids[fac_key]
        role_id = role_by_code[code]
        exists = await session.scalar(
            select(FacilityAccess).where(
                and_(
                    FacilityAccess.user_id == uid,
                    FacilityAccess.facility_id == fid_,
                )
            )
        )
        if exists is None:
            session.add(FacilityAccess(user_id=uid, facility_id=fid_, role_id=role_id))
        elif exists.role_id != role_id:
            exists.role_id = role_id
            exists.version += 1


async def cleanup_legacy_roles(session) -> int:
    """Apaga roles SYSTEM arquivados que não têm nenhum facility_access
    apontando pra eles — são os perfis legados (receptionist/nurse/doctor/
    lab_tech/manager/visa_agent) trocados pelos enxutos. Seguro: o WHERE
    NOT EXISTS garante zero FK violation."""
    result = await session.execute(
        delete(Role).where(
            and_(
                Role.municipality_id.is_(None),
                Role.archived == True,  # noqa: E712
                ~Role.id.in_(select(FacilityAccess.role_id).distinct()),
            )
        )
    )
    return result.rowcount or 0


async def provision_schemas(session) -> None:
    for m in MUNICIPALITIES:
        schema = await ensure_municipality_schema(session, m["ibge"])
        print(f"  · {m['name']:<25} → {schema}")


async def main() -> None:
    async with sessionmaker()() as session:
        print("→ municípios")
        mun_ids = await upsert_municipalities(session)
        print("→ setores default do sistema (por município)")
        sec_svc = SectorService(session)
        for key, mid in mun_ids.items():
            n = await sec_svc.ensure_municipality_defaults(mid)
            if n:
                print(f"  · {key}: {n} setores default criados")
        print("→ unidades")
        fac_ids = await upsert_facilities(session, mun_ids)
        print("→ usuários")
        user_ids = await upsert_users(session)
        print("→ acessos (município + unidade)")
        await upsert_mun_access(session, user_ids, mun_ids)
        await upsert_fac_access(session, user_ids, fac_ids)
        print("→ limpando perfis legados")
        removed = await cleanup_legacy_roles(session)
        if removed:
            print(f"  · {removed} role(s) legado(s) removido(s)")
        print("→ provisionando schemas de tenant")
        await provision_schemas(session)
        await session.commit()
        print()
        print(f"Seed OK · senha padrão pra todos: {DEFAULT_PASSWORD}")
        print(f"  · MASTER:   igor@zsaude.gov.br")
        print(f"  · Operador: 75696860125 (Igor)")
        print(f"  · Teste:    carla.recep, rafael.medico, simone.enf, juliana.coord, beatriz.audit, maria.visual")
    await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
