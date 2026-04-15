"""lfces038.txt — Profissional × equipe.

``id_unidade`` fica na posição 34-65 (após id_profissional).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Lfces038Row:
    codigo_ibge: str        # 6
    codigo_area: str        # 4
    sequencial_equipe: str  # 8
    id_profissional: str    # 16
    id_unidade: str         # 31
    codigo_cbo: str         # 6


def parse(line: str) -> Lfces038Row:
    return Lfces038Row(
        codigo_ibge       = line[0:6].strip(),
        codigo_area       = line[6:10].strip(),
        sequencial_equipe = line[10:18].strip(),
        id_profissional   = line[18:34].strip(),
        id_unidade        = line[34:65].strip(),
        codigo_cbo        = line[65:71].strip(),
    )
