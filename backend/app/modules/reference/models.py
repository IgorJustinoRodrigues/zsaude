"""Modelos das tabelas de referência globais."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import new_uuid7


class _RefMixin:
    """Colunas comuns a todas as tabelas de referência."""

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=new_uuid7)
    descricao: Mapped[str] = mapped_column(String(100), nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))


class RefNacionalidade(Base, _RefMixin):
    __tablename__ = "ref_nacionalidades"
    codigo: Mapped[str] = mapped_column(String(4), nullable=False, unique=True)


class RefRaca(Base, _RefMixin):
    __tablename__ = "ref_racas"
    codigo: Mapped[str] = mapped_column(String(2), nullable=False, unique=True)
    descricao: Mapped[str] = mapped_column(String(40), nullable=False)


class RefEtnia(Base, _RefMixin):
    __tablename__ = "ref_etnias"
    codigo: Mapped[str] = mapped_column(String(4), nullable=False, unique=True)


class RefLogradouro(Base, _RefMixin):
    __tablename__ = "ref_logradouros"
    codigo: Mapped[str] = mapped_column(String(4), nullable=False, unique=True)
    descricao: Mapped[str] = mapped_column(String(50), nullable=False)
