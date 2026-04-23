"""Catálogo mínimo do protocolo Campinas — Fase G.

Lista estática por ora — sem CRUD. Cada fluxograma ``Complaint`` tem um
``code`` único e uma lista ordenada de ``Discriminator``, do mais grave
(nível 1 — emergência) ao menos grave. A UI mostra os discriminadores e
calcula a sugestão de classificação com base no MAIS GRAVE que o triador
marcou (menor valor vence).

Quando o triador não usa protocolo (casos fora do catálogo, queixa
administrativa), ``complaint_code`` fica null no ``TriageRecord`` e
``risk_auto_suggested`` também — classificação é 100% manual.

Migração pra DB (tabelas tenant + CRUD MASTER) fica pra Fase G2 se
município precisar customizar fluxogramas. Seed inicial cobre ~80% das
demandas comuns em UPA/AB.
"""
from __future__ import annotations

from typing import Literal

from app.core.schema_base import CamelModel


Risk = Literal[1, 2, 3, 4, 5]


class Discriminator(CamelModel):
    """Pergunta fechada (sim/não) com classificação associada.

    Presente na UI como toggle. ``risk`` é o nível que este discriminador
    dispara quando marcado — ``1`` (emergência) a ``5`` (não urgente).
    """
    code: str
    text: str
    risk: int


class Complaint(CamelModel):
    """Fluxograma — queixa principal com seus discriminadores."""
    code: str
    name: str
    description: str = ""
    discriminators: list[Discriminator]


# ─── Catálogo mínimo (8 fluxogramas) ─────────────────────────────────


CAMPINAS_PROTOCOL: list[Complaint] = [
    Complaint(
        code="dor_toracica",
        name="Dor torácica",
        description="Dor, aperto ou opressão no peito — investigue cardíaca, respiratória e músculo-esquelética.",
        discriminators=[
            Discriminator(code="choque", text="Sinais de choque (PA < 90, perfusão ruim, pulso filiforme)", risk=1),
            Discriminator(code="dor_isquemica", text="Dor típica isquêmica (retroesternal, irradia p/ braço/mandíbula, sudorese)", risk=1),
            Discriminator(code="dispneia_grave", text="Dispneia grave (fala entrecortada, tiragem)", risk=1),
            Discriminator(code="dor_intensa", text="Dor intensa (≥7/10) persistente", risk=2),
            Discriminator(code="saturacao_baixa", text="SpO₂ < 94% em ar ambiente", risk=2),
            Discriminator(code="historia_iam", text="História prévia de IAM / revascularização", risk=2),
            Discriminator(code="dor_moderada", text="Dor moderada (4-6/10) recente", risk=3),
            Discriminator(code="dor_pleuritica", text="Dor ventilatório-dependente, sem sinais graves", risk=3),
            Discriminator(code="dor_leve", text="Dor leve (<4/10), estável há horas", risk=4),
        ],
    ),
    Complaint(
        code="dispneia",
        name="Dispneia / falta de ar",
        description="Sensação de falta de ar aguda ou crônica agudizada.",
        discriminators=[
            Discriminator(code="insuf_resp", text="Insuficiência respiratória (tiragem, cianose, confusão)", risk=1),
            Discriminator(code="saturacao_critica", text="SpO₂ < 90% em ar ambiente", risk=1),
            Discriminator(code="dispneia_repouso", text="Dispneia em repouso, frases curtas", risk=2),
            Discriminator(code="sibilos_intensos", text="Sibilos intensos / peito silencioso (asma grave)", risk=2),
            Discriminator(code="taquipneia", text="FR > 28 irpm", risk=2),
            Discriminator(code="dispneia_esforco", text="Dispneia aos pequenos esforços", risk=3),
            Discriminator(code="tosse_persistente", text="Tosse persistente há dias, sem sinais graves", risk=4),
        ],
    ),
    Complaint(
        code="cefaleia",
        name="Cefaleia / dor de cabeça",
        description="Dor de cabeça aguda — investigue sinais de alarme neurológico.",
        discriminators=[
            Discriminator(code="sinais_neuro", text="Déficit neurológico focal / rebaixamento / convulsão", risk=1),
            Discriminator(code="pior_vida", text="Cefaleia súbita 'pior da vida' (thunderclap)", risk=1),
            Discriminator(code="febre_rigidez", text="Febre alta + rigidez de nuca", risk=1),
            Discriminator(code="vomito_incoercivel", text="Vômitos em jato / incoercíveis", risk=2),
            Discriminator(code="dor_intensa", text="Dor intensa (≥8/10) resistente a analgésico comum", risk=2),
            Discriminator(code="pa_muito_alta", text="PA sistólica > 180 ou diastólica > 120", risk=2),
            Discriminator(code="primeiro_episodio_intenso", text="Primeiro episódio intenso, pós-40 anos", risk=3),
            Discriminator(code="dor_moderada", text="Dor moderada, padrão similar a crises anteriores", risk=4),
            Discriminator(code="dor_leve", text="Dor leve, sem sinais de alarme", risk=5),
        ],
    ),
    Complaint(
        code="febre",
        name="Febre",
        description="Elevação de temperatura corporal — investigue foco infeccioso e sinais de sepse.",
        discriminators=[
            Discriminator(code="sepse", text="Sinais de sepse (hipotensão, confusão, perfusão alterada)", risk=1),
            Discriminator(code="temp_extrema", text="Temperatura > 40°C", risk=2),
            Discriminator(code="febre_imunossuprimido", text="Paciente imunossuprimido / neoplásico em tratamento", risk=2),
            Discriminator(code="febre_lactente", text="Lactente < 3 meses com febre", risk=2),
            Discriminator(code="febre_persistente", text="Febre persistente > 3 dias, sem foco claro", risk=3),
            Discriminator(code="febre_simples", text="Febre com sintomas respiratórios/URI típicos", risk=4),
        ],
    ),
    Complaint(
        code="dor_abdominal",
        name="Dor abdominal",
        description="Dor abdominal aguda — considere abdome agudo cirúrgico e origem extra-abdominal.",
        discriminators=[
            Discriminator(code="abdome_agudo", text="Abdome em tábua / sinais peritoneais / choque", risk=1),
            Discriminator(code="hemorragia_digestiva", text="Sangramento ativo (hematêmese, melena, enterorragia)", risk=1),
            Discriminator(code="dor_lacerante", text="Dor lacerante irradiada pro dorso (dissecção / AAA)", risk=1),
            Discriminator(code="dor_intensa", text="Dor intensa (≥7/10) com vômitos persistentes", risk=2),
            Discriminator(code="gestante_dor", text="Gestante com dor abdominal", risk=2),
            Discriminator(code="dor_moderada", text="Dor moderada, localizada, sem sinais graves", risk=3),
            Discriminator(code="dispepsia", text="Queimação epigástrica / dispepsia há dias", risk=4),
        ],
    ),
    Complaint(
        code="trauma",
        name="Trauma",
        description="Lesão recente por causa externa — queda, acidente, agressão.",
        discriminators=[
            Discriminator(code="trauma_grave", text="Mecanismo de alta energia (ejeção, capotamento, queda >3m)", risk=1),
            Discriminator(code="glasgow_baixo", text="Glasgow ≤ 12 / alteração de consciência", risk=1),
            Discriminator(code="hemorragia_ativa", text="Hemorragia externa ativa significativa", risk=1),
            Discriminator(code="fratura_exposta", text="Fratura exposta ou deformidade grosseira", risk=2),
            Discriminator(code="tce_leve", text="TCE leve com cefaleia / vômito persistente", risk=2),
            Discriminator(code="fratura_fechada", text="Suspeita de fratura fechada", risk=3),
            Discriminator(code="contusao", text="Contusão / escoriação sem sinais graves", risk=4),
        ],
    ),
    Complaint(
        code="dor_lombar",
        name="Dor lombar",
        description="Lombalgia aguda — considerar red flags (infeccioso, neurológico, oncológico).",
        discriminators=[
            Discriminator(code="sindrome_cauda", text="Perda de força MMII / incontinência / anestesia em sela", risk=1),
            Discriminator(code="febre_lombar", text="Febre associada + dor localizada (osteomielite?)", risk=2),
            Discriminator(code="dor_ciatica", text="Dor irradiada com déficit motor/sensitivo", risk=3),
            Discriminator(code="dor_mecanica", text="Dor mecânica, sem red flags, pós-esforço", risk=4),
        ],
    ),
    Complaint(
        code="queixa_geral",
        name="Queixa geral / outro",
        description="Queixa não enquadrada em fluxograma específico — triador avalia caso a caso.",
        discriminators=[
            Discriminator(code="risco_iminente", text="Risco iminente de vida / descompensação súbita", risk=1),
            Discriminator(code="sinais_alarme", text="Sinais de alarme: alteração sensório, hipoxemia, choque", risk=2),
            Discriminator(code="sintoma_agudo", text="Sintoma agudo / desconforto moderado", risk=3),
            Discriminator(code="sintoma_leve", text="Sintoma leve / crônico estável", risk=4),
            Discriminator(code="demanda_admin", text="Demanda administrativa (renovação receita, atestado)", risk=5),
        ],
    ),
]


def complaint_by_code(code: str) -> Complaint | None:
    for c in CAMPINAS_PROTOCOL:
        if c.code == code:
            return c
    return None


def suggest_risk(complaint_code: str, marked: list[str]) -> int | None:
    """Dado o fluxograma e os códigos de discriminadores marcados,
    retorna a classificação sugerida (menor valor = mais grave vence).
    None se nada bate ou fluxograma inválido."""
    c = complaint_by_code(complaint_code)
    if c is None:
        return None
    matched: list[int] = [d.risk for d in c.discriminators if d.code in set(marked)]
    return min(matched) if matched else None
