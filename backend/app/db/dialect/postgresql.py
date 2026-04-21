"""Adapter PostgreSQL — implementação de referência."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy.sql import Executable

from app.db.dialect.base import DialectAdapter


class PostgreSQLAdapter(DialectAdapter):

    @property
    def name(self) -> str:
        return "postgresql"

    # ── Tenant Context ───────────────────────────────────────────────────

    async def set_search_path(self, conn: AsyncConnection, ibge: str | None) -> None:
        if ibge:
            path = f'"mun_{ibge}", "app", "public"'
        else:
            path = '"app", "public"'
        await conn.exec_driver_sql(f"SET LOCAL search_path = {path}")

    async def set_session_vars(self, conn: AsyncConnection, vars: dict[str, str]) -> None:
        for key, val in vars.items():
            await conn.exec_driver_sql(
                "SELECT set_config($1, $2, true)", (key, val),
            )

    # ── Upsert ───────────────────────────────────────────────────────────

    def upsert(
        self,
        table: type,
        values: list[dict[str, Any]] | dict[str, Any],
        *,
        index_elements: list[str],
        update_columns: list[str],
        extra_set: dict[str, Any] | None = None,
    ) -> Executable:
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        stmt = pg_insert(table).values(values)
        set_dict: dict[str, Any] = {col: stmt.excluded[col] for col in update_columns}
        if extra_set:
            set_dict.update(extra_set)
        return stmt.on_conflict_do_update(
            index_elements=index_elements,
            set_=set_dict,
        )

    def upsert_do_nothing(
        self, table: type, values: list[dict[str, Any]],
    ) -> Executable:
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        return pg_insert(table).values(values).on_conflict_do_nothing()

    # ── Schema Management ────────────────────────────────────────────────

    async def create_schema(self, conn: AsyncConnection, name: str) -> None:
        await conn.exec_driver_sql(f'CREATE SCHEMA IF NOT EXISTS "{name}"')

    async def drop_schema(
        self, conn: AsyncConnection, name: str, *, cascade: bool = False,
    ) -> None:
        suffix = " CASCADE" if cascade else ""
        await conn.exec_driver_sql(f'DROP SCHEMA IF EXISTS "{name}"{suffix}')

    async def schema_exists(self, conn: AsyncConnection, name: str) -> bool:
        result = await conn.exec_driver_sql(
            "SELECT 1 FROM information_schema.schemata WHERE schema_name = $1",
            (name,),
        )
        return result.scalar() is not None

    # ── Helpers ──────────────────────────────────────────────────────────

    def func_gen_uuid_sql(self) -> str:
        return "gen_random_uuid()"

    # ── Vetor ────────────────────────────────────────────────────────────

    def vector_cosine_distance_sql(self, column_expr: str, param_name: str) -> str:
        # pgvector: operator `<=>` cosine. CAST necessário pra interpretar o
        # bind como vector em vez de text.
        return f"({column_expr} <=> CAST(:{param_name} AS vector))"

    def create_vector_index_sql(
        self,
        index_name: str,
        table: str,
        column: str,
        *,
        distance: str = "cosine",
    ) -> str:
        ops = {"cosine": "vector_cosine_ops", "l2": "vector_l2_ops"}[distance]
        return (
            f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} "
            f"USING hnsw ({column} {ops}) WITH (m = 16, ef_construction = 64)"
        )

    # ── Busca textual ────────────────────────────────────────────────────

    def unaccent_upper_expr(self, column_expr: str) -> str:
        # Requer extensão ``unaccent`` instalada (migration 0011 cria).
        return f"UPPER(unaccent({column_expr}))"
