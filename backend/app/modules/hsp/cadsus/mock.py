"""Modo mock da integração CadSUS — útil em dev sem acesso ao DATASUS.

Ativado via CADSUS_MOCK=true no .env. Retorna 1-2 pacientes fake quando
um critério válido é informado.
"""

from __future__ import annotations

import re

from app.modules.hsp.cadsus.schemas import CadsusAddress, CadsusPatientResult


def _only_digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


_SAMPLE = CadsusPatientResult(
    cns="898001234567890",
    nome="MARIA APARECIDA DA SILVA",
    nome_mae="ANA MARIA DA SILVA",
    nome_pai="JOSE CARLOS DA SILVA",
    data_nascimento="1985-03-12",
    sexo="F",
    raca_cor="3",
    telefone="62999998888",
    cpf="39053344705",
    rg="1234567",
    naturalidade_ibge="5208707",  # Goiânia/GO
    endereco=CadsusAddress(
        cep="74110010",
        tipo="RUA",
        logradouro="RUA 1",
        numero="100",
        complemento="CASA",
        bairro="SETOR CENTRAL",
        ibge="5208707",
        ibge_original="520870",
        pais="BRA",
    ),
)


def mock_search(
    *,
    cpf: str | None = None,
    cns: str | None = None,
    nome: str | None = None,
    data_nascimento: str | None = None,
    nome_mae: str | None = None,
    sexo: str | None = None,
) -> list[CadsusPatientResult]:
    """Devolve o paciente-exemplo ajustado com o valor buscado."""
    cpf_c = _only_digits(cpf or "")
    cns_c = _only_digits(cns or "")

    if len(cpf_c) != 11 and len(cns_c) != 15 and not (nome or nome_mae):
        return []

    result = _SAMPLE.model_copy(deep=True)
    if len(cpf_c) == 11:
        result.cpf = cpf_c
    if len(cns_c) == 15:
        result.cns = cns_c
    if nome:
        result.nome = nome.upper()
    if data_nascimento:
        result.data_nascimento = data_nascimento
    if nome_mae:
        result.nome_mae = nome_mae.upper()
    if sexo in ("M", "F"):
        result.sexo = sexo

    return [result]
