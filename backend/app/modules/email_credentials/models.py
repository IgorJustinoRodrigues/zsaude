"""Modelo ``EmailCredentials`` — creds SES por escopo."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UUIDType, new_uuid7

# Mesmo sentinel usado em ``email_templates`` — por quê: Postgres aceita
# múltiplos NULL em UNIQUE, mas depender desse comportamento complica a
# resolução por cascata. Um UUID constante resolve sem gambiarra.
SYSTEM_SCOPE_ID = uuid.UUID("00000000-0000-0000-0000-000000000000")


class CredentialsScope(str, enum.Enum):
    SYSTEM = "system"
    MUNICIPALITY = "municipality"
    FACILITY = "facility"


class EmailCredentials(Base):
    """Credenciais SES pra um escopo.

    A resolução de envio é em cascata: FACILITY → MUNICIPALITY → SYSTEM
    (banco) → ``settings`` (env vars). Sem nenhuma linha, sistema continua
    funcionando com o que vem no ``.env``.
    """

    __tablename__ = "email_credentials"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)

    scope_type: Mapped[CredentialsScope] = mapped_column(
        Enum(
            CredentialsScope,
            name="email_credentials_scope",
            native_enum=False,
            length=20,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    scope_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), nullable=False)

    from_email: Mapped[str] = mapped_column(String(200), nullable=False)
    from_name: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    aws_region: Mapped[str] = mapped_column(String(32), nullable=False, server_default="us-east-1")
    aws_access_key_id: Mapped[str] = mapped_column(String(200), nullable=False)
    # Cifrada via Fernet (app.core.crypto.encrypt_secret).
    aws_secret_access_key_enc: Mapped[str] = mapped_column(String(500), nullable=False)
    ses_configuration_set: Mapped[str | None] = mapped_column(String(200), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("TRUE"))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=text("CURRENT_TIMESTAMP"),
    )

    __table_args__ = (
        UniqueConstraint("scope_type", "scope_id", name="uq_email_credentials_scope"),
        CheckConstraint(
            "scope_type IN ('system', 'municipality', 'facility')",
            name="ck_email_credentials_scope_type",
        ),
    )
