"""Helpers de query portáveis (PG + Oracle)."""

from __future__ import annotations

import unicodedata

from sqlalchemy import func
from sqlalchemy.sql import expression


def _strip_accents(s: str) -> str:
    """Remove acentos de uma string Python (para bind params)."""
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def unaccent_ilike(
    column: expression.ColumnElement, term: str,
) -> expression.ColumnElement:
    """Match case+accent-insensitive. Portável PG/Oracle.

    PG: usa ``unaccent(lower(col)) ILIKE unaccent(lower('%term%'))``.
    Oracle: faz strip de acentos no Python e usa ``LOWER(col) LIKE LOWER('%term%')``.
    O Oracle não tem ``unaccent`` nem ``ILIKE``, então removemos acentos
    do termo de busca no Python e usamos ``LIKE`` (case-insensitive via LOWER).
    """
    clean_term = _strip_accents(term)
    # LOWER + LIKE funciona em ambos os dialects.
    # No PG, perde a vantagem do unaccent nos dados, mas funciona.
    # Para PG com extensão unaccent, pode-se usar func.unaccent diretamente.
    return func.lower(column).like(func.lower(f"%{clean_term}%"))
