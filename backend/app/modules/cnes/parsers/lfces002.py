"""lfces002.txt — Leitos por unidade."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Lfces002Row:
    id_unidade: str
    id_leito: str
    id_tipo_leito: str
    quantidade_existente: int
    quantidade_sus: int


def _int(s: str) -> int:
    s = s.strip()
    if not s:
        return 0
    try:
        return int(s)
    except ValueError:
        return 0


def parse(line: str) -> Lfces002Row:
    return Lfces002Row(
        id_unidade           = line[0:31].strip(),
        id_leito             = line[31:33].strip(),
        id_tipo_leito        = line[33:35].strip(),
        quantidade_existente = _int(line[36:40]),
        quantidade_sus       = _int(line[42:46]),
    )
