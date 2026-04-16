"""Limpa tipos de documento: remove CPF, adiciona NIS/PIS, Título de eleitor, CadÚnico e Certidão de Nascimento

Revision ID: 0015_tipos_documento_cleanup
Revises: 0014_reference_tables_expand
Create Date: 2026-04-16

CPF e CNS têm campos próprios em ``patients`` — não devem aparecer como
opção de "tipo de documento" no cadastro adicional. Aproveita pra incluir
tipos que estavam faltando: NIS/PIS, Título de eleitor, CadÚnico e
Certidão de nascimento.
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0015_tipos_documento_cleanup"
down_revision: str | None = "0014_reference_tables_expand"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Novos tipos a adicionar (idempotente — ON CONFLICT DO NOTHING).
NEW_TIPOS: list[tuple[str, str]] = [
    ("NIS",  "NIS/PIS"),
    ("TIT",  "Título de Eleitor"),
    ("CADU", "CadÚnico"),
    ("CN",   "Certidão de Nascimento"),
    ("CC",   "Certidão de Casamento"),
]


def upgrade() -> None:
    # Remove CPF — já está como coluna principal em patients.
    op.execute("DELETE FROM app.ref_tipos_documento WHERE codigo = 'CPF'")

    for codigo, descricao in NEW_TIPOS:
        op.execute(
            f"""
            INSERT INTO app.ref_tipos_documento (id, codigo, descricao, is_system, active)
            VALUES (gen_random_uuid(), '{codigo}', $seed${descricao}$seed$, true, true)
            ON CONFLICT (codigo) DO NOTHING
            """
        )


def downgrade() -> None:
    op.execute(
        "DELETE FROM app.ref_tipos_documento WHERE codigo IN "
        "('NIS', 'TIT', 'CADU', 'CN', 'CC')"
    )
    op.execute(
        """
        INSERT INTO app.ref_tipos_documento (id, codigo, descricao, is_system, active)
        VALUES (gen_random_uuid(), 'CPF', $seed$CPF$seed$, true, true)
        ON CONFLICT (codigo) DO NOTHING
        """
    )
