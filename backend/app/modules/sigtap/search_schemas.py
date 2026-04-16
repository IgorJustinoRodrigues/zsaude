from __future__ import annotations

from decimal import Decimal

from app.core.schema_base import CamelModel


class CboOut(CamelModel):
    codigo: str
    descricao: str
    total_procedimentos: int = 0


class CidOut(CamelModel):
    codigo: str
    descricao: str
    agravo: str
    sexo: str
    total_procedimentos: int = 0


class ProcedimentoOut(CamelModel):
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
    revogado: bool


class CboProcedimentoOut(CamelModel):
    codigo_procedimento: str
    nome_procedimento: str
    complexidade: str
    valor_sh: Decimal
    valor_sa: Decimal
    valor_sp: Decimal
    competencia: str


class CidProcedimentoOut(CamelModel):
    codigo_procedimento: str
    nome_procedimento: str
    complexidade: str
    principal: str
    valor_sh: Decimal
    valor_sa: Decimal
    valor_sp: Decimal
    competencia: str


class ServicoOut(CamelModel):
    codigo: str
    descricao: str
    competencia: str
    total_classificacoes: int = 0


class ServicoProcedimentoOut(CamelModel):
    codigo_procedimento: str
    nome_procedimento: str
    complexidade: str
    codigo_classificacao: str
    valor_sh: Decimal
    valor_sa: Decimal
    valor_sp: Decimal
    competencia: str


class HabilitacaoOut(CamelModel):
    codigo: str
    descricao: str
    competencia: str
    total_procedimentos: int = 0


class HabilitacaoProcedimentoOut(CamelModel):
    codigo_procedimento: str
    nome_procedimento: str
    complexidade: str
    codigo_grupo_habilitacao: str
    valor_sh: Decimal
    valor_sa: Decimal
    valor_sp: Decimal
    competencia: str


class CompatibilidadeOut(CamelModel):
    codigo_procedimento: str
    codigo_procedimento_secundario: str
    nome_procedimento_secundario: str
    registro_principal: str
    registro_secundario: str
    tipo_compatibilidade: str
    quantidade_permitida: int
    competencia: str


class FormaOrganizacaoOut(CamelModel):
    codigo_grupo: str
    codigo_subgrupo: str
    codigo_forma: str
    descricao: str
    competencia: str


class ProcedimentoDescricaoOut(CamelModel):
    codigo_procedimento: str
    descricao: str
    competencia: str
