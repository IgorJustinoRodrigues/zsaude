"""Adiciona ``sector_waiting`` aos estados válidos de Attendance.

Revision ID: t0010_attendance_sector_status
Revises: t0009_attendances
Create Date: 2026-04-21

Quando um totem está configurado pra emitir senhas direto pra um setor
(pula a recepção), o atendimento nasce com ``status='sector_waiting'``
e ``sector_name`` preenchido. Esse status já é "ativo" pros efeitos de
dedup e listagem.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "t0010_attendance_sector_status"
down_revision: str | None = "t0009_attendances"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Postgres: drop + recreate constraint (ALTER não aceita ADD/DROP
    # de CHECK em única transação com a mesma constraint em pg <16).
    op.drop_constraint(
        "ck_attendances_status", "attendances", type_="check",
    )
    op.create_check_constraint(
        "ck_attendances_status",
        "attendances",
        "status IN ('reception_waiting', 'reception_called', "
        "'reception_attending', 'sector_waiting', 'triagem_waiting', "
        "'cancelled', 'evasion')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_attendances_status", "attendances", type_="check",
    )
    op.create_check_constraint(
        "ck_attendances_status",
        "attendances",
        "status IN ('reception_waiting', 'reception_called', "
        "'reception_attending', 'triagem_waiting', 'cancelled', 'evasion')",
    )
