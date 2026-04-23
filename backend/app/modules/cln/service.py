"""Serviços do módulo Clínico.

``ClnConfigService`` — leitura/escrita/efetiva da config (mesmo padrão
de ``RecConfigService``).

``ClnService`` — filas (triagem e atendimento) e ações do fluxo
(chamar, atender, liberar pra atendimento, finalizar, cancelar). Cada
transição loga em ``attendance_events`` via ``AttendanceService._log_event``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.cln.schemas import (
    ClnConfig,
    ClnConfigRead,
    ClnConfigUpdate,
    EffectiveClnConfig,
)
from app.modules.tenants.models import Facility, Municipality
from app.tenant_models.attendances import Attendance


# ─── Defaults ───────────────────────────────────────────────────────

def default_cln_config() -> EffectiveClnConfig:
    """Módulo desabilitado por padrão — cada município decide onde ligar."""
    return EffectiveClnConfig(
        enabled=False,
        triagem_enabled=True,
        triagem_sector_name=None,
        atendimento_sector_name=None,
        sources={
            "enabled": "default",
            "triagem_enabled": "default",
            "triagem_sector_name": "default",
            "atendimento_sector_name": "default",
        },
    )


# ─── Config Service ─────────────────────────────────────────────────

class ClnConfigService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _get_municipality_or_404(self, municipality_id: UUID) -> Municipality:
        mun = await self.db.get(Municipality, municipality_id)
        if mun is None:
            raise HTTPException(status_code=404, detail="Município não encontrado.")
        return mun

    async def _get_facility_or_404(self, facility_id: UUID) -> Facility:
        fac = await self.db.get(Facility, facility_id)
        if fac is None:
            raise HTTPException(status_code=404, detail="Unidade não encontrada.")
        return fac

    async def get_for_municipality(self, municipality_id: UUID) -> ClnConfigRead:
        mun = await self._get_municipality_or_404(municipality_id)
        return ClnConfigRead(
            scope_type="municipality",
            scope_id=str(mun.id),
            config=ClnConfig.model_validate(mun.cln_config) if mun.cln_config else None,
        )

    async def get_for_facility(self, facility_id: UUID) -> ClnConfigRead:
        fac = await self._get_facility_or_404(facility_id)
        return ClnConfigRead(
            scope_type="facility",
            scope_id=str(fac.id),
            config=ClnConfig.model_validate(fac.cln_config) if fac.cln_config else None,
        )

    def _validate_merged_config(self, cfg: dict) -> None:
        """Valida regras de integridade do dict mesclado.

        Só dispara 409 quando os dois campos estão preenchidos E iguais —
        campos ausentes/nulos são tolerados (herdam).
        """
        triagem_en = cfg.get("triagem_enabled", True)
        t = cfg.get("triagem_sector_name")
        a = cfg.get("atendimento_sector_name")
        if triagem_en and t and a and t == a:
            raise HTTPException(
                status_code=409,
                detail="Triagem e atendimento precisam ser setores diferentes.",
            )

    async def update_for_municipality(
        self, municipality_id: UUID, payload: ClnConfigUpdate,
    ) -> ClnConfigRead:
        mun = await self._get_municipality_or_404(municipality_id)
        if payload.config is None:
            mun.cln_config = None
        else:
            new = (mun.cln_config or {}).copy()
            for k, v in payload.config.model_dump(exclude_unset=True).items():
                new[k] = v
            self._validate_merged_config(new)
            mun.cln_config = new
        await self.db.flush()
        return await self.get_for_municipality(municipality_id)

    async def update_for_facility(
        self, facility_id: UUID, payload: ClnConfigUpdate,
    ) -> ClnConfigRead:
        fac = await self._get_facility_or_404(facility_id)
        if payload.config is None:
            fac.cln_config = None
        else:
            new = (fac.cln_config or {}).copy()
            for k, v in payload.config.model_dump(exclude_unset=True).items():
                new[k] = v
            self._validate_merged_config(new)
            fac.cln_config = new
        await self.db.flush()
        return await self.get_for_facility(facility_id)

    async def effective_for_facility(
        self, facility_id: UUID, municipality_id: UUID,
    ) -> EffectiveClnConfig:
        """Merge defaults → município → unidade. Fields que a unidade
        não sobrescreveu ficam do município; que o município não
        sobrescreveu ficam do default."""
        mun = await self.db.get(Municipality, municipality_id)
        fac = await self.db.get(Facility, facility_id)

        defaults = default_cln_config()
        mun_cfg: dict = (mun.cln_config if mun and mun.cln_config else {}) or {}
        fac_cfg: dict = (fac.cln_config if fac and fac.cln_config else {}) or {}

        def pick(key: str, default_val):
            if key in fac_cfg and fac_cfg[key] is not None:
                return fac_cfg[key], "facility"
            if key in mun_cfg and mun_cfg[key] is not None:
                return mun_cfg[key], "municipality"
            return default_val, "default"

        enabled, s_en = pick("enabled", defaults.enabled)
        triagem_en, s_te = pick("triagem_enabled", defaults.triagem_enabled)
        triagem_sec, s_ts = pick("triagem_sector_name", defaults.triagem_sector_name)
        atend_sec, s_as = pick("atendimento_sector_name", defaults.atendimento_sector_name)

        return EffectiveClnConfig(
            enabled=enabled,
            triagem_enabled=triagem_en,
            triagem_sector_name=triagem_sec,
            atendimento_sector_name=atend_sec,
            sources={
                "enabled": s_en,
                "triagem_enabled": s_te,
                "triagem_sector_name": s_ts,
                "atendimento_sector_name": s_as,
            },
        )

    async def effective_for_municipality(
        self, municipality_id: UUID,
    ) -> EffectiveClnConfig:
        mun = await self._get_municipality_or_404(municipality_id)
        defaults = default_cln_config()
        mun_cfg: dict = mun.cln_config or {}

        def pick(key: str, default_val):
            if key in mun_cfg and mun_cfg[key] is not None:
                return mun_cfg[key], "municipality"
            return default_val, "default"

        enabled, s_en = pick("enabled", defaults.enabled)
        triagem_en, s_te = pick("triagem_enabled", defaults.triagem_enabled)
        triagem_sec, s_ts = pick("triagem_sector_name", defaults.triagem_sector_name)
        atend_sec, s_as = pick("atendimento_sector_name", defaults.atendimento_sector_name)

        return EffectiveClnConfig(
            enabled=enabled,
            triagem_enabled=triagem_en,
            triagem_sector_name=triagem_sec,
            atendimento_sector_name=atend_sec,
            sources={
                "enabled": s_en,
                "triagem_enabled": s_te,
                "triagem_sector_name": s_ts,
                "atendimento_sector_name": s_as,
            },
        )


# ─── Ops: filas + ações ─────────────────────────────────────────────

class ClnService:
    """Operações do CLN: filas e transições de ticket.

    Compartilha o banco com ``AttendanceService`` — instancia-o
    internamente pra reaproveitar ``_log_event``, ``_publish_status``
    e ``_get_or_404``.
    """

    def __init__(
        self,
        *,
        app_db: AsyncSession,
        tenant_db: AsyncSession,
        valkey=None,
    ) -> None:
        self.app_db = app_db
        self.tenant_db = tenant_db
        # Late import pra evitar ciclo (attendances importa cln indireto).
        from app.modules.attendances.service import AttendanceService
        self._att = AttendanceService(app_db=app_db, tenant_db=tenant_db, valkey=valkey)

    # ── Filas ─────────────────────────────────────────────────────

    async def list_triagem(
        self, facility_id: UUID, triagem_sector_name: str,
    ) -> list[Attendance]:
        """Fila de triagem: ticket em ``triagem_waiting`` com sector_name
        igual ao configurado. Também inclui ``cln_called``/``cln_attending``
        cujo sector_name bate (ticket que está sendo atendido agora)."""
        rows = await self.tenant_db.scalars(
            select(Attendance)
            .where(Attendance.facility_id == facility_id)
            .where(Attendance.sector_name == triagem_sector_name)
            .where(Attendance.status.in_((
                "triagem_waiting", "cln_called", "cln_attending",
            )))
            .order_by(Attendance.priority.desc(), Attendance.arrived_at.asc())
        )
        return list(rows.all())

    async def list_atendimento(
        self, facility_id: UUID, atendimento_sector_name: str,
    ) -> list[Attendance]:
        """Fila de atendimento: ``sector_waiting`` no setor configurado,
        mais os em ``cln_called``/``cln_attending`` que já estão sendo
        atendidos."""
        rows = await self.tenant_db.scalars(
            select(Attendance)
            .where(Attendance.facility_id == facility_id)
            .where(Attendance.sector_name == atendimento_sector_name)
            .where(Attendance.status.in_((
                "sector_waiting", "cln_called", "cln_attending",
            )))
            .order_by(Attendance.priority.desc(), Attendance.arrived_at.asc())
        )
        return list(rows.all())

    # ── Ações ─────────────────────────────────────────────────────

    async def call(
        self, attendance_id: UUID, user_id: UUID, user_name: str = "",
    ) -> Attendance:
        """Chama o paciente — transiciona pra ``cln_called``. Se já estava
        ``cln_called`` (rechamada), mantém status mas loga 'recalled'."""
        att = await self._att._get_or_404(attendance_id)  # noqa: SLF001
        entry_statuses = ("triagem_waiting", "sector_waiting", "cln_called")
        if att.status not in entry_statuses:
            raise HTTPException(
                status_code=409,
                detail=f"Status inválido pra chamar: {att.status}",
            )
        is_recall = att.status == "cln_called"
        if not is_recall:
            att.called_at = datetime.now(UTC)
            att.called_by_user_id = user_id
            att.status = "cln_called"
            await self.tenant_db.flush()
        await self._att._log_event(  # noqa: SLF001
            att.id, "recalled" if is_recall else "called",
            user_id=user_id, user_name=user_name,
            details={"ticketNumber": att.ticket_number, "sector": att.sector_name},
        )
        await self._att._publish_status(att)  # noqa: SLF001
        return att

    async def start(
        self, attendance_id: UUID, user_id: UUID, user_name: str = "",
    ) -> Attendance:
        """Começa o atendimento — vai pra ``cln_attending``.

        Bloqueia atendimento concorrente: um mesmo usuário só pode estar
        atendendo 1 ticket por vez na unidade. Precisa finalizar, liberar
        ou cancelar o atual antes de pegar outro.
        """
        att = await self._att._get_or_404(attendance_id)  # noqa: SLF001
        if att.status not in ("cln_called", "triagem_waiting", "sector_waiting"):
            raise HTTPException(
                status_code=409,
                detail=f"Status inválido pra atender: {att.status}",
            )
        # Atendimento único por usuário/unidade.
        existing = await self.tenant_db.scalar(
            select(Attendance)
            .where(Attendance.facility_id == att.facility_id)
            .where(Attendance.started_by_user_id == user_id)
            .where(Attendance.status == "cln_attending")
            .where(Attendance.id != attendance_id)
            .limit(1)
        )
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "already_attending",
                    "message": (
                        f"Você já está atendendo a senha {existing.ticket_number} "
                        f"({existing.patient_name}). Libere ou finalize antes de "
                        f"pegar outro paciente."
                    ),
                    "activeTicket": {
                        "id": str(existing.id),
                        "ticketNumber": existing.ticket_number,
                        "patientName": existing.patient_name,
                    },
                },
            )
        att.status = "cln_attending"
        att.started_at = datetime.now(UTC)
        att.started_by_user_id = user_id
        await self.tenant_db.flush()
        await self._att._log_event(  # noqa: SLF001
            att.id, "started", user_id=user_id, user_name=user_name,
            details={"sector": att.sector_name},
        )
        await self._att._publish_status(att)  # noqa: SLF001
        return att

    async def release_to_atendimento(
        self,
        attendance_id: UUID,
        user_id: UUID,
        atendimento_sector_name: str,
        user_name: str = "",
    ) -> Attendance:
        """Triagem terminou — libera ticket pra fila de atendimento
        (muda sector_name + volta pra sector_waiting)."""
        att = await self._att._get_or_404(attendance_id)  # noqa: SLF001
        if att.status not in ("cln_attending", "cln_called"):
            raise HTTPException(
                status_code=409,
                detail=f"Status inválido pra liberar: {att.status}",
            )
        prev_sector = att.sector_name
        att.status = "sector_waiting"
        att.sector_name = atendimento_sector_name.strip()
        att.forwarded_at = datetime.now(UTC)
        att.forwarded_by_user_id = user_id
        await self.tenant_db.flush()
        await self._att._log_event(  # noqa: SLF001
            att.id, "forwarded", user_id=user_id, user_name=user_name,
            details={
                "sectorName": att.sector_name,
                "from": prev_sector,
                "reason": "triagem_completed",
            },
        )
        await self._att._publish_status(att)  # noqa: SLF001
        return att

    async def finish(
        self, attendance_id: UUID, user_id: UUID, user_name: str = "",
    ) -> Attendance:
        """Encerra o atendimento no setor — status terminal ``finished``."""
        att = await self._att._get_or_404(attendance_id)  # noqa: SLF001
        if att.status not in ("cln_attending", "cln_called"):
            raise HTTPException(
                status_code=409,
                detail=f"Status inválido pra finalizar: {att.status}",
            )
        att.status = "finished"
        await self.tenant_db.flush()
        await self._att._log_event(  # noqa: SLF001
            att.id, "finished", user_id=user_id, user_name=user_name,
            details={"sector": att.sector_name},
        )
        await self._att._publish_status(att)  # noqa: SLF001
        return att

    async def cancel(
        self, attendance_id: UUID, user_id: UUID, reason: str,
        user_name: str = "",
    ) -> Attendance:
        return await self._att.cancel(attendance_id, user_id, reason, user_name=user_name)
