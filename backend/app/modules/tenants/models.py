"""Modelos de tenancy: Municipality, Facility e os acessos do usuário."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedMixin
from app.db.types import JSONType, UUIDType, new_uuid7


# ─── Multi-Database Config ───────────────────────────────────────────────────


class MunicipalityDatabase(Base, TimestampedMixin):
    """Override de conexão por município.

    Quando presente e ``active=True``, o município usa uma conexão própria
    (PG ou Oracle) em vez do banco principal da aplicação.
    """

    __tablename__ = "municipality_databases"

    municipality_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("municipalities.id", ondelete="CASCADE"),
        primary_key=True,
    )
    dialect: Mapped[str] = mapped_column(String(20), nullable=False)
    connection_url_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    pool_size: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("5"))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("1"))


class FacilityType(str, enum.Enum):
    SMS = "SMS"
    UBS = "UBS"
    UPA = "UPA"
    HOSPITAL = "Hospital"
    LAB = "Lab"
    VISA = "VISA"
    POLICLINICA = "Policlínica"
    CEO = "CEO"
    CAPS = "CAPS"
    TRANSPORTES = "Transportes"
    OUTRO = "Outro"


class Municipality(Base, TimestampedMixin):
    __tablename__ = "municipalities"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(2), nullable=False)
    ibge: Mapped[str] = mapped_column(String(7), unique=True, nullable=False)
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"), index=True)

    # Demografia e geolocalização (opcionais).
    population: Mapped[int | None] = mapped_column(Integer, nullable=True)
    center_latitude: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    center_longitude: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    # Polígono do território: lista de [lat, lng]. None = sem desenho.
    territory: Mapped[list | None] = mapped_column(JSONType(), nullable=True)
    # Módulos operacionais habilitados neste município (lista de códigos).
    # None = nunca configurado (tratado como "todos habilitados" no serviço).
    enabled_modules: Mapped[list | None] = mapped_column(JSONType(), nullable=True)

    # Credenciais da integração CadSUS/DATASUS (por município — cada
    # secretaria recebe do DATASUS um usuário no formato
    # CADSUS.SMS.{MUNICIPIO}.{UF}). Sem configurar, cai no fallback da
    # env var global (ou 503 em produção).
    cadsus_user: Mapped[str] = mapped_column(String(100), nullable=False, server_default=" ")
    cadsus_password: Mapped[str] = mapped_column(String(200), nullable=False, server_default=" ")

    # Fuso horário IANA (ex.: "America/Sao_Paulo"). Usado por features
    # time-aware — parabéns enviado às 8h locais, auditoria, agenda.
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default="America/Sao_Paulo",
    )

    __table_args__ = (UniqueConstraint("name", "state", name="uq_municipality_name_state"),)


class Neighborhood(Base, TimestampedMixin):
    """Bairro de um município. Ambos coords e território são opcionais."""

    __tablename__ = "neighborhoods"
    __table_args__ = (
        UniqueConstraint("municipality_id", "name", name="uq_neighborhood_mun_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    municipality_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("municipalities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    population: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    territory: Mapped[list | None] = mapped_column(JSONType(), nullable=True)


class Facility(Base, TimestampedMixin):
    __tablename__ = "facilities"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    municipality_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("municipalities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    short_name: Mapped[str] = mapped_column(String(80), nullable=False)
    type: Mapped[FacilityType] = mapped_column(
        Enum(FacilityType, name="facility_type", native_enum=False, length=20),
        nullable=False,
    )
    cnes: Mapped[str | None] = mapped_column(String(7), nullable=True)
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"), index=True)

    # Subset dos módulos do município habilitados nesta unidade. ``None`` =
    # herda o município. Lista = personalização; intersectada com o
    # ``Municipality.enabled_modules`` na resolução em tempo real.
    enabled_modules: Mapped[list | None] = mapped_column(JSONType(), nullable=True)


class MunicipalityAccess(Base, TimestampedMixin):
    """Vínculo usuário → município."""

    __tablename__ = "municipality_accesses"
    __table_args__ = (UniqueConstraint("user_id", "municipality_id", name="uq_mun_access_user_mun"),)

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    municipality_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(), ForeignKey("municipalities.id", ondelete="CASCADE"), nullable=False, index=True
    )


class FacilityAccess(Base, TimestampedMixin):
    """Vínculo usuário → unidade.

    ``role_id`` é obrigatório — todo acesso tem um perfil que define a base
    de permissões. Overrides por acesso ficam em
    ``facility_access_permission_overrides``.
    ``version`` bumpa quando o acesso ou overrides mudam — usado para
    invalidar o cache de resolução.
    """

    __tablename__ = "facility_accesses"
    __table_args__ = (UniqueConstraint("user_id", "facility_id", name="uq_fac_access_user_fac"),)

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    facility_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(), ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType(),
        ForeignKey("roles.id"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
