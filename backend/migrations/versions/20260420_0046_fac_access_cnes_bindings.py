"""Vínculos CNES 1:N por acesso (tabela ``facility_access_cnes_bindings``).

Revision ID: 0046_fa_cnes_bindings
Revises: 0045_fac_access_cnes_snap
Create Date: 2026-04-20

Migra o vínculo CNES de ``facility_accesses`` (1:1) pra tabela separada
``facility_access_cnes_bindings`` (1:N). Motivo: um mesmo profissional
pode ter múltiplos CBOs numa unidade, e o mesmo acesso (user × unidade)
pode reunir vínculos a mais de um profissional ou CBO.

- Cria a tabela, com FK cascade pro FacilityAccess.
- Migra cada linha de ``facility_accesses`` que tinha ``cnes_professional_id``
  pra uma linha equivalente na nova tabela.
- Dropa as 5 colunas antigas.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.types import UUIDType

revision: str = "0046_fa_cnes_bindings"
down_revision: str | None = "0045_fac_access_cnes_snap"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "facility_access_cnes_bindings",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column(
            "facility_access_id",
            UUIDType(),
            sa.ForeignKey("app.facility_accesses.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("cbo_id", sa.String(6), nullable=False),
        sa.Column("cbo_description", sa.String(255), nullable=True),
        sa.Column("cnes_professional_id", sa.String(16), nullable=False),
        sa.Column("cnes_snapshot_cpf", sa.String(11), nullable=True),
        sa.Column("cnes_snapshot_nome", sa.String(200), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "facility_access_id", "cnes_professional_id", "cbo_id",
            name="uq_fa_cnes_binding_access_prof_cbo",
        ),
        schema="app",
    )

    # Migra dados atuais (1:1) pro novo modelo (1:N).
    op.execute("""
        INSERT INTO app.facility_access_cnes_bindings (
            id, facility_access_id, cbo_id, cbo_description,
            cnes_professional_id, cnes_snapshot_cpf, cnes_snapshot_nome
        )
        SELECT gen_random_uuid(), id, cbo_id, cbo_description,
               cnes_professional_id, cnes_snapshot_cpf, cnes_snapshot_nome
          FROM app.facility_accesses
         WHERE cnes_professional_id IS NOT NULL
    """)

    # Remove as colunas 1:1 antigas.
    op.drop_column("facility_accesses", "cnes_snapshot_nome", schema="app")
    op.drop_column("facility_accesses", "cnes_snapshot_cpf", schema="app")
    op.drop_column("facility_accesses", "cnes_professional_id", schema="app")
    op.drop_column("facility_accesses", "cbo_description", schema="app")
    op.drop_column("facility_accesses", "cbo_id", schema="app")


def downgrade() -> None:
    op.add_column(
        "facility_accesses",
        sa.Column("cbo_id", sa.String(6), nullable=True),
        schema="app",
    )
    op.add_column(
        "facility_accesses",
        sa.Column("cbo_description", sa.String(255), nullable=True),
        schema="app",
    )
    op.add_column(
        "facility_accesses",
        sa.Column("cnes_professional_id", sa.String(16), nullable=True),
        schema="app",
    )
    op.add_column(
        "facility_accesses",
        sa.Column("cnes_snapshot_cpf", sa.String(11), nullable=True),
        schema="app",
    )
    op.add_column(
        "facility_accesses",
        sa.Column("cnes_snapshot_nome", sa.String(200), nullable=True),
        schema="app",
    )
    # Restaura o PRIMEIRO binding por acesso (heurística — melhor esforço).
    op.execute("""
        UPDATE app.facility_accesses fa
           SET cbo_id              = b.cbo_id,
               cbo_description     = b.cbo_description,
               cnes_professional_id= b.cnes_professional_id,
               cnes_snapshot_cpf   = b.cnes_snapshot_cpf,
               cnes_snapshot_nome  = b.cnes_snapshot_nome
          FROM (
              SELECT DISTINCT ON (facility_access_id) *
                FROM app.facility_access_cnes_bindings
               ORDER BY facility_access_id, created_at ASC
          ) b
         WHERE b.facility_access_id = fa.id
    """)
    op.drop_table("facility_access_cnes_bindings", schema="app")
