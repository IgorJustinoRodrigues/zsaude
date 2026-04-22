"""Coluna ``speed`` em ``tts_voices``.

Revision ID: 0065_tts_voice_speed
Revises: 0064_tts_default_voice
Create Date: 2026-04-22

Velocidade de fala por voz (0.25 — 4.0, conforme ElevenLabs). Default
0.9 — levemente mais lento, melhora inteligibilidade em painéis
públicos. Entra no hash do cache, então mudar o valor re-gera os
fragmentos da voz na próxima chamada.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0065_tts_voice_speed"
down_revision: str | None = "0064_tts_default_voice"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tts_voices",
        sa.Column("speed", sa.Numeric(3, 2), nullable=False, server_default="0.9"),
        schema="app",
    )
    op.create_check_constraint(
        "ck_tts_voices_speed",
        "tts_voices",
        "speed >= 0.25 AND speed <= 4.0",
        schema="app",
    )


def downgrade() -> None:
    op.drop_constraint("ck_tts_voices_speed", "tts_voices", schema="app")
    op.drop_column("tts_voices", "speed", schema="app")
