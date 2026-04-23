"""Cria attendance_procedures (Fase F — procedimentos SIGTAP).

Revision ID: t0018_attendance_procedures
Revises: t0017_triage_expanded
Create Date: 2026-04-23

Fase F integra a marcação de procedimentos SIGTAP ao fluxo de
atendimento. O catálogo SIGTAP vive no schema app (``procedimentos``,
``cbo_procedimento``) e é reimportado mensalmente (DATASUS publica por
competência MM/AAAA). Aqui no tenant ficam só as marcações do
atendimento — sem FK cross-schema; guardamos ``codigo`` +
``competencia`` como snapshot, descrição é resolvida na leitura via
join em bulk.

Pontos de auto-marcação (``source``):
- ``auto_triagem`` — inserido por ``ClnService.triage_and_release`` com
  o código do acolhimento com classificação de risco (``0301010273``).
- ``auto_atendimento`` — inserido por ``ClnService.finish`` com a
  consulta adequada ao CBO do atendente (mapeamento por prefixo no
  service). Quando o CBO não está mapeado, nada é adicionado e o
  profissional marca manualmente.
- ``manual`` — profissional adicionou via busca na tela.

Unique em (attendance_id, codigo) evita duplicatas — se a retriagem
rodar de novo, o INSERT ... ON CONFLICT DO NOTHING garante idempotência.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "t0018_attendance_procedures"
down_revision: str | None = "t0017_triage_expanded"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


PG_UUID = UUIDType()


def upgrade() -> None:
    op.create_table(
        "attendance_procedures",
        sa.Column("id", PG_UUID, primary_key=True),
        sa.Column(
            "attendance_id", PG_UUID,
            sa.ForeignKey("attendances.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Código SIGTAP — 10 dígitos sem pontuação.
        sa.Column("codigo", sa.String(10), nullable=False),
        # Competência (YYYYMM) da versão do catálogo usada na hora da marcação.
        # Guarda o snapshot — se um código for alterado/removido em competência
        # futura, a leitura ainda consegue renderizar corretamente.
        sa.Column("competencia", sa.String(6), nullable=False, server_default="000000"),
        sa.Column("quantidade", sa.Integer, nullable=False, server_default="1"),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("marked_by_user_id", PG_UUID, nullable=True),
        sa.Column("marked_by_user_name", sa.String(200), nullable=False, server_default=" "),
        sa.Column(
            "marked_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint(
            "source IN ('manual','auto_triagem','auto_atendimento')",
            name="ck_attendance_procedures_source",
        ),
        sa.CheckConstraint(
            "quantidade > 0 AND quantidade <= 999",
            name="ck_attendance_procedures_quantidade",
        ),
        sa.UniqueConstraint(
            "attendance_id", "codigo",
            name="uq_attendance_procedures_att_codigo",
        ),
    )
    op.create_index(
        "ix_attendance_procedures_att",
        "attendance_procedures",
        ["attendance_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_attendance_procedures_att",
        table_name="attendance_procedures",
    )
    op.drop_table("attendance_procedures")
