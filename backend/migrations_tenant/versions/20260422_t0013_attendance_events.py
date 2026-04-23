"""Cria attendance_events pra linha do tempo do atendimento

Revision ID: t0013_attendance_events
Revises: t0012_patient_addresses
Create Date: 2026-04-22

Tabela de eventos por atendimento — registra chamadas (incluindo
rechamadas), encaminhamentos, cancelamentos, assumir handover, upload
de foto etc. O ``Attendance`` continua com seus timestamps de 1ª
ocorrência (called_at, started_at, …) pra queries rápidas; essa tabela
é o histórico granular.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "t0013_attendance_events"
down_revision: str | None = "t0012_patient_addresses"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


PG_UUID = UUIDType()


def upgrade() -> None:
    op.create_table(
        "attendance_events",
        sa.Column("id", PG_UUID, primary_key=True),
        sa.Column("attendance_id", PG_UUID,
                  sa.ForeignKey("attendances.id", ondelete="CASCADE"), nullable=False),
        # event_type livre (string) — validação no código. Enum em DB trava
        # evoluções (novo tipo vira migration). Valores esperados:
        # arrived, called, recalled, started, forwarded, cancelled,
        # handover_assumed, photo_uploaded, data_updated, note_added.
        sa.Column("event_type",   sa.String(40),   nullable=False),
        # Usuário que gerou o evento (app.users — sem FK cross-schema).
        # Pode ser null pra eventos automáticos (ex.: 'arrived' via totem).
        sa.Column("user_id",      PG_UUID,         nullable=True),
        sa.Column("user_name",    sa.String(200),  nullable=False, server_default=" "),
        # Detalhes específicos do evento (sector_name, reason, etc.).
        sa.Column("details",      sa.JSON(),       nullable=True),
        sa.Column("created_at",   sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index(
        "ix_attendance_events_attendance_created",
        "attendance_events",
        ["attendance_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_attendance_events_attendance_created",
        table_name="attendance_events",
    )
    op.drop_table("attendance_events")
