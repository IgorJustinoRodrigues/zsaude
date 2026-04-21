"""Interface abstrata para operações dialect-specific.

Cada banco (PG, Oracle) implementa esta interface. O código da aplicação
chama apenas estes métodos — nunca importa de ``sqlalchemy.dialects`` diretamente.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy.sql import Executable


class DialectAdapter(ABC):

    @property
    @abstractmethod
    def name(self) -> str:
        """Nome do dialect: 'postgresql', 'oracle', etc."""

    # ── Tenant Context ───────────────────────────────────────────────────

    @abstractmethod
    async def set_search_path(
        self, conn: AsyncConnection, ibge: str | None,
    ) -> None:
        """Configura schema ativo para o tenant.

        PG: ``SET LOCAL search_path``.
        Oracle: ``ALTER SESSION SET CURRENT_SCHEMA``.
        """

    @abstractmethod
    async def set_session_vars(
        self, conn: AsyncConnection, vars: dict[str, str],
    ) -> None:
        """Define variáveis de sessão (contexto de auditoria/RLS).

        PG: ``set_config(key, val, true)``.
        Oracle: ``DBMS_SESSION.SET_CONTEXT``.
        """

    # ── Upsert ───────────────────────────────────────────────────────────

    @abstractmethod
    def upsert(
        self,
        table: type,
        values: list[dict[str, Any]] | dict[str, Any],
        *,
        index_elements: list[str],
        update_columns: list[str],
        extra_set: dict[str, Any] | None = None,
    ) -> Executable:
        """INSERT ... ON CONFLICT DO UPDATE (PG) ou MERGE INTO (Oracle).

        ``update_columns`` — nomes das colunas a atualizar com o valor do
        registro proposto (``excluded`` no PG, ``src`` no Oracle).
        ``extra_set`` — valores fixos adicionais no UPDATE (ex: ``{"status": "Ativo"}``).
        """

    @abstractmethod
    def upsert_do_nothing(
        self,
        table: type,
        values: list[dict[str, Any]],
    ) -> Executable:
        """INSERT ... ON CONFLICT DO NOTHING (PG) ou MERGE sem UPDATE (Oracle)."""

    async def execute_upsert(
        self,
        session: Any,
        table: type,
        values: list[dict[str, Any]] | dict[str, Any],
        *,
        index_elements: list[str],
        update_columns: list[str],
        extra_set: dict[str, Any] | None = None,
    ) -> None:
        """Executa upsert completo (batch-safe). Override para dialects que não suportam multi-row."""
        stmt = self.upsert(table, values, index_elements=index_elements, update_columns=update_columns, extra_set=extra_set)
        await session.execute(stmt)

    async def execute_upsert_do_nothing(
        self,
        session: Any,
        table: type,
        values: list[dict[str, Any]],
    ) -> None:
        """Executa upsert-do-nothing completo (batch-safe)."""
        stmt = self.upsert_do_nothing(table, values)
        await session.execute(stmt)

    # ── Schema Management ────────────────────────────────────────────────

    @abstractmethod
    async def create_schema(self, conn: AsyncConnection, name: str) -> None:
        """Cria schema/user do tenant. Idempotente."""

    @abstractmethod
    async def drop_schema(
        self, conn: AsyncConnection, name: str, *, cascade: bool = False,
    ) -> None:
        """Remove schema/user do tenant."""

    @abstractmethod
    async def schema_exists(self, conn: AsyncConnection, name: str) -> bool:
        """Verifica se o schema/user existe."""

    # ── Helpers ──────────────────────────────────────────────────────────

    @abstractmethod
    def func_gen_uuid_sql(self) -> str:
        """SQL literal para gerar UUID server-side.

        PG: ``gen_random_uuid()``. Oracle: ``SYS_GUID()``.
        """

    # ── Vetor (reconhecimento facial / embeddings) ───────────────────────

    @abstractmethod
    def vector_cosine_distance_sql(self, column_expr: str, param_name: str) -> str:
        """SQL para distância coseno entre uma coluna vetorial e um parâmetro.

        Retorna uma **expressão** (não statement), já parametrizada.
        Distância coseno: 0 = idêntico, 1 = ortogonal, 2 = oposto.

        - PG (pgvector): ``column <=> CAST(:param AS vector)``.
        - Oracle 23ai:   ``VECTOR_DISTANCE(column, :param, COSINE)``.

        Exemplo::

            sql = adapter.vector_cosine_distance_sql("fe.embedding", "q")
            stmt = text(f"SELECT ... WHERE {sql} <= :max_dist ORDER BY {sql} ASC")
        """

    @abstractmethod
    def create_vector_index_sql(
        self,
        index_name: str,
        table: str,
        column: str,
        *,
        distance: str = "cosine",
    ) -> str:
        """SQL para criar índice de busca vetorial (HNSW / IVF_FLAT).

        Chamado pelo provisioning Oracle e pelas migrations PG. Retorna um
        comando completo ``CREATE ... INDEX ...``.

        ``distance``: ``"cosine"`` (default) ou ``"l2"``.
        """

    # ── Busca textual (case/accent insensitive) ──────────────────────────

    @abstractmethod
    def unaccent_upper_expr(self, column_expr: str) -> str:
        """SQL que retorna o valor da coluna em UPPERCASE e sem acentos.

        Uso típico: ``WHERE {unaccent_upper_expr(col)} LIKE :pattern`` onde
        ``pattern`` já vem em upper + sem acentos. Portável:

        - PG: usa extensão ``unaccent`` → ``UPPER(unaccent(col))``.
        - Oracle: ``UTL_RAW``/``TRANSLATE`` ou ``NLS_UPPER(..., 'NLS_SORT=BINARY_AI')``.
        """
