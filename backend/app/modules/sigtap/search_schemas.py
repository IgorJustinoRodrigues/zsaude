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
