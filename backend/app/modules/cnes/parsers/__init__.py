"""Parsers das linhas dos arquivos LFCES do CNES.

Cada módulo declara um ``parse(line)`` que devolve um ``dataclass`` imutável
com os campos já limpos. Offsets vieram do sistema legado (PHP) documentado
em ``docs/backend/cnes-import.md``.

Arquivos LFCES são ISO-8859-1. O service decodifica antes de chamar o parser.
"""

from app.modules.cnes.parsers import (  # noqa: F401
    lfces002,
    lfces004,
    lfces018,
    lfces021,
    lfces032,
    lfces037,
    lfces038,
    lfces045,
)
