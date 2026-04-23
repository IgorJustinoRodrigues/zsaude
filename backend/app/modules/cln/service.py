"""Serviços do módulo Clínico.

``ClnConfigService`` — leitura/escrita/efetiva da config (mesmo padrão
de ``RecConfigService``).

``ClnService`` — filas (triagem e atendimento) e ações do fluxo
(chamar, atender, liberar pra atendimento, finalizar, cancelar). Cada
transição loga em ``attendance_events`` via ``AttendanceService._log_event``.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException

logger = logging.getLogger(__name__)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.cln.schemas import (
    ClnConfig,
    ClnConfigRead,
    ClnConfigUpdate,
    EffectiveClnConfig,
)
from app.modules.cln.schemas import (
    PriorityGroupCreate,
    PriorityGroupUpdate,
    TriageInput,
)
from app.modules.sigtap.models import SigtapProcedure, SigtapProcedureCbo
from app.modules.tenants.models import Facility, FacilityType, Municipality
from app.tenant_models.attendances import (
    Attendance,
    AttendanceProcedure,
    PriorityGroup,
    TriageRecord,
)


# Códigos SIGTAP padrão pra auto-marcação (Fase F). Compatíveis com BPA
# em UPA/AB. Município pode override via config futura — por ora fixos.
AUTO_TRIAGEM_CODE = "0301060118"  # Acolhimento com classificação de risco

# Mapeamento prefixo CBO (família) → código de consulta. Prefixo mais
# específico vence (ordem importa). CBOs não mapeados não auto-marcam.
AUTO_ATENDIMENTO_BY_CBO_PREFIX: tuple[tuple[str, str], ...] = (
    # Cirurgião-dentista — 2232xx.
    ("2232", "0301010153"),  # Primeira consulta odontológica programática
    # Enfermeiro — 2235xx.
    ("2235", "0301010030"),  # Consulta de profissionais de nível superior na AP (exceto médico)
    # Médicos — 2251/2252/2253 família.
    ("2251", "0301010064"),  # Consulta médica em atenção primária
    ("2252", "0301010064"),
    ("2253", "0301010064"),
)


def _auto_atendimento_code_for(cbo_id: str | None) -> str | None:
    """Retorna o código SIGTAP padrão de consulta pra família CBO do
    usuário, ou None se o CBO não estiver mapeado."""
    if not cbo_id:
        return None
    for prefix, code in AUTO_ATENDIMENTO_BY_CBO_PREFIX:
        if cbo_id.startswith(prefix):
            return code
    return None


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

    async def triage_and_release(
        self,
        attendance_id: UUID,
        user_id: UUID,
        atendimento_sector_name: str,
        payload: TriageInput,
        user_name: str = "",
    ) -> tuple[Attendance, TriageRecord]:
        """Grava os dados de triagem E libera pra atendimento numa única
        transação. Triagem precisa estar em ``cln_attending`` ou
        ``cln_called``. Validação da classificação (1..5) já é
        garantida pelo pydantic no router."""
        att = await self._att._get_or_404(attendance_id)  # noqa: SLF001
        if att.status not in ("cln_attending", "cln_called"):
            raise HTTPException(
                status_code=409,
                detail=f"Status inválido pra liberar: {att.status}",
            )
        if not (1 <= payload.risk_classification <= 5):
            raise HTTPException(
                status_code=400,
                detail="Classificação de risco precisa estar entre 1 e 5.",
            )
        # Override sem motivo é inválido — UI já obriga, mas guardamos a
        # invariante no backend também.
        if (
            payload.risk_auto_suggested is not None
            and payload.risk_auto_suggested != payload.risk_classification
            and not (payload.risk_override_reason or "").strip()
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Classificação diverge da sugestão do protocolo — "
                    "informe o motivo do override."
                ),
            )

        # 0a. Detecta se já existiu triagem prévia — vira retriagem.
        prev_count = await self.tenant_db.scalar(
            select(func.count())
            .select_from(TriageRecord)
            .where(TriageRecord.attendance_id == att.id)
        )
        is_retriage = (prev_count or 0) >= 1

        # 0. Se triador informou grupo prioritário, seta no Attendance.
        if payload.priority_group_id is not None:
            # Valida que existe (evita FK solta — a tabela não tem FK formal).
            pg = await self.tenant_db.get(PriorityGroup, payload.priority_group_id)
            if pg is None or pg.archived:
                raise HTTPException(
                    status_code=404, detail="Grupo prioritário não encontrado.",
                )
            att.priority_group_id = payload.priority_group_id
            att.priority = True

        # 1. Grava o TriageRecord.
        from decimal import Decimal

        def _dec(v: float | int | None) -> Decimal | None:
            return Decimal(str(v)) if v is not None else None

        rec = TriageRecord(
            attendance_id=att.id,
            queixa=(payload.queixa or "").strip(),
            observacoes=(payload.observacoes or "").strip(),
            pa_sistolica=payload.pa_sistolica,
            pa_diastolica=payload.pa_diastolica,
            fc=payload.fc,
            fr=payload.fr,
            temperatura=_dec(payload.temperatura),
            spo2=_dec(payload.spo2),
            glicemia=payload.glicemia,
            dor=max(0, min(10, int(payload.dor or 0))),
            peso=_dec(payload.peso),
            altura=payload.altura,
            imc=_dec(payload.imc),
            perimetro_cefalico=_dec(payload.perimetro_cefalico),
            perimetro_abdominal=_dec(payload.perimetro_abdominal),
            perimetro_toracico=_dec(payload.perimetro_toracico),
            perimetro_panturrilha=_dec(payload.perimetro_panturrilha),
            gestante=payload.gestante,
            dum=payload.dum,
            semanas_gestacao=payload.semanas_gestacao,
            risk_classification=payload.risk_classification,
            risk_auto_suggested=payload.risk_auto_suggested,
            risk_override_reason=(payload.risk_override_reason or None),
            complaint_code=(payload.complaint_code or None),
            triaged_by_user_id=user_id,
            triaged_by_user_name=(user_name or "").strip()[:200],
        )
        self.tenant_db.add(rec)
        await self.tenant_db.flush()

        # 2. Transiciona pra sector_waiting com o novo sector_name.
        prev_sector = att.sector_name
        att.status = "sector_waiting"
        att.sector_name = atendimento_sector_name.strip()
        att.forwarded_at = datetime.now(UTC)
        att.forwarded_by_user_id = user_id
        await self.tenant_db.flush()

        # 3. Evento na timeline — inclui a classificação pra facilitar
        # leitura no histórico (sem precisar joinar triage_records).
        await self._att._log_event(  # noqa: SLF001
            att.id, "forwarded",
            user_id=user_id, user_name=user_name,
            details={
                "sectorName": att.sector_name,
                "from": prev_sector,
                "reason": "retriagem_completed" if is_retriage else "triagem_completed",
                "risk": payload.risk_classification,
                **({"retriagemNumber": (prev_count or 0) + 1} if is_retriage else {}),
            },
        )
        # 4. Auto-marca procedimento de acolhimento (Fase F).
        #    Falha não bloqueia o fluxo clínico (é questão fiscal), mas
        #    logamos pra detectar mapeamento errado ou competência sem
        #    o código.
        try:
            await self.add_procedure(
                att.id, AUTO_TRIAGEM_CODE,
                user_id=user_id, user_name=user_name,
                source="auto_triagem",
            )
        except HTTPException as e:
            logger.warning(
                "auto_triagem: failed to mark %s on attendance %s: %s",
                AUTO_TRIAGEM_CODE, att.id, e.detail,
            )

        await self._att._publish_status(att)  # noqa: SLF001
        return att, rec

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
        self,
        attendance_id: UUID,
        user_id: UUID,
        user_name: str = "",
        cbo_id: str | None = None,
        force: bool = False,
    ) -> Attendance:
        """Encerra o atendimento no setor — status terminal ``finished``.

        - Auto-marca consulta SIGTAP por família CBO (Fase F). Se o CBO
          não está mapeado nada é feito.
        - Valida que o atendimento tem pelo menos 1 procedimento marcado
          — sem isso a BPA fica vazia. Retorna 409 com
          ``code=no_procedures_marked`` pro front prompt confirmar com
          ``force=true``.
        """
        att = await self._att._get_or_404(attendance_id)  # noqa: SLF001
        if att.status not in ("cln_attending", "cln_called"):
            raise HTTPException(
                status_code=409,
                detail=f"Status inválido pra finalizar: {att.status}",
            )

        # Auto-marca consulta pro CBO antes da validação.
        auto_code = _auto_atendimento_code_for(cbo_id)
        if auto_code is not None:
            try:
                await self.add_procedure(
                    att.id, auto_code,
                    user_id=user_id, user_name=user_name,
                    source="auto_atendimento",
                )
            except HTTPException as e:
                logger.warning(
                    "auto_atendimento: failed to mark %s (cbo=%s) on "
                    "attendance %s: %s",
                    auto_code, cbo_id, att.id, e.detail,
                )

        if not force and not await self.has_any_procedure(att.id):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "no_procedures_marked",
                    "message": (
                        "Nenhum procedimento marcado. Finalizar sem "
                        "procedimento impede a geração da BPA — confirme "
                        "se deseja prosseguir."
                    ),
                },
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

    async def evade(
        self, attendance_id: UUID, user_id: UUID,
        reason: str = "", user_name: str = "",
    ) -> Attendance:
        """Marca ticket como evadido (paciente não retornou).

        Semanticamente distinto de ``cancel``: evasão não é uma
        desistência ativa — é 'chamei e não veio'. Aparece em aba
        própria e pode ser relatório separado.
        """
        att = await self._att._get_or_404(attendance_id)  # noqa: SLF001
        if not att.is_active:
            raise HTTPException(
                status_code=409,
                detail=f"Atendimento já fechado: {att.status}",
            )
        att.status = "evaded"
        att.cancelled_at = datetime.now(UTC)
        att.cancelled_by_user_id = user_id
        att.cancellation_reason = (reason or "").strip() or "Paciente não retornou"
        await self.tenant_db.flush()
        await self._att._log_event(  # noqa: SLF001
            att.id, "evaded", user_id=user_id, user_name=user_name,
            details={"reason": att.cancellation_reason, "sector": att.sector_name},
        )
        await self._att._publish_status(att)  # noqa: SLF001
        return att

    async def refer_to_ubs(
        self,
        attendance_id: UUID,
        ubs_facility_id: UUID,
        user_id: UUID,
        municipality_id: UUID,
        user_name: str = "",
    ) -> Attendance:
        """Encaminha paciente não urgente pra uma UBS — Fase H.

        Requisitos:
        - Ticket em ``cln_called`` ou ``cln_attending`` (triador na frente).
        - Ao menos um ``TriageRecord`` existente e risco 4 ou 5. Sem
          classificação, não tem como justificar o encaminhamento.
        - UBS destino válida: ``FacilityType.UBS``, mesmo município do
          contexto, não arquivada.

        Status vira terminal ``referred``. Evento ``referred`` na timeline.
        """
        att = await self._att._get_or_404(attendance_id)  # noqa: SLF001
        if att.status not in ("cln_called", "cln_attending"):
            raise HTTPException(
                status_code=409,
                detail=f"Status inválido pra encaminhar: {att.status}",
            )

        last_triage = await self.tenant_db.scalar(
            select(TriageRecord)
            .where(TriageRecord.attendance_id == att.id)
            .order_by(TriageRecord.created_at.desc())
            .limit(1)
        )
        if last_triage is None:
            raise HTTPException(
                status_code=409,
                detail="Encaminhe somente pacientes com triagem concluída.",
            )
        if last_triage.risk_classification not in (4, 5):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Somente pacientes com classificação 4 ou 5 podem "
                    "ser encaminhados pra UBS. Classificação atual: "
                    f"{last_triage.risk_classification}."
                ),
            )

        ubs = await self.app_db.get(Facility, ubs_facility_id)
        if ubs is None or ubs.archived:
            raise HTTPException(status_code=404, detail="UBS destino não encontrada.")
        if ubs.municipality_id != municipality_id:
            raise HTTPException(
                status_code=403,
                detail="UBS destino não pertence a este município.",
            )
        if ubs.type != FacilityType.UBS:
            raise HTTPException(
                status_code=409,
                detail=f"Unidade destino não é UBS (é {ubs.type.value}).",
            )

        att.status = "referred"
        att.referred_to_facility_id = ubs_facility_id
        att.referred_at = datetime.now(UTC)
        att.referred_by_user_id = user_id
        await self.tenant_db.flush()
        await self._att._log_event(  # noqa: SLF001
            att.id, "referred", user_id=user_id, user_name=user_name,
            details={
                "ubsId": str(ubs_facility_id),
                "ubsName": ubs.name,
                "risk": last_triage.risk_classification,
            },
        )
        await self._att._publish_status(att)  # noqa: SLF001
        return att

    async def retriage(
        self,
        attendance_id: UUID,
        user_id: UUID,
        triagem_sector_name: str,
        user_name: str = "",
    ) -> Attendance:
        """Devolve um ticket pra fila de triagem — o paciente piorou, mudou
        o quadro ou a triagem anterior precisa ser revista.

        Elegível a partir de ``sector_waiting``/``cln_called``/``cln_attending``:
        tickets que já passaram pela triagem (têm ao menos um ``TriageRecord``).
        Preserva o histórico — o novo registro será criado pela próxima
        chamada a ``triage_and_release``.
        """
        att = await self._att._get_or_404(attendance_id)  # noqa: SLF001
        if att.status not in ("sector_waiting", "cln_called", "cln_attending"):
            raise HTTPException(
                status_code=409,
                detail=f"Status inválido pra retriagem: {att.status}",
            )
        has_prior = await self.tenant_db.scalar(
            select(func.count())
            .select_from(TriageRecord)
            .where(TriageRecord.attendance_id == att.id)
        )
        if not (has_prior or 0):
            raise HTTPException(
                status_code=409,
                detail="Ticket nunca passou por triagem — use a fila normal.",
            )
        prev_sector = att.sector_name
        prev_status = att.status
        att.status = "triagem_waiting"
        att.sector_name = triagem_sector_name.strip()
        # Reabre timeline de chamada/atendimento — triador novo precisa
        # chamar e iniciar de novo; os timestamps antigos viram histórico
        # na aba Encaminhados.
        att.called_at = None
        att.called_by_user_id = None
        att.started_at = None
        att.started_by_user_id = None
        await self.tenant_db.flush()
        await self._att._log_event(  # noqa: SLF001
            att.id, "retriagem_requested",
            user_id=user_id, user_name=user_name,
            details={
                "from": prev_sector,
                "fromStatus": prev_status,
                "sectorName": att.sector_name,
            },
        )
        await self._att._publish_status(att)  # noqa: SLF001
        return att

    async def list_triage_history(
        self, attendance_id: UUID,
    ) -> list[TriageRecord]:
        """Registros de triagem do ticket, ordenados do mais recente ao
        mais antigo. Usado pra renderizar card comparativo no form."""
        rows = await self.tenant_db.scalars(
            select(TriageRecord)
            .where(TriageRecord.attendance_id == attendance_id)
            .order_by(TriageRecord.created_at.desc())
        )
        return list(rows.all())

    async def triage_counts(
        self, attendance_ids: list[UUID],
    ) -> dict[UUID, int]:
        """Quantidade de registros de triagem por ticket — agregação em
        bulk pra evitar N+1 na listagem."""
        if not attendance_ids:
            return {}
        rows = await self.tenant_db.execute(
            select(TriageRecord.attendance_id, func.count())
            .where(TriageRecord.attendance_id.in_(set(attendance_ids)))
            .group_by(TriageRecord.attendance_id)
        )
        return {aid: int(c) for aid, c in rows.all()}

    # ── Grupos prioritários ───────────────────────────────────────

    async def list_priority_groups(
        self, *, include_archived: bool = False,
    ) -> list[PriorityGroup]:
        stmt = select(PriorityGroup)
        if not include_archived:
            stmt = stmt.where(PriorityGroup.archived == False)  # noqa: E712
        stmt = stmt.order_by(PriorityGroup.display_order, PriorityGroup.name)
        rows = await self.tenant_db.scalars(stmt)
        return list(rows.all())

    async def create_priority_group(self, payload: PriorityGroupCreate) -> PriorityGroup:
        name = (payload.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Nome obrigatório.")
        dup = await self.tenant_db.scalar(
            select(PriorityGroup).where(PriorityGroup.name == name).limit(1)
        )
        if dup is not None:
            raise HTTPException(status_code=409, detail="Já existe grupo com esse nome.")
        row = PriorityGroup(
            name=name,
            description=(payload.description or "").strip(),
            display_order=payload.display_order,
        )
        self.tenant_db.add(row)
        await self.tenant_db.flush()
        return row

    async def update_priority_group(
        self, group_id: UUID, payload: PriorityGroupUpdate,
    ) -> PriorityGroup:
        row = await self.tenant_db.get(PriorityGroup, group_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Grupo não encontrado.")
        if payload.name is not None:
            n = payload.name.strip()
            if not n:
                raise HTTPException(status_code=400, detail="Nome não pode ficar vazio.")
            if n != row.name:
                dup = await self.tenant_db.scalar(
                    select(PriorityGroup)
                    .where(PriorityGroup.name == n)
                    .where(PriorityGroup.id != group_id).limit(1)
                )
                if dup is not None:
                    raise HTTPException(status_code=409, detail="Nome já em uso.")
                row.name = n
        if payload.description is not None:
            row.description = payload.description.strip()
        if payload.display_order is not None:
            row.display_order = payload.display_order
        if payload.archived is not None:
            row.archived = payload.archived
        await self.tenant_db.flush()
        return row

    async def delete_priority_group(self, group_id: UUID) -> None:
        row = await self.tenant_db.get(PriorityGroup, group_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Grupo não encontrado.")
        # Evita deletar grupo em uso — arquiva em vez disso.
        in_use = await self.tenant_db.scalar(
            select(Attendance)
            .where(Attendance.priority_group_id == group_id).limit(1)
        )
        if in_use is not None:
            raise HTTPException(
                status_code=409,
                detail="Grupo em uso em atendimentos. Arquive em vez de deletar.",
            )
        await self.tenant_db.delete(row)
        await self.tenant_db.flush()

    async def set_ticket_priority_group(
        self, attendance_id: UUID, user_id: UUID, group_id: UUID | None,
        user_name: str = "",
    ) -> Attendance:
        """Seta (ou remove) o grupo prioritário dum ticket. Sincroniza
        ``priority`` (bool) automaticamente."""
        att = await self._att._get_or_404(attendance_id)  # noqa: SLF001
        if group_id is not None:
            pg = await self.tenant_db.get(PriorityGroup, group_id)
            if pg is None or pg.archived:
                raise HTTPException(
                    status_code=404, detail="Grupo prioritário não encontrado.",
                )
            att.priority_group_id = group_id
            att.priority = True
            label = pg.name
        else:
            att.priority_group_id = None
            att.priority = False
            label = None
        await self.tenant_db.flush()
        await self._att._log_event(  # noqa: SLF001
            att.id, "data_updated", user_id=user_id, user_name=user_name,
            details={
                "fields": ["Grupo prioritário"],
                "priority_group": label or "removido",
            },
        )
        return att

    # ── Procedimentos SIGTAP ──────────────────────────────────────

    async def list_procedures(
        self, attendance_id: UUID,
    ) -> list[tuple[AttendanceProcedure, SigtapProcedure | None]]:
        """Procedimentos marcados no atendimento, enriquecidos com o
        catálogo SIGTAP (app schema). Se um código for removido em
        competência futura, a linha ainda aparece — descrição fica None
        e o caller decide como renderizar."""
        rows = await self.tenant_db.scalars(
            select(AttendanceProcedure)
            .where(AttendanceProcedure.attendance_id == attendance_id)
            .order_by(AttendanceProcedure.marked_at.asc())
        )
        items = list(rows.all())
        if not items:
            return []
        codes = {p.codigo for p in items}
        proc_rows = await self.app_db.scalars(
            select(SigtapProcedure).where(SigtapProcedure.codigo.in_(codes))
        )
        by_code: dict[str, SigtapProcedure] = {p.codigo: p for p in proc_rows.all()}
        return [(p, by_code.get(p.codigo)) for p in items]

    async def add_procedure(
        self, attendance_id: UUID, codigo: str,
        user_id: UUID, user_name: str = "",
        quantidade: int = 1,
        source: str = "manual",
        cbo_id: str | None = None,
    ) -> AttendanceProcedure | None:
        """Marca um procedimento no atendimento.

        - Valida que o código existe no catálogo SIGTAP (app).
        - Se ``source == 'manual'`` e ``cbo_id`` foi passado, valida que
          o procedimento é compatível com aquele CBO (SigtapProcedureCbo).
          Auto-marcações pulam a validação de CBO.
        - Idempotente via UNIQUE(attendance_id, codigo) — retorna None
          se o código já estava marcado.
        """
        codigo = (codigo or "").strip()
        if not codigo or len(codigo) > 10:
            raise HTTPException(status_code=400, detail="Código SIGTAP inválido.")
        quantidade = max(1, min(999, int(quantidade or 1)))

        proc = await self.app_db.scalar(
            select(SigtapProcedure)
            .where(SigtapProcedure.codigo == codigo)
            .where(SigtapProcedure.revogado == False)  # noqa: E712
        )
        if proc is None:
            raise HTTPException(
                status_code=404,
                detail="Procedimento não encontrado no catálogo SIGTAP vigente.",
            )

        if source == "manual" and cbo_id:
            ok = await self.app_db.scalar(
                select(SigtapProcedureCbo)
                .where(SigtapProcedureCbo.codigo_procedimento == codigo)
                .where(SigtapProcedureCbo.codigo_cbo == cbo_id)
                .limit(1)
            )
            if ok is None:
                raise HTTPException(
                    status_code=409,
                    detail="Procedimento não é compatível com o CBO do profissional.",
                )

        # Insert idempotente — se já existir, só retorna None.
        dup = await self.tenant_db.scalar(
            select(AttendanceProcedure)
            .where(AttendanceProcedure.attendance_id == attendance_id)
            .where(AttendanceProcedure.codigo == codigo).limit(1)
        )
        if dup is not None:
            return None
        row = AttendanceProcedure(
            attendance_id=attendance_id,
            codigo=codigo,
            competencia=proc.competencia or "000000",
            quantidade=quantidade,
            source=source,
            marked_by_user_id=user_id,
            marked_by_user_name=(user_name or "").strip()[:200],
        )
        self.tenant_db.add(row)
        await self.tenant_db.flush()
        return row

    async def remove_procedure(
        self, attendance_id: UUID, procedure_id: UUID,
        user_id: UUID, user_name: str = "",
    ) -> None:
        row = await self.tenant_db.get(AttendanceProcedure, procedure_id)
        if row is None or row.attendance_id != attendance_id:
            raise HTTPException(status_code=404, detail="Procedimento não encontrado.")
        await self.tenant_db.delete(row)
        await self.tenant_db.flush()
        _ = user_id, user_name  # timeline de proc não é relevante — só mudança DB

    async def search_procedures_for_cbo(
        self, cbo_id: str | None, query: str, limit: int = 20,
    ) -> list[SigtapProcedure]:
        """Busca procedimentos filtrados pelo CBO do profissional.

        Sem CBO vinculado → lista vazia (política de segurança: o que ele
        não pode registrar não deve nem aparecer).
        """
        if not cbo_id:
            return []
        from app.db.query_helpers import unaccent_ilike

        stmt = (
            select(SigtapProcedure)
            .join(
                SigtapProcedureCbo,
                SigtapProcedureCbo.codigo_procedimento == SigtapProcedure.codigo,
            )
            .where(SigtapProcedureCbo.codigo_cbo == cbo_id)
            .where(SigtapProcedure.revogado == False)  # noqa: E712
        )
        q = (query or "").strip()
        if q:
            stmt = stmt.where(
                unaccent_ilike(SigtapProcedure.nome, q) |
                SigtapProcedure.codigo.like(f"{q}%")
            )
        stmt = stmt.order_by(SigtapProcedure.codigo).limit(limit)
        rows = await self.app_db.scalars(stmt)
        return list(rows.all())

    async def has_any_procedure(self, attendance_id: UUID) -> bool:
        row = await self.tenant_db.scalar(
            select(AttendanceProcedure.id)
            .where(AttendanceProcedure.attendance_id == attendance_id).limit(1)
        )
        return row is not None

    async def pending_auto_procedures(
        self,
        attendance_id: UUID,
        triagem_sector_name: str | None,
        atendimento_sector_name: str | None,
        cbo_id: str | None,
    ) -> list[tuple[str, SigtapProcedure | None, str, str]]:
        """Procedimentos que SERÃO auto-marcados no próximo checkpoint
        do ticket — feedback visual "ghost" na UI. Retorna lista de
        ``(codigo, SigtapProcedure|None, source, trigger)``.

        Lógica:
        - Ticket em ``cln_called``/``cln_attending`` no setor de triagem
          → pendente: código de acolhimento (aplicado ao liberar).
        - Mesmo estado no setor de atendimento → pendente: consulta por
          CBO (aplicada ao finalizar). Se o CBO não tá mapeado, vazio.
        - Códigos já marcados são filtrados.
        """
        att = await self._att._get_or_404(attendance_id)  # noqa: SLF001
        if att.status not in ("cln_called", "cln_attending"):
            return []

        pending: list[tuple[str, str, str]] = []  # (code, source, trigger)
        if triagem_sector_name and att.sector_name == triagem_sector_name:
            pending.append((AUTO_TRIAGEM_CODE, "auto_triagem", "on_release"))
        elif atendimento_sector_name and att.sector_name == atendimento_sector_name:
            code = _auto_atendimento_code_for(cbo_id)
            if code:
                pending.append((code, "auto_atendimento", "on_finish"))

        if not pending:
            return []

        # Filtra os já marcados.
        already = await self.tenant_db.scalars(
            select(AttendanceProcedure.codigo)
            .where(AttendanceProcedure.attendance_id == attendance_id)
            .where(AttendanceProcedure.codigo.in_([c for c, _, _ in pending]))
        )
        existing = set(already.all())
        pending = [p for p in pending if p[0] not in existing]
        if not pending:
            return []

        # Enriquece com SigtapProcedure (pode ser None se código não
        # estiver na competência vigente — UI mostra fallback).
        codes = [c for c, _, _ in pending]
        rows = await self.app_db.scalars(
            select(SigtapProcedure).where(SigtapProcedure.codigo.in_(codes))
        )
        by_code: dict[str, SigtapProcedure] = {r.codigo: r for r in rows.all()}
        return [(c, by_code.get(c), s, t) for c, s, t in pending]

    # ── Listagens de histórico ────────────────────────────────────

    async def list_triagem_encaminhados(
        self, facility_id: UUID, atendimento_sector_name: str,
    ) -> list[Attendance]:
        """Tickets que passaram pela triagem nas últimas 24h (foram
        liberados pra atendimento). Detectamos via triage_records
        recentes — mais preciso que olhar só o status atual."""
        since = datetime.now(UTC) - timedelta(hours=24)
        rows = await self.tenant_db.scalars(
            select(Attendance)
            .join(TriageRecord, TriageRecord.attendance_id == Attendance.id)
            .where(Attendance.facility_id == facility_id)
            .where(TriageRecord.created_at >= since)
            .order_by(TriageRecord.created_at.desc())
        )
        # Filtra por atendimento atual — útil pra ver se ainda tá parado lá
        _ = atendimento_sector_name  # informacional, não usamos pra filtro
        return list(rows.all())

    async def list_triagem_evadidos(
        self, facility_id: UUID, triagem_sector_name: str,
    ) -> list[Attendance]:
        """Evadidos que estavam na triagem nos últimos 7 dias."""
        since = datetime.now(UTC) - timedelta(days=7)
        rows = await self.tenant_db.scalars(
            select(Attendance)
            .where(Attendance.facility_id == facility_id)
            .where(Attendance.status == "evaded")
            .where(Attendance.sector_name == triagem_sector_name)
            .where(Attendance.cancelled_at >= since)
            .order_by(Attendance.cancelled_at.desc())
        )
        return list(rows.all())

    async def list_atendimento_encaminhados(
        self, facility_id: UUID, atendimento_sector_name: str,
    ) -> list[Attendance]:
        """Atendimentos finalizados nas últimas 24h."""
        since = datetime.now(UTC) - timedelta(hours=24)
        rows = await self.tenant_db.scalars(
            select(Attendance)
            .where(Attendance.facility_id == facility_id)
            .where(Attendance.status == "finished")
            .where(Attendance.sector_name == atendimento_sector_name)
            .where(Attendance.updated_at >= since)
            .order_by(Attendance.updated_at.desc())
        )
        return list(rows.all())

    async def list_atendimento_evadidos(
        self, facility_id: UUID, atendimento_sector_name: str,
    ) -> list[Attendance]:
        """Evadidos que estavam no atendimento nos últimos 7 dias."""
        since = datetime.now(UTC) - timedelta(days=7)
        rows = await self.tenant_db.scalars(
            select(Attendance)
            .where(Attendance.facility_id == facility_id)
            .where(Attendance.status == "evaded")
            .where(Attendance.sector_name == atendimento_sector_name)
            .where(Attendance.cancelled_at >= since)
            .order_by(Attendance.cancelled_at.desc())
        )
        return list(rows.all())
