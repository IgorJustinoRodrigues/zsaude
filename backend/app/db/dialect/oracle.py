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

    @staticmethod
    def _coerce_value_for_oracle(v: Any, col_type: Any = None) -> Any:
        """Converte tipos Python pros esperados pelo oracledb, ciente do tipo
        da coluna SQLAlchemy (quando disponível).

        Conversões:
        - ``uuid.UUID``           → ``bytes`` (RAW(16)).
        - coluna ``JSONType``     → JSON string (``json.dumps(value)``).
        - coluna ``VectorType``   → ``array.array("f", ...)`` (Oracle VECTOR).
        - ``bool``                → ``int`` (NUMBER(1)).
        - ``list``/``dict`` (sem tipo) → JSON string por heurística.
        """
        import json as _json
        import uuid as _uuid
        import array as _array

        if v is None:
            return v

        # Tipo da coluna tem prioridade sobre tipo Python (ex: bool em
        # coluna JSON vira ``"true"``, não ``1``).
        if col_type is not None:
            try:
                from app.db.types import JSONType, VectorType, ArrayAsJSON
                if isinstance(col_type, (JSONType, ArrayAsJSON)):
                    return _json.dumps(v, ensure_ascii=False)
                if isinstance(col_type, VectorType):
                    if isinstance(v, _array.array):
                        return v
                    return _array.array("f", v)
            except Exception:
                pass

        if isinstance(v, _uuid.UUID):
            return v.bytes
        if isinstance(v, bool):
            return 1 if v else 0
        if isinstance(v, (dict, list)):
            # list/dict em coluna não-JSON (raro) — serializa como fallback.
            return _json.dumps(v, ensure_ascii=False)
        return v

    @staticmethod
    def _column_types(table: type) -> dict[str, Any]:
        """Mapeia nome da coluna → TypeDecorator do model."""
        try:
            tbl = table.__table__  # type: ignore[attr-defined]
            return {c.name: c.type for c in tbl.columns}
        except Exception:
            return {}

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
        col_types = self._column_types(table)
        for row in rows:
            prefixed = {
                f"p_{k.strip('\"')}":
                    self._coerce_value_for_oracle(v, col_types.get(k))
                for k, v in row.items()
            }
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

    # ── Vetor (Oracle 23ai AI Vector Search) ─────────────────────────────

    def vector_cosine_distance_sql(self, column_expr: str, param_name: str) -> str:
        # Oracle 23ai: VECTOR_DISTANCE(v1, v2, metric) — retorna float.
        # Para coseno, retorna o mesmo range do pgvector <=> (0..2).
        return f"VECTOR_DISTANCE({column_expr}, :{param_name}, COSINE)"

    def create_vector_index_sql(
        self,
        index_name: str,
        table: str,
        column: str,
        *,
        distance: str = "cosine",
    ) -> str:
        metric = {"cosine": "COSINE", "l2": "EUCLIDEAN"}[distance]
        # Oracle 23ai IVF (NEIGHBOR PARTITIONS): ANN on-disk, não exige
        # VECTOR_MEMORY_SIZE (que seria necessário para ORGANIZATION INMEMORY
        # NEIGHBOR GRAPH / HNSW). Se o ambiente tiver VECTOR_MEMORY_SIZE
        # configurado, basta trocar a ORGANIZATION por INMEMORY NEIGHBOR GRAPH
        # pra HNSW — performance de build/query similares pra até 100k rows.
        return (
            f"CREATE VECTOR INDEX {index_name} ON {table} ({column}) "
            f"ORGANIZATION NEIGHBOR PARTITIONS DISTANCE {metric} "
            f"WITH TARGET ACCURACY 95"
        )

    # ── Busca textual ────────────────────────────────────────────────────

    def unaccent_upper_expr(self, column_expr: str) -> str:
        # Oracle não tem ``unaccent`` nativo. ``NLS_UPPER`` com
        # ``NLS_SORT=BINARY_AI`` (Accent Insensitive) faz uppercase sem
        # acentos de forma consistente pra português.
        return f"NLS_UPPER({column_expr}, 'NLS_SORT=BINARY_AI')"
