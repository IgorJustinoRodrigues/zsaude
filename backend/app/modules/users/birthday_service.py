"""Serviço de envio de parabéns.

Dois tipos de evento:

- **birthday_birth**: aniversário da data de nascimento.
- **birthday_usage**: aniversário da data de cadastro (todo ano).

Regras consolidadas em ``docs/email_system_roadmap.md`` (memória de
projeto):

- Roda às 8h no fuso local do município. Se o sistema cair no horário,
  pula o ano — ``email_send_log`` com ``idempotency_key`` único por
  ``(kind, user_id, year)`` garante.
- Só usuários ativos (``status='Ativo'``) com ``email_verified_at`` set.
- Quando o usuário tem vínculo em múltiplos municípios, emite UM
  e-mail por município COM TEMPLATE customizado + UM genérico cobrindo
  o restante.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from typing import TYPE_CHECKING
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import and_, exists, func, select

from app.core.config import settings
from app.core.email import EmailService
from app.core.logging import get_logger
from app.modules.email_templates.dispatcher import EmailDispatcher
from app.modules.email_templates.models import (
    SYSTEM_SCOPE_ID,
    EmailTemplate,
    TemplateScope,
)
from app.modules.tenants.models import Facility, FacilityAccess, Municipality
from app.modules.users.models import User, UserStatus

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

log = get_logger(__name__)

# Hora-alvo de envio em horário local (sempre 08:00).
BIRTHDAY_HOUR = 8


@dataclass(slots=True)
class BirthdayCandidate:
    user: User
    reference_date: date         # data do aniversário (ano corrente)
    kind: str                    # 'birth' | 'usage'
    years: int | None            # só preenchido pra 'usage' e 'birth' se der
    municipality_ids: list[UUID]  # vínculos atuais


# ─── Helpers de fuso ─────────────────────────────────────────────────────────


def _tz_for(mun: Municipality) -> ZoneInfo:
    try:
        return ZoneInfo(mun.timezone)
    except ZoneInfoNotFoundError:
        log.warning(
            "birthday_invalid_timezone",
            municipality_id=str(mun.id), timezone=mun.timezone,
        )
        return ZoneInfo("America/Sao_Paulo")


def _local_now(mun: Municipality, *, now_utc: datetime) -> datetime:
    return now_utc.astimezone(_tz_for(mun))


def _is_sending_window(
    local_now: datetime, *, hour: int = BIRTHDAY_HOUR,
) -> bool:
    """Retorna True se o relógio local está dentro da janela [hour, hour+1).

    Rodando o job de hora em hora, esse intervalo captura o disparo sem
    duplicar (a idempotency_key cuida do resto).
    """
    return local_now.hour == hour


# ─── Service principal ───────────────────────────────────────────────────────


class BirthdayEmailService:
    def __init__(
        self, session: "AsyncSession", email_service: EmailService,
    ) -> None:
        self.session = session
        self.email_service = email_service

    # ── Seleção de candidatos ──────────────────────────────────────────────

    async def _active_users_with_verified_email(
        self, *, municipality_id: UUID,
    ) -> list[User]:
        """Usuários ativos com e-mail verificado vinculados a este município.

        Vinculação = tem ao menos um FacilityAccess em uma unidade do município.
        """
        stmt = (
            select(User)
            .where(
                User.status == UserStatus.ATIVO,
                User.email_verified_at.is_not(None),
                User.email.is_not(None),
            )
            .join(FacilityAccess, FacilityAccess.user_id == User.id)
            .join(Facility, Facility.id == FacilityAccess.facility_id)
            .where(Facility.municipality_id == municipality_id)
            .distinct()
        )
        rows = await self.session.scalars(stmt)
        return list(rows.all())

    async def _has_municipality_template(
        self, code: str, municipality_id: UUID,
    ) -> bool:
        exists_stmt = select(
            exists().where(
                and_(
                    EmailTemplate.code == code,
                    EmailTemplate.scope_type == TemplateScope.MUNICIPALITY,
                    EmailTemplate.scope_id == municipality_id,
                    EmailTemplate.is_active.is_(True),
                )
            )
        )
        return bool(await self.session.scalar(exists_stmt))

    async def _all_user_municipality_ids(self, user_id: UUID) -> list[UUID]:
        rows = await self.session.scalars(
            select(Facility.municipality_id)
            .join(FacilityAccess, FacilityAccess.facility_id == Facility.id)
            .where(FacilityAccess.user_id == user_id)
            .distinct()
        )
        return list(rows.all())

    # ── Envio ──────────────────────────────────────────────────────────────

    def _first_name(self, user: User) -> str:
        name = (user.social_name or "").strip() or (user.name or "").strip()
        return name.split()[0] if name else ""

    def _age_today(self, user: User, today: date) -> int | None:
        if not user.birth_date:
            return None
        years = today.year - user.birth_date.year
        had_birthday = (today.month, today.day) >= (
            user.birth_date.month, user.birth_date.day,
        )
        return years if had_birthday else years - 1

    def _years_since_signup(self, user: User, today: date) -> int:
        created = user.created_at.date() if hasattr(user.created_at, "date") else user.created_at
        years = today.year - created.year
        had = (today.month, today.day) >= (created.month, created.day)
        return years if had else years - 1

    async def dispatch_for_municipality(
        self, *, municipality: Municipality, today_local: date,
    ) -> dict[str, int]:
        """Emite os parabéns de ``today_local`` pros usuários do município.

        Retorna contagens por status pra métricas.
        """
        counts = {"sent": 0, "skipped": 0, "failed": 0}
        users = await self._active_users_with_verified_email(
            municipality_id=municipality.id,
        )

        for user in users:
            # Aniversário de nascimento (dia/mês batem)
            if user.birth_date and (
                user.birth_date.month, user.birth_date.day,
            ) == (today_local.month, today_local.day):
                res = await self._dispatch_birth(
                    user=user, municipality=municipality, today_local=today_local,
                )
                counts[res] = counts.get(res, 0) + 1

            # Aniversário de uso (data de criação + N anos)
            if user.created_at:
                created_date = (
                    user.created_at.date()
                    if hasattr(user.created_at, "date")
                    else user.created_at
                )
                if (
                    (created_date.month, created_date.day)
                    == (today_local.month, today_local.day)
                    and created_date.year < today_local.year
                ):
                    res = await self._dispatch_usage(
                        user=user, municipality=municipality, today_local=today_local,
                    )
                    counts[res] = counts.get(res, 0) + 1

        return counts

    async def _dispatch_birth(
        self, *, user: User, municipality: Municipality, today_local: date,
    ) -> str:
        """Envia parabéns de nascimento.

        Regra multi-vínculo: se o município tem template customizado,
        envia uma instância com o branding dele. Municípios sem template
        caem num único envio genérico (SYSTEM). Se o usuário tem mais de
        um município E este aqui não tem template, ele pode ser o escolhido
        pra mandar o genérico. Pra evitar duplicatas, só um — o de menor
        UUID — dispara o genérico.
        """
        has_custom = await self._has_municipality_template(
            "birthday_birth", municipality.id,
        )
        if has_custom:
            return await self._do_dispatch(
                user=user, municipality=municipality, today_local=today_local,
                code="birthday_birth", kind="birth", personalized=True,
            )
        # Sem custom: checa se é o município "canônico" pro genérico.
        mun_ids = sorted(await self._all_user_municipality_ids(user.id))
        if not mun_ids or mun_ids[0] != municipality.id:
            # Outro município já vai (ou já foi) disparar o genérico pelo user.
            return "skipped"
        return await self._do_dispatch(
            user=user, municipality=None, today_local=today_local,
            code="birthday_birth", kind="birth", personalized=False,
        )

    async def _dispatch_usage(
        self, *, user: User, municipality: Municipality, today_local: date,
    ) -> str:
        years = self._years_since_signup(user, today_local)
        if years <= 0:
            return "skipped"
        has_custom = await self._has_municipality_template(
            "birthday_usage", municipality.id,
        )
        if has_custom:
            return await self._do_dispatch(
                user=user, municipality=municipality, today_local=today_local,
                code="birthday_usage", kind="usage", personalized=True,
                years=years,
            )
        mun_ids = sorted(await self._all_user_municipality_ids(user.id))
        if not mun_ids or mun_ids[0] != municipality.id:
            return "skipped"
        return await self._do_dispatch(
            user=user, municipality=None, today_local=today_local,
            code="birthday_usage", kind="usage", personalized=False,
            years=years,
        )

    async def _do_dispatch(
        self,
        *,
        user: User,
        municipality: Municipality | None,
        today_local: date,
        code: str,
        kind: str,
        personalized: bool,
        years: int | None = None,
    ) -> str:
        if not user.email:
            return "skipped"

        first_name = self._first_name(user)
        context: dict = {
            "app_name": settings.email_from_name,
            "user_name": user.social_name or user.name or "",
            "user_first_name": first_name,
            "municipality_name": municipality.name if municipality else "",
        }
        if code == "birthday_birth":
            age = self._age_today(user, today_local)
            context["age"] = age if age is not None else ""
        elif code == "birthday_usage":
            context["years"] = years

        # Chave de idempotência: (código + user + ano + município alvo).
        # Pra "personalized=False" usamos "*" pra não colidir com entry do mesmo
        # user em outro município caso o cenário mude no futuro.
        scope_tag = str(municipality.id) if municipality else "generic"
        idem = f"{code}:{user.id}:{today_local.year}:{scope_tag}"

        result = await EmailDispatcher(self.session, self.email_service).send(
            code=code,
            to=user.email,
            context=context,
            user_id=user.id,
            municipality_id=municipality.id if personalized and municipality else None,
            idempotency_key=idem,
        )
        return result.status

    # ── Entrada do runner ───────────────────────────────────────────────────

    async def run_cycle(self, *, now_utc: datetime | None = None) -> dict:
        """Percorre todos os municípios, dispara onde for 8h local.

        Retorna resumo agregado.
        """
        now_utc = now_utc or datetime.now(timezone.utc)
        munnrows = await self.session.scalars(
            select(Municipality).where(Municipality.archived.is_(False))
        )
        totals = {"sent": 0, "skipped": 0, "failed": 0, "municipalities": 0}
        for mun in munnrows.all():
            local = _local_now(mun, now_utc=now_utc)
            if not _is_sending_window(local):
                continue
            totals["municipalities"] += 1
            counts = await self.dispatch_for_municipality(
                municipality=mun, today_local=local.date(),
            )
            for k, v in counts.items():
                totals[k] = totals.get(k, 0) + v
        return totals
