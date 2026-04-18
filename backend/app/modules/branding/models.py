"""Modelo ``BrandingConfig`` — identidade visual por escopo."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import JSONType, UUIDType, new_uuid7


class BrandingScope(str, enum.Enum):
    """A quem a configuração se aplica."""

    MUNICIPALITY = "municipality"
    FACILITY = "facility"


class BrandingConfig(Base):
    """Identidade visual de um município ou unidade.

    Uma linha por ``(scope_type, scope_id)``. O serviço ``branding`` faz
    merge em runtime (facility > municipality > sistema).

    Strings vazias / ``" "`` representam "herdar". Ver resolver em
    ``service.py``.
    """

    __tablename__ = "branding_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)

    # values_callable garante que o VALUE (lowercase) seja gravado no banco
    # — bate com a CheckConstraint 'municipality'/'facility'.
    scope_type: Mapped[BrandingScope] = mapped_column(
        Enum(
            BrandingScope,
            name="branding_scope",
            native_enum=False,
            length=20,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    scope_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), nullable=False)

    # Logo carregada via POST /logo — entra no ``app.files`` (category='branding_logo').
    logo_file_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(),
        ForeignKey("files.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Identidade textual. Espaço em branco = "herdar" (server_default=" ")
    # para compatibilidade com Oracle que não aceita string vazia em
    # NOT NULL sem default.
    display_name:  Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    header_line_1: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    header_line_2: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")
    footer_text:   Mapped[str] = mapped_column(String(500), nullable=False, server_default=" ")

    # Cor primária em hex (ex.: "#0ea5e9"). Vazio = usar default.
    primary_color: Mapped[str] = mapped_column(String(16), nullable=False, server_default=" ")

    # Configs por tipo de PDF (extensível sem migration). Shape esperado:
    # ``{ report: {...}, export: {...}, prescription: {...} }``.
    # Nullable no DB (Oracle não aceita ``'{}'`` como server_default em JSON);
    # sempre populado pelo Python via ``default=dict``. Resolver trata None.
    pdf_configs: Mapped[dict | None] = mapped_column(JSONType(), nullable=True, default=dict)

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
        UniqueConstraint("scope_type", "scope_id", name="uq_branding_scope"),
        CheckConstraint(
            "scope_type IN ('municipality', 'facility')",
            name="ck_branding_scope_type",
        ),
    )
