"""Aplica tenant migrations.

Uso:
    # Todos os municípios ativos:
    docker compose exec app python -m scripts.migrate_tenants

    # Um município específico (IBGE):
    docker compose exec app python -m scripts.migrate_tenants --ibge 5208707

    # Incluir arquivados:
    docker compose exec app python -m scripts.migrate_tenants --all
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select

from app.db.session import dispose_engine, sessionmaker
from app.db.tenant_schemas import apply_tenant_migrations, schema_for_municipality
from app.modules.tenants.models import Municipality


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ibge", help="IBGE de um município específico")
    parser.add_argument("--all", action="store_true",
                        help="Inclui municípios arquivados")
    args = parser.parse_args()

    async with sessionmaker()() as session:
        stmt = select(Municipality)
        if args.ibge:
            stmt = stmt.where(Municipality.ibge == args.ibge)
        elif not args.all:
            stmt = stmt.where(Municipality.archived.is_(False))
        muns = list((await session.scalars(stmt)).all())

    if not muns:
        print("Nenhum município encontrado.")
        return

    print(f"Aplicando tenant migrations em {len(muns)} município(s):")
    for m in muns:
        schema = schema_for_municipality(m.ibge)
        print(f"  · {m.name} ({m.state}) → {schema}")
        await apply_tenant_migrations(schema)

    print("Concluído.")
    await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
