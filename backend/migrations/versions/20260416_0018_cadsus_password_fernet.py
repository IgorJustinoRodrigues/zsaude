"""Cifra senhas CadSUS já persistidas (Fernet)

Revision ID: 0018_cadsus_password_fernet
Revises: 0017_cadsus_base_setting
Create Date: 2026-04-16

Pega as linhas de ``app.municipalities`` com ``cadsus_password`` não vazia
e re-escreve o valor cifrado via ``app.core.crypto.encrypt_secret`` (Fernet
com prefixo ``fernet:v1:``). Idempotente — detecta o prefixo e pula.

Requer ``SECRETS_ENCRYPTION_KEY`` configurada no ambiente onde a migration
rodar. Sem a chave, falha fail-fast em vez de gravar senha em plain.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018_cadsus_password_fernet"
down_revision: str | None = "0017_cadsus_base_setting"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Import local pra não quebrar autogenerate / ambientes sem a chave
    # configurada (ex: linter) — mas exige a chave ao rodar a migration.
    from app.core.crypto import encrypt_secret, is_encrypted

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT id, cadsus_password FROM app.municipalities "
            "WHERE cadsus_password IS NOT NULL AND cadsus_password <> ''"
        )
    ).fetchall()

    for row in rows:
        if is_encrypted(row.cadsus_password):
            continue
        encrypted = encrypt_secret(row.cadsus_password)
        bind.execute(
            sa.text("UPDATE app.municipalities SET cadsus_password = :p WHERE id = :id"),
            {"p": encrypted, "id": row.id},
        )


def downgrade() -> None:
    """Decifra de volta pra plaintext (perde a proteção em repouso)."""
    from app.core.crypto import decrypt_secret, is_encrypted

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT id, cadsus_password FROM app.municipalities "
            "WHERE cadsus_password IS NOT NULL AND cadsus_password <> ''"
        )
    ).fetchall()

    for row in rows:
        if not is_encrypted(row.cadsus_password):
            continue
        plain = decrypt_secret(row.cadsus_password)
        bind.execute(
            sa.text("UPDATE app.municipalities SET cadsus_password = :p WHERE id = :id"),
            {"p": plain, "id": row.id},
        )
