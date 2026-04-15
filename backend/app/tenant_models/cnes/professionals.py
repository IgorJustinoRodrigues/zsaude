"""Profissionais (lfces018.txt) e vínculos profissional × unidade (lfces021.txt)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.types import new_uuid7
from app.tenant_models import TenantBase


class CnesProfessional(TenantBase):
    """Profissional da saúde (snapshot do lfces018)."""

    __tablename__ = "cnes_professionals"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)

    id_profissional: Mapped[str] = mapped_column(String(16), unique=True, nullable=False, index=True)
    cpf: Mapped[str] = mapped_column(String(11), nullable=False, server_default="", index=True)
    cns: Mapped[str] = mapped_column(String(15), nullable=False, server_default="", index=True)
    nome: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")

    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="Ativo")
    competencia_ultima_importacao: Mapped[str] = mapped_column(String(6), nullable=False, server_default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default=text("now()"), onupdate=text("now()"),
    )


class CnesProfessionalUnit(TenantBase):
    """Vínculo profissional × unidade × CBO (snapshot do lfces021).

    Chave natural: (id_profissional, id_unidade, id_cbo).
    """

    __tablename__ = "cnes_professional_unit"
    __table_args__ = (
        UniqueConstraint(
            "id_profissional", "id_unidade", "id_cbo",
            name="uq_cnes_prof_unit_cbo",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)

    id_profissional: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    id_unidade: Mapped[str] = mapped_column(String(31), nullable=False, index=True)
    id_cbo: Mapped[str] = mapped_column(String(6), nullable=False)

    carga_horaria_ambulatorial: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    carga_horaria_hospitalar: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    id_conselho: Mapped[str] = mapped_column(String(2), nullable=False, server_default="")
    num_conselho: Mapped[str] = mapped_column(String(10), nullable=False, server_default="")

    # Status traduzido: 'Ativo' | 'Bloqueado'
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="Ativo", index=True)

    competencia_ultima_importacao: Mapped[str] = mapped_column(String(6), nullable=False, server_default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default=text("now()"), onupdate=text("now()"),
    )
