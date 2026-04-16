"""Regenera embeddings faciais dos pacientes com foto ativa.

Uso:
    # Um município específico (IBGE):
    docker compose exec app python -m scripts.face_reindex --ibge 5208707

    # Todos os municípios ativos (pode demorar):
    docker compose exec app python -m scripts.face_reindex --all

    # Reindexar mesmo os que já têm embedding (force):
    docker compose exec app python -m scripts.face_reindex --ibge 5208707 --force

O script exige que o modelo InsightFace já esteja baixado (primeira
execução baixa ~320 MB no volume persistente).
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select, text

from app.db.session import dispose_engine, sessionmaker
from app.db.tenant_schemas import schema_for_municipality, search_path_for
from app.modules.hsp import face_service
from app.modules.tenants.models import Municipality


async def reindex_municipality(ibge: str, name: str, state: str, force: bool) -> None:
    schema = schema_for_municipality(ibge)
    print(f"\n  · {name} ({state}) → {schema}")
    async with sessionmaker()() as session:
        await session.execute(text(f"SET LOCAL search_path = {search_path_for(ibge)}"))
        status = await face_service.reindex_all(session, force=force)
        await session.commit()
        print(
            f"    total={status.total}  ok={status.enrolled}  "
            f"sem_rosto={status.no_face}  erros={status.errors}"
        )


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ibge", help="IBGE de um município específico")
    parser.add_argument("--all", action="store_true",
                        help="Processa todos os municípios ativos")
    parser.add_argument("--force", action="store_true",
                        help="Recalcula embeddings mesmo para pacientes já indexados")
    args = parser.parse_args()

    if not args.ibge and not args.all:
        parser.error("informe --ibge ou --all")

    async with sessionmaker()() as session:
        stmt = select(Municipality)
        if args.ibge:
            stmt = stmt.where(Municipality.ibge == args.ibge)
        else:
            stmt = stmt.where(Municipality.archived.is_(False))
        muns = list((await session.scalars(stmt)).all())

    if not muns:
        print("Nenhum município encontrado.")
        return

    print(f"Reindexando embeddings em {len(muns)} município(s)")
    if args.force:
        print("  (modo --force: recalcula todos, mesmo os já indexados)")
    for m in muns:
        try:
            await reindex_municipality(m.ibge, m.name, m.state, args.force)
        except Exception as e:  # noqa: BLE001
            print(f"    ERRO: {e}")

    print("\nConcluído.")
    await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
