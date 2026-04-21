"""Loader que importa constantes das migrations Alembic sem executá-las.

As migrations de seed declaram listas de tuplas no topo (ex:
``NACIONALIDADES``, ``ETNIAS``). Reaproveitamos esses dados — via
``importlib`` — para não duplicar os catálogos DATASUS em dois lugares.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

_BACKEND_ROOT = Path(__file__).resolve().parents[3]
_MIGRATIONS_DIR = _BACKEND_ROOT / "migrations" / "versions"


def load_migration_module(filename: str) -> Any:
    """Importa um arquivo de migration como módulo (sem rodar ``upgrade()``).

    ``filename`` é o nome do arquivo (ex: ``20260416_0013_seed_etnias.py``).
    Retorna o módulo com todas as constantes top-level acessíveis.
    """
    path = _MIGRATIONS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Migration não encontrada: {path}")

    # Usa um nome sintético (identifier Python válido) para o módulo.
    mod_name = f"_seed_src_{filename.replace('.py', '').replace('-', '_')}"
    spec = importlib.util.spec_from_file_location(mod_name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Falha ao carregar {path}")
    module = importlib.util.module_from_spec(spec)
    # ``upgrade()`` e ``downgrade()`` ficam definidas mas não são chamadas.
    spec.loader.exec_module(module)
    return module
