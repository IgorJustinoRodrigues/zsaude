"""Schemas I/O da integração CadSUS."""

from __future__ import annotations

from pydantic import Field

from app.core.schema_base import CamelModel


class CadsusAddress(CamelModel):
    cep: str = ""
    logradouro: str = ""
    tipo: str = ""
    numero: str = ""
    complemento: str = ""
    bairro: str = ""
    ibge: str = ""             # 7 dígitos (IBGE oficial)
    ibge_original: str = ""    # 6 dígitos como recebido do CADSUS
    pais: str = ""


class CadsusPatientResult(CamelModel):
    """Resultado normalizado vindo do DATASUS.

    Todos os campos são opcionais porque CadSUS pode omitir qualquer
    um deles dependendo do cadastro no sistema federal.
    """
    cns: str = ""
    nome: str = ""
    nome_mae: str = ""
    nome_pai: str = ""
    data_nascimento: str = ""     # ISO AAAA-MM-DD
    sexo: str = ""                # M / F
    raca_cor: str = ""            # código DATASUS
    telefone: str = ""
    cpf: str = ""
    rg: str = ""
    naturalidade_ibge: str = ""   # 7 dígitos
    endereco: CadsusAddress = Field(default_factory=CadsusAddress)


class CadsusSearchResponse(CamelModel):
    items: list[CadsusPatientResult]
    source: str = "pdq"           # "pdq" | "mock"
