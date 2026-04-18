"""Evolução de schema Oracle via diff de metadata ↔ banco.

Em Postgres as mudanças de schema vivem em Alembic. Em Oracle, como as
migrations Alembic são PG-only (SQL cru + extensions), precisamos de um
caminho alternativo: comparar o metadata SQLAlchemy declarado nos models
com o schema real e aplicar ``ALTER TABLE`` pras diferenças.

Suporta:

- ``ADD COLUMN``    — adiciona coluna que existe no model mas não no banco.
- ``DROP COLUMN``   — remove coluna que existe no banco mas não no model
  (opcional, off por default — destrutivo).
- ``MODIFY COLUMN`` — muda tipo/tamanho/nullable de coluna existente
  (opcional, off por default — pode falhar se o dado não couber no tipo
  novo ou se a conversão não for implícita).

Uso::

    from app.db.schema_migrator import evolve_schema
    from app.db.base import Base

    async with engine.begin() as conn:
        result = await conn.run_sync(
            lambda c: evolve_schema(
                c, Base.metadata,
                schema_translate={"app": None},
                allow_modify=True,
            ),
        )
    # result.added_columns / .modified_columns / .skipped / .warnings
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import MetaData, Table, text
from sqlalchemy.engine import Connection
from sqlalchemy.schema import CreateColumn

from app.core.logging import get_logger

log = get_logger(__name__)


@dataclass
class EvolveResult:
    """Relatório do ``evolve_schema``."""

    added_columns: list[str] = field(default_factory=list)
    modified_columns: list[str] = field(default_factory=list)
    dropped_columns: list[str] = field(default_factory=list)
    missing_tables: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def evolve_schema(
    conn: Connection,
    metadata: MetaData,
    *,
    schema_translate: dict[str, str | None] | None = None,
    allow_drop: bool = False,
    allow_modify: bool = False,
    dry_run: bool = False,
) -> EvolveResult:
    """Compara ``metadata`` com o schema real e aplica ``ALTER TABLE``.

    ``schema_translate``: mapeia schema do metadata → schema real. Em
    Oracle, ``{"app": None}`` faz ``schema="app"`` virar CURRENT_SCHEMA.

    ``allow_drop``: habilita DROP COLUMN pra colunas que sumiram dos models.
    Default False — evita destruir dado por acidente.

    ``allow_modify``: habilita MODIFY COLUMN em mudanças de tipo/nullable.
    Default False — mudança pode falhar se dados existentes não couberem
    no tipo novo. Em ambiente novo/dev, ativar é seguro.

    ``dry_run``: só analisa, não executa ALTERs. Útil pra preview em prod.
    """
    dialect = conn.dialect.name
    if dialect != "oracle":
        return EvolveResult(warnings=[
            f"evolve_schema: dialect {dialect!r} não precisa — use Alembic.",
        ])

    result = EvolveResult()
    translate = schema_translate or {}

    # Mapa "nome real no banco" → Table do metadata
    tables_by_realname: dict[str, Table] = {}
    for t in metadata.sorted_tables:
        tables_by_realname[_real_table_name(t, translate)] = t

    for real_name, table in tables_by_realname.items():
        existing = _get_existing_columns(conn, real_name)
        if existing is None:
            result.missing_tables.append(real_name)
            result.warnings.append(
                f"Tabela {real_name!r} não existe no banco — rode "
                "``metadata.create_all`` primeiro."
            )
            continue

        # Colunas do model indexadas por nome uppercase
        model_cols = {c.name.upper(): c for c in table.columns}
        existing_cols = _get_columns_detail(conn, real_name)
        existing_upper = set(existing_cols.keys())

        # ADD COLUMN
        for col_upper, col in model_cols.items():
            if col_upper in existing_upper:
                continue
            ddl = _render_add_column_sql(conn, table, col, real_name)
            if dry_run:
                result.skipped.append(f"[DRY] {ddl}")
            else:
                try:
                    conn.execute(text(ddl))
                    result.added_columns.append(f"{real_name}.{col.name}")
                    log.info("schema_add_column", table=real_name, column=col.name)
                except Exception as e:  # noqa: BLE001
                    result.warnings.append(
                        f"Falha em {ddl}: {type(e).__name__}: {str(e)[:120]}"
                    )

        # MODIFY COLUMN (opcional)
        if allow_modify:
            for col_upper, col in model_cols.items():
                if col_upper not in existing_upper:
                    continue
                existing_info = existing_cols[col_upper]
                diff = _column_diff(conn, col, existing_info)
                if diff is None:
                    continue
                ddl = _render_modify_column_sql(
                    conn, col, real_name, diff, existing_info,
                )
                if dry_run:
                    result.skipped.append(f"[DRY] {ddl}  -- reason: {diff}")
                else:
                    try:
                        conn.execute(text(ddl))
                        result.modified_columns.append(
                            f"{real_name}.{col.name} ({diff})"
                        )
                        log.info(
                            "schema_modify_column",
                            table=real_name, column=col.name, change=diff,
                        )
                    except Exception as e:  # noqa: BLE001
                        result.warnings.append(
                            f"Falha em {ddl}: {type(e).__name__}: {str(e)[:120]}"
                        )

        # DROP COLUMN (opcional)
        if allow_drop:
            extras = existing_upper - set(model_cols.keys())
            # Pula colunas auto-geradas/LOB indexes que não são do app
            extras = {c for c in extras if not c.startswith("SYS_")}
            for col_name in extras:
                ddl = f'ALTER TABLE {real_name} DROP COLUMN "{col_name}"'
                if dry_run:
                    result.skipped.append(f"[DRY] {ddl}")
                else:
                    try:
                        conn.execute(text(ddl))
                        result.dropped_columns.append(f"{real_name}.{col_name}")
                        log.warning("schema_drop_column", table=real_name, column=col_name)
                    except Exception as e:  # noqa: BLE001
                        result.warnings.append(
                            f"Falha em {ddl}: {type(e).__name__}: {str(e)[:120]}"
                        )

    return result


def _real_table_name(table: Table, translate: dict[str, str | None]) -> str:
    """Retorna o nome da tabela como existe no banco Oracle.

    Oracle não tem "schema" separado do user — mapeamos pro user atual.
    """
    schema = table.schema
    if schema in translate:
        schema = translate[schema]
    if schema:
        return f"{schema.upper()}.{table.name.upper()}"
    return table.name.upper()


def _get_existing_columns(conn: Connection, real_name: str) -> set[str] | None:
    """Lista colunas atuais da tabela no Oracle. Retorna ``None`` se não existe."""
    detail = _get_columns_detail(conn, real_name)
    return set(detail.keys()) if detail else None


def _get_columns_detail(conn: Connection, real_name: str) -> dict[str, dict]:
    """Retorna ``{COL_NAME_UPPER: {data_type, data_length, nullable, ...}}``.

    As chaves são sempre **uppercase** pra comparação consistente — colunas
    criadas com aspas (ex: ``"level"``) ficam lowercase no dictionary, mas
    normalizamos aqui pra bater com ``col.name.upper()`` dos models.

    Retorna ``{}`` se a tabela não existe.
    """
    cols = (
        "column_name, data_type, data_length, nullable, "
        "data_precision, data_scale, char_length"
    )
    if "." in real_name:
        owner, name = real_name.split(".", 1)
        rows = conn.execute(
            text(f"SELECT {cols} FROM all_tab_columns "
                 "WHERE owner = :o AND table_name = :t"),
            {"o": owner.upper(), "t": name.upper()},
        ).all()
    else:
        rows = conn.execute(
            text(f"SELECT {cols} FROM user_tab_columns WHERE table_name = :t"),
            {"t": real_name.upper()},
        ).all()
    return {
        (r[0] or "").upper(): {
            "data_type": r[1],
            "data_length": r[2],
            "nullable": r[3],              # 'Y' ou 'N'
            "data_precision": r[4],
            "data_scale": r[5],
            "char_length": r[6],
        }
        for r in rows
    }


def _render_add_column_sql(
    conn: Connection, table: Table, col: Any, real_name: str,  # noqa: ARG001
) -> str:
    """Gera ``ALTER TABLE ... ADD (...)`` usando o compiler nativo do dialect."""
    column_ddl = str(CreateColumn(col).compile(dialect=conn.dialect))
    return f"ALTER TABLE {real_name} ADD ({column_ddl})"


# ── MODIFY COLUMN: diff + DDL ──────────────────────────────────────────────

def _column_type_compiled(conn: Connection, col: Any) -> str:
    """Retorna o tipo compilado pro dialect atual, ex: ``VARCHAR2(200 CHAR)``."""
    return col.type.compile(dialect=conn.dialect)


# Tipos cuja comparação é feita por (data_type exato + tamanho).
_SIMPLE_VARCHAR_TYPES = {"VARCHAR2", "NVARCHAR2", "CHAR", "NCHAR"}
_NUMBER_TYPES = {"NUMBER", "FLOAT", "BINARY_DOUBLE", "BINARY_FLOAT"}
_LOB_TYPES = {"CLOB", "NCLOB", "BLOB"}
_DATE_TYPES = {"DATE", "TIMESTAMP", "TIMESTAMP(6)"}


def _column_diff(conn: Connection, col: Any, existing: dict) -> str | None:
    """Compara a coluna do model com o registro atual no Oracle.

    Retorna uma string descrevendo a diferença real, ou ``None`` se são
    equivalentes. **Conservador**: só gera diff em casos claros onde o
    ALTER provavelmente vai funcionar:

    - **Tamanho de VARCHAR2 mudou** (ex: String(200) → String(400))
    - **NULL ↔ NOT NULL** mudou (apenas se o sentido é consistente)

    Ignora:

    - Mudanças estruturais de tipo (NUMBER↔INTEGER são sinônimos em Oracle;
      mudanças VARCHAR↔NUMBER precisam de migração de dado, requerem DBA).
    - Tipos especiais (VECTOR, JSON, RAW, LOBs) — SQLAlchemy compile pode
      divergir do que o driver reporta.
    """
    existing_type = (existing["data_type"] or "").upper()

    # Tipos complexos: nunca tenta MODIFY (falsos positivos do compiler).
    if existing_type in {"VECTOR", "JSON", "RAW", "LONG RAW", "BLOB", "CLOB", "NCLOB"}:
        return None

    compiled = _column_type_compiled(conn, col).upper()
    if "VECTOR" in compiled or "JSON" in compiled or "RAW" in compiled:
        return None
    if any(t in compiled for t in _LOB_TYPES):
        return None

    changes: list[str] = []

    # Tamanho de VARCHAR2 (só se tipo base é o mesmo).
    if existing_type in _SIMPLE_VARCHAR_TYPES and any(
        t in compiled for t in _SIMPLE_VARCHAR_TYPES
    ):
        new_size = _parse_varchar_size(compiled)
        existing_size = existing["char_length"] or existing["data_length"]
        if new_size and existing_size and new_size != existing_size:
            changes.append(f"length {existing_size}→{new_size}")

    # Nullable: só reporta mudança REAL (N↔Y).
    expected_nullable = "Y" if col.nullable else "N"
    current_nullable = (existing["nullable"] or "").upper()
    if current_nullable and current_nullable != expected_nullable:
        changes.append(f"nullable {current_nullable}→{expected_nullable}")

    return ", ".join(changes) if changes else None


def _parse_varchar_size(compiled_type: str) -> int | None:
    """Extrai o tamanho de um tipo tipo ``VARCHAR2(200 CHAR)`` → 200."""
    import re
    m = re.search(r"\(\s*(\d+)", compiled_type)
    return int(m.group(1)) if m else None


def _render_modify_column_sql(
    conn: Connection,
    col: Any,
    real_name: str,
    diff: str,  # noqa: ARG001
    existing: dict,
) -> str:
    """Gera ``ALTER TABLE X MODIFY (col NEW_TYPE [NOT NULL])``.

    Inclui a cláusula ``NULL``/``NOT NULL`` **apenas** se está mudando —
    Oracle dispara ORA-01442/ORA-01451 se declarar uma constraint que já
    está no estado pedido.
    """
    ddl_type = _column_type_compiled(conn, col)
    col_name = col.name.upper()

    current_nullable = (existing.get("nullable") or "").upper()
    expected_nullable = "Y" if col.nullable else "N"
    if current_nullable == expected_nullable:
        clause = f'"{col_name}" {ddl_type}'
    elif col.nullable:
        clause = f'"{col_name}" {ddl_type} NULL'
    else:
        clause = f'"{col_name}" {ddl_type} NOT NULL'

    return f"ALTER TABLE {real_name} MODIFY ({clause})"
