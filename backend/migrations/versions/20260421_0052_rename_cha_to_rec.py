"""Renomeia o código do módulo ``cha`` para ``rec`` (Recepção).

Revision ID: 0052_rename_cha_to_rec
Revises: 0051_cbo_abilities
Create Date: 2026-04-21

O slot ``cha`` (Painel de Chamadas) era um placeholder nunca
implementado. O módulo real será ``rec`` (Recepção) e abraça totem,
balcão e painel de chamadas como **funções habilitáveis** por município
e unidade (futuramente).

Este migration:
- Troca ``cha`` por ``rec`` em ``municipalities.enabled_modules`` (JSONB).
- Troca em ``facilities.enabled_modules`` (JSONB) quando não-null.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0052_rename_cha_to_rec"
down_revision: str | None = "0051_cbo_abilities"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Município: JSONB com array de códigos. Substitui 'cha' por 'rec'.
    op.execute("""
        UPDATE app.municipalities
        SET enabled_modules = (
            SELECT jsonb_agg(
                CASE WHEN v = '"cha"'::jsonb THEN '"rec"'::jsonb ELSE v END
            )
            FROM jsonb_array_elements(enabled_modules) v
        )
        WHERE enabled_modules IS NOT NULL
          AND enabled_modules @> '["cha"]'::jsonb;
    """)
    # Unidade: idem, mas só linhas com array definido (null = herda do mun).
    op.execute("""
        UPDATE app.facilities
        SET enabled_modules = (
            SELECT jsonb_agg(
                CASE WHEN v = '"cha"'::jsonb THEN '"rec"'::jsonb ELSE v END
            )
            FROM jsonb_array_elements(enabled_modules) v
        )
        WHERE enabled_modules IS NOT NULL
          AND enabled_modules @> '["cha"]'::jsonb;
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE app.municipalities
        SET enabled_modules = (
            SELECT jsonb_agg(
                CASE WHEN v = '"rec"'::jsonb THEN '"cha"'::jsonb ELSE v END
            )
            FROM jsonb_array_elements(enabled_modules) v
        )
        WHERE enabled_modules IS NOT NULL
          AND enabled_modules @> '["rec"]'::jsonb;
    """)
    op.execute("""
        UPDATE app.facilities
        SET enabled_modules = (
            SELECT jsonb_agg(
                CASE WHEN v = '"rec"'::jsonb THEN '"cha"'::jsonb ELSE v END
            )
            FROM jsonb_array_elements(enabled_modules) v
        )
        WHERE enabled_modules IS NOT NULL
          AND enabled_modules @> '["rec"]'::jsonb;
    """)
