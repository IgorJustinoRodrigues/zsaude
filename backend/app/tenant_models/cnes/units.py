"""Unidades de saúde (lfces004.txt)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, text

from sqlalchemy.orm import Mapped, mapped_column

from app.db.types import UUIDType, new_uuid7
from app.tenant_models import TenantBase


class CnesUnit(TenantBase):
    """Unidade de saúde do CNES (snapshot do lfces004).

    ``id_unidade`` (31 chars) é o identificador SCNES; ``cnes`` (7 dígitos)
    é o código público da unidade. Os dois são chaves naturais — manter
    ambas indexadas.
    """

    __tablename__ = "cnes_units"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)

    id_unidade: Mapped[str] = mapped_column(String(31), unique=True, nullable=False, index=True)
    cnes: Mapped[str] = mapped_column(String(7), unique=True, nullable=False, index=True)

    cnpj_mantenedora: Mapped[str] = mapped_column(String(14), nullable=False, server_default="")
    razao_social: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    nome_fantasia: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")

    cpf: Mapped[str] = mapped_column(String(11), nullable=False, server_default="")
    cnpj: Mapped[str] = mapped_column(String(14), nullable=False, server_default="")

    tipo_unidade: Mapped[str] = mapped_column(String(2), nullable=False, server_default="")
    estado: Mapped[str] = mapped_column(String(2), nullable=False, server_default="")
    codigo_ibge: Mapped[str] = mapped_column(String(7), nullable=False, index=True)

    # Competência da última importação que atualizou esta linha (AAAAMM).
    competencia_ultima_importacao: Mapped[str] = mapped_column(String(6), nullable=False, server_default="")

    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("1"), index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default=text("CURRENT_TIMESTAMP"), onupdate=text("CURRENT_TIMESTAMP"),
    )
