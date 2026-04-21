"""Tabela ``attendances`` — atendimentos que atravessam o paciente
desde a recepção até a alta.

Revision ID: t0009_attendances
Revises: t0008_files
Create Date: 2026-04-21

A entidade ``Attendance`` representa a jornada inteira do paciente na
rede pública daquele município — começa quando tira a senha no totem
(ou chega no balcão) e só termina quando o paciente tem alta ou é
cancelado. Fases:

- ``reception_waiting``    — emitido pelo totem, na fila da recepção
- ``reception_called``     — recepcionista chamou
- ``reception_attending``  — no balcão, conferindo cadastro
- ``triagem_waiting``      — encaminhado pra triagem (recepção concluída)
- ``cancelled``            — cancelado manualmente
- ``evasion``              — evadido (foi pra outra unidade; reason auto)

Dedup **por município**: o mesmo ``doc_value`` (CPF/CNS) ou
``patient_id`` não pode estar ativo em duas unidades ao mesmo tempo.
O mesmo doc na mesma unidade bloqueia novas emissões até finalizar.
Em outra unidade, emite com ``needs_handover_from_attendance_id`` setado
— a recepção da nova unidade vê o flag e confirma a presença antes de
atender (fecha o antigo como ``evasion``).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "t0009_attendances"
down_revision: str | None = "t0008_files"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "attendances",
        sa.Column("id", UUIDType(), primary_key=True),

        # Escopo — snapshot (facility/device moram em app schema).
        sa.Column("facility_id", UUIDType(), nullable=False),
        sa.Column("device_id", UUIDType(), nullable=True),

        # Senha
        sa.Column("ticket_number", sa.String(20), nullable=False),
        sa.Column(
            "priority", sa.Boolean(),
            nullable=False, server_default=sa.text("false"),
        ),

        # Identificação (snapshot — doc_value pode ser NULL quando manual)
        sa.Column("doc_type", sa.String(10), nullable=False),
        sa.Column("doc_value", sa.String(15), nullable=True),
        sa.Column("patient_name", sa.String(200), nullable=False),
        sa.Column(
            "patient_id", UUIDType(),
            sa.ForeignKey("patients.id", ondelete="SET NULL"),
            nullable=True,
        ),

        # Estado
        sa.Column(
            "status", sa.String(30),
            nullable=False, server_default="reception_waiting",
        ),
        # Setor de destino (preenchido no forward). Snapshot do nome —
        # renomear setor não quebra histórico.
        sa.Column("sector_name", sa.String(120), nullable=True),

        # Handover (quando mesmo paciente tinha atendimento em outra
        # unidade — este aponta pro antigo até a nova recepção confirmar
        # presença; aí o antigo vira evasion e este campo limpa).
        sa.Column(
            "needs_handover_from_attendance_id", UUIDType(), nullable=True,
        ),

        # Timeline
        sa.Column(
            "arrived_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.Column("called_at",    sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at",   sa.DateTime(timezone=True), nullable=True),
        sa.Column("forwarded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),

        # Quem fez cada transição (app.users — sem FK cross-schema)
        sa.Column("called_by_user_id",    UUIDType(), nullable=True),
        sa.Column("started_by_user_id",   UUIDType(), nullable=True),
        sa.Column("forwarded_by_user_id", UUIDType(), nullable=True),
        sa.Column("cancelled_by_user_id", UUIDType(), nullable=True),

        # Motivo em caso de cancel/evasion (auto ou manual)
        sa.Column("cancellation_reason", sa.String(300), nullable=True),

        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),

        sa.CheckConstraint(
            "status IN ('reception_waiting', 'reception_called', "
            "'reception_attending', 'triagem_waiting', 'cancelled', 'evasion')",
            name="ck_attendances_status",
        ),
        sa.CheckConstraint(
            "doc_type IN ('cpf', 'cns', 'manual')",
            name="ck_attendances_doc_type",
        ),
    )

    # Índice pra lista da recepção (status + ordenação por chegada).
    op.create_index(
        "ix_attendances_facility_status",
        "attendances",
        ["facility_id", "status", "arrived_at"],
    )
    # Pra dedup rápido por doc.
    op.create_index(
        "ix_attendances_doc_value",
        "attendances",
        ["doc_value", "status"],
    )
    # Pra dedup por patient_id.
    op.create_index(
        "ix_attendances_patient_active",
        "attendances",
        ["patient_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_attendances_patient_active", table_name="attendances")
    op.drop_index("ix_attendances_doc_value", table_name="attendances")
    op.drop_index("ix_attendances_facility_status", table_name="attendances")
    op.drop_table("attendances")
