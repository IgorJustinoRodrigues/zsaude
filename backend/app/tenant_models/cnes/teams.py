"""Equipes (lfces037.txt) e vínculo equipe × profissional (lfces038.txt)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint, text

from sqlalchemy.orm import Mapped, mapped_column

from app.db.types import UUIDType, new_uuid7
from app.tenant_models import TenantBase


class CnesTeam(TenantBase):
    """Equipe (ESF/NASF/etc). Chave natural: (codigo_ibge, codigo_area, sequencial)."""

    __tablename__ = "cnes_teams"
    __table_args__ = (
        UniqueConstraint(
            "codigo_ibge", "codigo_area", "sequencial_equipe",
            name="uq_cnes_team",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)

    codigo_ibge: Mapped[str] = mapped_column(String(6), nullable=False, index=True)
    codigo_area: Mapped[str] = mapped_column(String(4), nullable=False)
    sequencial_equipe: Mapped[str] = mapped_column(String(8), nullable=False)

    id_unidade: Mapped[str] = mapped_column(String(31), nullable=False, index=True)
    tipo_equipe: Mapped[str] = mapped_column(String(2), nullable=False)
    nome_equipe: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")

    competencia_ultima_importacao: Mapped[str] = mapped_column(String(6), nullable=False, server_default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )


class CnesTeamProfessional(TenantBase):
    """Profissional × equipe. Chave: (ibge, area, sequencial, id_profissional, cbo)."""

    __tablename__ = "cnes_team_professionals"
    __table_args__ = (
        UniqueConstraint(
            "codigo_ibge", "codigo_area", "sequencial_equipe",
            "id_profissional", "codigo_cbo",
            name="uq_cnes_team_prof",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=new_uuid7)

    codigo_ibge: Mapped[str] = mapped_column(String(6), nullable=False, index=True)
    codigo_area: Mapped[str] = mapped_column(String(4), nullable=False)
    sequencial_equipe: Mapped[str] = mapped_column(String(8), nullable=False)

    id_profissional: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    id_unidade: Mapped[str] = mapped_column(String(31), nullable=False, index=True)
    codigo_cbo: Mapped[str] = mapped_column(String(6), nullable=False)

    competencia_ultima_importacao: Mapped[str] = mapped_column(String(6), nullable=False, server_default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )
