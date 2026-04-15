"""lfces021.txt — Vínculo profissional × unidade × CBO."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Lfces021Row:
    id_unidade: str
    id_profissional: str
    id_cbo: str
    carga_horaria_ambulatorial: int
    id_conselho: str
    num_conselho: str
    status_code: str  # '2' ou '3' = Ativo, demais = Bloqueado
    carga_horaria_hospitalar: int


def _int(s: str) -> int:
    s = s.strip()
    if not s:
        return 0
    try:
        return int(s)
    except ValueError:
        return 0


def parse(line: str) -> Lfces021Row:
    return Lfces021Row(
        id_unidade                 = line[0:31].strip(),
        id_profissional            = line[31:47].strip(),
        id_cbo                     = line[47:53].strip(),
        carga_horaria_ambulatorial = _int(line[63:66]),
        id_conselho                = line[76:78].strip(),
        num_conselho               = line[78:83].strip(),
        status_code                = line[92:93].strip(),
        carga_horaria_hospitalar   = _int(line[132:135]),
    )


def is_active(status_code: str) -> bool:
    return status_code in {"2", "3"}
