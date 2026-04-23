"""Adiciona campos expandidos em triage_records (Fase D).

Revision ID: t0017_triage_expanded
Revises: t0016_priority_groups
Create Date: 2026-04-23

Fase D da tela de triagem — campos além dos sinais vitais básicos:

- Antropometria: peso (kg), altura (cm), imc (kg/m²).
  IMC é persistido em vez de calculado em view — grava o que o
  profissional validou visualmente na tela (evita discrepância entre
  arredondamentos cliente/servidor).
- Perímetros (cm): cefálico (criança < 2 anos), abdominal, torácico,
  panturrilha. Profissional preenche o que for relevante.
- Gestação: ``gestante`` (bool nullable, null = não perguntado/aplicável),
  ``dum`` (data última menstruação), ``semanas_gestacao``
  (override manual quando DUM desconhecida).

Todos nullable — triagem tolera campos em branco.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "t0017_triage_expanded"
down_revision: str | None = "t0016_priority_groups"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("triage_records") as batch:
        # Antropometria
        batch.add_column(sa.Column("peso",   sa.Numeric(5, 2), nullable=True))
        batch.add_column(sa.Column("altura", sa.Integer,       nullable=True))
        batch.add_column(sa.Column("imc",    sa.Numeric(5, 2), nullable=True))

        # Perímetros (cm)
        batch.add_column(sa.Column("perimetro_cefalico",    sa.Numeric(4, 1), nullable=True))
        batch.add_column(sa.Column("perimetro_abdominal",   sa.Numeric(4, 1), nullable=True))
        batch.add_column(sa.Column("perimetro_toracico",    sa.Numeric(4, 1), nullable=True))
        batch.add_column(sa.Column("perimetro_panturrilha", sa.Numeric(4, 1), nullable=True))

        # Gestação
        batch.add_column(sa.Column("gestante",          sa.Boolean,      nullable=True))
        batch.add_column(sa.Column("dum",               sa.Date,         nullable=True))
        batch.add_column(sa.Column("semanas_gestacao",  sa.SmallInteger, nullable=True))

    # Ranges sanos — mantém dados limpos sem travar edge cases.
    op.create_check_constraint(
        "ck_triage_records_peso_range",
        "triage_records",
        "peso IS NULL OR (peso > 0 AND peso < 600)",
    )
    op.create_check_constraint(
        "ck_triage_records_altura_range",
        "triage_records",
        "altura IS NULL OR (altura > 20 AND altura < 260)",
    )
    op.create_check_constraint(
        "ck_triage_records_semanas_range",
        "triage_records",
        "semanas_gestacao IS NULL OR (semanas_gestacao >= 0 AND semanas_gestacao <= 45)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_triage_records_semanas_range", "triage_records", type_="check")
    op.drop_constraint("ck_triage_records_altura_range",  "triage_records", type_="check")
    op.drop_constraint("ck_triage_records_peso_range",    "triage_records", type_="check")

    with op.batch_alter_table("triage_records") as batch:
        batch.drop_column("semanas_gestacao")
        batch.drop_column("dum")
        batch.drop_column("gestante")
        batch.drop_column("perimetro_panturrilha")
        batch.drop_column("perimetro_toracico")
        batch.drop_column("perimetro_abdominal")
        batch.drop_column("perimetro_cefalico")
        batch.drop_column("imc")
        batch.drop_column("altura")
        batch.drop_column("peso")
