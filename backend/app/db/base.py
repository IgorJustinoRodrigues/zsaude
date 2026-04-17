"""Base declarativa do SQLAlchemy.

Naming conventions garantem migrations estáveis (evita nomes autogerados
diferentes entre ambientes).
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from sqlalchemy import MetaData, event, func, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

# Schema padrão de tabelas compartilhadas (identidade, diretório, auditoria,
# terminologias). Tabelas locais ao município ficam em schemas mun_<ibge>
# com metadata própria (ver app.db.tenant_schemas).
APP_SCHEMA = "app"


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION, schema=APP_SCHEMA)


def _register_oracle_null_fix() -> None:
    """Oracle trata '' como NULL. Converte None → '' ao carregar strings do ORM."""
    from sqlalchemy import String as SAString
    from sqlalchemy.orm import InstanceEvents

    @event.listens_for(Base, "load", propagate=True)
    def _fix_empty_strings(target, context):
        mapper = target.__class__.__mapper__
        for col in mapper.columns:
            if isinstance(col.type, SAString) and not col.nullable:
                val = getattr(target, col.key, None)
                if val is None:
                    object.__setattr__(target, col.key, "")


# ── Mixins comuns ───────────────────────────────────────────────────────────


TimestampMixinCreatedAt = Annotated[
    datetime,
    mapped_column(server_default=text("CURRENT_TIMESTAMP"), nullable=False),
]
TimestampMixinUpdatedAt = Annotated[
    datetime,
    mapped_column(server_default=text("CURRENT_TIMESTAMP"), onupdate=func.now(), nullable=False),
]


class TimestampedMixin:
    """Adiciona created_at / updated_at com defaults server-side."""

    created_at: Mapped[datetime] = mapped_column(
        server_default=text("CURRENT_TIMESTAMP"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=text("CURRENT_TIMESTAMP"), onupdate=func.now(), nullable=False
    )
