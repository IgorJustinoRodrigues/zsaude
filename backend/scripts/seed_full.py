"""Seed completo e robusto para testes end-to-end.

Popula:
- 5 municípios (GO) com bairros
- 20+ unidades de saúde (todos os tipos)
- 20 usuários (MASTER, ADMIN, USER, bloqueados, inativos)
- Acessos complexos (multi-município, multi-unidade, roles variados)
- 50 pacientes com dados realistas (SUS, convênio, particular,
  gestantes, idosos, crianças, situação de rua, indígenas, etc.)
- Documentos de pacientes (RG, CNH, etc.)
- Dados CNES simulados (unidades, profissionais, equipes, leitos)
- Roles municipais customizados + overrides de permissão

Idempotente. Executar:
    docker compose exec app .venv/bin/python scripts/seed_full.py
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import date

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


def fid(key: str) -> uuid.UUID:
    return uuid.uuid5(NS, key)


# ═══════════════════════════════════════════════════════════════════════════════
# MUNICÍPIOS + BAIRROS
# ═══════════════════════════════════════════════════════════════════════════════

MUNICIPALITIES = [
    {"key": "mun1", "name": "Goiânia",              "state": "GO", "ibge": "5208707", "pop": 1437237, "lat": -16.6869, "lng": -49.2648},
    {"key": "mun2", "name": "Aparecida de Goiânia", "state": "GO", "ibge": "5201405", "pop": 590146,  "lat": -16.8198, "lng": -49.2469},
    {"key": "mun3", "name": "Anápolis",             "state": "GO", "ibge": "5201108", "pop": 391772,  "lat": -16.3281, "lng": -48.9530},
    {"key": "mun4", "name": "Senador Canedo",       "state": "GO", "ibge": "5220454", "pop": 127192,  "lat": -16.7082, "lng": -49.0917},
    {"key": "mun5", "name": "Trindade",             "state": "GO", "ibge": "5221403", "pop": 129823,  "lat": -16.6512, "lng": -49.4884},
    {"key": "mun6", "name": "Goianésia",            "state": "GO", "ibge": "5208608", "pop": 72681,   "lat": -15.3125, "lng": -49.1172},
]

NEIGHBORHOODS = {
    "mun1": [
        {"key": "bairro1",  "name": "Setor Central",      "pop": 12000},
        {"key": "bairro2",  "name": "Setor Bueno",        "pop": 35000},
        {"key": "bairro3",  "name": "Setor Sul",          "pop": 18000},
        {"key": "bairro4",  "name": "Campinas",           "pop": 42000},
        {"key": "bairro5",  "name": "Setor Oeste",        "pop": 28000},
        {"key": "bairro6",  "name": "Jardim América",     "pop": 38000},
        {"key": "bairro7",  "name": "Setor Marista",      "pop": 22000},
        {"key": "bairro8",  "name": "Setor Universitário","pop": 15000},
        {"key": "bairro9",  "name": "Faiçalville",        "pop": 20000},
        {"key": "bairro10", "name": "Setor Aeroporto",    "pop": 16000},
    ],
    "mun2": [
        {"key": "bairro20", "name": "Jardim Tiradentes",  "pop": 25000},
        {"key": "bairro21", "name": "Papillon Park",      "pop": 18000},
        {"key": "bairro22", "name": "Cidade Livre",       "pop": 30000},
        {"key": "bairro23", "name": "Garavelo",           "pop": 22000},
        {"key": "bairro24", "name": "Jardim Nova Era",    "pop": 15000},
    ],
    "mun3": [
        {"key": "bairro30", "name": "Centro",             "pop": 10000},
        {"key": "bairro31", "name": "Jundiaí",            "pop": 35000},
        {"key": "bairro32", "name": "Vila Santa Isabel",  "pop": 12000},
    ],
    "mun6": [
        {"key": "bairro60", "name": "Centro",             "pop": 8000},
        {"key": "bairro61", "name": "Setor Universitário","pop": 5000},
        {"key": "bairro62", "name": "Vila Brasília",      "pop": 6000},
        {"key": "bairro63", "name": "Jardim Goiás",       "pop": 4000},
    ],
}

# ═══════════════════════════════════════════════════════════════════════════════
# UNIDADES
# ═══════════════════════════════════════════════════════════════════════════════

FACILITIES = [
    # Goiânia — completa
    {"key": "fac1",  "mun": "mun1", "name": "Secretaria Municipal de Saúde",              "short": "SMS Central",      "type": FacilityType.SMS,         "cnes": "2337878"},
    {"key": "fac2",  "mun": "mun1", "name": "UBS Centro",                                 "short": "UBS Centro",       "type": FacilityType.UBS,         "cnes": "2338009"},
    {"key": "fac3",  "mun": "mun1", "name": "UPA Norte",                                  "short": "UPA Norte",        "type": FacilityType.UPA,         "cnes": "7210132"},
    {"key": "fac4",  "mun": "mun1", "name": "Laboratório Municipal",                      "short": "Lab. Municipal",   "type": FacilityType.LAB,         "cnes": "2338017"},
    {"key": "fac5",  "mun": "mun1", "name": "VISA Municipal",                             "short": "VISA Municipal",   "type": FacilityType.VISA,        "cnes": None},
    {"key": "fac6",  "mun": "mun1", "name": "Setor de Transportes",                       "short": "Transportes",      "type": FacilityType.TRANSPORTES, "cnes": None},
    {"key": "fac12", "mun": "mun1", "name": "CEO Centro de Espec. Odontológicas",         "short": "CEO Centro",       "type": FacilityType.CEO,         "cnes": "6543210"},
    {"key": "fac13", "mun": "mun1", "name": "CAPS II Atenção Psicossocial",               "short": "CAPS II",          "type": FacilityType.CAPS,        "cnes": "5432109"},
    {"key": "fac15", "mun": "mun1", "name": "UBS Jardim América",                         "short": "UBS Jd América",   "type": FacilityType.UBS,         "cnes": "2338025"},
    {"key": "fac16", "mun": "mun1", "name": "Hospital Municipal Dr. Alberto Rassi (HGG)", "short": "HGG",              "type": FacilityType.HOSPITAL,    "cnes": "2338033"},
    # Aparecida
    {"key": "fac7",  "mun": "mun2", "name": "Secretaria Municipal de Saúde",              "short": "SMS Aparecida",    "type": FacilityType.SMS,         "cnes": "2464705"},
    {"key": "fac8",  "mun": "mun2", "name": "UBS Jardim Tiradentes",                      "short": "UBS Jardim",       "type": FacilityType.UBS,         "cnes": "2464713"},
    {"key": "fac9",  "mun": "mun2", "name": "UPA Sul",                                    "short": "UPA Sul",          "type": FacilityType.UPA,         "cnes": "7654321"},
    {"key": "fac14", "mun": "mun2", "name": "Policlínica Municipal",                      "short": "Policlínica",      "type": FacilityType.POLICLINICA, "cnes": "4321098"},
    # Anápolis
    {"key": "fac10", "mun": "mun3", "name": "Secretaria Municipal de Saúde",              "short": "SMS Anápolis",     "type": FacilityType.SMS,         "cnes": "2527901"},
    {"key": "fac11", "mun": "mun3", "name": "HMU Hospital Municipal de Urgência",         "short": "HMU",              "type": FacilityType.HOSPITAL,    "cnes": "2527928"},
    {"key": "fac17", "mun": "mun3", "name": "UBS Centro Anápolis",                        "short": "UBS Centro Ana",   "type": FacilityType.UBS,         "cnes": "2527936"},
    # Senador Canedo
    {"key": "fac18", "mun": "mun4", "name": "SMS Senador Canedo",                         "short": "SMS S.Canedo",     "type": FacilityType.SMS,         "cnes": "3601234"},
    {"key": "fac19", "mun": "mun4", "name": "UBS Central Canedo",                         "short": "UBS Canedo",       "type": FacilityType.UBS,         "cnes": "3601242"},
    # Trindade
    {"key": "fac20", "mun": "mun5", "name": "SMS Trindade",                               "short": "SMS Trindade",     "type": FacilityType.SMS,         "cnes": "3701234"},
    {"key": "fac21", "mun": "mun5", "name": "UBS Trindade Centro",                        "short": "UBS Trindade",     "type": FacilityType.UBS,         "cnes": "3701242"},
    # Goianésia
    {"key": "fac22", "mun": "mun6", "name": "Secretaria Municipal de Saúde de Goianésia", "short": "SMS Goianésia",    "type": FacilityType.SMS,         "cnes": "2504901"},
    {"key": "fac23", "mun": "mun6", "name": "UBS Centro Goianésia",                       "short": "UBS Centro Goia",  "type": FacilityType.UBS,         "cnes": "2504928"},
    {"key": "fac24", "mun": "mun6", "name": "Hospital Municipal de Goianésia",            "short": "HM Goianésia",     "type": FacilityType.HOSPITAL,    "cnes": "2504936"},
    {"key": "fac25", "mun": "mun6", "name": "UBS Vila Brasília",                          "short": "UBS V.Brasília",   "type": FacilityType.UBS,         "cnes": "2504944"},
]

# ═══════════════════════════════════════════════════════════════════════════════
# USUÁRIOS
# ═══════════════════════════════════════════════════════════════════════════════

USERS = [
    # MASTER
    {"key": "usr1",  "login": "igor.santos",       "email": "igor@zsaude.gov.br",      "name": "Igor Santos",             "cpf": "02134567890", "phone": "(62) 99999-1234", "status": UserStatus.ATIVO,     "level": UserLevel.MASTER,  "birth": "1990-05-15"},
    # ADMIN por município
    {"key": "usr2",  "login": "carla.mendonca",    "email": "carla@zsaude.gov.br",     "name": "Carla Mendonça",          "cpf": "13456789012", "phone": "(62) 98888-5678", "status": UserStatus.ATIVO,     "level": UserLevel.ADMIN,   "birth": "1985-11-20"},
    {"key": "usr13", "login": "admin.aparecida",   "email": "admin@aparecida.gov.br",  "name": "Ana Paula Ribeiro",       "cpf": "11122233344", "phone": "(62) 98111-2222", "status": UserStatus.ATIVO,     "level": UserLevel.ADMIN,   "birth": "1988-03-08"},
    {"key": "usr14", "login": "admin.anapolis",    "email": "admin@anapolis.gov.br",   "name": "Carlos Eduardo Dias",     "cpf": "55566677788", "phone": "(62) 98333-4444", "status": UserStatus.ATIVO,     "level": UserLevel.ADMIN,   "birth": "1982-07-25"},
    # Profissionais variados
    {"key": "usr3",  "login": "diego.figueiredo",  "email": "diego@zsaude.gov.br",     "name": "Diego Figueiredo",        "cpf": "24567890123", "phone": "(62) 97777-9012", "status": UserStatus.ATIVO,     "level": UserLevel.USER,    "birth": "1992-01-10"},
    {"key": "usr4",  "login": "renata.cabral",     "email": "renata@zsaude.gov.br",    "name": "Renata Cabral",           "cpf": "35678901234", "phone": "(62) 96666-3456", "status": UserStatus.ATIVO,     "level": UserLevel.USER,    "birth": "1995-09-14"},
    {"key": "usr6",  "login": "simone.araujo",     "email": "simone@zsaude.gov.br",    "name": "Simone Araújo",           "cpf": "57890123456", "phone": "(62) 94444-1234", "status": UserStatus.ATIVO,     "level": UserLevel.USER,    "birth": "1987-06-30"},
    {"key": "usr7",  "login": "rafael.campos",     "email": "rafael@zsaude.gov.br",    "name": "Dr. Rafael Campos",       "cpf": "68901234567", "phone": "(62) 93333-5678", "status": UserStatus.ATIVO,     "level": UserLevel.USER,    "birth": "1980-12-05"},
    {"key": "usr9",  "login": "paulo.henrique",    "email": "paulo@zsaude.gov.br",     "name": "Paulo Henrique Silva",    "cpf": "80123456789", "phone": "(62) 91111-3456", "status": UserStatus.ATIVO,     "level": UserLevel.USER,    "birth": "1991-04-18"},
    {"key": "usr10", "login": "beatriz.nunes",     "email": "beatriz@zsaude.gov.br",   "name": "Beatriz Nunes",           "cpf": "91234567890", "phone": "(62) 90000-7890", "status": UserStatus.ATIVO,     "level": UserLevel.USER,    "birth": "1993-08-22"},
    {"key": "usr12", "login": "juliana.torres",    "email": "juliana@zsaude.gov.br",   "name": "Juliana Torres",          "cpf": "13456789023", "phone": "(62) 99876-5432", "status": UserStatus.ATIVO,     "level": UserLevel.USER,    "birth": "1996-02-14"},
    {"key": "usr15", "login": "dra.amanda.souza",  "email": "amanda@zsaude.gov.br",    "name": "Dra. Amanda Souza",       "cpf": "44455566677", "phone": "(62) 98555-6666", "status": UserStatus.ATIVO,     "level": UserLevel.USER,    "birth": "1983-10-01"},
    {"key": "usr16", "login": "enfermeiro.jose",   "email": "jose.enf@zsaude.gov.br",  "name": "José Carlos Enfermeiro",  "cpf": "66677788899", "phone": "(62) 98777-8888", "status": UserStatus.ATIVO,     "level": UserLevel.USER,    "birth": "1989-05-20"},
    {"key": "usr17", "login": "farmacia.lucia",    "email": "lucia@zsaude.gov.br",     "name": "Lúcia Farmacêutica",      "cpf": "77788899900", "phone": "(62) 98888-9999", "status": UserStatus.ATIVO,     "level": UserLevel.USER,    "birth": "1994-11-11"},
    # Inativos e Bloqueados
    {"key": "usr5",  "login": "thales.marques",    "email": "thales@zsaude.gov.br",    "name": "Thales Marques",          "cpf": "46789012345", "phone": "(62) 95555-7890", "status": UserStatus.INATIVO,   "level": UserLevel.USER,    "birth": "1997-03-03"},
    {"key": "usr8",  "login": "fernanda.lima",     "email": "fernanda@zsaude.gov.br",  "name": "Fernanda Lima",           "cpf": "79012345678", "phone": "(62) 92222-9012", "status": UserStatus.BLOQUEADO, "level": UserLevel.USER,    "birth": "1986-07-17"},
    {"key": "usr11", "login": "marcos.vinicius",   "email": "marcos@zsaude.gov.br",    "name": "Marcos Vinicius Costa",   "cpf": "02345678901", "phone": "(62) 98765-4321", "status": UserStatus.INATIVO,   "level": UserLevel.USER,    "birth": "1998-01-28"},
    # Novos municípios
    {"key": "usr18", "login": "admin.canedo",      "email": "admin@canedo.gov.br",     "name": "Roberta Alves",           "cpf": "88899900011", "phone": "(62) 98999-0001", "status": UserStatus.ATIVO,     "level": UserLevel.ADMIN,   "birth": "1990-12-12"},
    {"key": "usr19", "login": "admin.trindade",    "email": "admin@trindade.gov.br",   "name": "Fernando Gomes",          "cpf": "99900011122", "phone": "(62) 99000-1112", "status": UserStatus.ATIVO,     "level": UserLevel.ADMIN,   "birth": "1987-04-05"},
    {"key": "usr20", "login": "medico.canedo",     "email": "medico@canedo.gov.br",    "name": "Dr. Lucas Pereira",       "cpf": "00011122233", "phone": "(62) 90011-2223", "status": UserStatus.ATIVO,     "level": UserLevel.USER,    "birth": "1979-08-16"},
    # Goianésia
    {"key": "usr21", "login": "admin.goianesia",   "email": "admin@goianesia.gov.br",  "name": "Mariana Costa Oliveira",  "cpf": "11100022233", "phone": "(62) 91100-2223", "status": UserStatus.ATIVO,     "level": UserLevel.ADMIN,   "birth": "1991-06-15"},
    {"key": "usr22", "login": "medico.goianesia",  "email": "medico@goianesia.gov.br", "name": "Dr. Henrique Ferreira",   "cpf": "22200033344", "phone": "(62) 92200-3334", "status": UserStatus.ATIVO,     "level": UserLevel.USER,    "birth": "1976-02-28"},
    {"key": "usr23", "login": "enf.goianesia",     "email": "enf@goianesia.gov.br",    "name": "Patrícia Enfermeira",     "cpf": "33300044455", "phone": "(62) 93300-4445", "status": UserStatus.ATIVO,     "level": UserLevel.USER,    "birth": "1988-09-10"},
    {"key": "usr24", "login": "recep.goianesia",   "email": "recep@goianesia.gov.br",  "name": "Cláudia Recepcionista",   "cpf": "44400055566", "phone": "(62) 94400-5556", "status": UserStatus.ATIVO,     "level": UserLevel.USER,    "birth": "1995-12-20"},
]

_ROLE_MAP = {
    "system_admin": "system_admin", "municipality_admin": "municipality_admin",
    "receptionist": "receptionist_base", "nurse": "nurse_base",
    "doctor": "doctor_base", "lab_tech": "lab_tech_base",
    "manager": "manager_base", "visa": "visa_agent_base",
}

MUN_ACCESS = [
    ("usr1", "mun1"), ("usr1", "mun2"), ("usr1", "mun3"), ("usr1", "mun4"), ("usr1", "mun5"),
    ("usr2", "mun1"), ("usr3", "mun1"), ("usr4", "mun1"), ("usr5", "mun1"), ("usr6", "mun1"),
    ("usr7", "mun1"), ("usr7", "mun3"), ("usr8", "mun2"), ("usr9", "mun1"), ("usr10", "mun2"),
    ("usr10", "mun3"), ("usr11", "mun2"), ("usr12", "mun1"), ("usr13", "mun2"), ("usr14", "mun3"),
    ("usr15", "mun1"), ("usr15", "mun2"), ("usr16", "mun1"), ("usr17", "mun1"),
    ("usr18", "mun4"), ("usr19", "mun5"), ("usr20", "mun4"),
    ("usr1", "mun6"), ("usr21", "mun6"), ("usr22", "mun6"), ("usr23", "mun6"), ("usr24", "mun6"),
]

FAC_ACCESS = [
    # MASTER — acesso amplo
    ("usr1", "fac1",  "system_admin"), ("usr1", "fac2",  "doctor"),  ("usr1", "fac7",  "manager"),
    ("usr1", "fac10", "manager"),      ("usr1", "fac18", "manager"), ("usr1", "fac20", "manager"),
    # ADMINs
    ("usr2",  "fac1",  "municipality_admin"), ("usr2",  "fac2",  "municipality_admin"),
    ("usr13", "fac7",  "municipality_admin"), ("usr13", "fac8",  "municipality_admin"), ("usr13", "fac14", "municipality_admin"),
    ("usr14", "fac10", "municipality_admin"), ("usr14", "fac11", "municipality_admin"), ("usr14", "fac17", "municipality_admin"),
    ("usr18", "fac18", "municipality_admin"), ("usr18", "fac19", "municipality_admin"),
    ("usr19", "fac20", "municipality_admin"), ("usr19", "fac21", "municipality_admin"),
    # Profissionais
    ("usr3",  "fac4",  "lab_tech"),     # lab
    ("usr4",  "fac5",  "visa"),         # fiscal
    ("usr6",  "fac3",  "nurse"),  ("usr6",  "fac13", "nurse"),  ("usr6", "fac16", "nurse"),  # enfermeira multi-unidade
    ("usr7",  "fac16", "doctor"), ("usr7",  "fac11", "doctor"),  # médico 2 hospitais
    ("usr9",  "fac2",  "nurse"),        # farmacêutico na UBS
    ("usr10", "fac8",  "nurse"),  ("usr10", "fac14", "nurse"),   # assistente social
    ("usr12", "fac2",  "receptionist"), ("usr12", "fac3",  "receptionist"), ("usr12", "fac15", "receptionist"),
    ("usr15", "fac3",  "doctor"), ("usr15", "fac9",  "doctor"),  # médica em 2 UPAs
    ("usr16", "fac2",  "nurse"),  ("usr16", "fac15", "nurse"),   # enfermeiro 2 UBS
    ("usr17", "fac2",  "nurse"),        # farmacêutica
    ("usr20", "fac19", "doctor"),       # médico canedo
    # Inativos/Bloqueados (mantêm acessos antigos)
    ("usr5",  "fac6",  "manager"),
    ("usr8",  "fac9",  "doctor"),
    ("usr11", "fac9",  "nurse"),
    # Goianésia
    ("usr1",  "fac22", "manager"),
    ("usr21", "fac22", "municipality_admin"), ("usr21", "fac23", "municipality_admin"),
    ("usr21", "fac24", "municipality_admin"), ("usr21", "fac25", "municipality_admin"),
    ("usr22", "fac24", "doctor"), ("usr22", "fac23", "doctor"),
    ("usr23", "fac23", "nurse"),  ("usr23", "fac24", "nurse"), ("usr23", "fac25", "nurse"),
    ("usr24", "fac23", "receptionist"), ("usr24", "fac25", "receptionist"),
]

# ═══════════════════════════════════════════════════════════════════════════════
# PACIENTES — 50 pacientes distribuídos em 5 municípios
# ═══════════════════════════════════════════════════════════════════════════════

def _p(key, pront, name, **kw):
    return {"key": key, "pront": pront, "name": name, **kw}

PATIENTS = {
    "5208707": [  # Goiânia — 20 pacientes
        _p("p01", "GYN-0001", "Maria da Silva Santos",     cpf="12345678901", cns="700001234567890", sex="F", birth="1985-03-15", mother="Ana da Silva",           cell="(62) 99901-1001", cep="74000010", end="Rua 1",             num="100",  bairro="Setor Central",     raca="3"),
        _p("p02", "GYN-0002", "João Pedro Oliveira",       cpf="23456789012", cns="700002345678901", sex="M", birth="1990-07-22", mother="Maria Oliveira",         cell="(62) 99902-2002", cep="74810100", end="Av. T-63",          num="500",  bairro="Setor Bueno",       raca="1"),
        _p("p03", "GYN-0003", "Ana Beatriz Ferreira",      cpf="34567890123", cns="700003456789012", sex="F", birth="1978-11-30", mother="Teresa Ferreira",        cell="(62) 99903-3003", cep="74230010", end="Rua 83",            num="45",   bairro="Setor Sul",         raca="1", plano="CONVENIO", conv_nome="Unimed", conv_num="123456"),
        _p("p04", "GYN-0004", "Carlos Eduardo Rocha",      cpf="45678901234", cns="700004567890123", sex="M", birth="2000-01-10", mother="Lucia Rocha",            cell="(62) 99904-4004", cep="74670010", end="Av. Anhanguera",    num="2000", bairro="Campinas",          raca="2"),
        _p("p05", "GYN-0005", "Francisca Souza Lima",      cpf="56789012345", cns="700005678901234", sex="F", birth="1955-06-08", mother="Raimunda Souza",         phone="(62) 3333-5005", cep="74475020", end="Rua F-42",          num="12",   bairro="Faiçalville",       raca="3", doencas="Hipertensão arterial, Diabetes tipo 2", alergia="Dipirona"),
        _p("p06", "GYN-0006", "Pedro Henrique Almeida",    cpf="67890123456",                        sex="M", birth="2023-09-01", mother="Patrícia Almeida",       cell="(62) 99906-6006", cep="74140010", end="Rua 9",             num="88",   bairro="Setor Oeste",       raca="1", plano="PARTICULAR"),
        _p("p07", "GYN-0007", "Luzia Aparecida Costa",     cpf="78901234567", cns="700007890123456", sex="F", birth="1968-12-25", mother="Conceição Costa",        cell="(62) 99907-7007", cep="74560290", end="Av. Perimetral",    num="350",  bairro="Setor Universitário",raca="2", gestante=True),
        _p("p08", "GYN-0008", "Antônio José Martins",      cpf="89012345678", cns="700008901234567", sex="M", birth="1942-04-17", mother_unknown=True,             phone="(62) 3333-8008", cep="74023010", end="Rua 3",             num="200",  bairro="Setor Central",     raca="3", doencas="DPOC, ICC", fumante=True),
        _p("p09", "GYN-0009", "Raquel Nunes Barbosa",      cpf="90123456789", cns="700009012345678", sex="F", birth="1995-08-20", mother="Sandra Nunes",           cell="(62) 99909-9009", cep="74845090", end="Rua T-37",          num="72",   bairro="Setor Marista",     raca="4", plano="CONVENIO", conv_nome="Hapvida", conv_num="789012"),
        _p("p10", "GYN-0010", "José Ribeiro da Silva",                        cns="700010123456789", sex="M", birth="2024-11-05", mother="Joana Ribeiro da Silva", cell="(62) 99910-0010", cep="74810250", end="Rua 1040",          num="15",   bairro="Setor Marista",     raca="3"),
        _p("p11", "GYN-0011", "Tereza Cristina Pereira",   cpf="11223344556", cns="700011223344556", sex="F", birth="1970-02-14", mother="Marta Pereira",          cell="(62) 99911-1111", cep="74175120", end="Av. Goiás",          num="1500", bairro="Setor Aeroporto",   raca="5", etnia="0245"),
        _p("p12", "GYN-0012", "Marcos Aurélio Tavares",    cpf="22334455667", cns="700012233445566", sex="M", birth="1988-06-30", mother="Cleusa Tavares",         cell="(62) 99912-2222", cep="74525010", end="Rua C-152",          num="33",   bairro="Jardim América",    raca="1", situacao_rua=True),
        _p("p13", "GYN-0013", "Lucinda Maria Gonçalves",   cpf="33445566001", cns="700013334455660", sex="F", birth="1960-09-12", mother="Aparecida Gonçalves",    phone="(62) 3333-1313", cep="74000020", end="Rua 4",             num="55",   bairro="Setor Central",     raca="3", doencas="Asma, Hipotireoidismo"),
        _p("p14", "GYN-0014", "Gabriel Ferreira Santos",   cpf="44556677002", cns="700014445566770", sex="M", birth="2015-05-20", mother="Juliana Ferreira",       cell="(62) 99914-1414", cep="74810120", end="Av. T-10",          num="220",  bairro="Setor Bueno",       raca="1"),
        _p("p15", "GYN-0015", "Rosa Maria Indígena",       cpf="55667788003", cns="700015556677880", sex="F", birth="1975-01-01", mother="Iracema",                cell="(62) 99915-1515", cep="74000030", end="Aldeia Carretão",   num="S/N",  bairro="Zona Rural",        raca="5", etnia="0245"),
        _p("p16", "GYN-0016", "Valentina Oliveira Souza",  cpf="66778899004",                        sex="F", birth="2026-01-15", mother="Camila Oliveira Souza",  cell="(62) 99916-1616", cep="74670020", end="Rua 44",            num="101",  bairro="Campinas",          raca="3"),
        _p("p17", "GYN-0017", "Hiroshi Tanaka",            cpf="77889900005", cns="700017778899000", sex="M", birth="1965-03-22", mother="Keiko Tanaka",           phone="(62) 3333-1717", cep="74230020", end="Rua 85",            num="12",   bairro="Setor Sul",         raca="4"),
        _p("p18", "GYN-0018", "Fátima Nascimento",         cpf="88990011006", cns="700018889900110", sex="F", birth="1950-08-10", mother="Sebastiana Nascimento",  phone="(62) 3333-1818", cep="74023020", end="Rua 5",             num="300",  bairro="Setor Central",     raca="2", doencas="Diabetes tipo 1, Neuropatia periférica, Retinopatia", alergia="Penicilina, Sulfas"),
        _p("p19", "GYN-0019", "Ricardo Souza Mendes",      cpf="99001122007",                        sex="M", birth="1998-12-31", mother="Sandra Souza",           cell="(62) 99919-1919", cep="74560300", end="Rua 235",           num="78",   bairro="Setor Universitário",raca="1", etilista=True, fumante=True),
        _p("p20", "GYN-0020", "Gestante Maria Aparecida",  cpf="00112233008", cns="700020001122330", sex="F", birth="1999-04-04", mother="Antônia Maria",          cell="(62) 99920-2020", cep="74525020", end="Rua C-200",         num="10",   bairro="Jardim América",    raca="3", gestante=True),
    ],
    "5201405": [  # Aparecida — 12 pacientes
        _p("p30", "APA-0001", "Luciana Martins Pereira",   cpf="33445566778", cns="700030334455667", sex="F", birth="1992-05-10", mother="Rosa Martins",           cell="(62) 99930-3030", cep="74968000", end="Rua das Flores",     num="55",  bairro="Jardim Tiradentes",  raca="3"),
        _p("p31", "APA-0002", "Roberto Carlos Vieira",     cpf="44556677889", cns="700031445566778", sex="M", birth="1975-09-22", mother="Nair Vieira",            phone="(62) 3344-3131", cep="74935650", end="Av. Independência",  num="180", bairro="Papillon Park",      raca="1", doencas="Hipertensão"),
        _p("p32", "APA-0003", "Silvana Oliveira Gomes",    cpf="55667788990", cns="700032556677889", sex="F", birth="2001-12-01", mother="Vânia Oliveira",         cell="(62) 99932-3232", cep="74922270", end="Rua J-25",           num="42",  bairro="Jardim Nova Era",    raca="3"),
        _p("p33", "APA-0004", "Joaquim Pereira Neto",      cpf="66778899001", cns="700033667788990", sex="M", birth="1960-03-08", mother="Antônia Pereira",        phone="(62) 3344-3333", cep="74952210", end="Rua Porto Alegre",   num="230", bairro="Cidade Livre",       raca="2", fumante=True, etilista=True),
        _p("p34", "APA-0005", "Camila Rodrigues Santos",   cpf="77889900112", cns="700034778899001", sex="F", birth="1998-07-15", mother="Elaine Rodrigues",       cell="(62) 99934-3434", cep="74968570", end="Av. Central",        num="900", bairro="Garavelo",           raca="1", plano="CONVENIO", conv_nome="Amil", conv_num="456789"),
        _p("p35", "APA-0006", "Matheus Silva Cardoso",     cpf="88990011223", cns="700035889900112", sex="M", birth="2010-02-28", mother="Patrícia Silva",         cell="(62) 99935-3535", cep="74968010", end="Rua 10",             num="22",  bairro="Jardim Tiradentes",  raca="3"),
        _p("p36", "APA-0007", "Dona Tereza Albuquerque",   cpf="99001122334",                        sex="F", birth="1938-06-20", mother_unknown=True,             phone="(62) 3344-3636", cep="74935660", end="Rua Goiânia",        num="100", bairro="Papillon Park",      raca="1", doencas="Alzheimer, Osteoporose"),
        _p("p37", "APA-0008", "Gestante Juliana Moraes",   cpf="00112233445", cns="700037001122334", sex="F", birth="1997-10-18", mother="Sandra Moraes",          cell="(62) 99937-3737", cep="74922280", end="Rua J-30",           num="15",  bairro="Jardim Nova Era",    raca="3", gestante=True),
        _p("p38", "APA-0009", "André Luiz Nascimento",     cpf="11223344556", cns="700038112233445", sex="M", birth="1985-04-05", mother="Maria do Carmo",         cell="(62) 99938-3838", cep="74952220", end="Rua Minas Gerais",   num="50",  bairro="Cidade Livre",       raca="2", situacao_rua=True),
        _p("p39", "APA-0010", "Beatriz Santos Lima",       cpf="22334455667", cns="700039223344556", sex="F", birth="2020-07-04", mother="Fernanda Santos",        cell="(62) 99939-3939", cep="74968580", end="Av. Central",        num="1200",bairro="Garavelo",           raca="3"),
        _p("p40", "APA-0011", "Sérgio Roberto Ferreira",   cpf="33445566000", cns="700040334455667", sex="M", birth="1970-11-11", mother="Neuza Ferreira",         phone="(62) 3344-4040", cep="74968020", end="Rua 15",             num="300", bairro="Jardim Tiradentes",  raca="1", doencas="Diabetes tipo 2, Hipertensão", alergia="Ibuprofeno"),
        _p("p41", "APA-0012", "Clara Valentina Dias",                         cns="700041000000000", sex="F", birth="2025-12-01", mother="Isabela Dias",           cell="(62) 99941-4141", cep="74935670", end="Rua São Paulo",      num="88",  bairro="Papillon Park",      raca="3"),
    ],
    "5201108": [  # Anápolis — 8 pacientes
        _p("p50", "ANA-0001", "Sebastião Alves de Souza",  cpf="88990011223", cns="700050889900112", sex="M", birth="1950-01-20", mother="Benedita Alves",         phone="(62) 3355-5050", cep="75080210", end="Rua Goiás",          num="100", bairro="Centro",             raca="3", doencas="Diabetes tipo 2, Artrose", alergia="AAS"),
        _p("p51", "ANA-0002", "Larissa Fernandes Costa",   cpf="99001122334", cns="700051990011223", sex="F", birth="1993-10-05", mother="Cristina Fernandes",     cell="(62) 99951-5151", cep="75113430", end="Av. Brasil",         num="500", bairro="Jundiaí",            raca="1", gestante=True),
        _p("p52", "ANA-0003", "Manoel Ferreira Lima",      cpf="00112233445", cns="700052001122334", sex="M", birth="1982-04-12", mother="Maria Ferreira",         cell="(62) 99952-5252", cep="75064400", end="Rua 15 de Novembro", num="88",  bairro="Vila Santa Isabel", raca="3"),
        _p("p53", "ANA-0004", "Ivone Batista Ribeiro",     cpf="11223344001", cns="700053112233440", sex="F", birth="1945-07-30", mother="Benedita Batista",       phone="(62) 3355-5353", cep="75080220", end="Rua Mato Grosso",    num="45",  bairro="Centro",             raca="2", doencas="DPOC, Fibrilação atrial"),
        _p("p54", "ANA-0005", "Felipe Augusto Mendes",     cpf="22334455002", cns="700054223344550", sex="M", birth="2005-11-22", mother="Carla Mendes",           cell="(62) 99954-5454", cep="75113440", end="Av. Brasil Norte",   num="1200",bairro="Jundiaí",            raca="1"),
        _p("p55", "ANA-0006", "Rosa Indígena Xavante",     cpf="33445566003",                        sex="F", birth="1980-01-01", mother="Waiwai",                 cell="(62) 99955-5555", cep="75064410", end="Aldeia Sangradouro", num="S/N", bairro="Zona Rural",        raca="5", etnia="0245"),
        _p("p56", "ANA-0007", "Recém-nascido Silva",                          cns="700056000000000", sex="M", birth="2026-04-10", mother="Ana Clara Silva",        cell="(62) 99956-5656", cep="75080230", end="Rua Goiás",          num="200", bairro="Centro",             raca="3"),
        _p("p57", "ANA-0008", "Gestante Mariana Oliveira", cpf="44556677004", cns="700057445566770", sex="F", birth="2000-06-18", mother="Teresa Oliveira",        cell="(62) 99957-5757", cep="75113450", end="Av. Brasil Sul",     num="800", bairro="Jundiaí",            raca="1", gestante=True),
    ],
    "5220454": [  # Senador Canedo — 5 pacientes
        _p("p60", "CAN-0001", "Jorge Henrique Alves",      cpf="55667788005", cns="700060556677880", sex="M", birth="1972-08-14", mother="Maria Helena Alves",     cell="(62) 99960-6060", cep="75250000", end="Rua 1",             num="50",  bairro="Centro",             raca="3"),
        _p("p61", "CAN-0002", "Sandra Regina Costa",       cpf="66778899006", cns="700061667788990", sex="F", birth="1988-02-05", mother="Dalva Costa",            cell="(62) 99961-6161", cep="75250010", end="Av. Dom Pedro II",  num="200", bairro="Jardim das Oliveiras",raca="1"),
        _p("p62", "CAN-0003", "Miguel Santos Pereira",     cpf="77889900007",                        sex="M", birth="2022-03-15", mother="Bruna Santos",           cell="(62) 99962-6262", cep="75250020", end="Rua 3",             num="12",  bairro="Centro",             raca="3"),
        _p("p63", "CAN-0004", "Dona Conceição Ferreira",   cpf="88990011008", cns="700063889900110", sex="F", birth="1935-12-25", mother_unknown=True,             phone="(62) 3535-6363", cep="75250030", end="Rua 5",             num="100", bairro="Setor Industrial",    raca="2", doencas="ICC, Diabetes tipo 2, Artrite"),
        _p("p64", "CAN-0005", "Valentina Costa Silva",                                               sex="F", birth="2026-04-01", mother="Juliana Costa Silva",    cell="(62) 99964-6464", cep="75250010", end="Av. Dom Pedro II",  num="50",  bairro="Jardim das Oliveiras",raca="3"),
    ],
    "5208608": [  # Goianésia — 15 pacientes
        _p("p80", "GOI-0001", "João Batista Ferreira",      cpf="10101010101", cns="700080101010101", sex="M", birth="1958-04-22", mother="Maria Ferreira",          phone="(62) 3355-8080", cep="76380000", end="Rua 5",               num="100", bairro="Centro",             raca="3", doencas="Diabetes tipo 2, Hipertensão", alergia="AAS, Metformina"),
        _p("p81", "GOI-0002", "Ana Carolina Souza Lima",    cpf="20202020202", cns="700081202020202", sex="F", birth="1992-11-15", mother="Sandra Souza",            cell="(62) 99981-8181", cep="76380010", end="Av. Goiás",            num="500", bairro="Setor Universitário", raca="1", gestante=True),
        _p("p82", "GOI-0003", "Pedro Paulo Alves Ribeiro",  cpf="30303030303", cns="700082303030303", sex="M", birth="2018-06-01", mother="Juliana Alves",           cell="(62) 99982-8282", cep="76380020", end="Rua 10",              num="25",  bairro="Vila Brasília",      raca="3"),
        _p("p83", "GOI-0004", "Maria Aparecida dos Santos", cpf="40404040404", cns="700083404040404", sex="F", birth="1945-01-30", mother_unknown=True,              phone="(62) 3355-8383", cep="76380000", end="Rua 3",               num="200", bairro="Centro",             raca="2", doencas="DPOC, Osteoporose, ICC", fumante=True),
        _p("p84", "GOI-0005", "Lucas Gabriel Oliveira",     cpf="50505050505",                        sex="M", birth="2024-08-10", mother="Camila Oliveira",         cell="(62) 99984-8484", cep="76380030", end="Rua 15",              num="10",  bairro="Jardim Goiás",       raca="1"),
        _p("p85", "GOI-0006", "Francisca Indígena Tapuia",  cpf="60606060606", cns="700085606060606", sex="F", birth="1970-03-08", mother="Raimunda Tapuia",         cell="(62) 99985-8585", cep="76380000", end="Aldeia Carretão",     num="S/N", bairro="Zona Rural",         raca="5", etnia="0245"),
        _p("p86", "GOI-0007", "Roberto Carlos Mendes",      cpf="70707070707", cns="700086707070707", sex="M", birth="1980-12-25", mother="Neuza Mendes",            cell="(62) 99986-8686", cep="76380010", end="Av. Goiás",            num="300", bairro="Setor Universitário", raca="1", plano="CONVENIO", conv_nome="Unimed", conv_num="GOI-123"),
        _p("p87", "GOI-0008", "Gestante Helena Rodrigues",  cpf="80808080808", cns="700087808080808", sex="F", birth="2000-05-14", mother="Teresa Rodrigues",        cell="(62) 99987-8787", cep="76380020", end="Rua 12",              num="45",  bairro="Vila Brasília",      raca="3", gestante=True),
        _p("p88", "GOI-0009", "Antônio José da Silva",      cpf="90909090909", cns="700088909090909", sex="M", birth="1935-07-04", mother_unknown=True,              phone="(62) 3355-8888", cep="76380000", end="Rua 1",               num="5",   bairro="Centro",             raca="3", doencas="Alzheimer, Diabetes, Hipertensão", alergia="Penicilina"),
        _p("p89", "GOI-0010", "Juliana Cristina Pereira",   cpf="01010101010", cns="700089010101010", sex="F", birth="1998-02-28", mother="Marta Cristina",          cell="(62) 99989-8989", cep="76380030", end="Rua 20",              num="88",  bairro="Jardim Goiás",       raca="1", plano="PARTICULAR"),
        _p("p90", "GOI-0011", "Marcos Vinícius Costa",      cpf="11110000111", cns="700090111100001", sex="M", birth="1975-09-18", mother="Dalva Costa",             cell="(62) 99990-9090", cep="76380010", end="Av. Goiás",            num="800", bairro="Setor Universitário", raca="3", situacao_rua=True, etilista=True, fumante=True),
        _p("p91", "GOI-0012", "Recém-nascido Oliveira",                        cns="700091000000000", sex="F", birth="2026-04-15", mother="Ana Carolina Souza Lima", cell="(62) 99981-8181", cep="76380010", end="Av. Goiás",            num="500", bairro="Setor Universitário", raca="1"),
        _p("p92", "GOI-0013", "Sérgio Luiz Ferreira",       cpf="22220000222", cns="700092222200002", sex="M", birth="1988-10-05", mother="Rosa Ferreira",           cell="(62) 99992-9292", cep="76380020", end="Rua 8",               num="150", bairro="Vila Brasília",      raca="3", doencas="Asma"),
        _p("p93", "GOI-0014", "Tereza Quilombola Santos",   cpf="33330000333", cns="700093333300003", sex="F", birth="1965-06-20", mother="Benedita Santos",         phone="(62) 3355-9393", cep="76380000", end="Comunidade Quilombola",num="S/N",bairro="Zona Rural",         raca="2"),
        _p("p94", "GOI-0015", "Valentina Ferreira Costa",   cpf="44440000444",                        sex="F", birth="2025-11-30", mother="Helena Rodrigues",        cell="(62) 99987-8787", cep="76380020", end="Rua 12",              num="45",  bairro="Vila Brasília",      raca="3"),
    ],
    "5221403": [  # Trindade — 5 pacientes
        _p("p70", "TRI-0001", "Sebastiana Romeira",        cpf="99001122008", cns="700070990011220", sex="F", birth="1965-10-30", mother="Benedita Romeira",       phone="(62) 3636-7070", cep="75380000", end="Rua da Romaria",    num="1",   bairro="Centro",             raca="3"),
        _p("p71", "TRI-0002", "Moisés Aparecido Santos",   cpf="00112233009", cns="700071001122330", sex="M", birth="1978-05-15", mother="Ozana Santos",           cell="(62) 99971-7171", cep="75380010", end="Av. Bernardo Sayão",num="500", bairro="Setor Sul",          raca="3", doencas="Hipertensão"),
        _p("p72", "TRI-0003", "Luana Cristina Ferreira",   cpf="11223344010", cns="700072112233440", sex="F", birth="1996-09-08", mother="Cristina Ferreira",      cell="(62) 99972-7272", cep="75380020", end="Rua 10",            num="33",  bairro="Jardim Califórnia",  raca="1", gestante=True),
        _p("p73", "TRI-0004", "José Carlos Oliveira",      cpf="22334455011", cns="700073223344550", sex="M", birth="1955-03-01", mother="Maria Oliveira",         phone="(62) 3636-7373", cep="75380000", end="Rua da Romaria",    num="200", bairro="Centro",             raca="3", fumante=True, doencas="DPOC"),
        _p("p74", "TRI-0005", "Bebê Ana Luísa",                                                      sex="F", birth="2026-03-20", mother="Luana Cristina Ferreira",cell="(62) 99972-7272", cep="75380020", end="Rua 10",            num="33",  bairro="Jardim Califórnia",  raca="1"),
    ],
}

# Documentos por paciente (key paciente → lista de docs)
PATIENT_DOCS = {
    "p01": [{"tipo": "RG",   "numero": "1234567",    "emissor": "SSP", "uf": "GO"}],
    "p02": [{"tipo": "RG",   "numero": "2345678",    "emissor": "SSP", "uf": "GO"}, {"tipo": "CNH", "numero": "12345678900", "emissor": "DETRAN", "uf": "GO"}],
    "p03": [{"tipo": "RG",   "numero": "3456789",    "emissor": "SSP", "uf": "GO"}, {"tipo": "CTPS","numero": "123456",      "emissor": "MTE",    "uf": "GO"}],
    "p05": [{"tipo": "RG",   "numero": "5678901",    "emissor": "SSP", "uf": "GO"}],
    "p08": [{"tipo": "RG",   "numero": "8901234",    "emissor": "SSP", "uf": "GO"}],
    "p11": [{"tipo": "CRNM", "numero": "V123456-7",  "emissor": "PF",  "uf": "DF"}],
    "p30": [{"tipo": "RG",   "numero": "9012345",    "emissor": "SSP", "uf": "GO"}, {"tipo": "CNH", "numero": "98765432100", "emissor": "DETRAN", "uf": "GO"}],
    "p50": [{"tipo": "RG",   "numero": "0123456",    "emissor": "SSP", "uf": "GO"}],
    # Goianésia
    "p80": [{"tipo": "RG",   "numero": "GO-801234",  "emissor": "SSP", "uf": "GO"}, {"tipo": "CNH", "numero": "80123456789", "emissor": "DETRAN", "uf": "GO"}],
    "p81": [{"tipo": "RG",   "numero": "GO-811234",  "emissor": "SSP", "uf": "GO"}],
    "p83": [{"tipo": "RG",   "numero": "GO-831234",  "emissor": "SSP", "uf": "GO"}],
    "p86": [{"tipo": "RG",   "numero": "GO-861234",  "emissor": "SSP", "uf": "GO"}, {"tipo": "CTPS", "numero": "861234", "emissor": "MTE", "uf": "GO"}],
    "p88": [{"tipo": "RG",   "numero": "GO-881234",  "emissor": "SSP", "uf": "GO"}],
    "p89": [{"tipo": "RG",   "numero": "GO-891234",  "emissor": "SSP", "uf": "GO"}, {"tipo": "CNH", "numero": "89123456789", "emissor": "DETRAN", "uf": "GO"}, {"tipo": "PASS", "numero": "BR891234", "emissor": "PF", "uf": "DF"}],
}

# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════


async def _get_ref_ids(session: AsyncSession) -> dict[str, dict[str, uuid.UUID]]:
    refs: dict[str, dict[str, uuid.UUID]] = {}
    tables = [
        ("ref_racas", "raca"), ("ref_etnias", "etnia"),
        ("ref_nacionalidades", "nacionalidade"), ("ref_tipos_documento", "tipo_doc"),
        ("ref_parentescos", "parentesco"),
    ]
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
    raca_id = refs.get("raca", {}).get(p.get("raca"))
    etnia_id = refs.get("etnia", {}).get(p.get("etnia")) if p.get("etnia") else None
    nac_id = refs.get("nacionalidade", {}).get("10")
    plano = p.get("plano", "SUS")
    return {
        "id": fid(p["key"]), "prontuario": p["pront"], "name": p["name"],
        "cpf": p.get("cpf"), "cns": p.get("cns"), "sex": p.get("sex"),
        "birth_date": date.fromisoformat(p["birth"]) if p.get("birth") else None,
        "mother_name": p.get("mother", ""), "mother_unknown": p.get("mother_unknown", False),
        "nacionalidade_id": nac_id, "raca_id": raca_id, "etnia_id": etnia_id,
        "cep": p.get("cep", ""), "endereco": p.get("end", ""), "numero": p.get("num", ""),
        "bairro": p.get("bairro", ""), "uf": "GO",
        "phone": p.get("phone", ""), "cellphone": p.get("cell", ""),
        "plano_tipo": plano,
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


async def seed_app(session: AsyncSession) -> None:
    from app.modules.permissions.models import Role

    # Municípios
    for m in MUNICIPALITIES:
        if not await session.scalar(select(Municipality).where(Municipality.id == fid(m["key"]))):
            session.add(Municipality(
                id=fid(m["key"]), name=m["name"], state=m["state"], ibge=m["ibge"],
                population=m.get("pop"), center_latitude=m.get("lat"), center_longitude=m.get("lng"),
            ))
    await session.flush()
    print(f"  Municípios: {len(MUNICIPALITIES)}")

    # Bairros
    n_bairros = 0
    for mun_key, bairros in NEIGHBORHOODS.items():
        for b in bairros:
            if not await session.scalar(select(Neighborhood).where(Neighborhood.id == fid(b["key"]))):
                session.add(Neighborhood(
                    id=fid(b["key"]), municipality_id=fid(mun_key),
                    name=b["name"], population=b.get("pop"),
                ))
                n_bairros += 1
    await session.flush()
    print(f"  Bairros: {n_bairros}")

    # Facilities
    for f in FACILITIES:
        if not await session.scalar(select(Facility).where(Facility.id == fid(f["key"]))):
            session.add(Facility(
                id=fid(f["key"]), municipality_id=fid(f["mun"]),
                name=f["name"], short_name=f["short"], type=f["type"], cnes=f.get("cnes"),
            ))
    await session.flush()
    print(f"  Unidades: {len(FACILITIES)}")

    # Users
    pwd = hash_password(DEFAULT_PASSWORD)
    for u in USERS:
        if not await session.scalar(select(User).where(User.id == fid(u["key"]))):
            session.add(User(
                id=fid(u["key"]), login=u["login"], email=u["email"], name=u["name"],
                cpf=u["cpf"], phone=u["phone"], password_hash=pwd,
                status=u["status"], level=u.get("level", UserLevel.USER),
                is_active=u["status"] != UserStatus.BLOQUEADO,
                is_superuser=u.get("level") == UserLevel.MASTER,
                primary_role=u.get("role", ""),
                birth_date=date.fromisoformat(u["birth"]) if u.get("birth") else None,
            ))
    await session.flush()
    print(f"  Usuários: {len(USERS)}")

    # Mun Access
    n = 0
    for uk, mk in MUN_ACCESS:
        if not await session.scalar(select(MunicipalityAccess).where(
            MunicipalityAccess.user_id == fid(uk), MunicipalityAccess.municipality_id == fid(mk),
        )):
            session.add(MunicipalityAccess(user_id=fid(uk), municipality_id=fid(mk)))
            n += 1
    await session.flush()
    print(f"  Acessos municípios: {n}")

    # Fac Access
    role_ids = {r.code: r.id for r in (await session.scalars(select(Role).where(Role.municipality_id.is_(None)))).all()}
    fallback = role_ids.get("receptionist_base")
    n = 0
    for uk, fk, role_code in FAC_ACCESS:
        rid = role_ids.get(_ROLE_MAP.get(role_code, role_code), fallback)
        if not await session.scalar(select(FacilityAccess).where(
            FacilityAccess.user_id == fid(uk), FacilityAccess.facility_id == fid(fk),
        )):
            session.add(FacilityAccess(user_id=fid(uk), facility_id=fid(fk), role_id=rid))
            n += 1
    await session.flush()
    print(f"  Acessos unidades: {n}")


async def seed_patients(session: AsyncSession, ibge: str, patients: list[dict]) -> int:
    from app.tenant_models.patients import Patient, PatientDocument

    refs = await _get_ref_ids(session)
    creator = fid("usr1")
    await _set_tenant(session, ibge)

    n_patients = 0
    for p in patients:
        if not await session.scalar(select(Patient).where(Patient.id == fid(p["key"]))):
            session.add(Patient(**_build_patient(p, refs, creator)))
            n_patients += 1
    await session.flush()

    # Documentos
    n_docs = 0
    tipo_doc_ids = refs.get("tipo_doc", {})
    for p in patients:
        docs = PATIENT_DOCS.get(p["key"], [])
        for d in docs:
            doc_id = fid(f"{p['key']}_doc_{d['tipo']}_{d['numero']}")
            if not await session.scalar(select(PatientDocument).where(PatientDocument.id == doc_id)):
                session.add(PatientDocument(
                    id=doc_id, patient_id=fid(p["key"]),
                    tipo_documento_id=tipo_doc_ids.get(d["tipo"]),
                    tipo_codigo=d["tipo"], numero=d["numero"],
                    orgao_emissor=d.get("emissor", ""), uf_emissor=d.get("uf", ""),
                ))
                n_docs += 1
    await session.flush()

    return n_patients, n_docs


async def seed_cnes(session: AsyncSession, ibge: str, facilities: list[dict]) -> int:
    """Seed dados CNES simulados para o município."""
    from app.tenant_models.cnes.units import CnesUnit
    from app.tenant_models.cnes.professionals import CnesProfessional, CnesProfessionalUnit

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
                id=fid(f"cnes_unit_{cnes_code}"),
                id_unidade=unit_id, cnes=cnes_code,
                razao_social=f["name"], nome_fantasia=f["short"],
                tipo_unidade="05", estado="GO", codigo_ibge=ibge,
                competencia_ultima_importacao=competencia, active=True,
            ))
            n += 1
    await session.flush()

    # Profissionais (únicos por município: 1 médico + 1 enfermeiro + 1 recepcionista)
    # id_profissional: max 16 chars, CPF: exactly 11 chars (numérico)
    s = ibge[-3:]  # 3 dígitos
    profs = [
        ("med", f"Dr. Médico {ibge}",            f"2251{ibge}00001", f"100{s}00001", "225125"),
        ("enf", f"Enf. Enfermeiro(a) {ibge}",    f"2231{ibge}00002", f"200{s}00002", "223505"),
        ("rec", f"Recepcionista {ibge}",          f"4221{ibge}00003", f"300{s}00003", "422105"),
    ]
    for prefix, nome, id_prof, cpf, cbo in profs:
        prof_key = f"cnes_prof_{ibge}_{prefix}"
        if not await session.scalar(select(CnesProfessional).where(CnesProfessional.id_profissional == id_prof)):
            session.add(CnesProfessional(
                id=fid(prof_key), id_profissional=id_prof, cpf=cpf, nome=nome,
                status="Ativo", competencia_ultima_importacao=competencia,
            ))
    await session.flush()

    return n


async def main() -> None:
    engine()

    # RBAC
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
        await seed_app(s)
        await s.commit()

    # Tenant schemas
    print("\nSchemas tenant:")
    async with sessionmaker()() as s:
        for m in MUNICIPALITIES:
            schema = await ensure_municipality_schema(s, m["ibge"])
            print(f"  · {m['name']:<25} → {schema}")
        await s.commit()

    # Pacientes + Docs + CNES
    print("\nPacientes e CNES:")
    total_p, total_d, total_c = 0, 0, 0
    mun_fac = {}
    for f in FACILITIES:
        mun_fac.setdefault(f["mun"], []).append(f)

    for m in MUNICIPALITIES:
        ibge = m["ibge"]
        patients = PATIENTS.get(ibge, [])
        facs = mun_fac.get(m["key"], [])
        async with sessionmaker()() as s:
            np, nd = await seed_patients(s, ibge, patients) if patients else (0, 0)
            nc = await seed_cnes(s, ibge, facs) if facs else 0
            await s.commit()
            total_p += np; total_d += nd; total_c += nc
            print(f"  · {m['name']:<25} → {np} pacientes, {nd} docs, {nc} CNES units")

    print(f"\n{'='*60}")
    print(f"Seed completo!")
    print(f"  Municípios:     {len(MUNICIPALITIES)}")
    print(f"  Bairros:        {sum(len(b) for b in NEIGHBORHOODS.values())}")
    print(f"  Unidades:       {len(FACILITIES)}")
    print(f"  Usuários:       {len(USERS)}")
    print(f"  Pacientes:      {total_p}")
    print(f"  Documentos:     {total_d}")
    print(f"  CNES Units:     {total_c}")
    print(f"  Senha:          {DEFAULT_PASSWORD}")
    print(f"{'='*60}")

    await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
