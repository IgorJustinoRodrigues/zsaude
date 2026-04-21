"""DTOs do módulo Recepção — configuração por município/unidade.

A config é um dicionário estruturado em três funções (totem, painel,
recepção/balcão). Cada função tem um flag ``enabled`` e campos
específicos. ``None`` em qualquer nível significa "herdar" — do
município (quando o escopo é unidade) ou dos defaults do sistema.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.core.schema_base import CamelModel


# ─── Blocos aninhados ────────────────────────────────────────────────────────

class TotemCapture(CamelModel):
    """Formas de identificação aceitas no totem."""

    cpf: bool = True
    cns: bool = True
    face: bool = False          # reconhecimento facial (exige câmera)
    manual_name: bool = True    # permite entrar só com nome (sem doc)


class TotemConfig(CamelModel):
    enabled: bool = True
    capture: TotemCapture = Field(default_factory=TotemCapture)
    priority_prompt: bool = True   # pergunta "você tem prioridade?"


class PainelConfig(CamelModel):
    enabled: bool = True
    mode: Literal["senha", "nome", "ambos"] = "senha"
    announce_audio: bool = True   # TTS ao chamar


class RecepcaoConfig(CamelModel):
    """Balcão/console da atendente."""

    enabled: bool = True
    # Pra onde o paciente vai depois do atendimento na recepção.
    after_attendance: Literal["triagem", "consulta", "nenhum"] = "triagem"


# ─── Config completa ─────────────────────────────────────────────────────────

class RecConfig(CamelModel):
    """Config completa do módulo Recepção. Todos os campos opcionais:
    ausência = herda."""

    totem: TotemConfig | None = None
    painel: PainelConfig | None = None
    recepcao: RecepcaoConfig | None = None


class RecConfigRead(CamelModel):
    """GET do recurso bruto (o que foi salvo neste escopo, sem merge).

    Se o escopo nunca foi configurado, retorna ``config=None`` —
    o frontend mostra os campos como "herdando".
    """

    scope_type: Literal["municipality", "facility"]
    scope_id: str
    config: RecConfig | None = None


class RecConfigUpdate(CamelModel):
    """Payload do PATCH.

    - Para **limpar** a config do escopo inteiro (voltar a herdar tudo),
      envie ``{"config": null}``.
    - Para ajustar parcialmente, envie o dicionário parcial. Merge raso:
      blocos enviados sobrescrevem por inteiro; blocos omitidos ficam.
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
