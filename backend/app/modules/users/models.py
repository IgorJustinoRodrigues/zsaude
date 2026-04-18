"""Modelo User."""

from __future__ import annotations

import enum
import uuid
from datetime import date

from sqlalchemy import Boolean, Date, Enum, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedMixin
from app.db.types import UUIDType, new_uuid7


class UserStatus(str, enum.Enum):
    ATIVO = "Ativo"
    INATIVO = "Inativo"
    BLOQUEADO = "Bloqueado"


class UserLevel(str, enum.Enum):
    """Nível hierárquico do usuário.

    - MASTER: gerencia toda a plataforma (municípios, unidades, configs, terminologias).
    - ADMIN: gerencia usuários e configuração dentro dos municípios vinculados.
    - USER:   fluxo operacional (atende paciente, libera laudo, etc.).
    """

    MASTER = "master"
    ADMIN = "admin"
    USER = "user"


class User(Base, TimestampedMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(), primary_key=True, default=new_uuid7
    )

    login: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    cpf: Mapped[str] = mapped_column(String(11), unique=True, nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, server_default=" ")

    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)

    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus, name="user_status", native_enum=False, length=20),
        nullable=False,
        server_default=UserStatus.ATIVO.value,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("1"))
    is_superuser: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))

    level: Mapped[UserLevel] = mapped_column(
        Enum(
            UserLevel,
            name="user_level",
            native_enum=False,
            length=10,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        server_default=UserLevel.USER.value,
        index=True,
    )

    primary_role: Mapped[str] = mapped_column(String(100), nullable=False, server_default=" ")

    # Incrementado para invalidar todos os access tokens emitidos (logout-all).
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))

    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User {self.login}>"
