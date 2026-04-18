"""Modelos que vivem em cada schema `mun_<ibge>`.

Ao contrário de `app.db.base.Base` (que fixa schema=`app`), aqui a metadata
NÃO tem schema. As tabelas são criadas no `search_path` ativo durante a
migration — que será o schema do município de destino.
"""

from __future__ import annotations

from sqlalchemy import MetaData, String as SAString, event
from sqlalchemy.orm import DeclarativeBase

TENANT_NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class TenantBase(DeclarativeBase):
    """Base para modelos per-município."""
    metadata = MetaData(naming_convention=TENANT_NAMING)


def _register_tenant_oracle_null_fix() -> None:
    """Compat layer Oracle ↔ strings vazias nos models tenant.

    Mesma lógica de ``app.db.base._register_oracle_null_fix``: converte
    ``""`` → ``" "`` antes de INSERT/UPDATE (pra satisfazer ``NOT NULL``)
    e ``None`` → ``""`` após LOAD (pro código Python não precisar checar).
    """

    @event.listens_for(TenantBase, "load", propagate=True)
    def _fix_empty_strings_on_load(target, context):
        mapper = target.__class__.__mapper__
        for col in mapper.columns:
            if isinstance(col.type, SAString) and not col.nullable:
                val = getattr(target, col.key, None)
                if val is None:
                    object.__setattr__(target, col.key, "")

    def _fix_empty_strings_on_write(mapper, connection, target):
        if connection.dialect.name != "oracle":
            return
        for col in mapper.columns:
            if not isinstance(col.type, SAString) or col.nullable:
                continue
            val = getattr(target, col.key, None)
            if val is None or val == "":
                object.__setattr__(target, col.key, " ")

    @event.listens_for(TenantBase, "before_insert", propagate=True)
    def _before_insert(mapper, connection, target):
        _fix_empty_strings_on_write(mapper, connection, target)

    @event.listens_for(TenantBase, "before_update", propagate=True)
    def _before_update(mapper, connection, target):
        _fix_empty_strings_on_write(mapper, connection, target)
