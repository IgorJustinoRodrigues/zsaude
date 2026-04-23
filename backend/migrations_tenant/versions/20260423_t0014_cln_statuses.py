"""Adiciona statuses CLN: cln_called, cln_attending, finished

Revision ID: t0014_cln_statuses
Revises: t0013_attendance_events
Create Date: 2026-04-23

Novos statuses do ciclo de vida pós-recepção (módulo Clínico):
- ``cln_called`` — atendente chamou no painel/setor (genérico — vale
  tanto pra triagem quanto pra atendimento final, distinguidos pelo
  ``sector_name`` do ticket vs config).
- ``cln_attending`` — em atendimento no CLN.
- ``finished`` — terminal (alta do setor).
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "t0014_cln_statuses"
down_revision: str | None = "t0013_attendance_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_NEW_STATUSES = (
    "reception_waiting", "reception_called", "reception_attending",
    "sector_waiting", "triagem_waiting",
    "cln_called", "cln_attending", "finished",
    "cancelled", "evasion",
)


def upgrade() -> None:
    op.drop_constraint(
        "ck_attendances_status", "attendances", type_="check",
    )
    joined = ", ".join(f"'{s}'" for s in _NEW_STATUSES)
    op.create_check_constraint(
        "ck_attendances_status",
        "attendances",
        f"status IN ({joined})",
    )


def downgrade() -> None:
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
