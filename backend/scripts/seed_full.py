"""Seed massivo para testes de carga e observabilidade.

Gera:
- 30 municípios goianos reais (com IBGE, coordenadas, população)
- 3-8 unidades por município (~150 unidades)
- 2-5 usuários por município + 5 globais (~100 usuários)
- 30-50 pacientes por município (~1200 pacientes)
- Documentos, dados CNES, bairros

Idempotente. Executar:
    docker compose exec app .venv/bin/python scripts/seed_full.py
"""

from __future__ import annotations

import asyncio
import hashlib
import random
import uuid
from datetime import date, timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.db.session import dispose_engine, engine, sessionmaker
from app.db.tenant_schemas import ensure_municipality_schema
from app.modules.tenants.models import (
    Facility,
    FacilityAccess,
    FacilityType,
    Municipality,
    MunicipalityAccess,
    Neighborhood,
)
from app.modules.users.models import User, UserLevel, UserStatus

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")
DEFAULT_PASSWORD = "Admin@123"
random.seed(42)  # determinístico para idempotência


def fid(key: str) -> uuid.UUID:
    return uuid.uuid5(NS, key)


# ═══════════════════════════════════════════════════════════════════════════════
# 30 MUNICÍPIOS GOIANOS REAIS
# ═══════════════════════════════════════════════════════════════════════════════

MUNICIPALITIES = [
    {"key": "mun01", "name": "Goiânia",              "ibge": "5208707", "pop": 1437237, "lat": -16.6869, "lng": -49.2648},
    {"key": "mun02", "name": "Aparecida de Goiânia", "ibge": "5201405", "pop": 590146,  "lat": -16.8198, "lng": -49.2469},
    {"key": "mun03", "name": "Anápolis",             "ibge": "5201108", "pop": 391772,  "lat": -16.3281, "lng": -48.9530},
    {"key": "mun04", "name": "Rio Verde",            "ibge": "5218805", "pop": 235647,  "lat": -17.7928, "lng": -50.9192},
    {"key": "mun05", "name": "Luziânia",             "ibge": "5212501", "pop": 209432,  "lat": -16.2528, "lng": -47.9500},
    {"key": "mun06", "name": "Águas Lindas de Goiás","ibge": "5200258", "pop": 212440,  "lat": -15.7672, "lng": -48.2811},
    {"key": "mun07", "name": "Valparaíso de Goiás",  "ibge": "5221858", "pop": 164740,  "lat": -16.0681, "lng": -47.9781},
    {"key": "mun08", "name": "Trindade",             "ibge": "5221403", "pop": 129823,  "lat": -16.6512, "lng": -49.4884},
    {"key": "mun09", "name": "Senador Canedo",       "ibge": "5220454", "pop": 127192,  "lat": -16.7082, "lng": -49.0917},
    {"key": "mun10", "name": "Formosa",              "ibge": "5208004", "pop": 119506,  "lat": -15.5372, "lng": -47.3342},
    {"key": "mun11", "name": "Goianésia",            "ibge": "5208608", "pop": 72681,   "lat": -15.3125, "lng": -49.1172},
    {"key": "mun12", "name": "Itumbiara",            "ibge": "5211503", "pop": 105234,  "lat": -18.4191, "lng": -49.2158},
    {"key": "mun13", "name": "Catalão",              "ibge": "5205109", "pop": 110983,  "lat": -18.1661, "lng": -47.9461},
    {"key": "mun14", "name": "Jataí",                "ibge": "5211909", "pop": 102065,  "lat": -17.8822, "lng": -51.7142},
    {"key": "mun15", "name": "Planaltina",           "ibge": "5217609", "pop": 95648,   "lat": -15.4528, "lng": -47.6139},
    {"key": "mun16", "name": "Caldas Novas",         "ibge": "5204507", "pop": 91735,   "lat": -17.7442, "lng": -48.6253},
    {"key": "mun17", "name": "Novo Gama",            "ibge": "5214838", "pop": 114175,  "lat": -16.0589, "lng": -48.0422},
    {"key": "mun18", "name": "Inhumas",              "ibge": "5210208", "pop": 53081,   "lat": -16.3561, "lng": -49.4942},
    {"key": "mun19", "name": "Mineiros",             "ibge": "5213103", "pop": 65417,   "lat": -17.5694, "lng": -52.5508},
    {"key": "mun20", "name": "Jaraguá",              "ibge": "5211800", "pop": 52452,   "lat": -15.7558, "lng": -49.3344},
    {"key": "mun21", "name": "Porangatu",            "ibge": "5218003", "pop": 45761,   "lat": -13.4408, "lng": -49.1486},
    {"key": "mun22", "name": "Morrinhos",            "ibge": "5213806", "pop": 46540,   "lat": -17.7311, "lng": -49.1011},
    {"key": "mun23", "name": "Uruaçu",               "ibge": "5221601", "pop": 39197,   "lat": -14.5239, "lng": -49.1414},
    {"key": "mun24", "name": "Goiatuba",             "ibge": "5209150", "pop": 37612,   "lat": -18.0131, "lng": -49.3564},
    {"key": "mun25", "name": "Ceres",                "ibge": "5205307", "pop": 22570,   "lat": -15.3072, "lng": -49.5958},
    {"key": "mun26", "name": "Quirinópolis",         "ibge": "5218508", "pop": 47746,   "lat": -18.4483, "lng": -50.4522},
    {"key": "mun27", "name": "Pirenópolis",          "ibge": "5217302", "pop": 24694,   "lat": -15.8511, "lng": -49.0297},
    {"key": "mun28", "name": "Goiás",                "ibge": "5208905", "pop": 24727,   "lat": -15.9333, "lng": -49.7142},
    {"key": "mun29", "name": "Niquelândia",          "ibge": "5214606", "pop": 47450,   "lat": -14.4739, "lng": -48.4594},
    {"key": "mun30", "name": "Cristalina",           "ibge": "5206206", "pop": 56814,   "lat": -16.7678, "lng": -47.6136},
]

# Todos são GO
for m in MUNICIPALITIES:
    m["state"] = "GO"

# ═══════════════════════════════════════════════════════════════════════════════
# GERADORES PROGRAMÁTICOS
# ═══════════════════════════════════════════════════════════════════════════════

_FIRST_NAMES_M = [
    "João", "Pedro", "Carlos", "José", "Antônio", "Francisco", "Lucas", "Marcos",
    "Paulo", "Rafael", "Gabriel", "Mateus", "André", "Thiago", "Felipe", "Bruno",
    "Diego", "Rodrigo", "Eduardo", "Vinícius", "Henrique", "Gustavo", "Leonardo",
    "Daniel", "Renato", "Sérgio", "Manoel", "Sebastião", "Joaquim", "Moisés",
]
_FIRST_NAMES_F = [
    "Maria", "Ana", "Francisca", "Juliana", "Patricia", "Carla", "Fernanda",
    "Sandra", "Luciana", "Beatriz", "Camila", "Raquel", "Tereza", "Helena",
    "Silvana", "Rosa", "Lúcia", "Ivone", "Cláudia", "Simone", "Larissa",
    "Amanda", "Bruna", "Valentina", "Isabela", "Letícia", "Mariana", "Tatiana",
    "Cristina", "Aparecida",
]
_LAST_NAMES = [
    "Silva", "Santos", "Oliveira", "Souza", "Pereira", "Costa", "Ferreira",
    "Rodrigues", "Almeida", "Nascimento", "Lima", "Araújo", "Fernandes",
    "Carvalho", "Gomes", "Martins", "Rocha", "Ribeiro", "Alves", "Monteiro",
    "Mendes", "Barros", "Freitas", "Barbosa", "Pinto", "Moura", "Cavalcanti",
    "Dias", "Castro", "Campos", "Cardoso", "Correia", "Vieira", "Nunes",
]
_STREETS = ["Rua", "Av.", "Travessa", "Alameda", "Praça"]
_STREET_NAMES = [
    "das Flores", "Brasil", "Goiás", "15 de Novembro", "7 de Setembro",
    "Dom Pedro II", "Santos Dumont", "JK", "Anhanguera", "Araguaia",
    "Tocantins", "Paranaíba", "dos Bandeirantes", "da Liberdade", "Central",
    "do Comércio", "da Paz", "das Mangueiras", "dos Ipês", "das Palmeiras",
]
_BAIRROS = [
    "Centro", "Setor Central", "Vila Nova", "Jardim das Flores", "Setor Sul",
    "Setor Norte", "Vila Brasília", "Jardim Goiás", "Setor Universitário",
    "Vila Santa Maria", "Jardim América", "Setor Industrial", "Vila São José",
    "Jardim Planalto", "Setor Aeroporto", "Vila Formosa", "Parque das Laranjeiras",
    "Residencial Canadá", "Jardim Europa", "Setor Oeste",
]
_DISEASES = [
    "Hipertensão arterial", "Diabetes tipo 2", "Diabetes tipo 1", "Asma",
    "DPOC", "ICC", "Artrose", "Fibrilação atrial", "Hipotireoidismo",
    "Epilepsia", "Depressão", "Ansiedade", "Osteoporose", "Anemia falciforme",
    "Alzheimer", "Neuropatia periférica", "Retinopatia diabética",
]
_ALLERGIES = ["Dipirona", "AAS", "Penicilina", "Sulfas", "Ibuprofeno", "Látex", "Contraste iodado"]
_FACILITY_TYPES = [
    (FacilityType.UBS, "UBS"),
    (FacilityType.UPA, "UPA"),
    (FacilityType.HOSPITAL, "Hospital Municipal"),
    (FacilityType.LAB, "Laboratório Municipal"),
    (FacilityType.CAPS, "CAPS"),
    (FacilityType.CEO, "CEO"),
    (FacilityType.POLICLINICA, "Policlínica"),
]


def _gen_cpf(seed: int) -> str:
    return f"{seed:011d}"


def _gen_cns(seed: int) -> str | None:
    if seed % 5 == 0:  # 20% sem CNS
        return None
    return f"7{seed:014d}"


def _gen_phone(seed: int) -> str:
    return f"(62) 9{seed % 10000:04d}-{(seed * 7) % 10000:04d}"


def _gen_cep(ibge: str) -> str:
    h = int(hashlib.md5(ibge.encode()).hexdigest()[:4], 16) % 90000 + 10000
    return f"7{h:05d}00"


def _gen_facilities(mun_key: str, mun_name: str, ibge: str, pop: int) -> list[dict]:
    """Gera facilities para um município baseado na população."""
    facs = [{"key": f"{mun_key}_sms", "mun": mun_key, "name": f"Secretaria Municipal de Saúde — {mun_name}",
             "short": f"SMS {mun_name[:15]}", "type": FacilityType.SMS, "cnes": f"{int(ibge[:5]):07d}"}]
    n_extra = min(7, max(2, pop // 50000))
    used = set()
    for i in range(n_extra):
        ft, prefix = _FACILITY_TYPES[i % len(_FACILITY_TYPES)]
        name = f"{prefix} {_BAIRROS[i % len(_BAIRROS)]} — {mun_name}"
        short = f"{prefix[:3]} {_BAIRROS[i % len(_BAIRROS)][:10]}"
        cnes_num = f"{int(ibge[:4]) + i + 1:07d}"
        if cnes_num in used:
            cnes_num = f"{int(ibge[:4]) + i + 100:07d}"
        used.add(cnes_num)
        facs.append({"key": f"{mun_key}_fac{i}", "mun": mun_key, "name": name,
                      "short": short, "type": ft, "cnes": cnes_num})
    return facs


def _gen_users(mun_key: str, mun_name: str, idx: int) -> list[dict]:
    """Gera usuários para um município."""
    base = idx * 10
    login_prefix = mun_name.lower().replace(" ", "").replace("á", "a").replace("â", "a") \
        .replace("ã", "a").replace("é", "e").replace("ê", "e").replace("í", "i") \
        .replace("ó", "o").replace("ô", "o").replace("ú", "u").replace("ç", "c")[:8]
    users = [
        {"key": f"{mun_key}_admin", "login": f"admin.{login_prefix}",
         "email": f"admin@{login_prefix}.gov.br", "name": f"Admin {mun_name}",
         "cpf": _gen_cpf(80000 + base), "phone": _gen_phone(80000 + base),
         "status": UserStatus.ATIVO, "level": UserLevel.ADMIN, "birth": "1985-06-15"},
        {"key": f"{mun_key}_med", "login": f"med.{login_prefix}",
         "email": f"medico@{login_prefix}.gov.br", "name": f"Dr. Médico {mun_name}",
         "cpf": _gen_cpf(80001 + base), "phone": _gen_phone(80001 + base),
         "status": UserStatus.ATIVO, "level": UserLevel.USER, "birth": "1978-03-22"},
        {"key": f"{mun_key}_enf", "login": f"enf.{login_prefix}",
         "email": f"enf@{login_prefix}.gov.br", "name": f"Enf. {_FIRST_NAMES_F[idx % len(_FIRST_NAMES_F)]} {_LAST_NAMES[idx % len(_LAST_NAMES)]}",
         "cpf": _gen_cpf(80002 + base), "phone": _gen_phone(80002 + base),
         "status": UserStatus.ATIVO, "level": UserLevel.USER, "birth": "1990-08-10"},
        {"key": f"{mun_key}_rec", "login": f"rec.{login_prefix}",
         "email": f"recep@{login_prefix}.gov.br", "name": f"{_FIRST_NAMES_F[(idx+5) % len(_FIRST_NAMES_F)]} Recepcionista",
         "cpf": _gen_cpf(80003 + base), "phone": _gen_phone(80003 + base),
         "status": UserStatus.ATIVO, "level": UserLevel.USER, "birth": "1995-12-01"},
    ]
    return users


def _gen_patients(ibge: str, mun_name: str, idx: int, count: int) -> list[dict]:
    """Gera pacientes para um município."""
    patients = []
    prefix = mun_name[:3].upper()
    cep = _gen_cep(ibge)
    for i in range(count):
        seed = idx * 1000 + i
        sex = "F" if i % 3 != 0 else "M"
        names = _FIRST_NAMES_F if sex == "F" else _FIRST_NAMES_M
        name = f"{names[i % len(names)]} {_LAST_NAMES[i % len(_LAST_NAMES)]} {_LAST_NAMES[(i+3) % len(_LAST_NAMES)]}"
        age_days = random.randint(0, 365 * 95)
        birth = (date.today() - timedelta(days=age_days)).isoformat()
        raca = str(random.choice([1, 1, 2, 3, 3, 3, 4, 5]))
        mother_name = f"{_FIRST_NAMES_F[(i+7) % len(_FIRST_NAMES_F)]} {_LAST_NAMES[(i+2) % len(_LAST_NAMES)]}"

        p = {
            "key": f"pac_{ibge}_{i:04d}", "pront": f"{prefix}-{i+1:04d}",
            "name": name, "sex": sex, "birth": birth,
            "cpf": _gen_cpf(seed + 100000) if i % 8 != 0 else None,
            "cns": _gen_cns(seed),
            "mother": mother_name,
            "cell": _gen_phone(seed), "cep": cep,
            "end": f"{_STREETS[i % len(_STREETS)]} {_STREET_NAMES[i % len(_STREET_NAMES)]}",
            "num": str(random.randint(1, 2000)),
            "bairro": _BAIRROS[i % len(_BAIRROS)],
            "raca": raca,
        }
        # Variações realistas
        if age_days > 365 * 60 and i % 3 == 0:
            p["doencas"] = ", ".join(random.sample(_DISEASES, k=random.randint(1, 3)))
        if i % 12 == 0:
            p["alergia"] = ", ".join(random.sample(_ALLERGIES, k=random.randint(1, 2)))
        if sex == "F" and 18 * 365 < age_days < 45 * 365 and i % 7 == 0:
            p["gestante"] = True
        if i % 20 == 0 and age_days > 365 * 40:
            p["fumante"] = True
        if i % 25 == 0:
            p["etilista"] = True
        if i % 50 == 0:
            p["situacao_rua"] = True
        if raca == "5":
            p["etnia"] = "0245"
        if i % 6 == 0:
            p["plano"] = random.choice(["SUS", "SUS", "SUS", "CONVENIO", "PARTICULAR"])
            if p["plano"] == "CONVENIO":
                p["conv_nome"] = random.choice(["Unimed", "Hapvida", "Amil", "Bradesco Saúde"])
                p["conv_num"] = f"{seed:09d}"
        patients.append(p)
    return patients


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

_ROLE_MAP = {
    "system_admin": "system_admin", "municipality_admin": "municipality_admin",
    "receptionist": "receptionist_base", "nurse": "nurse_base",
    "doctor": "doctor_base", "lab_tech": "lab_tech_base",
    "manager": "manager_base", "visa": "visa_agent_base",
}


async def _get_ref_ids(session: AsyncSession) -> dict[str, dict[str, uuid.UUID]]:
    refs: dict[str, dict[str, uuid.UUID]] = {}
    tables = [("ref_racas", "raca"), ("ref_etnias", "etnia"),
              ("ref_nacionalidades", "nacionalidade"), ("ref_tipos_documento", "tipo_doc")]
    dialect = session.bind.dialect.name
    schema_prefix = '"APP".' if dialect == "oracle" else "app."
    for table_name, ref_key in tables:
        rows = await session.execute(text(f"SELECT id, codigo FROM {schema_prefix}{table_name}"))
        refs[ref_key] = {}
        for row in rows.mappings():
            rid = row["id"]
            if isinstance(rid, bytes):
                rid = uuid.UUID(bytes=rid)
            refs[ref_key][str(row["codigo"])] = rid
    return refs


def _build_patient(p: dict, refs: dict, creator: uuid.UUID) -> dict:
    return {
        "id": fid(p["key"]), "prontuario": p["pront"], "name": p["name"],
        "cpf": p.get("cpf"), "cns": p.get("cns"), "sex": p.get("sex"),
        "birth_date": date.fromisoformat(p["birth"]) if p.get("birth") else None,
        "mother_name": p.get("mother", ""), "mother_unknown": p.get("mother_unknown", False),
        "nacionalidade_id": refs.get("nacionalidade", {}).get("10"),
        "raca_id": refs.get("raca", {}).get(p.get("raca")),
        "etnia_id": refs.get("etnia", {}).get(p.get("etnia")) if p.get("etnia") else None,
        "cep": p.get("cep", ""), "endereco": p.get("end", ""), "numero": p.get("num", ""),
        "bairro": p.get("bairro", ""), "uf": "GO",
        "phone": p.get("phone", ""), "cellphone": p.get("cell", ""),
        "plano_tipo": p.get("plano", "SUS"),
        "convenio_nome": p.get("conv_nome", ""), "convenio_numero_carteirinha": p.get("conv_num", ""),
        "doencas_cronicas": p.get("doencas", ""),
        "tem_alergia": bool(p.get("alergia")), "alergias": p.get("alergia", ""),
        "gestante": p.get("gestante", False),
        "fumante": p.get("fumante"), "etilista": p.get("etilista"),
        "situacao_rua": p.get("situacao_rua", False),
        "created_by": creator, "active": True,
    }


async def _set_tenant(session: AsyncSession, ibge: str) -> None:
    dialect = session.bind.dialect.name
    if dialect == "postgresql":
        from app.db.tenant_schemas import search_path_for
        await session.execute(text(f"SET LOCAL search_path = {search_path_for(ibge)}"))
    elif dialect == "oracle":
        await session.execute(text(f'ALTER SESSION SET CURRENT_SCHEMA = "MUN_{ibge}"'))


# ═══════════════════════════════════════════════════════════════════════════════
# SEEDING
# ═══════════════════════════════════════════════════════════════════════════════


async def seed_app(session: AsyncSession) -> dict:
    from app.modules.permissions.models import Role

    stats = {"municipalities": 0, "neighborhoods": 0, "facilities": 0, "users": 0, "mun_access": 0, "fac_access": 0}

    # ── Global MASTER user ──
    pwd = hash_password(DEFAULT_PASSWORD)
    master_users = [
        {"key": "master1", "login": "igor.santos", "email": "igor@zsaude.gov.br",
         "name": "Igor Santos", "cpf": "02134567890", "phone": "(62) 99999-1234",
         "status": UserStatus.ATIVO, "level": UserLevel.MASTER, "birth": "1990-05-15"},
        {"key": "master2", "login": "admin.global", "email": "admin@zsaude.gov.br",
         "name": "Administrador Global", "cpf": "98765432100", "phone": "(62) 98888-0000",
         "status": UserStatus.ATIVO, "level": UserLevel.MASTER, "birth": "1985-01-01"},
    ]
    for u in master_users:
        if not await session.scalar(select(User).where(User.id == fid(u["key"]))):
            session.add(User(
                id=fid(u["key"]), login=u["login"], email=u["email"], name=u["name"],
                cpf=u["cpf"], phone=u["phone"], password_hash=pwd,
                status=u["status"], level=u["level"],
                is_active=True, is_superuser=True,
                birth_date=date.fromisoformat(u["birth"]),
            ))
            stats["users"] += 1
    await session.flush()

    # ── Municípios ──
    for m in MUNICIPALITIES:
        if not await session.scalar(select(Municipality).where(Municipality.id == fid(m["key"]))):
            session.add(Municipality(
                id=fid(m["key"]), name=m["name"], state=m["state"], ibge=m["ibge"],
                population=m.get("pop"), center_latitude=m.get("lat"), center_longitude=m.get("lng"),
            ))
            stats["municipalities"] += 1
    await session.flush()

    # ── MASTER access a todos os municípios ──
    for mk in [m["key"] for m in MUNICIPALITIES]:
        for uk in ["master1", "master2"]:
            if not await session.scalar(select(MunicipalityAccess).where(
                MunicipalityAccess.user_id == fid(uk), MunicipalityAccess.municipality_id == fid(mk),
            )):
                session.add(MunicipalityAccess(user_id=fid(uk), municipality_id=fid(mk)))
                stats["mun_access"] += 1
    await session.flush()

    # ── Por município: bairros, facilities, users, acessos ──
    all_facilities = []
    role_ids = {r.code: r.id for r in (await session.scalars(select(Role).where(Role.municipality_id.is_(None)))).all()}
    fallback_role = role_ids.get("receptionist_base")

    for idx, m in enumerate(MUNICIPALITIES):
        # Bairros
        n_bairros = min(5, max(2, m["pop"] // 100000))
        for bi in range(n_bairros):
            bk = f"{m['key']}_bairro{bi}"
            if not await session.scalar(select(Neighborhood).where(Neighborhood.id == fid(bk))):
                session.add(Neighborhood(
                    id=fid(bk), municipality_id=fid(m["key"]),
                    name=_BAIRROS[bi % len(_BAIRROS)], population=random.randint(3000, 40000),
                ))
                stats["neighborhoods"] += 1

        # Facilities
        facs = _gen_facilities(m["key"], m["name"], m["ibge"], m["pop"])
        all_facilities.extend(facs)
        for f in facs:
            if not await session.scalar(select(Facility).where(Facility.id == fid(f["key"]))):
                session.add(Facility(
                    id=fid(f["key"]), municipality_id=fid(f["mun"]),
                    name=f["name"], short_name=f["short"], type=f["type"], cnes=f.get("cnes"),
                ))
                stats["facilities"] += 1

        # Users
        users = _gen_users(m["key"], m["name"], idx)
        for u in users:
            if not await session.scalar(select(User).where(User.id == fid(u["key"]))):
                session.add(User(
                    id=fid(u["key"]), login=u["login"], email=u["email"], name=u["name"],
                    cpf=u["cpf"], phone=u["phone"], password_hash=pwd,
                    status=u["status"], level=u.get("level", UserLevel.USER),
                    is_active=u["status"] != UserStatus.BLOQUEADO,
                    birth_date=date.fromisoformat(u["birth"]) if u.get("birth") else None,
                ))
                stats["users"] += 1

        await session.flush()

        # Mun Access
        for u in users:
            if not await session.scalar(select(MunicipalityAccess).where(
                MunicipalityAccess.user_id == fid(u["key"]), MunicipalityAccess.municipality_id == fid(m["key"]),
            )):
                session.add(MunicipalityAccess(user_id=fid(u["key"]), municipality_id=fid(m["key"])))
                stats["mun_access"] += 1

        # Fac Access
        role_assignments = [
            (f"{m['key']}_admin", "municipality_admin"),
            (f"{m['key']}_med",   "doctor"),
            (f"{m['key']}_enf",   "nurse"),
            (f"{m['key']}_rec",   "receptionist"),
        ]
        for user_key, role_code in role_assignments:
            rid = role_ids.get(_ROLE_MAP.get(role_code, role_code), fallback_role)
            # Admin acessa todas as facilities, outros acessam a SMS + primeira UBS
            target_facs = facs if role_code == "municipality_admin" else facs[:2]
            for f in target_facs:
                if not await session.scalar(select(FacilityAccess).where(
                    FacilityAccess.user_id == fid(user_key), FacilityAccess.facility_id == fid(f["key"]),
                )):
                    session.add(FacilityAccess(user_id=fid(user_key), facility_id=fid(f["key"]), role_id=rid))
                    stats["fac_access"] += 1

        # MASTER acessa SMS de cada município
        for uk in ["master1", "master2"]:
            sms_key = facs[0]["key"]
            if not await session.scalar(select(FacilityAccess).where(
                FacilityAccess.user_id == fid(uk), FacilityAccess.facility_id == fid(sms_key),
            )):
                session.add(FacilityAccess(user_id=fid(uk), facility_id=fid(sms_key),
                                           role_id=role_ids.get("system_admin", fallback_role)))
                stats["fac_access"] += 1

        await session.flush()

    return stats


async def seed_patients(session: AsyncSession, ibge: str, patients: list[dict]) -> tuple[int, int]:
    from app.tenant_models.patients import Patient

    refs = await _get_ref_ids(session)
    creator = fid("master1")
    await _set_tenant(session, ibge)

    n_patients = 0
    for p in patients:
        if not await session.scalar(select(Patient).where(Patient.id == fid(p["key"]))):
            session.add(Patient(**_build_patient(p, refs, creator)))
            n_patients += 1
    await session.flush()
    return n_patients, 0


async def seed_cnes(session: AsyncSession, ibge: str, facilities: list[dict]) -> int:
    from app.tenant_models.cnes.units import CnesUnit
    from app.tenant_models.cnes.professionals import CnesProfessional

    await _set_tenant(session, ibge)
    competencia = "202604"
    n = 0
    for f in facilities:
        if not f.get("cnes"):
            continue
        cnes_code = f["cnes"]
        unit_id = f"{'0' * 24}{cnes_code}"[:31]
        if not await session.scalar(select(CnesUnit).where(CnesUnit.cnes == cnes_code)):
            session.add(CnesUnit(
                id=fid(f"cnes_{cnes_code}"), id_unidade=unit_id, cnes=cnes_code,
                razao_social=f["name"], nome_fantasia=f["short"],
                tipo_unidade="05", estado="GO", codigo_ibge=ibge,
                competencia_ultima_importacao=competencia, active=True,
            ))
            n += 1
    await session.flush()

    s = ibge[-3:]
    profs = [
        ("med", f"Dr. Médico CNES {ibge}", f"2251{ibge}00001", f"100{s}00001"),
        ("enf", f"Enf. CNES {ibge}",       f"2231{ibge}00002", f"200{s}00002"),
    ]
    for prefix, nome, id_prof, cpf in profs:
        if not await session.scalar(select(CnesProfessional).where(CnesProfessional.id_profissional == id_prof)):
            session.add(CnesProfessional(
                id=fid(f"cnesprof_{ibge}_{prefix}"), id_profissional=id_prof,
                cpf=cpf, nome=nome, status="Ativo", competencia_ultima_importacao=competencia,
            ))
    await session.flush()
    return n


async def main() -> None:
    engine()

    from app.core.permissions.seed import ensure_system_base_roles, sync_permissions
    from app.modules.system.service import SettingsService

    async with sessionmaker()() as s:
        await sync_permissions(s)
        await s.commit()
    async with sessionmaker()() as s:
        await ensure_system_base_roles(s)
        await SettingsService(s).warm_up()
        await s.commit()
    print("RBAC e settings OK.\n")

    # App schema
    print("Schema app:")
    async with sessionmaker()() as s:
        stats = await seed_app(s)
        await s.commit()
    for k, v in stats.items():
        print(f"  {k}: {v}")

    # Tenant schemas
    print("\nSchemas tenant:")
    async with sessionmaker()() as s:
        for m in MUNICIPALITIES:
            schema = await ensure_municipality_schema(s, m["ibge"])
            print(f"  · {m['name']:<25} → {schema}")
        await s.commit()

    # Pacientes + CNES
    print("\nPacientes e CNES:")
    total_p, total_c = 0, 0
    mun_fac = {}
    all_facs = []
    for m in MUNICIPALITIES:
        facs = _gen_facilities(m["key"], m["name"], m["ibge"], m["pop"])
        mun_fac[m["ibge"]] = facs
        all_facs.extend(facs)

    for idx, m in enumerate(MUNICIPALITIES):
        ibge = m["ibge"]
        n_patients = min(50, max(30, m["pop"] // 20000))
        patients = _gen_patients(ibge, m["name"], idx, n_patients)
        facs = mun_fac.get(ibge, [])
        async with sessionmaker()() as s:
            np, _ = await seed_patients(s, ibge, patients)
            nc = await seed_cnes(s, ibge, facs)
            await s.commit()
            total_p += np
            total_c += nc
            print(f"  · {m['name']:<25} → {np:>3} pacientes, {nc} CNES")

    print(f"\n{'='*60}")
    print(f"Seed completo!")
    print(f"  Municípios:     {len(MUNICIPALITIES)}")
    print(f"  Unidades:       {len(all_facs)}")
    print(f"  Usuários:       {stats['users']}")
    print(f"  Pacientes:      {total_p}")
    print(f"  CNES Units:     {total_c}")
    print(f"  Senha:          {DEFAULT_PASSWORD}")
    print(f"{'='*60}")

    await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
