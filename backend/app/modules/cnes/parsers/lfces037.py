"""lfces037.txt — Equipes (ESF, NASF, etc).

Atenção: ``id_unidade`` fica na posição 18-49, não no início.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Lfces037Row:
    codigo_ibge: str        # 6 dígitos
    codigo_area: str        # 4
    sequencial_equipe: str  # 8
    id_unidade: str         # 31
    tipo_equipe: str        # 2
    nome_equipe: str        # até 60


def parse(line: str) -> Lfces037Row:
    return Lfces037Row(
        codigo_ibge       = line[0:6].strip(),
        codigo_area       = line[6:10].strip(),
        sequencial_equipe = line[10:18].strip(),
        id_unidade        = line[18:49].strip(),
        tipo_equipe       = line[49:51].strip(),
        nome_equipe       = line[51:111].strip(),
    )
