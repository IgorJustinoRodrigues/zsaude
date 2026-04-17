"""Tipos portáveis e helpers para multi-database (PostgreSQL + Oracle).

- ``UUIDType``: PG UUID nativo / Oracle RAW(16) / fallback CHAR(36).
- ``JSONType``: PG JSONB / Oracle CLOB com serialização JSON / fallback Text.
- ``ArrayAsJSON``: PG ARRAY(String) / Oracle/outros CLOB com lista JSON.
- ``new_uuid7()``: gera UUIDv7 ordenável por tempo.
"""

from __future__ import annotations

import json as _json
import uuid

from sqlalchemy import String, Text
from sqlalchemy.types import CHAR, TypeDecorator

from uuid_utils import uuid7


def new_uuid7() -> uuid.UUID:
    """UUIDv7: ordenável por tempo — ótimo para PK com índices btree."""
    return uuid.UUID(str(uuid7()))


# ── TypeDecorators portáveis ─────────────────────────────────────────────────


class UUIDType(TypeDecorator):
    """UUID portável. PG: UUID nativo. Oracle: RAW(16). Fallback: CHAR(36)."""

    impl = CHAR(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import UUID as PG_UUID

            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        if dialect.name == "oracle":
            from sqlalchemy.dialects.oracle import RAW

            return dialect.type_descriptor(RAW(16))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):  # type: ignore[override]
        if value is None:
            return value
        val = value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
        if dialect.name == "oracle":
            return val.bytes
        if dialect.name == "postgresql":
            return val
        return str(val)

    def process_result_value(self, value, dialect):  # type: ignore[override]
        if value is None:
            return value
        if isinstance(value, uuid.UUID):
            return value
        if isinstance(value, bytes):
            return uuid.UUID(bytes=value)
        return uuid.UUID(str(value))


class JSONType(TypeDecorator):
    """JSON portável. PG: JSONB. Oracle: CLOB + json. Fallback: Text."""

    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import JSONB

            return dialect.type_descriptor(JSONB())
        # Oracle 21c+ tem JSON nativo, mas CLOB é mais seguro para compat.
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value, dialect):  # type: ignore[override]
        if value is None:
            return value
        if dialect.name == "postgresql":
            return value
        return _json.dumps(value, ensure_ascii=False)

    def process_result_value(self, value, dialect):  # type: ignore[override]
        if value is None:
            return value
        if dialect.name == "postgresql":
            return value
        if isinstance(value, (dict, list, int, float, bool)):
            return value
        return _json.loads(value)


class ArrayAsJSON(TypeDecorator):
    """Array portável. PG: ARRAY(String). Outros: CLOB/Text com lista JSON."""

    impl = Text
    cache_ok = True

    def __init__(self, item_type=String(30)):
        super().__init__()
        self._item_type = item_type

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import ARRAY

            return dialect.type_descriptor(ARRAY(self._item_type))
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value, dialect):  # type: ignore[override]
        if value is None:
            return value
        if dialect.name == "postgresql":
            return value
        return _json.dumps(value, ensure_ascii=False)

    def process_result_value(self, value, dialect):  # type: ignore[override]
        if value is None:
            return value
        if isinstance(value, list):
            return value
        return _json.loads(value)
