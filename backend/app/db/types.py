"""Tipos SQLAlchemy portáveis, mapeando para o tipo **nativo** de cada banco.

Zero gambiarra: cada tipo delega à implementação nativa do Postgres ou
Oracle, preservando operators, índices e performance. Lista de mapeamentos:

=====================  =============================  ==================================
Tipo abstrato          PostgreSQL                     Oracle 23ai
=====================  =============================  ==================================
``UUIDType``           ``UUID`` (16 bytes)            ``RAW(16)`` (16 bytes)
``JSONType``           ``JSONB``                      ``JSON`` (OSON binário, 21c+)
``ArrayAsJSON``        ``ARRAY(item)``                ``JSON`` (lista JSON nativa)
``VectorType(N)``      ``vector(N)`` (pgvector)       ``VECTOR(N, FLOAT32)`` (23ai)
=====================  =============================  ==================================

Todos os operators nativos continuam disponíveis: em PG pgvector ``<=>``,
``<->``; em Oracle ``VECTOR_DISTANCE``, ``COSINE_DISTANCE``; em PG JSONB
``@>``, ``?``, índices GIN; em Oracle JSON_VALUE/JSON_QUERY + função
``JSON_EXISTS``.

Como as APIs de similaridade diferem entre os bancos (``<=>`` vs
``VECTOR_DISTANCE``), use ``app/db/dialect/*`` pra gerar o SQL certo — não
misture operators direto no código.

``new_uuid7()`` gera UUIDv7 (ordenável por tempo) — PK ideal pra índices
btree, reduz fragmentação.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import String, Text
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.types import CHAR, TypeDecorator

from uuid_utils import uuid7


def new_uuid7() -> uuid.UUID:
    """Gera UUIDv7: ordenável por tempo (milissegundos), ideal pra PK."""
    return uuid.UUID(str(uuid7()))


# ── UUID ────────────────────────────────────────────────────────────────────

class UUIDType(TypeDecorator):
    """UUID com tipo nativo em cada banco.

    - **PostgreSQL**: ``UUID`` (16 bytes, tipo dedicado).
    - **Oracle**:     ``RAW(16)`` (16 bytes, equivalente direto).
    - **Fallback**:   ``CHAR(36)`` (representação string).

    O driver cuida da conversão; no Python o valor é sempre ``uuid.UUID``.
    """

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
            return None
        val = value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
        if dialect.name == "oracle":
            return val.bytes  # RAW(16)
        if dialect.name == "postgresql":
            return val
        return str(val)

    def process_result_value(self, value, dialect):  # type: ignore[override]
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        if isinstance(value, bytes):
            return uuid.UUID(bytes=value)
        return uuid.UUID(str(value))


# ── JSON ────────────────────────────────────────────────────────────────────

class JSONType(TypeDecorator):
    """JSON com tipo nativo em cada banco.

    - **PostgreSQL**: ``JSONB`` (binário indexado, operators ``@>``, ``?``,
      índices GIN).
    - **Oracle 21c+**: ``JSON`` (OSON binário, operators ``JSON_VALUE``,
      ``JSON_QUERY``, ``JSON_EXISTS``).
    - **Fallback**:    ``TEXT`` com serialização manual.

    O driver do Oracle ``oracledb`` converte ``dict``/``list`` Python pra
    OSON e vice-versa automaticamente — não faz serialização no Python.
    """

    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import JSONB
            return dialect.type_descriptor(JSONB())
        if dialect.name == "oracle":
            # Render DDL como JSON nativo via @compiles abaixo.
            return dialect.type_descriptor(_OracleJSON())
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value, dialect):  # type: ignore[override]
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value  # driver asyncpg aceita dict/list direto em JSONB
        # Oracle 23ai JSON aceita VARCHAR2/CLOB com JSON válido e converte
        # pra OSON nativo internamente. Serializar evita ORA-01484 (array
        # binding requer PL/SQL).
        import json as _json
        return _json.dumps(value, ensure_ascii=False)

    def process_result_value(self, value, dialect):  # type: ignore[override]
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        if isinstance(value, (dict, list, int, float, bool)):
            return value
        import json as _json
        return _json.loads(value)


class _OracleJSON(TypeDecorator):
    """Tipo interno que renderiza como ``JSON`` nativo no DDL do Oracle."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):  # type: ignore[override]
        if value is None or isinstance(value, str):
            return value
        import json as _json
        return _json.dumps(value, ensure_ascii=False)


@compiles(_OracleJSON, "oracle")
def _render_oracle_json(element: Any, compiler: Any, **kw: Any) -> str:
    return "JSON"


# ── Array como JSON nativo ──────────────────────────────────────────────────

class ArrayAsJSON(TypeDecorator):
    """Array de valores simples com tipo nativo em cada banco.

    - **PostgreSQL**: ``ARRAY(item_type)`` (nativo).
    - **Oracle 21c+**: ``JSON`` nativo (lista JSON, usa o mesmo backend OSON).

    Oracle não tem tipo ``ARRAY`` relacional; a forma idiomática 21c+ é
    ``JSON`` (lista), que mantém performance e permite ``JSON_TABLE`` pra
    explodir em linhas quando precisar.
    """

    impl = Text
    cache_ok = True

    def __init__(self, item_type: Any = String(30)) -> None:
        super().__init__()
        self._item_type = item_type

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import ARRAY
            return dialect.type_descriptor(ARRAY(self._item_type))
        if dialect.name == "oracle":
            return dialect.type_descriptor(_OracleJSON())
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value, dialect):  # type: ignore[override]
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        # Oracle JSON aceita VARCHAR2/CLOB com JSON válido.
        import json as _json
        return _json.dumps(value, ensure_ascii=False)

    def process_result_value(self, value, dialect):  # type: ignore[override]
        if value is None:
            return None
        if isinstance(value, list):
            return value
        import json as _json
        return _json.loads(value)


# ── Vector (reconhecimento facial, embeddings) ──────────────────────────────

class VectorType(TypeDecorator):
    """Vetor de floats com tipo nativo em cada banco.

    - **PostgreSQL**: ``vector(N)`` via extensão ``pgvector``. Operators
      ``<=>`` (cosine), ``<->`` (L2); índices HNSW e IVFFLAT.
    - **Oracle 23ai**: ``VECTOR(N, FLOAT32)`` (AI Vector Search nativo).
      Funções ``VECTOR_DISTANCE``, ``COSINE_DISTANCE``; índices HNSW e
      IVF_FLAT via ``CREATE VECTOR INDEX``.

    Para busca por similaridade, **não escreva o operator direto no SQL**
    — use ``app/db/dialect/*.vector_cosine_distance_sql()`` pra gerar o
    SQL correto por dialeto.
    """

    # impl é um tipo qualquer — load_dialect_impl substitui pelo nativo
    # em tempo de compilação.
    impl = Text
    cache_ok = True

    def __init__(self, dim: int) -> None:
        super().__init__()
        self._dim = dim

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if dialect.name == "postgresql":
            from pgvector.sqlalchemy import Vector as PGVector
            return dialect.type_descriptor(PGVector(self._dim))
        if dialect.name == "oracle":
            from sqlalchemy.dialects.oracle import VECTOR, VectorStorageFormat
            return dialect.type_descriptor(
                VECTOR(dim=self._dim, storage_format=VectorStorageFormat.FLOAT32),
            )
        raise NotImplementedError(
            "VectorType requer PostgreSQL (pgvector) ou Oracle 23ai (AI Vector Search).",
        )

    def process_bind_param(self, value, dialect):  # type: ignore[override]
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value  # pgvector aceita list[float]
        # Oracle ``oracledb``: o VECTOR aceita ``array.array`` (ou bytes
        # float32 LE), mas ``list[float]`` é interpretada como array PL/SQL
        # e causa ORA-01484 em executemany. Converter pra ``array.array``
        # resolve o binding.
        import array as _array
        if isinstance(value, _array.array):
            return value
        return _array.array("f", value)

    def process_result_value(self, value, dialect):  # type: ignore[override]
        if value is None:
            return None
        if isinstance(value, (list, tuple)):
            return list(value)
        # oracledb retorna array.array("f", ...); converte pra list pra API
        # estável no app (list[float]).
        try:
            return list(value)
        except TypeError:
            return value
