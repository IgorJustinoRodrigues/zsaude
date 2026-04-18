"""Evolução de schema Oracle via diff de metadata ↔ banco.

Em Postgres as mudanças de schema vivem em Alembic. Em Oracle, como as
migrations Alembic são PG-only (SQL cru + extensions), precisamos de um
caminho alternativo: comparar o metadata SQLAlchemy declarado nos models
com o schema real e aplicar ``ALTER TABLE`` pras diferenças.

Suporta hoje:

- ``ADD COLUMN``  — adiciona coluna que existe no model mas não no banco.
- ``DROP COLUMN`` — remove coluna que existe no banco mas não no model
  (opcional, off por default — operação destrutiva).

**Não** suporta ``MODIFY COLUMN`` (mudança de tipo / nullable) — é
arriscado demais sem testes de migração de dados. Mudanças desse tipo
devem ser feitas manualmente via DBA ou migration específica.

Uso::

    from app.db.schema_migrator import evolve_schema
    from app.db.base import Base

    async with engine.begin() as conn:
        result = await conn.run_sync(
            lambda c: evolve_schema(c, Base.metadata, schema_translate={"app": None}),
        )
    # result.added_columns / result.skipped / result.warnings
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
    dry_run: bool = False,
) -> EvolveResult:
    """Compara ``metadata`` com o schema real e aplica ``ALTER TABLE``.

    ``schema_translate``: mapeia schema do metadata → schema real. Em
    Oracle, ``{"app": None}`` faz ``schema="app"`` virar CURRENT_SCHEMA.

    ``allow_drop``: habilita DROP COLUMN pra colunas que sumiram dos models.
    Default False — evita destruir dado por acidente.

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

        # Colunas do model
        model_cols = {c.name.upper(): c for c in table.columns}
        existing_upper = {name.upper() for name in existing}

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

        # DROP COLUMN (opcional)
        if allow_drop:
            extras = existing_upper - set(model_cols.keys())
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
    if "." in real_name:
        owner, name = real_name.split(".", 1)
        rows = conn.execute(
            text(
                "SELECT column_name FROM all_tab_columns "
                "WHERE owner = :o AND table_name = :t"
            ),
            {"o": owner.upper(), "t": name.upper()},
        ).all()
    else:
        rows = conn.execute(
            text(
                "SELECT column_name FROM user_tab_columns "
                "WHERE table_name = :t"
            ),
            {"t": real_name.upper()},
        ).all()
    if not rows:
        return None
    return {r[0] for r in rows}


def _render_add_column_sql(
    conn: Connection, table: Table, col: Any, real_name: str,
) -> str:
    """Gera ``ALTER TABLE ... ADD (...)`` usando o compiler nativo do dialect."""
    column_ddl = str(CreateColumn(col).compile(dialect=conn.dialect))
    return f"ALTER TABLE {real_name} ADD ({column_ddl})"
