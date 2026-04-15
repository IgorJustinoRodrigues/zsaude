"""Tipos custom: UUID7 por padrão para chaves."""

from __future__ import annotations

import uuid

from uuid_utils import uuid7


def new_uuid7() -> uuid.UUID:
    """UUIDv7: ordenável por tempo — ótimo para PK com índices btree."""
    return uuid.UUID(str(uuid7()))
