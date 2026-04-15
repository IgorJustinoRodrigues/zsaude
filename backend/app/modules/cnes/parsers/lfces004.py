"""lfces004.txt — Unidades de saúde.

Cada linha descreve uma unidade (estabelecimento) com CNES, razão social,
mantenedora, tipo e IBGE do município.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_ONLY_DIGITS = re.compile(r"\D")


def _digits(s: str) -> str:
    return _ONLY_DIGITS.sub("", s)


@dataclass(frozen=True, slots=True)
class Lfces004Row:
    id_unidade: str
    cnes: str
    cnpj_mantenedora: str
    razao_social: str
    nome_fantasia: str
    cpf: str
    cnpj: str
    tipo_unidade: str
    estado: str
    codigo_ibge: str  # 6 dígitos


def parse(line: str) -> Lfces004Row:
    razao  = line[53:113].strip()
    fantasia = line[113:173].strip() or razao
    return Lfces004Row(
        id_unidade       = line[0:31].strip(),
        cnes             = _digits(line[31:38]),
        cnpj_mantenedora = line[38:52].strip(),
        razao_social     = razao,
        nome_fantasia    = fantasia,
        cpf              = line[173:184].strip(),
        cnpj             = line[184:198].strip(),
        tipo_unidade     = line[198:200].strip(),
        estado           = line[200:202].strip(),
        codigo_ibge      = line[202:208].strip(),
    )
