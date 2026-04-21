"""lfces018.txt — Profissionais."""

from __future__ import annotations

import re
from dataclasses import dataclass

_ONLY_DIGITS = re.compile(r"\D")


def _digits(s: str) -> str:
    return _ONLY_DIGITS.sub("", s)


@dataclass(frozen=True, slots=True)
class Lfces018Row:
    id_profissional: str
    cpf: str
    nome: str
    cns: str


def parse(line: str) -> Lfces018Row:
    return Lfces018Row(
        id_profissional = line[0:16].strip(),
        cpf             = line[16:27].strip(),
        nome            = line[27:87].strip(),
        cns             = _digits(line[87:102]),
    )
