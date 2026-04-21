"""Modelos do RBAC (Role-Based Access Control) com herança dinâmica.

Hierarquia:
- **Permission** — catálogo somente-leitura, sincronizado do registry no código.
- **Role** — perfil. Escopo SYSTEM (seed, global) ou MUNICIPALITY (por município).
  Pode herdar de outro role (``parent_id``) — a resolução é dinâmica, então
  mudar o pai propaga para os filhos que não sobrescreveram a permissão.
- **RolePermission** — grant/deny explícito de uma permissão no role. Ausência
  de linha = herda do pai. ``granted=true`` concede, ``granted=false`` nega
  explicitamente (mesmo que o pai conceda).
- **FacilityAccessPermissionOverride** — override por acesso específico de
  um usuário em uma unidade. Mesma semântica de grant/deny/ausência.

Precedência (mais específico vence): override do acesso > role mais filho >
role pai > ... > role SYSTEM base. Default = deny.
"""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Boolean,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedMixin
from app.db.types import UUIDType, new_uuid7


class RoleScope(str, enum.Enum):
    SYSTEM = "SYSTEM"
    MUNICIPALITY = "MUNICIPALITY"


class Permission(Base, TimestampedMixin):
    """Catálogo read-only. Source of truth é o registry em ``app.core.permissions``."""

    __tablename__ = "permissions"

    code: Mapped[str] = mapped_column(String(100), primary_key=True)
    module: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    resource: Mapped[str] = mapped_column(String(60), nullable=False)
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)


class Role(Base, TimestampedMixin):
    __tablename__ = "roles"
    __table_args__ = (
        # SYSTEM roles têm code único globalmente; MUNICIPALITY roles têm code
        # único dentro do município. Enforce via partial unique indexes abaixo.
        Index(
            "uq_role_code_system",
            "code",
            unique=True,
            postgresql_where=text("municipality_id IS NULL"),
        ),
        Index(
            "uq_role_code_municipal",
            "code",
            "municipality_id",
            unique=True,
            postgresql_where=text("municipality_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(), primary_key=True, default=new_uuid7
    )
    code: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    scope: Mapped[RoleScope] = mapped_column(
        Enum(RoleScope, name="role_scope", native_enum=False, length=20),
        nullable=False,
        index=True,
    )
    municipality_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(),
        ForeignKey("municipalities.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType(),
        ForeignKey("roles.id"),
        nullable=True,
        index=True,
    )

    is_system_base: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("0")
    )
    archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("0"), index=True
    )
    # bumpa em qualquer mudança de permissões/parent — usado para invalidar
    # o cache de resolução em Valkey.
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))


class RolePermission(Base, TimestampedMixin):
    """Grant/deny explícito. Ausência de linha = herda do pai."""

    __tablename__ = "role_permissions"

    role_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    permission_code: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("permissions.code", ondelete="CASCADE"),
        primary_key=True,
    )
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)


class FacilityAccessPermissionOverride(Base, TimestampedMixin):
    """Override por acesso: personaliza uma permissão para um usuário específico
    em uma unidade específica, sem mexer no role."""

    __tablename__ = "facility_access_permission_overrides"
    __table_args__ = (
        UniqueConstraint(
            "facility_access_id",
            "permission_code",
            name="uq_fac_access_override",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(), primary_key=True, default=new_uuid7
    )
    facility_access_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("facility_accesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    permission_code: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("permissions.code", ondelete="CASCADE"),
        nullable=False,
    )
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)


class CboAbility(Base):
    """Mapeamento CBO → direito profissional (ability).

    O catálogo de ``ability_code`` vive em
    ``app.core.cbo_abilities.registry`` (código), mesmo padrão de
    ``permissions``. Esta tabela só associa o CBO (vindo do CNES) às
    abilities declaradas. Ação clínica passa por dois gates:

        role_permission(X) AND cbo_has_ability(Y)
    """

    __tablename__ = "cbo_abilities"

    cbo_id: Mapped[str] = mapped_column(String(6), primary_key=True)
    ability_code: Mapped[str] = mapped_column(String(100), primary_key=True)
