"""Modelos que vivem em cada schema `mun_<ibge>`.

Ao contrário de `app.db.base.Base` (que fixa schema=`app`), aqui a metadata
NÃO tem schema. As tabelas são criadas no `search_path` ativo durante a
migration — que será o schema do município de destino.
"""

from __future__ import annotations

from sqlalchemy import MetaData
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
