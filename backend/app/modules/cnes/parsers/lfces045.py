"""lfces045.txt — Habilitações da unidade."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Lfces045Row:
    id_unidade: str
    codigo_habilitacao: str


def parse(line: str) -> Lfces045Row:
    return Lfces045Row(
        id_unidade         = line[0:31].strip(),
        codigo_habilitacao = line[31:35].strip(),
    )
