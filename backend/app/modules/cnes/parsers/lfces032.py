"""lfces032.txt — Serviço / classificação da unidade."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Lfces032Row:
    id_unidade: str
    id_servico: str
    id_classificacao: str


def parse(line: str) -> Lfces032Row:
    return Lfces032Row(
        id_unidade       = line[0:31].strip(),
        id_servico       = line[31:34].strip(),
        id_classificacao = line[63:66].strip(),
    )
