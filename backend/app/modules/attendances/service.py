"""Serviço de atendimentos — emit, call, start, forward, cancel, handover.

Faz a ponte entre a sessão do schema `app` (totens, counters, facilities,
municípios) e a sessão do schema tenant `mun_<ibge>` (attendances).
Quem chama passa as duas sessions.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

import redis.asyncio as redis
from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.attendances.schemas import (
    EmitTicketInput,
    ForwardInput,
    HandoverInfo,
)
from app.modules.devices.hub import publish_facility_event
from app.modules.devices.models import Device
from app.modules.hsp import face_service
from app.modules.tenants.models import Facility, Municipality
from app.modules.totens.models import Totem, TotemCounter
from app.tenant_models.attendances import Attendance, AttendanceEvent
from app.tenant_models.patients import Patient, PatientPhoto


# ─── Helpers de numeração ────────────────────────────────────────────────────

def _period_key(strategy: str, now_local: datetime) -> str:
    """Chave de período pra resetar o contador da senha. Baseia no
    horário LOCAL do município (cliente já deve ter convertido)."""
    if strategy == "never":
        return ""
    if strategy == "daily":
        return now_local.strftime("%Y-%m-%d")
    if strategy == "weekly":
        iso_year, iso_week, _ = now_local.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    if strategy == "monthly":
        return now_local.strftime("%Y-%m")
    raise ValueError(f"reset_strategy inválido: {strategy}")


def _format_ticket(prefix: str, n: int, padding: int) -> str:
    return f"{prefix}-{str(n).zfill(padding)}"


# Proporção 2:1 (prioritário:normal) pro modo ``priority_fifo``. Escolha
# razoável de default — garante que normais não fiquem travados mesmo
# com muita prioridade, mas ainda respeita a fila legal.
PRIORITY_RATIO_P = 2
PRIORITY_RATIO_N = 1


# ─── Pesos do modo "ai" (scoring ponderado) ─────────────────────────────────
#
# Valores-base. Futuramente: salvar no rec_config pra admin ajustar.
# Cada sinal é normalizado em [0,1] e multiplicado pelo peso abaixo.
AI_W_PRIORITY = 0.50
AI_W_WAIT = 0.30
AI_WAIT_NORMALIZE_MIN = 30      # atinge peso total após 30min de espera
AI_W_OVERSHOOT = 0.25
AI_OVERSHOOT_THRESHOLD_MIN = 45  # começa a acelerar após 45min
AI_OVERSHOOT_CAP_MIN = 30        # teto do acelerador (30min a mais)
AI_W_FAIRNESS_CAP = -0.15
AI_FAIRNESS_CAP_LAST_N = 3       # damping se os últimos N foram prioridade
AI_W_HANDOVER = 0.10


@dataclass
class _ScoreReason:
    tag: str
    contrib: float
    note: str | None = None


def _apply_queue_order(
    rows: list[Attendance], mode: str,
) -> tuple[list[Attendance], dict[UUID, list[_ScoreReason]]]:
    """Aplica o modo de ordenação escolhido e devolve ``(ordered, reasons)``.

    ``reasons`` vem preenchido só no modo ``ai`` — mapeia cada ticket
    aguardando → lista de contribuições no score (pra o frontend exibir
    "por que esse antes daquele"). Em ``fifo`` e ``priority_fifo`` volta
    vazio.

    Atendimentos em andamento/chamados ficam no topo (ordem interna
    preservada) independentemente do modo — a ordenação "smart" só vale
    pros que estão aguardando.
    """
    in_flight_statuses = ("reception_attending", "reception_called")
    in_flight = [r for r in rows if r.status in in_flight_statuses]
    waiting = [r for r in rows if r.status not in in_flight_statuses]
    reasons: dict[UUID, list[_ScoreReason]] = {}

    if mode == "fifo":
        waiting_sorted = sorted(waiting, key=lambda r: r.arrived_at)
    elif mode == "ai":
        waiting_sorted = _order_by_score(waiting, in_flight, reasons)
    else:
        # priority_fifo (default)
        priorities = sorted(
            [r for r in waiting if r.priority], key=lambda r: r.arrived_at,
        )
        normals = sorted(
            [r for r in waiting if not r.priority], key=lambda r: r.arrived_at,
        )
        waiting_sorted = _interleave(priorities, normals, PRIORITY_RATIO_P, PRIORITY_RATIO_N)

    return in_flight + waiting_sorted, reasons


def _order_by_score(
    waiting: list[Attendance],
    in_flight: list[Attendance],
    reasons_out: dict[UUID, list[_ScoreReason]],
) -> list[Attendance]:
    """Ordena os aguardando pelo score ponderado. Popula ``reasons_out``
    com as contribuições pra o frontend poder mostrar ao atendente."""
    now = datetime.now(UTC)
    # Proxy de "últimos chamados" — usamos os tickets que estão em voo
    # como sinal de "o que foi chamado recentemente". Não é exato, mas
    # reflete o padrão recente sem precisar de outra query.
    recent_priority_count = sum(1 for r in in_flight if r.priority)
    damp_priority = recent_priority_count >= AI_FAIRNESS_CAP_LAST_N

    scored: list[tuple[float, Attendance]] = []
    for att in waiting:
        score, reasons = _score_ticket(att, now, damp_priority)
        reasons_out[att.id] = reasons
        scored.append((score, att))

    # Ordena por score desc; empate → chegada mais antiga primeiro.
    scored.sort(key=lambda x: (-x[0], x[1].arrived_at))
    return [att for _, att in scored]


def _score_ticket(
    att: Attendance, now: datetime, damp_priority: bool,
) -> tuple[float, list[_ScoreReason]]:
    """Score ponderado de um único ticket. Retorna (score, reasons)."""
    reasons: list[_ScoreReason] = []
    score = 0.0

    # ── Prioridade legal ──
    if att.priority:
        contrib = AI_W_PRIORITY
        note: str | None = None
        if damp_priority:
            # Aplicou damping por excesso de prioridade recente.
            contrib += AI_W_FAIRNESS_CAP  # negativo
            note = f"últimos {AI_FAIRNESS_CAP_LAST_N}+ chamados foram prioridade"
        reasons.append(_ScoreReason("prioridade_legal", contrib, note))
        score += contrib

    # ── Espera ──
    wait_min = max(0.0, (now - att.arrived_at).total_seconds() / 60.0)
    if wait_min > 0:
        wait_contrib = min(wait_min / AI_WAIT_NORMALIZE_MIN, 1.0) * AI_W_WAIT
        reasons.append(
            _ScoreReason(f"esperando_{int(wait_min)}min", round(wait_contrib, 4))
        )
        score += wait_contrib

    # ── Overshoot (anti-starvation) ──
    if wait_min > AI_OVERSHOOT_THRESHOLD_MIN:
        over_min = wait_min - AI_OVERSHOOT_THRESHOLD_MIN
        over_contrib = min(over_min / AI_OVERSHOOT_CAP_MIN, 1.0) * AI_W_OVERSHOOT
        reasons.append(
            _ScoreReason("espera_prolongada", round(over_contrib, 4))
        )
        score += over_contrib

    # ── Handover pendente ──
    if att.needs_handover_from_attendance_id is not None:
        reasons.append(_ScoreReason("handover_pendente", AI_W_HANDOVER))
        score += AI_W_HANDOVER

    return score, reasons


def _interleave(
    a: list[Attendance], b: list[Attendance], take_a: int, take_b: int,
) -> list[Attendance]:
    """Intercala duas listas na proporção ``take_a:take_b``. Quando uma
    esgota, a outra continua em ordem."""
    out: list[Attendance] = []
    i = j = 0
    while i < len(a) or j < len(b):
        for _ in range(take_a):
            if i < len(a):
                out.append(a[i]); i += 1
        for _ in range(take_b):
            if j < len(b):
                out.append(b[j]); j += 1
    return out


# ─── Service ─────────────────────────────────────────────────────────────────

class AttendanceService:
    def __init__(
        self,
        app_db: AsyncSession,
        tenant_db: AsyncSession,
        valkey: redis.Redis | None = None,
    ) -> None:
        self.app_db = app_db
        self.tenant_db = tenant_db
        self.valkey = valkey

    # ── Emit (totem) ───────────────────────────────────────────────────

    async def emit_ticket(
        self, device: Device, payload: EmitTicketInput,
    ) -> tuple[Attendance, HandoverInfo | None]:
        """Emite uma senha no totem. Retorna o atendimento criado e,
        se aplicável, info do atendimento em outra unidade que virou
        candidato a handover."""
        if device.type != "totem":
            raise HTTPException(status_code=400, detail="Device não é do tipo totem.")
        if device.facility_id is None:
            raise HTTPException(status_code=400, detail="Totem não vinculado a unidade.")
        if device.totem_id is None:
            raise HTTPException(
                status_code=400,
                detail="Totem não tem configuração vinculada. Peça ao admin pra "
                       "configurar em Recepção → Dispositivos.",
            )

        totem = await self.app_db.get(Totem, device.totem_id)
        if totem is None or totem.archived:
            raise HTTPException(status_code=404, detail="Configuração do totem não encontrada.")

        facility = await self.app_db.get(Facility, device.facility_id)
        if facility is None:
            raise HTTPException(status_code=404, detail="Unidade não encontrada.")
        municipality = await self.app_db.get(Municipality, facility.municipality_id)
        if municipality is None:
            raise HTTPException(status_code=404, detail="Município não encontrado.")

        # ── Normaliza doc + resolve paciente ──────────────────────
        # Dois caminhos pra identidade:
        #   (a) face match confirmada → ``payload.patient_id`` preenchido;
        #       buscamos o paciente e usamos CPF/CNS dele como ``doc_value``
        #       (assim a dedup cross-unidade continua funcionando).
        #   (b) totem mandou CPF/CNS digitado → buscamos paciente por ele
        #       pra setar ``att.patient_id`` quando houver match.
        doc_value = (payload.doc_value or "").strip() or None
        doc_type = payload.doc_type
        resolved_patient_id: UUID | None = None

        if payload.patient_id is not None:
            patient = await self.tenant_db.get(Patient, payload.patient_id)
            if patient is None:
                raise HTTPException(status_code=404, detail="Paciente não encontrado.")
            resolved_patient_id = patient.id
            # Preferência: CPF > CNS > manual (se o cadastro não tem nenhum).
            if patient.cpf:
                doc_type = "cpf"
                doc_value = patient.cpf
            elif patient.cns:
                doc_type = "cns"
                doc_value = patient.cns
            else:
                doc_type = "manual"
                doc_value = None
        else:
            if doc_type != "manual" and not doc_value:
                raise HTTPException(
                    status_code=400,
                    detail="doc_value obrigatório para CPF ou CNS.",
                )
            if doc_value and doc_type in ("cpf", "cns"):
                field = Patient.cpf if doc_type == "cpf" else Patient.cns
                found = await self.tenant_db.scalar(
                    select(Patient).where(field == doc_value).limit(1)
                )
                if found is not None:
                    resolved_patient_id = found.id
                else:
                    # Cadastro mínimo automático pelo totem: nome + CPF/CNS.
                    # Recepcionista completa os demais dados depois. Sem
                    # isso, não teria patient_id pra vincular a foto (face
                    # learning) nem pra rastrear o paciente nas próximas
                    # visitas.
                    new_patient = await self._create_minimal_patient(
                        name=payload.patient_name.strip(),
                        cpf=doc_value if doc_type == "cpf" else None,
                        cns=doc_value if doc_type == "cns" else None,
                    )
                    resolved_patient_id = new_patient.id

        # ── Dedup por município (CPF/CNS ou patient_id) ────────────
        handover_old: Attendance | None = None
        if doc_value:
            existing = await self._find_active_by_doc(doc_value)
            if existing is not None:
                if existing.facility_id == device.facility_id:
                    # Mesma unidade — bloqueia.
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "code": "already_exists_here",
                            "existingTicket": existing.ticket_number,
                            "existingStatus": existing.status,
                            "arrivedAt": existing.arrived_at.isoformat(),
                        },
                    )
                # Outra unidade — emite com flag de handover.
                handover_old = existing

        # ── Numeração ──────────────────────────────────────────────
        tz = ZoneInfo(municipality.timezone or "America/Sao_Paulo")
        now_local = datetime.now(tz)
        period = _period_key(totem.reset_strategy, now_local)
        prefix = totem.ticket_prefix_priority if payload.priority else totem.ticket_prefix_normal
        number = await self._next_counter(totem.id, prefix, period)
        ticket_number = _format_ticket(prefix, number, totem.number_padding)

        # ── Cria atendimento ───────────────────────────────────────
        # Se o totem está configurado pra um setor específico, a senha
        # pula a recepção e nasce ``sector_waiting`` com o setor já
        # preenchido. Caso contrário entra na fila da Recepção.
        if totem.default_sector_name:
            initial_status = "sector_waiting"
            initial_sector = totem.default_sector_name
        else:
            initial_status = "reception_waiting"
            initial_sector = None

        att = Attendance(
            facility_id=device.facility_id,
            device_id=device.id,
            ticket_number=ticket_number,
            priority=payload.priority,
            doc_type=doc_type,
            doc_value=doc_value,
            patient_name=payload.patient_name.strip(),
            patient_id=resolved_patient_id,
            status=initial_status,
            sector_name=initial_sector,
            needs_handover_from_attendance_id=handover_old.id if handover_old else None,
        )
        self.tenant_db.add(att)
        await self.tenant_db.flush()

        # Evento 'arrived' — chegada do paciente via totem.
        await self._log_event(
            att.id, "arrived", user_name="Totem",
            details={
                "ticketNumber": att.ticket_number,
                "docType": doc_type,
                "priority": att.priority,
                "source": "totem",
            },
        )

        # ── Monta info de handover pra retornar/expor ──────────────
        handover_info: HandoverInfo | None = None
        if handover_old:
            old_facility = await self.app_db.get(Facility, handover_old.facility_id)
            handover_info = HandoverInfo(
                attendance_id=handover_old.id,
                facility_name=old_facility.name if old_facility else "—",
                facility_short_name=old_facility.short_name if old_facility else "—",
                status=handover_old.status,  # type: ignore[arg-type]
                started_at=handover_old.arrived_at,
            )

        # ── Publica evento real-time pra lista da recepção atualizar ─
        await self._publish_status(att)

        return att, handover_info

    # ── Emit manual (recepcionista) ────────────────────────────────────

    async def emit_manual(
        self,
        facility_id: UUID,
        patient_id: UUID,
        priority: bool,
        user_id: UUID,
        user_name: str = "",
    ) -> tuple[Attendance, HandoverInfo | None]:
        """Cria atendimento direto do balcão — sem totem físico.
        Reusa a numeração de algum totem da unidade (primeiro não arquivado).
        Se não tiver totem, erro — admin precisa criar pelo menos um."""
        patient = await self.tenant_db.get(Patient, patient_id)
        if patient is None:
            raise HTTPException(status_code=404, detail="Paciente não encontrado.")

        facility = await self.app_db.get(Facility, facility_id)
        if facility is None:
            raise HTTPException(status_code=404, detail="Unidade não encontrada.")
        municipality = await self.app_db.get(Municipality, facility.municipality_id)
        if municipality is None:
            raise HTTPException(status_code=404, detail="Município não encontrado.")

        # Busca totem — prioridade facility, fallback município.
        totem = await self.app_db.scalar(
            select(Totem)
            .where(Totem.scope_type == "facility")
            .where(Totem.scope_id == facility_id)
            .where(Totem.archived == False)  # noqa: E712
            .limit(1)
        ) or await self.app_db.scalar(
            select(Totem)
            .where(Totem.scope_type == "municipality")
            .where(Totem.scope_id == municipality.id)
            .where(Totem.archived == False)  # noqa: E712
            .limit(1)
        )
        if totem is None:
            raise HTTPException(
                status_code=409,
                detail="Nenhum totem configurado pra usar como base de numeração. "
                       "Peça ao admin pra criar um totem no município ou unidade.",
            )

        # Define doc_type/doc_value a partir do cadastro.
        if patient.cpf:
            doc_type, doc_value = "cpf", patient.cpf
        elif patient.cns:
            doc_type, doc_value = "cns", patient.cns
        else:
            doc_type, doc_value = "manual", None

        # Dedup por doc na unidade — se ativo na mesma, bloqueia.
        handover_old: Attendance | None = None
        if doc_value:
            existing = await self._find_active_by_doc(doc_value)
            if existing is not None:
                if existing.facility_id == facility_id:
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "code": "already_exists_here",
                            "existingTicket": existing.ticket_number,
                            "existingStatus": existing.status,
                            "arrivedAt": existing.arrived_at.isoformat(),
                        },
                    )
                handover_old = existing

        # Numeração usando o totem escolhido.
        tz = ZoneInfo(municipality.timezone or "America/Sao_Paulo")
        now_local = datetime.now(tz)
        period = _period_key(totem.reset_strategy, now_local)
        prefix = totem.ticket_prefix_priority if priority else totem.ticket_prefix_normal
        number = await self._next_counter(totem.id, prefix, period)
        ticket_number = _format_ticket(prefix, number, totem.number_padding)

        # Status inicial — se totem é setor-direct, herda o setor; senão,
        # cai direto em atendimento (o operador já está na frente do
        # paciente, não faz sentido "aguardando chamada").
        if totem.default_sector_name:
            initial_status = "sector_waiting"
            initial_sector: str | None = totem.default_sector_name
            started_at = None
            started_by = None
        else:
            initial_status = "reception_attending"
            initial_sector = None
            started_at = datetime.now(UTC)
            started_by = user_id

        att = Attendance(
            facility_id=facility_id,
            device_id=None,  # sem device — entrada manual
            ticket_number=ticket_number,
            priority=priority,
            doc_type=doc_type,
            doc_value=doc_value,
            patient_name=patient.social_name.strip() or patient.name,
            patient_id=patient.id,
            status=initial_status,
            sector_name=initial_sector,
            needs_handover_from_attendance_id=handover_old.id if handover_old else None,
            started_at=started_at,
            started_by_user_id=started_by,
        )
        self.tenant_db.add(att)
        await self.tenant_db.flush()

        # Evento 'arrived' — chegada registrada manualmente no balcão.
        await self._log_event(
            att.id, "arrived", user_id=user_id, user_name=user_name,
            details={
                "ticketNumber": att.ticket_number,
                "docType": doc_type,
                "priority": att.priority,
                "source": "manual",
            },
        )
        if initial_status == "reception_attending":
            # Quando atendente já começou o atendimento direto do balcão.
            await self._log_event(
                att.id, "started", user_id=user_id, user_name=user_name,
            )

        handover_info: HandoverInfo | None = None
        if handover_old:
            old_facility = await self.app_db.get(Facility, handover_old.facility_id)
            handover_info = HandoverInfo(
                attendance_id=handover_old.id,
                facility_name=old_facility.name if old_facility else "—",
                facility_short_name=old_facility.short_name if old_facility else "—",
                status=handover_old.status,  # type: ignore[arg-type]
                started_at=handover_old.arrived_at,
            )

        await self._publish_status(att)
        return att, handover_info

    # ── Transições (console da recepção) ───────────────────────────────

    async def call(
        self, attendance_id: UUID, user_id: UUID, user_name: str = "",
    ) -> Attendance:
        att = await self._get_or_404(attendance_id)
        if att.status not in ("reception_waiting", "reception_called"):
            raise HTTPException(status_code=409, detail=f"Status inválido: {att.status}")
        if att.needs_handover_from_attendance_id is not None:
            # Pode chamar mesmo com handover pendente — a confirmação de
            # presença acontece no "atender".
            pass
        # Se já tava 'called', isso é rechamada — vira 'recalled' no log,
        # sem alterar called_at (queremos preservar o 1º call_at).
        is_recall = att.status == "reception_called"
        att.status = "reception_called"
        if not is_recall:
            att.called_at = datetime.now(UTC)
            att.called_by_user_id = user_id
        await self.tenant_db.flush()
        await self._log_event(
            att.id, "recalled" if is_recall else "called",
            user_id=user_id, user_name=user_name,
            details={"ticketNumber": att.ticket_number, "counter": "Recepção"},
        )

        # Publica no canal do painel (compatível com o que já existe)
        if self.valkey is not None:
            await publish_facility_event(
                self.valkey, att.facility_id, "painel:call",
                {
                    "ticket": att.ticket_number,
                    "counter": "Recepção",  # TODO: repassar guichê do operador
                    "patientName": att.patient_name,
                    "priority": att.priority,
                    "at": datetime.now(UTC).isoformat(),
                },
            )
        await self._publish_status(att)
        return att

    async def start(
        self, attendance_id: UUID, user_id: UUID, user_name: str = "",
    ) -> Attendance:
        att = await self._get_or_404(attendance_id)
        if att.status not in ("reception_called", "reception_waiting"):
            raise HTTPException(status_code=409, detail=f"Status inválido: {att.status}")
        # Handover pendente exige assume_handover antes de atender.
        if att.needs_handover_from_attendance_id is not None:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "handover_required",
                    "message": "Paciente tem atendimento aberto em outra unidade. "
                               "Confirme a presença (botão 'Confirmar presença') antes de atender.",
                },
            )
        att.status = "reception_attending"
        att.started_at = datetime.now(UTC)
        att.started_by_user_id = user_id
        await self.tenant_db.flush()
        await self._log_event(
            att.id, "started", user_id=user_id, user_name=user_name,
        )
        await self._publish_status(att)
        return att

    async def forward(
        self, attendance_id: UUID, user_id: UUID, payload: ForwardInput,
        user_name: str = "",
    ) -> Attendance:
        att = await self._get_or_404(attendance_id)
        if att.status != "reception_attending":
            raise HTTPException(
                status_code=409,
                detail="Só é possível encaminhar quem está em atendimento.",
            )
        att.status = "triagem_waiting"
        att.forwarded_at = datetime.now(UTC)
        att.forwarded_by_user_id = user_id
        att.sector_name = payload.sector_name.strip()
        await self.tenant_db.flush()
        await self._log_event(
            att.id, "forwarded", user_id=user_id, user_name=user_name,
            details={"sectorName": att.sector_name},
        )
        await self._publish_status(att)
        return att

    async def cancel(
        self, attendance_id: UUID, user_id: UUID, reason: str,
        user_name: str = "",
    ) -> Attendance:
        att = await self._get_or_404(attendance_id)
        if not att.is_active:
            raise HTTPException(status_code=409, detail=f"Atendimento já fechado: {att.status}")
        att.status = "cancelled"
        att.cancelled_at = datetime.now(UTC)
        att.cancelled_by_user_id = user_id
        att.cancellation_reason = reason.strip() or "Cancelado"
        await self.tenant_db.flush()
        await self._log_event(
            att.id, "cancelled", user_id=user_id, user_name=user_name,
            details={"reason": att.cancellation_reason},
        )
        await self._publish_status(att)
        return att

    async def assume_handover(
        self, attendance_id: UUID, user_id: UUID, user_name: str = "",
    ) -> Attendance:
        """Confirma presença do paciente nesta unidade: fecha o
        atendimento antigo (em outra unidade) como ``evasion`` e libera
        este pra seguir."""
        att = await self._get_or_404(attendance_id)
        if att.needs_handover_from_attendance_id is None:
            raise HTTPException(
                status_code=400,
                detail="Este atendimento não tem handover pendente.",
            )
        from_facility_name: str | None = None
        old = await self.tenant_db.get(Attendance, att.needs_handover_from_attendance_id)
        if old is not None and old.is_active:
            old_facility = await self.app_db.get(Facility, att.facility_id)
            new_facility_name = old_facility.short_name if old_facility else "outra unidade"
            src_facility = await self.app_db.get(Facility, old.facility_id)
            from_facility_name = src_facility.short_name if src_facility else None
            old.status = "evasion"
            old.cancelled_at = datetime.now(UTC)
            old.cancelled_by_user_id = user_id
            old.cancellation_reason = f"Paciente iniciou atendimento em {new_facility_name}"
            # Publica evento na FACILITY ANTIGA pra que a recepção de lá
            # retire o ticket da lista.
            if self.valkey is not None:
                await publish_facility_event(
                    self.valkey, old.facility_id,
                    "attendance:status-changed",
                    {"id": str(old.id), "status": "evasion"},
                )
        att.needs_handover_from_attendance_id = None
        await self.tenant_db.flush()
        await self._log_event(
            att.id, "handover_assumed", user_id=user_id, user_name=user_name,
            details={"fromFacility": from_facility_name} if from_facility_name else None,
        )
        await self._publish_status(att)
        return att

    # ── Timeline de eventos ───────────────────────────────────────────

    async def list_events(self, attendance_id: UUID) -> list[AttendanceEvent]:
        """Lista eventos do atendimento em ordem cronológica (mais
        antigo primeiro)."""
        await self._get_or_404(attendance_id)  # 404 se não existe
        rows = await self.tenant_db.scalars(
            select(AttendanceEvent)
            .where(AttendanceEvent.attendance_id == attendance_id)
            .order_by(AttendanceEvent.created_at, AttendanceEvent.id)
        )
        return list(rows.all())

    # ── Listagem pra recepção ─────────────────────────────────────────

    async def list_for_facility(
        self,
        facility_id: UUID,
        include_closed: bool = False,
        order_mode: str = "priority_fifo",
    ) -> tuple[
        list[tuple[Attendance, HandoverInfo | None]],
        dict[UUID, list["_ScoreReason"]],
    ]:
        """Retorna atendimentos ativos da unidade + (quando há handover
        pendente) info do atendimento antigo em outra unidade, pra UI
        exibir o badge.

        Ordenação aplicada em Python (pós-fetch) porque os modos exigem
        intercalação, que não dá pra expressar direto em SQL:

        - ``fifo``: pura ordem de chegada, ignora prioridade.
        - ``priority_fifo``: intercala 2 prioritários : 1 normal,
          respeitando ordem de chegada dentro de cada grupo.
        - ``ai``: placeholder — por ora cai em ``priority_fifo``.

        Atendimentos em andamento/chamados aparecem antes dos
        aguardando, pra a recepção não perder de vista o que já tocou.
        """
        stmt = select(Attendance).where(Attendance.facility_id == facility_id)
        if not include_closed:
            stmt = stmt.where(Attendance.status.in_(Attendance.ACTIVE_STATUSES))
        stmt = stmt.order_by(Attendance.arrived_at)
        rows = list((await self.tenant_db.scalars(stmt)).all())

        rows, order_reasons = _apply_queue_order(rows, order_mode)

        # Coleta ids de handover em lote
        handover_ids = [
            r.needs_handover_from_attendance_id for r in rows
            if r.needs_handover_from_attendance_id
        ]
        handovers: dict[UUID, HandoverInfo] = {}
        if handover_ids:
            old_rows = (await self.tenant_db.scalars(
                select(Attendance).where(Attendance.id.in_(handover_ids))
            )).all()
            fac_ids = {o.facility_id for o in old_rows}
            fac_rows = (await self.app_db.scalars(
                select(Facility).where(Facility.id.in_(fac_ids))
            )).all()
            fac_map = {f.id: f for f in fac_rows}
            for o in old_rows:
                f = fac_map.get(o.facility_id)
                handovers[o.id] = HandoverInfo(
                    attendance_id=o.id,
                    facility_name=f.name if f else "—",
                    facility_short_name=f.short_name if f else "—",
                    status=o.status,  # type: ignore[arg-type]
                    started_at=o.arrived_at,
                )

        out: list[tuple[Attendance, HandoverInfo | None]] = []
        for r in rows:
            h = handovers.get(r.needs_handover_from_attendance_id) \
                if r.needs_handover_from_attendance_id else None
            out.append((r, h))
        return out, order_reasons

    # ── Face (reconhecimento + learning) ─────────────────────────────

    async def face_match(
        self, image_bytes: bytes,
    ) -> "face_service.MatchResponse":
        """Roda o match facial contra os pacientes do município.
        Não persiste nada — só retorna candidatos."""
        return await face_service.match(self.tenant_db, image_bytes=image_bytes)

    async def face_enroll_for_patient(
        self,
        device: Device,
        patient_id: UUID,
        photo_bytes: bytes,
        mime_type: str,
    ) -> None:
        """Salva a foto no gallery do paciente + atualiza o embedding.
        Usado quando paciente se confirma no totem (match facial positivo)
        OU quando a identidade é confirmada por CPF/CNS depois de uma
        foto inicial. Learning contínuo — próxima vez que essa pessoa
        chegar, o match acerta mais rápido."""
        import hashlib
        from app.db.file_model import TenantFile
        from app.db.types import new_uuid7
        from app.services.storage import get_storage

        patient = await self.tenant_db.get(Patient, patient_id)
        if patient is None:
            # Silencioso — não é crítico pro fluxo do totem.
            return

        # Se o totem estiver sem facility_id (improvável a esta altura),
        # precisa de algo pro storage_key. Usa device.id como fallback.
        facility = await self.app_db.get(Facility, device.facility_id) if device.facility_id else None
        if facility is None:
            return
        municipality = await self.app_db.get(Municipality, facility.municipality_id)
        if municipality is None:
            return

        checksum = hashlib.sha256(photo_bytes).hexdigest()
        photo_uuid = new_uuid7()
        ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(mime_type, "bin")
        storage_key = f"mun_{municipality.ibge}/patients/{patient_id}/photos/{photo_uuid}.{ext}"

        storage = get_storage()
        await storage.upload(storage_key, photo_bytes, mime_type)

        # Nome do "uploader" legível — totem X, sem user.
        uploader_name = f"Totem: {device.name or device.id}"
        try:
            file_record = TenantFile(
                storage_key=storage_key,
                original_name=f"totem-{ext}",
                mime_type=mime_type,
                size_bytes=len(photo_bytes),
                checksum_sha256=checksum,
                category="patient_photo",
                entity_id=patient.id,
                uploaded_by=None,  # sem user — é device
                uploaded_by_name=uploader_name,
            )
            self.tenant_db.add(file_record)
            await self.tenant_db.flush()

            photo = PatientPhoto(
                id=photo_uuid,
                patient_id=patient.id,
                file_id=file_record.id,
                mime_type=mime_type,
                file_size=len(photo_bytes),
                checksum_sha256=checksum,
                uploaded_by=None,
                uploaded_by_name=uploader_name,
            )
            self.tenant_db.add(photo)
            await self.tenant_db.flush()

            # Se o paciente ainda não tem foto oficial (current_photo_id
            # vazio), promove essa do totem — dá pra ver na tela de
            # confirmação. Quando a recepção subir uma oficial, ela
            # substitui. Já tendo uma official, a do totem só enriquece
            # o gallery.
            if patient.current_photo_id is None:
                patient.current_photo_id = photo.id
                await self.tenant_db.flush()
        except Exception:
            # Se o DB falhar, tenta limpar o storage pra não vazar.
            try: await storage.delete(storage_key)
            except Exception: pass
            raise

        # Learning: atualiza o embedding com essa foto nova (UPSERT 1:1).
        result = await face_service.enroll_from_photo(
            self.tenant_db,
            patient_id=patient_id,
            photo_bytes=photo_bytes,
            photo_id=photo_uuid,
        )

        # Foto muito diferente do embedding atual → possível spoofing.
        # Marca a foto + sinaliza revisão no cadastro. A recepção decide
        # (ver o gallery, excluir fotos ruins, limpar o flag).
        if result.status == "mismatch":
            photo.flagged = True
            patient.identity_review_needed = True
            patient.identity_review_reason = "face_mismatch_totem"
            patient.identity_review_at = datetime.now(UTC)
            await self.tenant_db.flush()

    # ── Internos ──────────────────────────────────────────────────────

    async def _get_or_404(self, attendance_id: UUID) -> Attendance:
        row = await self.tenant_db.get(Attendance, attendance_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Atendimento não encontrado.")
        return row

    async def _create_minimal_patient(
        self, *, name: str, cpf: str | None, cns: str | None,
    ) -> Patient:
        """Cria um paciente com dados mínimos (nome + CPF/CNS). Usado
        quando o totem recebe um doc sem match — a recepção completa
        depois. Gera prontuário sequencial no município."""
        dialect = self.tenant_db.bind.dialect.name
        if dialect == "oracle":
            sql = (
                "SELECT COALESCE(MAX(CAST(prontuario AS INTEGER)), 0) "
                "FROM patients WHERE REGEXP_LIKE(prontuario, '^[0-9]+$')"
            )
        else:
            sql = (
                "SELECT COALESCE(MAX(CAST(prontuario AS integer)), 0) "
                "FROM patients WHERE prontuario ~ '^[0-9]+$'"
            )
        last = await self.tenant_db.scalar(sa_text(sql))
        n = int(last or 0) + 1
        prontuario = f"{n:06d}"
        for _ in range(5):
            exists = await self.tenant_db.scalar(
                select(Patient.id).where(Patient.prontuario == prontuario)
            )
            if exists is None:
                break
            n += 1
            prontuario = f"{n:06d}"

        patient = Patient(
            prontuario=prontuario,
            name=name,
            cpf=cpf,
            cns=cns,
        )
        self.tenant_db.add(patient)
        await self.tenant_db.flush()
        return patient

    async def _find_active_by_doc(self, doc_value: str) -> Attendance | None:
        """Procura atendimento ativo no schema tenant atual pelo doc."""
        return await self.tenant_db.scalar(
            select(Attendance)
            .where(Attendance.doc_value == doc_value)
            .where(Attendance.status.in_(Attendance.ACTIVE_STATUSES))
            .order_by(Attendance.arrived_at.desc())
            .limit(1)
        )

    async def _next_counter(
        self, totem_id: UUID, prefix: str, period_key: str,
    ) -> int:
        """Incrementa o contador do totem pro período. Usa SELECT FOR
        UPDATE pra garantir sequência sem gaps em concorrência."""
        row = await self.app_db.scalar(
            select(TotemCounter)
            .where(and_(
                TotemCounter.totem_id == totem_id,
                TotemCounter.prefix == prefix,
                TotemCounter.period_key == period_key,
            ))
            .with_for_update()
        )
        if row is None:
            row = TotemCounter(
                totem_id=totem_id, prefix=prefix, period_key=period_key,
                current_number=1,
            )
            self.app_db.add(row)
            await self.app_db.flush()
            return 1
        row.current_number += 1
        await self.app_db.flush()
        return row.current_number

    async def _log_event(
        self,
        attendance_id: UUID,
        event_type: str,
        *,
        user_id: UUID | None = None,
        user_name: str = "",
        details: dict | None = None,
    ) -> None:
        """Registra um evento na linha do tempo do atendimento.

        Nunca levanta — falha silenciosa pra não bloquear a ação principal
        (ex.: se o log falhar, o encaminhamento ainda acontece).
        """
        try:
            ev = AttendanceEvent(
                attendance_id=attendance_id,
                event_type=event_type,
                user_id=user_id,
                user_name=(user_name or "").strip()[:200],
                details=details,
            )
            self.tenant_db.add(ev)
            await self.tenant_db.flush()
        except Exception as e:  # noqa: BLE001
            # Log estrutural existe no audit/log — timeline é operacional.
            import logging
            logging.getLogger(__name__).warning(
                "attendance_event_log_failed",
                extra={"attendance_id": str(attendance_id), "event_type": event_type, "error": str(e)},
            )

    async def _publish_status(self, att: Attendance) -> None:
        """Publica evento real-time na unidade do atendimento.

        Reusa o canal ``device:fac:{id}`` pra simplicidade — totens/painéis
        ignoram eventos que não reconhecem; futuramente pode virar canal
        separado (``fac:{id}``) se quisermos segregar interesses.
        """
        if self.valkey is None:
            return
        try:
            await publish_facility_event(
                self.valkey, att.facility_id, "attendance:status-changed",
                {
                    "id": str(att.id),
                    "status": att.status,
                    "ticket": att.ticket_number,
                },
            )
        except Exception:
            pass
