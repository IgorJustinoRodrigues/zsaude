"""Adapter Oracle.

O Oracle usa conceitos diferentes do PostgreSQL:
- Schema = User (cada tenant é um user Oracle).
- Variáveis de sessão via ``DBMS_SESSION.SET_CONTEXT`` + Application Context.
- Upsert via ``MERGE INTO ... USING ... ON ... WHEN MATCHED / NOT MATCHED``.
- MERGE opera em uma row por vez (sem multi-row VALUES como PG ON CONFLICT).

Para batch upserts, os callers devem iterar e executar um MERGE por row,
ou usar ``executemany`` via o driver oracledb.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy.sql import Executable

from app.db.dialect.base import DialectAdapter


class OracleAdapter(DialectAdapter):

    @property
    def name(self) -> str:
        return "oracle"

    # ── Tenant Context ───────────────────────────────────────────────────

    async def set_search_path(self, conn: AsyncConnection, ibge: str | None) -> None:
        schema = f"MUN_{ibge}" if ibge else "APP"
        await conn.exec_driver_sql(
            f'ALTER SESSION SET CURRENT_SCHEMA = "{schema}"',
        )

    async def set_session_vars(self, conn: AsyncConnection, vars: dict[str, str]) -> None:
        for key, val in vars.items():
            await conn.exec_driver_sql(
                "BEGIN ZSAUDE.ZSAUDE_CTX_PKG.set_val(:k, :v); END;",
                {"k": key, "v": val},
            )

    # ── Upsert ───────────────────────────────────────────────────────────

    @staticmethod
    def _qtbl(name: str) -> str:
        """Quota nome de tabela Oracle (uppercase, sem aspas = Oracle default)."""
        return name.strip('"').upper()

    # Oracle reserved words that need quoting (lowercase)
    _RESERVED = frozenset({
        "resource", "comment", "order", "group", "table", "index", "type",
        "user", "role", "session", "level", "size", "start", "end", "date",
        "number", "mode", "option", "check", "constraint", "primary",
    })

    @classmethod
    def _qcol(cls, name: str) -> str:
        """Nome de coluna Oracle. Palavras reservadas quotadas lowercase, resto UPPERCASE."""
        clean = name.strip('"')
        if clean.lower() in cls._RESERVED:
            return f'"{clean}"'
        return clean.upper()

    def _build_merge_sql(
        self,
        table_name: str,
        all_cols: list[str],
        index_elements: list[str],
        update_columns: list[str],
        extra_set: dict[str, Any] | None = None,
    ) -> str:
        """Constrói SQL MERGE INTO para uma row (bind params com :col)."""
        qc = self._qcol
        tbl = self._qtbl(table_name)
        # Prefix bind params with 'p_' to avoid Oracle reserved word conflicts
        bp = {c: f"p_{c.strip('\"')}" for c in all_cols}
        src_select = ", ".join(f":{bp[c]} AS {qc(c)}" for c in all_cols)
        on_clause = " AND ".join(f"t.{qc(c)} = src.{qc(c)}" for c in index_elements)

        update_parts = [f"t.{qc(c)} = src.{qc(c)}" for c in update_columns]
        if extra_set:
            for k, v in extra_set.items():
                if isinstance(v, str):
                    update_parts.append(f"t.{qc(k)} = '{v}'")
                elif isinstance(v, bool):
                    update_parts.append(f"t.{qc(k)} = {1 if v else 0}")
                else:
                    update_parts.append(f"t.{qc(k)} = {v}")
        update_set = ", ".join(update_parts)

        insert_cols = ", ".join(qc(c) for c in all_cols)
        insert_vals = ", ".join(f"src.{qc(c)}" for c in all_cols)

        sql = f"MERGE INTO {tbl} t "
        sql += f"USING (SELECT {src_select} FROM dual) src "
        sql += f"ON ({on_clause}) "
        if update_set:
            sql += f"WHEN MATCHED THEN UPDATE SET {update_set} "
        sql += f"WHEN NOT MATCHED THEN INSERT ({insert_cols}) VALUES ({insert_vals})"

        return sql

    def upsert(
        self,
        table: type,
        values: list[dict[str, Any]] | dict[str, Any],
        *,
        index_elements: list[str],
        update_columns: list[str],
        extra_set: dict[str, Any] | None = None,
    ) -> Executable:
        rows = values if isinstance(values, list) else [values]
        if not rows:
            raise ValueError("upsert requires at least one row")

        tbl = table.__tablename__  # type: ignore[attr-defined]
        all_cols = list(rows[0].keys())

        sql = self._build_merge_sql(tbl, all_cols, index_elements, update_columns, extra_set)

        prefixed_row = {f"p_{k.strip('\"')}": v for k, v in rows[0].items()}
        return text(sql).bindparams(**prefixed_row)

    async def execute_upsert(
        self, session: Any, table: type,
        values: list[dict[str, Any]] | dict[str, Any],
        *, index_elements: list[str], update_columns: list[str],
        extra_set: dict[str, Any] | None = None,
    ) -> None:
        """Oracle: executa MERGE row-by-row (não suporta multi-row VALUES)."""
        rows = values if isinstance(values, list) else [values]
        if not rows:
            return
        tbl = table.__tablename__  # type: ignore[attr-defined]
        all_cols = list(rows[0].keys())
        sql = self._build_merge_sql(tbl, all_cols, index_elements, update_columns, extra_set)
        stmt = text(sql)
        for row in rows:
            prefixed = {f"p_{k.strip('\"')}": v for k, v in row.items()}
            await session.execute(stmt, prefixed)

    async def execute_upsert_do_nothing(
        self, session: Any, table: type, values: list[dict[str, Any]],
    ) -> None:
        """Oracle: executa MERGE do-nothing row-by-row."""
        for row in values:
            stmt = self.upsert_do_nothing(table, [row])
            await session.execute(stmt)

    def upsert_do_nothing(
        self, table: type, values: list[dict[str, Any]],
    ) -> Executable:
        """MERGE sem WHEN MATCHED — insere apenas se não existir."""
        if not values:
            raise ValueError("upsert_do_nothing requires at least one row")

        tbl = table.__tablename__.upper()  # type: ignore[attr-defined]
        row = values[0]
        all_cols = list(row.keys())

        q = self._q
        bp = {c: f"p_{c.strip('\"')}" for c in all_cols}
        src_select = ", ".join(f":{bp[c]} AS {q(c)}" for c in all_cols)
        insert_cols = ", ".join(qc(c) for c in all_cols)
        insert_vals = ", ".join(f"src.{qc(c)}" for c in all_cols)

        on_clause = f't."id" = src."id"'

        sql = (
            f"MERGE INTO {tbl} t "
            f"USING (SELECT {src_select} FROM dual) src "
            f"ON ({on_clause}) "
            f"WHEN NOT MATCHED THEN INSERT ({insert_cols}) VALUES ({insert_vals})"
        )

        prefixed_row = {f"p_{k.strip('\"')}": v for k, v in row.items()}
        return text(sql).bindparams(**prefixed_row)

    # ── Schema Management ────────────────────────────────────────────────

    async def create_schema(self, conn: AsyncConnection, name: str) -> None:
        """Cria user Oracle (schema = user). Idempotente."""
        exists = await self.schema_exists(conn, name)
        if not exists:
            upper = name.upper()
            await conn.exec_driver_sql(
                f'CREATE USER "{upper}" IDENTIFIED BY "zsaude_tenant" '
                f"DEFAULT TABLESPACE users QUOTA UNLIMITED ON users",
            )
            await conn.exec_driver_sql(
                f'GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, '
                f'CREATE VIEW, CREATE PROCEDURE TO "{upper}"',
            )

    async def drop_schema(
        self, conn: AsyncConnection, name: str, *, cascade: bool = False,
    ) -> None:
        exists = await self.schema_exists(conn, name)
        if exists:
            suffix = " CASCADE" if cascade else ""
            await conn.exec_driver_sql(f'DROP USER "{name.upper()}"{suffix}')

    async def schema_exists(self, conn: AsyncConnection, name: str) -> bool:
        result = await conn.exec_driver_sql(
            "SELECT 1 FROM all_users WHERE username = :n",
            {"n": name.upper()},
        )
        return result.scalar() is not None

    # ── Helpers ──────────────────────────────────────────────────────────

    def func_gen_uuid_sql(self) -> str:
        return "SYS_GUID()"
