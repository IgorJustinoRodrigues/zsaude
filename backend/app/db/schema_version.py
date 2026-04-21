"""Versionamento de schema Oracle (substituto do ``alembic_version`` do PG).

Em Postgres cada tabela vive numa revision Alembic rastreada em
``alembic_version``. Em Oracle como as migrations Alembic não rodam,
mantemos um registro paralelo em ``APP.SCHEMA_VERSION``:

- ``id``          — ``'app'`` ou ``'mun_<ibge>'``
- ``fingerprint`` — hash do conjunto de tabelas + seeds aplicados
- ``table_count`` — quantas tabelas o provision criou
- ``applied_at``  — timestamp da última operação
- ``details``     — JSON com metadados (seeds aplicados, counts)

Serve pra:
1. Detectar se um schema foi provisionado vs. se está vazio.
2. Saber se o fingerprint mudou (houve change nos models sem re-provision).
3. Audit trail de quando cada schema foi bootstrapado/atualizado.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import MetaData, Table, text
from sqlalchemy.engine import Connection

from app.core.logging import get_logger

log = get_logger(__name__)


@dataclass
class SchemaRecord:
    id: str
    fingerprint: str
    table_count: int
    applied_at: datetime
    details: dict


def ensure_version_table(conn: Connection) -> None:
    """Cria ``APP.SCHEMA_VERSION`` se não existir. Só Oracle."""
    if conn.dialect.name != "oracle":
        return
    # Usa ALL_TABLES pra saber se tabela existe — user atual precisa ter
    # quota e ser owner do APP.
    row = conn.execute(text(
        "SELECT COUNT(*) FROM all_tables "
        "WHERE owner = 'APP' AND table_name = 'SCHEMA_VERSION'"
    )).scalar()
    if row and row > 0:
        return
    conn.execute(text("""
        CREATE TABLE APP.SCHEMA_VERSION (
            id VARCHAR2(40) PRIMARY KEY,
            fingerprint VARCHAR2(64) NOT NULL,
            table_count NUMBER NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            details CLOB
        )
    """))
    log.info("schema_version_table_created")


def compute_fingerprint(metadata: MetaData) -> str:
    """Hash SHA1 do conjunto (table_name, col_name, col_type) ordenado.

    Muda quando:
    - Tabela adicionada/removida.
    - Coluna adicionada/removida.
    - Tipo de coluna mudou.

    Não muda quando:
    - Só o conteúdo dos dados mudou.
    """
    parts: list[str] = []
    for t in sorted(metadata.sorted_tables, key=lambda x: x.name):
        schema = t.schema or ""
        for c in sorted(t.columns, key=lambda x: x.name):
            parts.append(f"{schema}.{t.name}.{c.name}:{c.type}")
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()
    return digest[:16]


def read_schema_record(conn: Connection, schema_id: str) -> SchemaRecord | None:
    """Lê registro atual. Retorna None se ausente."""
    if conn.dialect.name != "oracle":
        return None
    try:
        row = conn.execute(text(
            "SELECT id, fingerprint, table_count, applied_at, details "
            "FROM APP.SCHEMA_VERSION WHERE id = :i"
        ), {"i": schema_id}).first()
    except Exception:
        # tabela ainda não existe
        return None
    if row is None:
        return None
    details = {}
    if row[4]:
        raw = row[4].read() if hasattr(row[4], "read") else row[4]
        try:
            details = json.loads(raw)
        except (TypeError, ValueError):
            details = {}
    return SchemaRecord(
        id=row[0], fingerprint=row[1], table_count=int(row[2]),
        applied_at=row[3], details=details,
    )


def write_schema_record(
    conn: Connection,
    schema_id: str,
    *,
    fingerprint: str,
    table_count: int,
    details: dict,
) -> None:
    """Upsert do registro via MERGE. Só Oracle."""
    if conn.dialect.name != "oracle":
        return
    ensure_version_table(conn)
    conn.execute(text("""
        MERGE INTO APP.SCHEMA_VERSION t
        USING (SELECT :i AS id FROM dual) src
        ON (t.id = src.id)
        WHEN MATCHED THEN UPDATE SET
            t.fingerprint = :fp,
            t.table_count = :tc,
            t.applied_at = CURRENT_TIMESTAMP,
            t.details = :d
        WHEN NOT MATCHED THEN INSERT (id, fingerprint, table_count, details)
        VALUES (:i, :fp, :tc, :d)
    """), {
        "i": schema_id,
        "fp": fingerprint,
        "tc": table_count,
        "d": json.dumps(details, ensure_ascii=False, default=str),
    })
    log.info(
        "schema_version_recorded",
        schema_id=schema_id,
        fingerprint=fingerprint,
        table_count=table_count,
    )


def list_schemas(conn: Connection) -> list[SchemaRecord]:
    """Lista todos os schemas já provisionados."""
    if conn.dialect.name != "oracle":
        return []
    try:
        rows = conn.execute(text(
            "SELECT id, fingerprint, table_count, applied_at, details "
            "FROM APP.SCHEMA_VERSION ORDER BY applied_at DESC"
        )).all()
    except Exception:
        return []
    out = []
    for row in rows:
        details = {}
        if row[4]:
            raw = row[4].read() if hasattr(row[4], "read") else row[4]
            try:
                details = json.loads(raw)
            except (TypeError, ValueError):
                pass
        out.append(SchemaRecord(
            id=row[0], fingerprint=row[1], table_count=int(row[2]),
            applied_at=row[3], details=details,
        ))
    return out
