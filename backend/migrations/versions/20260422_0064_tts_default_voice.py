"""Coluna ``is_default`` em ``tts_voices``.

Revision ID: 0064_tts_default_voice
Revises: 0063_tts_tables
Create Date: 2026-04-22

Marca a voz padrão do sistema. Só uma pode ser default por vez
(unique index parcial). O provedor ativo fica implícito: é o provider
da voz default. Simplifica vs ter settings separadas.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0064_tts_default_voice"
down_revision: str | None = "0063_tts_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tts_voices",
        sa.Column("is_default", sa.Boolean(), nullable=False,
                  server_default=sa.text("false")),
        schema="app",
    )
    op.create_index(
        "uq_tts_voices_single_default",
        "tts_voices", ["is_default"],
        unique=True,
        schema="app",
        postgresql_where=sa.text("is_default = true"),
    )


def downgrade() -> None:
    op.drop_index("uq_tts_voices_single_default",
                  table_name="tts_voices", schema="app")
    op.drop_column("tts_voices", "is_default", schema="app")
