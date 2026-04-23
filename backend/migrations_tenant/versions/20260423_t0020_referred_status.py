"""Fase H — encaminhamento do não-urgente pra UBS.

Revision ID: t0020_referred_status
Revises: t0019_triage_complaint_code
Create Date: 2026-04-23

- Adiciona status terminal ``referred`` no CHECK de ``attendances.status``
  — usado quando o paciente foi encaminhado pra uma UBS.
- Colunas de encaminhamento:
    - ``referred_to_facility_id`` UUID NULL — unidade destino (UBS).
      FK lógica com ``app.facilities`` (sem FK formal: schema diferente).
    - ``referred_at`` TIMESTAMPTZ NULL — quando o encaminhamento ocorreu.
    - ``referred_by_user_id`` UUID NULL — quem encaminhou.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "t0020_referred_status"
down_revision: str | None = "t0019_triage_complaint_code"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


PG_UUID = UUIDType()

_STATUSES = (
    "reception_waiting", "reception_called", "reception_attending",
    "sector_waiting", "triagem_waiting",
    "cln_called", "cln_attending", "finished",
    "evaded", "cancelled", "evasion",
    "referred",
)


def upgrade() -> None:
    op.add_column(
        "attendances",
        sa.Column("referred_to_facility_id", PG_UUID, nullable=True),
    )
    op.add_column(
        "attendances",
        sa.Column("referred_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "attendances",
        sa.Column("referred_by_user_id", PG_UUID, nullable=True),
    )

    op.drop_constraint("ck_attendances_status", "attendances", type_="check")
    joined = ", ".join(f"'{s}'" for s in _STATUSES)
    op.create_check_constraint(
        "ck_attendances_status",
        "attendances",
        f"status IN ({joined})",
    )


def downgrade() -> None:
    op.drop_constraint("ck_attendances_status", "attendances", type_="check")
    op.create_check_constraint(
        "ck_attendances_status",
        "attendances",
        "status IN ('reception_waiting', 'reception_called', "
        "'reception_attending', 'sector_waiting', 'triagem_waiting', "
        "'cln_called', 'cln_attending', 'finished', "
        "'evaded', 'cancelled', 'evasion')",
    )
    op.drop_column("attendances", "referred_by_user_id")
    op.drop_column("attendances", "referred_at")
    op.drop_column("attendances", "referred_to_facility_id")
