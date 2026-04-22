"""DTOs do módulo Recepção — configuração por município/unidade.

A ``rec_config`` ficou reduzida aos **flags de feature** + destino pós-
atendimento. Detalhes de cada instância (formas de captura do totem,
modo do painel, áudio, lista de setores) migraram pras entidades
nomeadas (``painels``, ``totens`` — ver módulos correspondentes).

``None`` em qualquer nível significa "herdar" — do município (quando o
escopo é unidade) ou dos defaults do sistema.

``extra="ignore"`` nos submodels abaixo: dados antigos que ainda tenham
``capture``/``mode``/``announce_audio`` salvos no JSONB são
silenciosamente descartados na leitura (retrocompatível com escopos que
não passaram por um novo PATCH).
"""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from app.core.schema_base import CamelModel


# Base tolerante — aceita e descarta chaves extras vindas do banco
# (legado). Aplicado só nos sub-blocos do rec_config pra não afrouxar o
# CamelModel global (que tem ``extra="forbid"``).
class _TolerantCamelModel(CamelModel):
    model_config = ConfigDict(
        alias_generator=CamelModel.model_config["alias_generator"],
        populate_by_name=True,
        from_attributes=True,
        str_strip_whitespace=True,
        extra="ignore",
    )


# ─── Blocos aninhados ────────────────────────────────────────────────────────

class TotemConfig(_TolerantCamelModel):
    enabled: bool = True


class PainelConfig(_TolerantCamelModel):
    enabled: bool = True


QueueOrderMode = Literal["fifo", "priority_fifo", "ai"]


class RecepcaoConfig(_TolerantCamelModel):
    """Balcão/console da atendente."""

    enabled: bool = True
    # Setor pra onde o paciente vai depois do atendimento na recepção.
    # ``None`` = atendimento conclui na recepção (não encaminha).
    # O valor é o **nome do setor** (ex.: "Triagem", "Consulta médica").
    # A atendente ainda pode sobrescrever manualmente no momento de
    # encaminhar, mas esse campo é o default exibido.
    after_attendance_sector: str | None = None
    # Lista de setores disponíveis no modal de encaminhamento. ``None``
    # = mostra todos os setores do escopo (compat). Lista vazia = nenhum
    # setor aparece (caso raro). Cada item é o nome do setor. Outros
    # módulos (triagem, consulta) terão listas análogas — essa é a
    # config do módulo "Recepção".
    forward_sector_names: list[str] | None = None
    # Estratégia de ordenação da fila de espera na recepção.
    # - ``fifo``: pura ordem de chegada, sem prioridade.
    # - ``priority_fifo``: intercala prioritários e normais (default 2:1).
    # - ``ai``: ordenação dinâmica (hoje cai no priority_fifo até plugar
    #   o modelo real).
    queue_order_mode: QueueOrderMode = "priority_fifo"


# ─── Config completa ─────────────────────────────────────────────────────────

class RecConfig(_TolerantCamelModel):
    """Config completa do módulo Recepção. Todos os campos opcionais:
    ausência = herda."""

    totem: TotemConfig | None = None
    painel: PainelConfig | None = None
    recepcao: RecepcaoConfig | None = None


class RecConfigRead(CamelModel):
    """GET do recurso bruto (o que foi salvo neste escopo, sem merge)."""

    scope_type: Literal["municipality", "facility"]
    scope_id: str
    config: RecConfig | None = None


class RecConfigUpdate(CamelModel):
    """Payload do PATCH.

    - Para **limpar** a config do escopo inteiro (voltar a herdar tudo),
      envie ``{"config": null}``.
    - Para ajustar parcialmente, envie só a(s) seção(ões) que quer mexer.
      Merge raso: blocos enviados sobrescrevem por inteiro; blocos
      omitidos ficam.
    """

    config: RecConfig | None = None


class EffectiveRecConfig(CamelModel):
    """Config efetiva pós-merge (defaults → município → unidade).

    Nunca tem ``None`` nos blocos — sempre resolvido. ``sources`` indica
    quem contribuiu (útil pra exibir "herdando de..." no admin).
    """

    totem: TotemConfig
    painel: PainelConfig
    recepcao: RecepcaoConfig
    sources: dict[str, Literal["default", "municipality", "facility"]] = Field(
        default_factory=dict,
        description="Origem de cada bloco: 'default', 'municipality' ou 'facility'.",
    )
