"""TTS: provider keys, catálogo de vozes, cache de áudio.

Revision ID: 0063_tts_tables
Revises: 0062_drop_sector_rec_flag
Create Date: 2026-04-22

Tabelas:
- ``tts_provider_keys``: credenciais por provedor (scope global ou município).
- ``tts_voices``: catálogo de vozes — admin marca quais aparecem na seleção.
- ``tts_audio_cache``: cada fragmento de áudio gerado (content-addressed).

Storage: os áudios vivem no bucket em ``tts/{voice_external_id}/{hash}.mp3``
— pasta por voz pra manutenção fácil. URLs públicas (definido no plano).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0063_tts_tables"
down_revision: str | None = "0062_drop_sector_rec_flag"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ─── tts_provider_keys ───────────────────────────────────────────
    op.create_table(
        "tts_provider_keys",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True),
                  primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("scope_type", sa.String(20), nullable=False,
                  server_default="global"),
        sa.Column("scope_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  nullable=True),
        sa.Column("api_key_encrypted", sa.Text(), nullable=False),
        sa.Column("extra_config", JSONB(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False,
                  server_default=sa.text("true")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint(
            "provider IN ('elevenlabs','google')",
            name="ck_tts_provider_keys_provider",
        ),
        sa.CheckConstraint(
            "scope_type IN ('global','municipality')",
            name="ck_tts_provider_keys_scope",
        ),
        schema="app",
    )
    op.create_index(
        "uq_tts_provider_keys_unique_active",
        "tts_provider_keys",
        ["provider", "scope_type", "scope_id"],
        unique=True,
        schema="app",
        postgresql_where=sa.text("active = true"),
    )

    # ─── tts_voices ──────────────────────────────────────────────────
    op.create_table(
        "tts_voices",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True),
                  primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("external_id", sa.String(120), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("language", sa.String(20), nullable=False,
                  server_default="pt-BR"),
        sa.Column("gender", sa.String(20), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sample_url", sa.String(500), nullable=True),
        sa.Column("archived", sa.Boolean(), nullable=False,
                  server_default=sa.text("false")),
        sa.Column("available_for_selection", sa.Boolean(), nullable=False,
                  server_default=sa.text("true")),
        sa.Column("display_order", sa.Integer(), nullable=False,
                  server_default="0"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint(
            "provider IN ('elevenlabs','google')",
            name="ck_tts_voices_provider",
        ),
        sa.UniqueConstraint(
            "provider", "external_id", name="uq_tts_voices_external",
        ),
        schema="app",
    )

    # ─── tts_audio_cache ─────────────────────────────────────────────
    op.create_table(
        "tts_audio_cache",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True),
                  primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("voice_external_id", sa.String(120), nullable=False),
        sa.Column("language", sa.String(20), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("text_hash", sa.String(64), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("public_url", sa.String(1000), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("fragment_kind", sa.String(30), nullable=False,
                  server_default="custom"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("text_hash", name="uq_tts_audio_cache_hash"),
        schema="app",
    )
    op.create_index(
        "ix_tts_audio_cache_voice",
        "tts_audio_cache",
        ["provider", "voice_external_id"],
        schema="app",
    )


def downgrade() -> None:
    op.drop_index("ix_tts_audio_cache_voice",
                  table_name="tts_audio_cache", schema="app")
    op.drop_table("tts_audio_cache", schema="app")
    op.drop_table("tts_voices", schema="app")
    op.drop_index("uq_tts_provider_keys_unique_active",
                  table_name="tts_provider_keys", schema="app")
    op.drop_table("tts_provider_keys", schema="app")
