"""RBAC: finaliza migração — drop legado de facility_accesses.

Revision ID: 0008_rbac_finalize
Revises: 0007_rbac_system
Create Date: 2026-04-15

**Destrutivo em dev** (autorizado pelo user): apaga overrides e acessos
existentes, dropa colunas ``role`` e ``modules`` e torna ``role_id`` NOT NULL.
Após aplicar, rodar ``scripts/seed.py`` para recriar os acessos no formato
novo (cada acesso aponta para um SYSTEM/MUNICIPALITY role).
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_rbac_finalize"
down_revision: str | None = "0007_rbac_system"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Apaga overrides e acessos (dev-only — prod precisa de script de
    # migração customizado que mapeie role strings para role_id).
    op.execute('DELETE FROM app.facility_access_permission_overrides')
    op.execute('DELETE FROM app.facility_accesses')

    # 2. Dropa colunas legadas.
    op.drop_column('facility_accesses', 'role', schema='app')
    op.drop_column('facility_accesses', 'modules', schema='app')

    # 3. role_id vira obrigatório.
    op.alter_column(
        'facility_accesses',
        'role_id',
        nullable=False,
        schema='app',
    )


def downgrade() -> None:
    # Re-adiciona colunas como NULL/empty array.
    op.add_column(
        'facility_accesses',
        sa.Column('role', sa.String(100), nullable=True),
        schema='app',
    )
    op.add_column(
        'facility_accesses',
        sa.Column(
            'modules',
            sa.ARRAY(sa.String(10)),
            nullable=False,
            server_default='{}',
        ),
        schema='app',
    )
    # Preenche role com string vazia (downgrade não tenta recuperar valores).
    op.execute("UPDATE app.facility_accesses SET role = ''")
    op.alter_column('facility_accesses', 'role', nullable=False, schema='app')
    # role_id volta a ser nullable.
    op.alter_column(
        'facility_accesses',
        'role_id',
        nullable=True,
        schema='app',
    )
