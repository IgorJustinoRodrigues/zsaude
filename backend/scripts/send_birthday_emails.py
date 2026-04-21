"""Runner de parabéns.

Chamar a cada 1h via cron/k8s CronJob. Janela de disparo: 08:00-08:59
no fuso de cada município — qualquer rodada dentro da janela pega os
aniversariantes do dia. Idempotência via ``email_send_log``, sem risco
de duplicar.

Uso::

    python -m scripts.send_birthday_emails [--dry-run]

Em dev, rodar fora da janela não manda nada (por design) — pra testar,
use ``--force-now`` com ``--municipality <ibge>`` pra simular.
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.email import NullEmailService, get_email_service
from app.core.logging import get_logger
from app.db.session import sessionmaker
from app.modules.tenants.models import Municipality
from app.modules.users.birthday_service import BirthdayEmailService, _local_now

log = get_logger("scripts.send_birthday_emails")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Dispara parabéns do dia.")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Usa NullEmailService (não envia de verdade) e faz rollback "
             "do banco ao final. Útil pra ver quantos/quem seria atingido.",
    )
    parser.add_argument(
        "--force-now", action="store_true",
        help="Ignora a janela horária e processa todos os municípios "
             "(útil em dev/backfill; em prod use cron às 8h local).",
    )
    parser.add_argument(
        "--municipality",
        help="IBGE do município alvo (quando --force-now, roda só ele).",
    )
    args = parser.parse_args()

    email_service = NullEmailService() if args.dry_run else get_email_service()

    async with sessionmaker()() as session:
        svc = BirthdayEmailService(session, email_service)

        if args.force_now:
            mun_stmt = select(Municipality).where(
                Municipality.archived.is_(False),
            )
            if args.municipality:
                mun_stmt = mun_stmt.where(Municipality.ibge == args.municipality)
            rows = (await session.scalars(mun_stmt)).all()
            now_utc = datetime.now(timezone.utc)
            totals = {"sent": 0, "skipped": 0, "failed": 0, "municipalities": len(rows)}
            for mun in rows:
                today_local = _local_now(mun, now_utc=now_utc).date()
                counts = await svc.dispatch_for_municipality(
                    municipality=mun, today_local=today_local,
                )
                for k, v in counts.items():
                    totals[k] = totals.get(k, 0) + v
                log.info(
                    "birthday_forced",
                    municipality=mun.name, counts=counts, date=today_local.isoformat(),
                )
            if not args.dry_run:
                await session.commit()
            log.info("birthday_done", totals=totals, dry_run=args.dry_run)
        else:
            totals = await svc.run_cycle()
            if not args.dry_run:
                await session.commit()
            log.info("birthday_done", totals=totals, dry_run=args.dry_run)


if __name__ == "__main__":
    asyncio.run(main())
