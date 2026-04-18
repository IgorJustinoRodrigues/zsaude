"""Modelo User."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, text
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

    # ``login`` é o identificador interno, gerado a partir do CPF (ou do
    # e-mail, quando não há CPF). Não é mais exibido nem aceito na UI —
    # o usuário entra sempre com CPF ou e-mail.
    login: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    # Pelo menos UM de ``cpf``/``email`` é obrigatório — validado no
    # service e no schema. Ambos continuam UNIQUE; Postgres e Oracle
    # aceitam múltiplos NULL em colunas UNIQUE.
    email: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Nome social — como a pessoa quer ser chamada. Opcional, editado
    # pelo próprio usuário em "Minha Conta". Quando vazio, usamos ``name``.
    social_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    cpf: Mapped[str | None] = mapped_column(String(11), unique=True, nullable=True, index=True)
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

    # Quando a senha atual foi definida. Usado pra calcular expiração
    # (ver system_settings ``password_expiry_days``, default 90).
    password_changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    # ``True`` quando a senha atual é provisória (gerada por admin em
    # reset, por exemplo) — usuário é obrigado a trocar antes de usar o
    # sistema. Vira ``False`` quando o usuário troca.
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("0"),
    )

    # Foto ativa do usuário (FK lógica -> user_photos.id). FK não declarada
    # na coluna para evitar ciclo (UserPhoto.user_id -> users.id).
    current_photo_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), nullable=True)

    # Opt-in para reconhecimento facial. Default True (pode desativar na UI).
    # Paciente tem feature equivalente em tenant_models; aqui é global.
    face_opt_in: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("1"))

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User {self.login}>"


class PasswordHistory(Base):
    """Últimas N senhas do usuário — bloqueia reuso.

    Mantém ``password_history_count`` hashes (default 5). A cada troca,
    o service insere o novo hash e faz trim dos mais antigos.
    """

    __tablename__ = "password_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(), primary_key=True, default=new_uuid7
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
