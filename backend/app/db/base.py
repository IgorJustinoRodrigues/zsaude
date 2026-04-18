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
    """Compat layer Oracle ↔ strings vazias.

    Oracle trata ``''`` como NULL, o que quebra colunas ``NOT NULL``. Aplica
    dois hooks:

    1. **Antes de INSERT/UPDATE**: converte ``""`` → ``" "`` (um espaço) e
       ``None`` → ``" "`` em colunas ``String NOT NULL``. Permite que o
       código que passa strings vazias funcione sem modificação.
    2. **Após o LOAD**: converte ``None`` de volta pra ``""`` (para que
       Python não quebre ao comparar ``value == ""``).

    Resultado: em Oracle, strings vazias viram um espaço no banco (invisível
    em UI que faz ``.strip()``) e NULL é normalizado para string vazia na
    leitura.
    """
    from sqlalchemy import String as SAString

    @event.listens_for(Base, "load", propagate=True)
    def _fix_empty_strings_on_load(target, context):
        mapper = target.__class__.__mapper__
        for col in mapper.columns:
            if isinstance(col.type, SAString) and not col.nullable:
                val = getattr(target, col.key, None)
                if val is None:
                    object.__setattr__(target, col.key, "")

    def _fix_empty_strings_on_write(mapper, connection, target):
        # Só aplica em Oracle.
        if connection.dialect.name != "oracle":
            return
        for col in mapper.columns:
            if not isinstance(col.type, SAString) or col.nullable:
                continue
            val = getattr(target, col.key, None)
            if val is None or val == "":
                object.__setattr__(target, col.key, " ")

    @event.listens_for(Base, "before_insert", propagate=True)
    def _before_insert(mapper, connection, target):
        _fix_empty_strings_on_write(mapper, connection, target)

    @event.listens_for(Base, "before_update", propagate=True)
    def _before_update(mapper, connection, target):
        _fix_empty_strings_on_write(mapper, connection, target)


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
