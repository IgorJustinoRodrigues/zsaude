"""Tabela ``painels`` — painéis de chamada lógicos (scoped).

Revision ID: 0056_painels
Revises: 0055_sectors
Create Date: 2026-04-21

Um **painel** é uma configuração nomeada do que uma TV da recepção vai
exibir: modo (senha/nome/ambos), áudio on/off, e a lista de setores
que ela mostra. Escopo:

- ``municipality``: template disponível pras unidades usarem direto.
- ``facility``: painel próprio da unidade.

Na hora de parear um ``Device`` do tipo ``painel``, o admin escolhe um
painel lógico entre os disponíveis pra unidade (próprios + herdados do
município).

``sector_names`` é um JSONB de strings — **snapshot** dos nomes dos
setores. Renomear um setor não quebra o painel (o nome antigo
continua lá até o user editar).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import JSONType, UUIDType

revision: str = "0056_painels"
down_revision: str | None = "0055_sectors"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "painels",
        sa.Column("id", UUIDType(), nullable=False),
        sa.Column("scope_type", sa.String(20), nullable=False),
        sa.Column("scope_id", UUIDType(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column(
            "mode", sa.String(20), nullable=False,
            server_default="senha",
        ),
        sa.Column(
            "announce_audio", sa.Boolean(),
            nullable=False, server_default=sa.text("true"),
        ),
        # Lista de nomes de setores exibidos (JSONB array de strings).
        # Vazio = "exibe tudo que vier".
        sa.Column("sector_names", JSONType(), nullable=False, server_default="[]"),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_painels"),
        sa.CheckConstraint(
            "scope_type IN ('municipality', 'facility')",
            name="ck_painels_scope_type",
        ),
        sa.CheckConstraint(
            "mode IN ('senha', 'nome', 'ambos')",
            name="ck_painels_mode_valid",
        ),
        sa.UniqueConstraint(
            "scope_type", "scope_id", "name",
            name="uq_painels_scope_name",
        ),
        schema="app",
    )
    op.create_index(
        "ix_painels_scope", "painels",
        ["scope_type", "scope_id"],
        schema="app",
    )


def downgrade() -> None:
    op.drop_index("ix_painels_scope", table_name="painels", schema="app")
    op.drop_table("painels", schema="app")
