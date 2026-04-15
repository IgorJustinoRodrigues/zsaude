"""Popula o banco com os dados que espelham os mocks do frontend.

Idempotente: rodar várias vezes não duplica.

Executar:
    docker compose exec app uv run python -m scripts.seed
"""

from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import dispose_engine, sessionmaker
from app.db.tenant_schemas import ensure_municipality_schema
from app.modules.tenants.models import (
    Facility,
    FacilityAccess,
    FacilityType,
    Municipality,
    MunicipalityAccess,
)
from app.modules.users.models import User, UserStatus

# Namespace fixo para gerar UUIDv5 a partir dos IDs do frontend
NS = uuid.UUID("12345678-1234-5678-1234-567812345678")

DEFAULT_PASSWORD = "Admin@123"


def fid(key: str) -> uuid.UUID:
    """UUIDv5 determinístico a partir do ID textual do mock (ex: 'usr1')."""
    return uuid.uuid5(NS, key)


# ─── Dados ────────────────────────────────────────────────────────────────────

MUNICIPALITIES = [
    {"key": "mun1", "name": "Goiânia",              "state": "GO", "ibge": "5208707"},
    {"key": "mun2", "name": "Aparecida de Goiânia", "state": "GO", "ibge": "5201405"},
    {"key": "mun3", "name": "Anápolis",             "state": "GO", "ibge": "5201108"},
]

FACILITIES = [
    {"key": "fac1",  "mun": "mun1", "name": "Secretaria Municipal de Saúde", "short": "SMS Central",     "type": FacilityType.SMS},
    {"key": "fac2",  "mun": "mun1", "name": "UBS Centro",                    "short": "UBS Centro",      "type": FacilityType.UBS},
    {"key": "fac3",  "mun": "mun1", "name": "UPA Norte",                     "short": "UPA Norte",       "type": FacilityType.UPA},
    {"key": "fac4",  "mun": "mun1", "name": "Laboratório Municipal",          "short": "Lab. Municipal",  "type": FacilityType.LAB},
    {"key": "fac5",  "mun": "mun1", "name": "VISA Municipal",                 "short": "VISA Municipal",  "type": FacilityType.VISA},
    {"key": "fac6",  "mun": "mun1", "name": "Setor de Transportes",           "short": "Transportes",     "type": FacilityType.TRANSPORTES},
    {"key": "fac7",  "mun": "mun2", "name": "Secretaria Municipal de Saúde", "short": "SMS Aparecida",    "type": FacilityType.SMS},
    {"key": "fac8",  "mun": "mun2", "name": "UBS Jardim Tiradentes",         "short": "UBS Jardim",       "type": FacilityType.UBS},
    {"key": "fac9",  "mun": "mun2", "name": "UPA Sul",                       "short": "UPA Sul",          "type": FacilityType.UPA},
    {"key": "fac10", "mun": "mun3", "name": "Secretaria Municipal de Saúde", "short": "SMS Anápolis",     "type": FacilityType.SMS},
    {"key": "fac11", "mun": "mun3", "name": "HMU – Hospital Municipal",     "short": "HMU",              "type": FacilityType.HOSPITAL},
]

USERS = [
    {"key": "usr1",  "login": "igor.santos",      "email": "igor@zsaude.gov.br",     "name": "Igor Santos",       "cpf": "02134567890", "phone": "(62) 99999-1234", "status": UserStatus.ATIVO,    "role": "Administrador do Sistema", "superuser": True},
    {"key": "usr2",  "login": "carla.mendonca",   "email": "carla@zsaude.gov.br",    "name": "Carla Mendonça",    "cpf": "13456789012", "phone": "(62) 98888-5678", "status": UserStatus.ATIVO,    "role": "Recepcionista"},
    {"key": "usr3",  "login": "diego.figueiredo", "email": "diego@zsaude.gov.br",    "name": "Diego Figueiredo",  "cpf": "24567890123", "phone": "(62) 97777-9012", "status": UserStatus.ATIVO,    "role": "Técnico de Laboratório"},
    {"key": "usr4",  "login": "renata.cabral",    "email": "renata@zsaude.gov.br",   "name": "Renata Cabral",     "cpf": "35678901234", "phone": "(62) 96666-3456", "status": UserStatus.ATIVO,    "role": "Fiscal Sanitário"},
    {"key": "usr5",  "login": "thales.marques",   "email": "thales@zsaude.gov.br",   "name": "Thales Marques",    "cpf": "46789012345", "phone": "(62) 95555-7890", "status": UserStatus.INATIVO,  "role": "Gestor de Frota"},
    {"key": "usr6",  "login": "simone.araujo",    "email": "simone@zsaude.gov.br",   "name": "Simone Araújo",     "cpf": "57890123456", "phone": "(62) 94444-1234", "status": UserStatus.ATIVO,    "role": "Enfermeira"},
    {"key": "usr7",  "login": "rafael.campos",    "email": "rafael@zsaude.gov.br",   "name": "Rafael Campos",     "cpf": "68901234567", "phone": "(62) 93333-5678", "status": UserStatus.ATIVO,    "role": "Médico"},
    {"key": "usr8",  "login": "fernanda.lima",    "email": "fernanda@zsaude.gov.br", "name": "Fernanda Lima",     "cpf": "79012345678", "phone": "(62) 92222-9012", "status": UserStatus.BLOQUEADO,"role": "Médica"},
    {"key": "usr9",  "login": "paulo.henrique",   "email": "paulo@zsaude.gov.br",    "name": "Paulo Henrique",    "cpf": "80123456789", "phone": "(62) 91111-3456", "status": UserStatus.ATIVO,    "role": "Farmacêutico"},
    {"key": "usr10", "login": "beatriz.nunes",    "email": "beatriz@zsaude.gov.br",  "name": "Beatriz Nunes",     "cpf": "91234567890", "phone": "(62) 90000-7890", "status": UserStatus.ATIVO,    "role": "Assistente Social"},
    {"key": "usr11", "login": "marcos.vinicius",  "email": "marcos@zsaude.gov.br",   "name": "Marcos Vinicius",   "cpf": "02345678901", "phone": "(62) 98765-4321", "status": UserStatus.INATIVO,  "role": "Técnico de Enfermagem"},
    {"key": "usr12", "login": "juliana.torres",   "email": "juliana@zsaude.gov.br",  "name": "Juliana Torres",    "cpf": "13456789023", "phone": "(62) 99876-5432", "status": UserStatus.ATIVO,    "role": "Recepcionista"},
]

# (user_key, municipality_key) + (user_key, facility_key, role, modules)
MUN_ACCESS = [
    ("usr1", "mun1"), ("usr1", "mun2"), ("usr1", "mun3"),
    ("usr2", "mun1"),
    ("usr3", "mun1"),
    ("usr4", "mun1"),
    ("usr5", "mun1"),
    ("usr6", "mun1"),
    ("usr7", "mun3"),
    ("usr8", "mun2"),
    ("usr9", "mun1"),
    ("usr10", "mun2"), ("usr10", "mun3"),
    ("usr11", "mun2"),
    ("usr12", "mun1"),
]

FAC_ACCESS = [
    ("usr1",  "fac1",  "Administrador do Sistema", ["cln", "dgn", "hsp", "pln", "fsc", "ops"]),
    ("usr1",  "fac2",  "Supervisor Clínico",       ["cln", "dgn"]),
    ("usr1",  "fac3",  "Supervisor UPA",           ["cln", "hsp"]),
    ("usr1",  "fac7",  "Consultor Externo",        ["cln", "pln"]),
    ("usr1",  "fac8",  "Analista",                 ["cln"]),
    ("usr1",  "fac10", "Gestor Regional",          ["cln", "dgn", "hsp", "pln"]),
    ("usr2",  "fac2",  "Recepcionista",            ["cln"]),
    ("usr3",  "fac4",  "Técnico de Laboratório",   ["dgn"]),
    ("usr4",  "fac5",  "Fiscal Sanitário",         ["fsc"]),
    ("usr5",  "fac6",  "Gestor de Frota",          ["ops"]),
    ("usr6",  "fac3",  "Enfermeira",               ["cln", "hsp"]),
    ("usr7",  "fac11", "Médico",                   ["cln", "hsp"]),
    ("usr8",  "fac9",  "Médica",                   ["cln"]),
    ("usr9",  "fac2",  "Farmacêutico",             ["cln", "ops"]),
    ("usr10", "fac8",  "Assistente Social",        ["cln", "pln"]),
    ("usr10", "fac10", "Assistente Social",        ["cln"]),
    ("usr11", "fac9",  "Técnico de Enfermagem",    ["hsp"]),
    ("usr12", "fac2",  "Recepcionista",            ["cln"]),
    ("usr12", "fac3",  "Recepcionista",            ["cln"]),
]


# ─── Seeding ──────────────────────────────────────────────────────────────────


async def upsert_municipalities(session) -> None:
    for m in MUNICIPALITIES:
        exists = await session.scalar(select(Municipality).where(Municipality.id == fid(m["key"])))
        if exists is None:
            session.add(Municipality(id=fid(m["key"]), name=m["name"], state=m["state"], ibge=m["ibge"]))


async def upsert_facilities(session) -> None:
    for f in FACILITIES:
        exists = await session.scalar(select(Facility).where(Facility.id == fid(f["key"])))
        if exists is None:
            session.add(
                Facility(
                    id=fid(f["key"]),
                    municipality_id=fid(f["mun"]),
                    name=f["name"],
                    short_name=f["short"],
                    type=f["type"],
                )
            )


async def upsert_users(session) -> None:
    pwd_hash = hash_password(DEFAULT_PASSWORD)
    for u in USERS:
        exists = await session.scalar(select(User).where(User.id == fid(u["key"])))
        if exists is None:
            session.add(
                User(
                    id=fid(u["key"]),
                    login=u["login"],
                    email=u["email"],
                    name=u["name"],
                    cpf=u["cpf"],
                    phone=u["phone"],
                    password_hash=pwd_hash,
                    status=u["status"],
                    is_active=u["status"] != UserStatus.BLOQUEADO,
                    is_superuser=u.get("superuser", False),
                    primary_role=u["role"],
                )
            )


async def upsert_mun_access(session) -> None:
    for user_key, mun_key in MUN_ACCESS:
        exists = await session.scalar(
            select(MunicipalityAccess).where(
                MunicipalityAccess.user_id == fid(user_key),
                MunicipalityAccess.municipality_id == fid(mun_key),
            )
        )
        if exists is None:
            session.add(
                MunicipalityAccess(
                    user_id=fid(user_key),
                    municipality_id=fid(mun_key),
                )
            )


async def upsert_fac_access(session) -> None:
    for user_key, fac_key, role, modules in FAC_ACCESS:
        exists = await session.scalar(
            select(FacilityAccess).where(
                FacilityAccess.user_id == fid(user_key),
                FacilityAccess.facility_id == fid(fac_key),
            )
        )
        if exists is None:
            session.add(
                FacilityAccess(
                    user_id=fid(user_key),
                    facility_id=fid(fac_key),
                    role=role,
                    modules=modules,
                )
            )


async def provision_schemas(session) -> None:
    """Garante um schema `mun_<ibge>` para cada município seed."""
    for m in MUNICIPALITIES:
        schema = await ensure_municipality_schema(session, m["ibge"])
        print(f"  · schema {schema} ok")


async def main() -> None:
    async with sessionmaker()() as session:
        await upsert_municipalities(session)
        await session.flush()
        await upsert_facilities(session)
        await session.flush()
        await upsert_users(session)
        await session.flush()
        await upsert_mun_access(session)
        await upsert_fac_access(session)
        print("Provisionando schemas de municípios:")
        await provision_schemas(session)
        await session.commit()
        print(f"Seed OK · senha padrão para todos: {DEFAULT_PASSWORD}")
    await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
