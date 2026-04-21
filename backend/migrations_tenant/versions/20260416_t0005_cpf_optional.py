"""Torna patients.cpf opcional (cadastro simplificado)

Revision ID: t0005_cpf_optional
Revises: t0004_patient_documents
Create Date: 2026-04-16

CPF passa a aceitar NULL pra suportar:
- Cadastro rápido (só nome + sexo)
- Recém-nascidos sem CPF emitido
- Pacientes desconhecidos / emergência

A constraint UNIQUE continua — Postgres permite múltiplos NULLs em UNIQUE
por padrão, então CPFs preenchidos seguem únicos.
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "t0005_cpf_optional"
down_revision: str | None = "t0004_patient_documents"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("patients", "cpf", nullable=True)


def downgrade() -> None:
    # Pode falhar se houver linhas com cpf NULL — preencha antes do downgrade.
    op.alter_column("patients", "cpf", nullable=False)
