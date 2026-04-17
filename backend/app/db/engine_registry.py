"""Registry de engines para multi-database.

Gerencia um engine principal (app) e overrides opcionais por município.
Na maioria dos deployments, todos os municípios usam o engine principal.
Overrides são carregados da tabela ``municipality_databases`` na startup.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

log = logging.getLogger(__name__)


class EngineRegistry:
    """Pool de engines: um principal (app) + overrides por tenant."""

    def __init__(self) -> None:
        self._app_engine: AsyncEngine | None = None
        self._tenant_engines: dict[str, AsyncEngine] = {}
        self._app_sessionmaker: async_sessionmaker[AsyncSession] | None = None

    @staticmethod
    def _schema_map(database_url: str) -> dict[str, str | None] | None:
        dialect = database_url.split("+")[0].split(":")[0]
        if dialect == "oracle":
            return {"app": "APP"}
        return None

    def init_app(self, database_url: str, **pool_kwargs: Any) -> None:
        """Inicializa o engine principal da aplicação."""
        schema_map = self._schema_map(database_url)
        if schema_map:
            pool_kwargs.setdefault("execution_options", {})
            pool_kwargs["execution_options"]["schema_translate_map"] = schema_map
        self._app_engine = create_async_engine(database_url, **pool_kwargs)
        self._app_sessionmaker = async_sessionmaker(
            bind=self._app_engine,
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )
        log.info(
            "engine_registry_init",
            extra={"dialect": self._app_engine.dialect.name},
        )

    @property
    def app_engine(self) -> AsyncEngine:
        assert self._app_engine is not None, "EngineRegistry não inicializado. Chame init_app() primeiro."
        return self._app_engine

    @property
    def app_sessionmaker(self) -> async_sessionmaker[AsyncSession]:
        assert self._app_sessionmaker is not None
        return self._app_sessionmaker

    @property
    def app_dialect(self) -> str:
        return self.app_engine.dialect.name

    def tenant_engine(self, ibge: str) -> AsyncEngine:
        """Engine do município. Retorna override se existir, senão app_engine."""
        return self._tenant_engines.get(ibge, self.app_engine)

    def tenant_dialect(self, ibge: str) -> str:
        return self.tenant_engine(ibge).dialect.name

    def has_override(self, ibge: str) -> bool:
        return ibge in self._tenant_engines

    async def register_tenant(
        self,
        ibge: str,
        database_url: str,
        *,
        pool_size: int = 5,
        max_overflow: int = 3,
    ) -> None:
        """Registra engine override para um município."""
        if ibge in self._tenant_engines:
            await self._tenant_engines[ibge].dispose()

        eng = create_async_engine(
            database_url,
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_pre_ping=True,
            pool_recycle=3600,
        )
        self._tenant_engines[ibge] = eng
        log.info(
            "tenant_engine_registered",
            extra={"ibge": ibge, "dialect": eng.dialect.name},
        )

    async def unregister_tenant(self, ibge: str) -> None:
        """Remove engine override de um município."""
        eng = self._tenant_engines.pop(ibge, None)
        if eng is not None:
            await eng.dispose()
            log.info("tenant_engine_unregistered", extra={"ibge": ibge})

    async def load_overrides_from_db(self) -> int:
        """Carrega overrides da tabela municipality_databases na startup.

        Retorna a quantidade de overrides carregados.
        """
        try:
            async with self.app_sessionmaker() as session:
                # Verifica se a tabela existe antes de consultar
                dialect = self.app_dialect
                if dialect == "postgresql":
                    check = await session.execute(text(
                        "SELECT 1 FROM information_schema.tables "
                        "WHERE table_schema = 'app' AND table_name = 'municipality_databases'"
                    ))
                elif dialect == "oracle":
                    check = await session.execute(text(
                        "SELECT 1 FROM all_tables WHERE table_name = 'MUNICIPALITY_DATABASES'"
                    ))
                else:
                    return 0

                if check.scalar() is None:
                    return 0

                from app.modules.tenants.models import Municipality, MunicipalityDatabase
                from app.core.crypto import decrypt_secret

                rows = (await session.execute(
                    select(MunicipalityDatabase, Municipality.ibge)
                    .join(Municipality, Municipality.id == MunicipalityDatabase.municipality_id)
                    .where(MunicipalityDatabase.active.is_(True))
                )).all()

                count = 0
                for mdb, ibge in rows:
                    try:
                        url = decrypt_secret(mdb.connection_url_encrypted)
                        await self.register_tenant(
                            ibge, url, pool_size=mdb.pool_size,
                        )
                        count += 1
                    except Exception:
                        log.exception(
                            "tenant_engine_load_error",
                            extra={"ibge": ibge},
                        )

                return count
        except Exception:
            log.warning("municipality_databases table not available yet, skipping overrides")
            return 0

    @property
    def stats(self) -> dict[str, Any]:
        """Info para endpoints de diagnóstico."""
        return {
            "app_dialect": self.app_dialect,
            "total_overrides": len(self._tenant_engines),
            "overrides": {
                ibge: eng.dialect.name
                for ibge, eng in self._tenant_engines.items()
            },
        }

    async def dispose_all(self) -> None:
        """Libera todos os engines (shutdown)."""
        for eng in self._tenant_engines.values():
            await eng.dispose()
        self._tenant_engines.clear()
        if self._app_engine is not None:
            await self._app_engine.dispose()
            self._app_engine = None
            self._app_sessionmaker = None


# ── Singleton ────────────────────────────────────────────────────────────────

_registry: EngineRegistry | None = None


def get_registry() -> EngineRegistry:
    global _registry
    if _registry is None:
        _registry = EngineRegistry()
    return _registry


def reset_registry() -> None:
    """Para testes."""
    global _registry
    _registry = None
