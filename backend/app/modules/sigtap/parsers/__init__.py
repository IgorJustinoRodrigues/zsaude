"""Parsers posicionais dos 21 arquivos SIGTAP.

Cada parser é uma função ``parse(line: str)`` que devolve um ``@dataclass``
imutável com os campos extraídos. Todos os offsets seguem o ``*_layout.txt``
do pacote DATASUS (AAAAMM/2026 em diante).
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


def _int(s: str) -> int:
    s = s.strip()
    if not s:
        return 0
    try:
        return int(s)
    except ValueError:
        return 0


def _money(s: str) -> Decimal:
    """Converte ``"000000000120"`` → ``Decimal("1.20")`` (centavos nos últimos 2 dígitos)."""
    s = s.strip()
    if not s or not s.isdigit():
        return Decimal("0.00")
    if len(s) <= 2:
        return Decimal(f"0.{s.zfill(2)}")
    return Decimal(f"{s[:-2]}.{s[-2:]}")


# ─────────────────────────────────────────────────────────────────────
# Mestras


@dataclass(frozen=True, slots=True)
class ProcedimentoRow:
    codigo: str
    nome: str
    complexidade: str
    sexo: str
    qt_maxima: int
    qt_dias: int
    qt_pontos: int
    idade_minima: int
    idade_maxima: int
    valor_sh: Decimal
    valor_sa: Decimal
    valor_sp: Decimal
    id_financiamento: str
    competencia: str


def parse_procedimento(line: str) -> ProcedimentoRow:
    sexo_raw = line[261:262].strip() or ""
    # PHP original: "N" → "I" (indiferente)
    sexo = "I" if sexo_raw == "N" else sexo_raw
    return ProcedimentoRow(
        codigo=line[0:10].strip(),
        nome=line[10:260].strip(),
        complexidade=line[260:261].strip(),
        sexo=sexo,
        qt_maxima=_int(line[262:266]),
        qt_dias=_int(line[266:270]),
        qt_pontos=_int(line[270:274]),
        idade_minima=_int(line[274:278]),
        idade_maxima=_int(line[278:282]),
        valor_sh=_money(line[282:294]),
        valor_sa=_money(line[294:306]),
        valor_sp=_money(line[306:318]),
        id_financiamento=line[318:320].strip(),
        competencia=line[330:336].strip(),
    )


@dataclass(frozen=True, slots=True)
class OcupacaoRow:
    codigo: str
    descricao: str


def parse_ocupacao(line: str) -> OcupacaoRow:
    return OcupacaoRow(
        codigo=line[0:6].strip(),
        descricao=line[6:156].strip(),
    )


@dataclass(frozen=True, slots=True)
class CidRow:
    codigo: str
    descricao: str
    agravo: str
    sexo: str


def parse_cid(line: str) -> CidRow:
    return CidRow(
        codigo=line[0:4].strip(),
        descricao=line[4:104].strip(),
        agravo=line[104:105].strip(),
        sexo=line[105:106].strip(),
    )


@dataclass(frozen=True, slots=True)
class ModalidadeRow:
    codigo: str
    descricao: str
    competencia: str


def parse_modalidade(line: str) -> ModalidadeRow:
    return ModalidadeRow(
        codigo=line[0:2].strip(),
        descricao=line[2:102].strip(),
        competencia=line[102:108].strip(),
    )


@dataclass(frozen=True, slots=True)
class RegistroRow:
    codigo: str
    descricao: str
    competencia: str


def parse_registro(line: str) -> RegistroRow:
    return RegistroRow(
        codigo=line[0:2].strip(),
        descricao=line[2:52].strip(),
        competencia=line[52:58].strip(),
    )


@dataclass(frozen=True, slots=True)
class ServicoRow:
    codigo: str
    descricao: str
    competencia: str


def parse_servico(line: str) -> ServicoRow:
    return ServicoRow(
        codigo=line[0:3].strip(),
        descricao=line[3:123].strip(),
        competencia=line[123:129].strip(),
    )


@dataclass(frozen=True, slots=True)
class ServicoClassificacaoRow:
    codigo_servico: str
    codigo_classificacao: str
    descricao: str
    competencia: str


def parse_servico_classificacao(line: str) -> ServicoClassificacaoRow:
    return ServicoClassificacaoRow(
        codigo_servico=line[0:3].strip(),
        codigo_classificacao=line[3:6].strip(),
        descricao=line[6:106].strip(),
        competencia=line[156:162].strip(),
    )


@dataclass(frozen=True, slots=True)
class DescricaoRow:
    codigo_procedimento: str
    descricao: str
    competencia: str


def parse_descricao(line: str) -> DescricaoRow:
    return DescricaoRow(
        codigo_procedimento=line[0:10].strip(),
        descricao=line[10:4010].replace("'", "").strip(),
        competencia=line[4010:4016].strip(),
    )


@dataclass(frozen=True, slots=True)
class FormaOrganizacaoRow:
    codigo_grupo: str
    codigo_subgrupo: str
    codigo_forma: str
    descricao: str
    competencia: str


def parse_forma_organizacao(line: str) -> FormaOrganizacaoRow:
    return FormaOrganizacaoRow(
        codigo_grupo=line[0:2].strip(),
        codigo_subgrupo=line[2:4].strip(),
        codigo_forma=line[4:6].strip(),
        descricao=line[6:106].strip(),
        competencia=line[106:112].strip(),
    )


@dataclass(frozen=True, slots=True)
class HabilitacaoRow:
    codigo: str
    descricao: str
    competencia: str


def parse_habilitacao(line: str) -> HabilitacaoRow:
    return HabilitacaoRow(
        codigo=line[0:4].strip(),
        descricao=line[4:154].strip(),
        competencia=line[154:160].strip(),
    )


@dataclass(frozen=True, slots=True)
class GrupoHabilitacaoRow:
    codigo: str
    nome_grupo: str
    descricao: str


def parse_grupo_habilitacao(line: str) -> GrupoHabilitacaoRow:
    return GrupoHabilitacaoRow(
        codigo=line[0:4].strip(),
        nome_grupo=line[4:24].strip(),
        descricao=line[24:298].strip(),
    )


# ─────────────────────────────────────────────────────────────────────
# Relações


@dataclass(frozen=True, slots=True)
class ProcedimentoCidRow:
    codigo_procedimento: str
    codigo_cid: str
    principal: str
    competencia: str


def parse_procedimento_cid(line: str) -> ProcedimentoCidRow:
    return ProcedimentoCidRow(
        codigo_procedimento=line[0:10].strip(),
        codigo_cid=line[10:14].strip(),
        principal=line[14:15].strip(),
        competencia=line[15:21].strip(),
    )


@dataclass(frozen=True, slots=True)
class ProcedimentoOcupacaoRow:
    codigo_procedimento: str
    codigo_cbo: str
    competencia: str


def parse_procedimento_ocupacao(line: str) -> ProcedimentoOcupacaoRow:
    return ProcedimentoOcupacaoRow(
        codigo_procedimento=line[0:10].strip(),
        codigo_cbo=line[10:16].strip(),
        competencia=line[16:22].strip(),
    )


@dataclass(frozen=True, slots=True)
class ProcedimentoModalidadeRow:
    codigo_procedimento: str
    codigo_modalidade: str
    competencia: str


def parse_procedimento_modalidade(line: str) -> ProcedimentoModalidadeRow:
    return ProcedimentoModalidadeRow(
        codigo_procedimento=line[0:10].strip(),
        codigo_modalidade=line[10:12].strip(),
        competencia=line[12:18].strip(),
    )


@dataclass(frozen=True, slots=True)
class ProcedimentoRegistroRow:
    codigo_procedimento: str
    codigo_registro: str
    competencia: str


def parse_procedimento_registro(line: str) -> ProcedimentoRegistroRow:
    return ProcedimentoRegistroRow(
        codigo_procedimento=line[0:10].strip(),
        codigo_registro=line[10:12].strip(),
        competencia=line[12:18].strip(),
    )


@dataclass(frozen=True, slots=True)
class ProcedimentoCompatibilidadeRow:
    codigo_procedimento: str
    registro_principal: str
    codigo_procedimento_secundario: str
    registro_secundario: str
    tipo_compatibilidade: str
    quantidade_permitida: int
    competencia: str


def parse_procedimento_compatibilidade(line: str) -> ProcedimentoCompatibilidadeRow:
    return ProcedimentoCompatibilidadeRow(
        codigo_procedimento=line[0:10].strip(),
        registro_principal=line[10:12].strip(),
        codigo_procedimento_secundario=line[12:22].strip(),
        registro_secundario=line[22:24].strip(),
        tipo_compatibilidade=line[24:25].strip(),
        quantidade_permitida=_int(line[25:29]),
        competencia=line[29:35].strip(),
    )


@dataclass(frozen=True, slots=True)
class ProcedimentoDetalheRow:
    codigo_procedimento: str
    codigo_lista_validacao: str
    competencia: str


def parse_procedimento_detalhe(line: str) -> ProcedimentoDetalheRow:
    return ProcedimentoDetalheRow(
        codigo_procedimento=line[0:10].strip(),
        codigo_lista_validacao=line[10:13].strip(),
        competencia=line[13:19].strip(),
    )


@dataclass(frozen=True, slots=True)
class ProcedimentoServicoRow:
    codigo_procedimento: str
    codigo_servico: str
    codigo_classificacao: str
    competencia: str


def parse_procedimento_servico(line: str) -> ProcedimentoServicoRow:
    return ProcedimentoServicoRow(
        codigo_procedimento=line[0:10].strip(),
        codigo_servico=line[10:13].strip(),
        codigo_classificacao=line[13:16].strip(),
        competencia=line[16:22].strip(),
    )


@dataclass(frozen=True, slots=True)
class ProcedimentoLeitoRow:
    codigo_procedimento: str
    codigo_tipo_leito: str
    competencia: str


def parse_procedimento_leito(line: str) -> ProcedimentoLeitoRow:
    return ProcedimentoLeitoRow(
        codigo_procedimento=line[0:10].strip(),
        codigo_tipo_leito=line[10:12].strip(),
        competencia=line[12:18].strip(),
    )


@dataclass(frozen=True, slots=True)
class ProcedimentoRegraCondRow:
    codigo_procedimento: str
    regra_condicionada: str


def parse_procedimento_regra_cond(line: str) -> ProcedimentoRegraCondRow:
    return ProcedimentoRegraCondRow(
        codigo_procedimento=line[0:10].strip(),
        regra_condicionada=line[10:24].strip(),
    )


@dataclass(frozen=True, slots=True)
class ProcedimentoHabilitacaoRow:
    codigo_procedimento: str
    codigo_habilitacao: str
    codigo_grupo_habilitacao: str
    competencia: str


def parse_procedimento_habilitacao(line: str) -> ProcedimentoHabilitacaoRow:
    return ProcedimentoHabilitacaoRow(
        codigo_procedimento=line[0:10].strip(),
        codigo_habilitacao=line[10:14].strip(),
        codigo_grupo_habilitacao=line[14:18].strip(),
        competencia=line[18:24].strip(),
    )
