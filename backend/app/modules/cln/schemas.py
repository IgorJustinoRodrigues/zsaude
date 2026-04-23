"""DTOs do módulo Clínico.

``cln_config`` tem 4 campos (todos opcionais na entrada — ausência =
herda):

- ``enabled``: módulo ativo nesta unidade/município
- ``triagem_enabled``: se o fluxo passa por triagem antes do atendimento
- ``triagem_sector_name``: setor cujos tickets alimentam a fila de triagem
- ``atendimento_sector_name``: setor cujos tickets alimentam a fila de
  atendimento final

Quando ``triagem_enabled=false``, ``triagem_sector_name`` é ignorado e a
recepção encaminha direto pra ``atendimento_sector_name``.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field

from app.core.schema_base import CamelModel


class _TolerantCamelModel(CamelModel):
    """Tolerante com campos extras — ajuda em migrações de config."""

    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
        from_attributes=True,
    )


class ClnConfig(_TolerantCamelModel):
    """Config do módulo Clínico. Todos os campos opcionais — ausência = herda."""

    enabled: bool | None = None
    triagem_enabled: bool | None = None
    triagem_sector_name: str | None = None
    atendimento_sector_name: str | None = None


class ClnConfigRead(CamelModel):
    """GET do recurso bruto (o que foi salvo neste escopo, sem merge)."""

    scope_type: Literal["municipality", "facility"]
    scope_id: str
    config: ClnConfig | None = None


class ClnConfigUpdate(CamelModel):
    """Payload do PATCH.

    - ``{"config": null}`` limpa a config do escopo (volta a herdar tudo).
    - Parcial: só envia as chaves que quer mexer.
    """

    config: ClnConfig | None = None


class EffectiveClnConfig(CamelModel):
    """Config efetiva pós-merge (defaults → município → unidade)."""

    enabled: bool
    triagem_enabled: bool
    triagem_sector_name: str | None = None
    atendimento_sector_name: str | None = None
    sources: dict[str, Literal["default", "municipality", "facility"]] = Field(
        default_factory=dict,
        description="Origem de cada campo: 'default', 'municipality' ou 'facility'.",
    )


# ─── Fila / ações ────────────────────────────────────────────────────

ClnStatus = Literal[
    "triagem_waiting", "sector_waiting",
    "cln_called", "cln_attending",
    "finished", "cancelled", "evasion",
    "referred",
]


class ClnQueueItem(CamelModel):
    """Item da fila (triagem ou atendimento)."""

    id: UUID
    facility_id: UUID
    ticket_number: str
    priority: bool
    patient_id: UUID | None = None
    patient_name: str
    status: ClnStatus
    sector_name: str | None = None
    arrived_at: datetime
    called_at: datetime | None = None
    started_at: datetime | None = None
    # Usuário que está atendendo (preenchido quando ticket foi iniciado).
    # Útil pra outros atendentes saberem quem já pegou o paciente.
    started_by_user_id: UUID | None = None
    started_by_user_name: str | None = None
    # Grupo prioritário — resolvido via join em bulk nas listagens.
    priority_group_id: UUID | None = None
    priority_group_label: str | None = None
    # Nº de registros de triagem deste ticket — 0 = nunca triado,
    # 1 = triado normal, ≥2 = retriagem.
    triage_count: int = 0


class CancelInput(CamelModel):
    reason: str = ""


class UbsOut(CamelModel):
    """Unidade UBS no município — pra select de encaminhamento."""
    id: UUID
    name: str
    short_name: str
    cnes: str | None = None


class ReferInput(CamelModel):
    """Payload de POST /cln/tickets/:id/refer."""
    ubs_facility_id: UUID


class ReferralGuideOut(CamelModel):
    """Dados consolidados da guia de encaminhamento (tela de impressão)."""
    ticket_id: UUID
    ticket_number: str
    patient_name: str
    patient_doc_type: str
    patient_doc_value: str | None = None
    patient_birth_date: str | None = None
    patient_sex: str | None = None

    risk_classification: int
    risk_label: str
    complaint_code: str | None = None
    complaint_name: str | None = None
    queixa: str = ""
    observacoes: str = ""

    origin_facility_id: UUID
    origin_facility_name: str
    ubs_id: UUID
    ubs_name: str
    ubs_short_name: str
    ubs_cnes: str | None = None

    referred_at: datetime
    referred_by_user_id: UUID | None = None
    referred_by_user_name: str


# ─── Grupos prioritários ────────────────────────────────────────────

class PriorityGroupOut(CamelModel):
    id: UUID
    name: str
    description: str
    display_order: int
    archived: bool


class PriorityGroupCreate(CamelModel):
    name: str
    description: str = ""
    display_order: int = 0


class PriorityGroupUpdate(CamelModel):
    name: str | None = None
    description: str | None = None
    display_order: int | None = None
    archived: bool | None = None


class SetPriorityGroupInput(CamelModel):
    """Define ou remove o grupo prioritário de um ticket."""
    priority_group_id: UUID | None = None


class TriageInput(CamelModel):
    """Payload de triagem + liberação (usado por POST /cln/tickets/:id/triagem).

    Campos opcionais ficam ``None`` quando o profissional não aferiu.
    ``risk_classification`` é obrigatório (1 = emergência, 5 = não urgente).
    """
    queixa: str = ""
    observacoes: str = ""

    pa_sistolica: int | None = None
    pa_diastolica: int | None = None
    fc: int | None = None
    fr: int | None = None
    temperatura: float | None = None
    spo2: float | None = None
    glicemia: int | None = None
    dor: int = 0

    # Antropometria (Fase D). ``imc`` é calculado no cliente e persistido —
    # garante consistência com o que foi exibido ao profissional.
    peso: float | None = None
    altura: int | None = None
    imc: float | None = None

    # Perímetros em cm (Fase D).
    perimetro_cefalico: float | None = None
    perimetro_abdominal: float | None = None
    perimetro_toracico: float | None = None
    perimetro_panturrilha: float | None = None

    # Gestação (Fase D). ``gestante`` null = não perguntado (paciente
    # masculino, anônimo sem aferir). ``dum`` + ``semanas_gestacao`` podem
    # ser usados juntos (semanas como override quando DUM desconhecida).
    gestante: bool | None = None
    dum: date | None = None
    semanas_gestacao: int | None = None

    risk_classification: int
    # Protocolo Campinas (Fase G) — preenchidos quando triador usa um
    # fluxograma. ``complaint_code`` é a queixa escolhida;
    # ``risk_auto_suggested`` vem do fluxograma;
    # ``risk_override_reason`` é obrigatório quando o triador fecha
    # numa classificação diferente da sugestão.
    risk_auto_suggested: int | None = None
    risk_override_reason: str | None = None
    complaint_code: str | None = None
    # Opcional: o triador pode ajustar/confirmar o grupo prioritário.
    priority_group_id: UUID | None = None


ProcedureSource = Literal["manual", "auto_triagem", "auto_atendimento"]


class AttendanceProcedureOut(CamelModel):
    """Procedimento marcado num atendimento, enriquecido com nome e valores
    do catálogo SIGTAP (resolvido em bulk no read)."""

    id: UUID
    attendance_id: UUID
    codigo: str
    nome: str
    competencia: str
    quantidade: int
    source: ProcedureSource
    complexidade: str | None = None
    marked_by_user_id: UUID | None = None
    marked_by_user_name: str
    marked_at: datetime


class AddProcedureInput(CamelModel):
    """Payload do POST /cln/tickets/:id/procedures — marca manual."""

    codigo: str
    quantidade: int = 1


class PendingAutoProcedureOut(CamelModel):
    """Procedimento que SERÁ auto-marcado no próximo checkpoint do
    ticket (ao liberar a triagem ou finalizar o atendimento) — "ghost"
    exibido pelo frontend pra dar feedback visual."""
    codigo: str
    nome: str
    source: Literal["auto_triagem", "auto_atendimento"]
    trigger: Literal["on_release", "on_finish"]


class ProcedureSearchResultOut(CamelModel):
    """Resultado de busca filtrada por CBO do profissional."""

    codigo: str
    nome: str
    complexidade: str | None = None
    competencia: str


class TriageRecordOut(CamelModel):
    id: UUID
    attendance_id: UUID
    queixa: str
    observacoes: str
    pa_sistolica: int | None = None
    pa_diastolica: int | None = None
    fc: int | None = None
    fr: int | None = None
    temperatura: float | None = None
    spo2: float | None = None
    glicemia: int | None = None
    dor: int
    # Antropometria + perímetros + gestação (Fase D).
    peso: float | None = None
    altura: int | None = None
    imc: float | None = None
    perimetro_cefalico: float | None = None
    perimetro_abdominal: float | None = None
    perimetro_toracico: float | None = None
    perimetro_panturrilha: float | None = None
    gestante: bool | None = None
    dum: date | None = None
    semanas_gestacao: int | None = None
    risk_classification: int
    risk_auto_suggested: int | None = None
    risk_override_reason: str | None = None
    complaint_code: str | None = None
    triaged_by_user_id: UUID | None = None
    triaged_by_user_name: str
    created_at: datetime
