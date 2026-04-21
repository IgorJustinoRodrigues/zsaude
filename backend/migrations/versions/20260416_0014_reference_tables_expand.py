"""Amplia tabelas de referência globais para cadastro de paciente

Revision ID: 0014_reference_tables_expand
Revises: 0013_seed_etnias
Create Date: 2026-04-16

Novas tabelas: tipos_documento, estados_civis, escolaridades, religioes,
tipos_sanguineos, povos_tradicionais, deficiencias, parentescos,
orientacoes_sexuais, identidades_genero.

Códigos seguem o padrão DATASUS/e-SUS onde existe; demais são arbitrários
e cobertos pelo flag is_system.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db.types import UUIDType
revision: str = "0014_reference_tables_expand"
down_revision: str | None = "0013_seed_etnias"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ══════════════════════════════════════════════════════════════════════════════
# Seeds
# ══════════════════════════════════════════════════════════════════════════════

TIPOS_DOCUMENTO: list[tuple[str, str]] = [
    ("CPF", "CPF"),
    ("RG", "Cédula de Identidade (RG)"),
    ("CNH", "Carteira Nacional de Habilitação"),
    ("CTPS", "Carteira de Trabalho e Previdência Social"),
    ("PASS", "Passaporte"),
    ("CRNM", "Carteira de Registro Nacional Migratório"),
    ("CIN", "Carteira de Identidade Nacional"),
    ("RIC", "Registro de Identidade Civil"),
    ("OUT", "Outro"),
]


ESTADOS_CIVIS: list[tuple[str, str]] = [
    ("1", "Solteiro(a)"),
    ("2", "Casado(a)"),
    ("3", "Viúvo(a)"),
    ("4", "Separado(a) judicialmente"),
    ("5", "Divorciado(a)"),
    ("6", "União estável"),
    ("9", "Ignorado"),
]


# Tabela SIGAB de escolaridade (códigos oficiais e-SUS AB)
ESCOLARIDADES: list[tuple[str, str]] = [
    ("0", "Creche"),
    ("1", "Pré-escola"),
    ("2", "Classe de alfabetização"),
    ("3", "Ensino fundamental 1ª a 4ª série"),
    ("4", "Ensino fundamental 5ª a 8ª série"),
    ("5", "Ensino fundamental completo"),
    ("6", "Ensino médio, 2º grau completo"),
    ("7", "Ensino superior incompleto"),
    ("8", "Ensino superior completo"),
    ("9", "Especialização/Residência"),
    ("10", "Mestrado"),
    ("11", "Doutorado"),
    ("12", "Ensino fundamental especial"),
    ("13", "Ensino médio especial"),
    ("14", "Alfabetização para adultos (EJA)"),
    ("15", "Nenhuma"),
    ("99", "Não se aplica"),
]


RELIGIOES: list[tuple[str, str]] = [
    ("1",  "Católica"),
    ("2",  "Evangélica"),
    ("3",  "Espírita"),
    ("4",  "Umbanda/Candomblé"),
    ("5",  "Judaica"),
    ("6",  "Muçulmana"),
    ("7",  "Budista"),
    ("8",  "Outra religião"),
    ("9",  "Sem religião"),
    ("99", "Não informado"),
]


TIPOS_SANGUINEOS: list[tuple[str, str]] = [
    ("A+",  "A+"),
    ("A-",  "A-"),
    ("B+",  "B+"),
    ("B-",  "B-"),
    ("AB+", "AB+"),
    ("AB-", "AB-"),
    ("O+",  "O+"),
    ("O-",  "O-"),
    ("NI",  "Não informado"),
]


POVOS_TRADICIONAIS: list[tuple[str, str]] = [
    ("1",  "Povos indígenas"),
    ("2",  "Quilombola"),
    ("3",  "Cigano"),
    ("4",  "Pescador artesanal"),
    ("5",  "Ribeirinho"),
    ("6",  "Assentado"),
    ("7",  "Povo de terreiro"),
    ("8",  "Extrativista"),
    ("9",  "Outros"),
    ("99", "Não se aplica"),
]


DEFICIENCIAS: list[tuple[str, str]] = [
    ("1", "Física"),
    ("2", "Auditiva"),
    ("3", "Visual"),
    ("4", "Intelectual/Cognitiva"),
    ("5", "Psíquica/Transtorno mental"),
    ("6", "Múltipla"),
    ("7", "Outra"),
]


PARENTESCOS: list[tuple[str, str]] = [
    ("1",  "Pai"),
    ("2",  "Mãe"),
    ("3",  "Filho(a)"),
    ("4",  "Irmão(ã)"),
    ("5",  "Avô/Avó"),
    ("6",  "Neto(a)"),
    ("7",  "Cônjuge/Companheiro(a)"),
    ("8",  "Tio(a)"),
    ("9",  "Sobrinho(a)"),
    ("10", "Primo(a)"),
    ("11", "Responsável legal"),
    ("12", "Amigo(a)"),
    ("13", "Vizinho(a)"),
    ("99", "Outro"),
]


ORIENTACOES_SEXUAIS: list[tuple[str, str]] = [
    ("1",  "Heterossexual"),
    ("2",  "Homossexual"),
    ("3",  "Bissexual"),
    ("4",  "Assexual"),
    ("5",  "Pansexual"),
    ("9",  "Outra"),
    ("99", "Não informado"),
]


IDENTIDADES_GENERO: list[tuple[str, str]] = [
    ("1",  "Homem cisgênero"),
    ("2",  "Mulher cisgênero"),
    ("3",  "Homem transgênero"),
    ("4",  "Mulher transgênero"),
    ("5",  "Não-binário"),
    ("9",  "Outra"),
    ("99", "Não informado"),
]


# ══════════════════════════════════════════════════════════════════════════════

def _create_table(name: str, codigo_len: int, descricao_len: int) -> None:
    op.create_table(
        name,
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("codigo", sa.String(codigo_len), nullable=False),
        sa.Column("descricao", sa.String(descricao_len), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("codigo", name=f"uq_{name}_codigo"),
        schema="app",
    )
    op.create_index(f"ix_{name}_active", name, ["active"], schema="app")


def _seed(name: str, rows: list[tuple[str, str]]) -> None:
    if not rows:
        return
    values = ",\n".join(
        f"    (gen_random_uuid(), '{cod}', $seed${desc}$seed$, true, true)"
        for cod, desc in rows
    )
    op.execute(f"""
        INSERT INTO app.{name} (id, codigo, descricao, is_system, active) VALUES
        {values}
    """)


TABLES: list[tuple[str, int, int, list[tuple[str, str]]]] = [
    ("ref_tipos_documento",     4, 100, TIPOS_DOCUMENTO),
    ("ref_estados_civis",       4, 100, ESTADOS_CIVIS),
    ("ref_escolaridades",       4, 100, ESCOLARIDADES),
    ("ref_religioes",           4, 100, RELIGIOES),
    ("ref_tipos_sanguineos",    4,  40, TIPOS_SANGUINEOS),
    ("ref_povos_tradicionais",  4, 100, POVOS_TRADICIONAIS),
    ("ref_deficiencias",        4, 100, DEFICIENCIAS),
    ("ref_parentescos",         4, 100, PARENTESCOS),
    ("ref_orientacoes_sexuais", 4, 100, ORIENTACOES_SEXUAIS),
    ("ref_identidades_genero",  4, 100, IDENTIDADES_GENERO),
]


def upgrade() -> None:
    for name, cod_len, desc_len, _ in TABLES:
        _create_table(name, cod_len, desc_len)
    for name, _, _, rows in TABLES:
        _seed(name, rows)


def downgrade() -> None:
    for name, _, _, _ in reversed(TABLES):
        op.drop_index(f"ix_{name}_active", table_name=name, schema="app")
        op.drop_table(name, schema="app")
