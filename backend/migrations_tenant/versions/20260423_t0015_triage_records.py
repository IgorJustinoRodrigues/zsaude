"""Cria triage_records + status 'evaded' + coluna priority_group_id

Revision ID: t0015_triage_records
Revises: t0014_cln_statuses
Create Date: 2026-04-23

Fase A da tela de triagem:

1. Tabela ``triage_records`` com dados clínicos coletados na triagem
   (queixa, sinais vitais, classificação de risco, quem triou).
2. Adiciona status ``evaded`` ao CHECK constraint de ``attendances.status``
   — paciente não retornou durante a espera (aba "Evadidos").
3. Coluna ``priority_group_id`` (nullable) em ``attendances`` — preparação
   pra Fase C (grupos prioritários: gestante, idoso, deficiente, criança
   de colo). Fica inerte até os grupos serem cadastrados.

Campos risk_auto_suggested / risk_override_reason são pra o protocolo
Campinas (Fase G): o protocolo sugere, profissional confirma ou
sobrescreve.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "t0015_triage_records"
down_revision: str | None = "t0014_cln_statuses"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


PG_UUID = UUIDType()

_NEW_STATUSES = (
    "reception_waiting", "reception_called", "reception_attending",
    "sector_waiting", "triagem_waiting",
    "cln_called", "cln_attending", "finished",
    "evaded",
    "cancelled", "evasion",
)


def upgrade() -> None:
    # 1. Tabela triage_records
    op.create_table(
        "triage_records",
        sa.Column("id", PG_UUID, primary_key=True),
        sa.Column("attendance_id", PG_UUID,
                  sa.ForeignKey("attendances.id", ondelete="CASCADE"), nullable=False),

        # Queixa e observações
        sa.Column("queixa",      sa.Text,  nullable=False, server_default=""),
        sa.Column("observacoes", sa.Text,  nullable=False, server_default=""),

        # Sinais vitais — todos nullable, profissional preenche o que afere.
        sa.Column("pa_sistolica",  sa.Integer, nullable=True),
        sa.Column("pa_diastolica", sa.Integer, nullable=True),
        sa.Column("fc",            sa.Integer, nullable=True),
        sa.Column("fr",            sa.Integer, nullable=True),
        sa.Column("temperatura",   sa.Numeric(4, 1), nullable=True),
        sa.Column("spo2",          sa.Numeric(4, 1), nullable=True),
        sa.Column("glicemia",      sa.Integer, nullable=True),

        # Escala de dor (0..10).
        sa.Column("dor", sa.SmallInteger, nullable=False, server_default="0"),

        # Classificação de risco (1..5).
        sa.Column("risk_classification", sa.SmallInteger, nullable=False),
        # Sugestão do protocolo (Campinas) — null quando sem protocolo.
        sa.Column("risk_auto_suggested",  sa.SmallInteger, nullable=True),
        # Motivo do override manual (só preenchido se o profissional
        # sobrescreveu a sugestão do protocolo).
        sa.Column("risk_override_reason", sa.Text, nullable=True),

        # Auditoria: quem triou.
        sa.Column("triaged_by_user_id",   PG_UUID, nullable=True),
        sa.Column("triaged_by_user_name", sa.String(200), nullable=False, server_default=" "),

        sa.Column("created_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),

        sa.CheckConstraint(
            "dor BETWEEN 0 AND 10", name="ck_triage_records_dor_range",
        ),
        sa.CheckConstraint(
            "risk_classification BETWEEN 1 AND 5",
            name="ck_triage_records_risk_range",
        ),
        sa.CheckConstraint(
            "risk_auto_suggested IS NULL OR risk_auto_suggested BETWEEN 1 AND 5",
            name="ck_triage_records_risk_suggested_range",
        ),
    )
    op.create_index(
        "ix_triage_records_attendance_created",
        "triage_records",
        ["attendance_id", "created_at"],
    )

    # 2. Adiciona 'evaded' no CHECK constraint de status.
    op.drop_constraint(
        "ck_attendances_status", "attendances", type_="check",
    )
    joined = ", ".join(f"'{s}'" for s in _NEW_STATUSES)
    op.create_check_constraint(
        "ck_attendances_status",
        "attendances",
        f"status IN ({joined})",
    )

    # 3. Coluna priority_group_id (nullable, sem FK por ora — tabela do
    #    domínio nasce na Fase C).
    op.add_column(
        "attendances",
        sa.Column("priority_group_id", PG_UUID, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("attendances", "priority_group_id")

    op.drop_constraint(
        "ck_attendances_status", "attendances", type_="check",
    )
    op.create_check_constraint(
        "ck_attendances_status",
        "attendances",
        "status IN ('reception_waiting', 'reception_called', "
        "'reception_attending', 'sector_waiting', 'triagem_waiting', "
        "'cln_called', 'cln_attending', 'finished', "
        "'cancelled', 'evasion')",
    )

    op.drop_index(
        "ix_triage_records_attendance_created",
        table_name="triage_records",
    )
    op.drop_table("triage_records")
