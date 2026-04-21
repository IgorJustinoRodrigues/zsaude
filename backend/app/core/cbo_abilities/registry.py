"""Registry in-memory de abilities (catálogo de direitos clínicos).

Mesmo padrão de ``app.core.permissions.registry``: código define o
catálogo, o banco só reflete. Cada ability tem ``code`` único.

Convenção de ``code``: ``clinical.<ação>`` para ações clínicas diretas
(ex.: ``clinical.prescribe``) e ``<área>.<ação>`` para áreas específicas
(ex.: ``regulation.dispatch``).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class AbilityDef:
    code: str
    description: str


_REGISTRY: dict[str, AbilityDef] = {}


def register(code: str, description: str) -> str:
    """Registra uma ability. Retorna o próprio código (constante)."""
    if code in _REGISTRY:
        existing = _REGISTRY[code]
        if existing.description != description:
            raise ValueError(
                f"Ability {code!r} já registrada com descrição diferente: "
                f"{existing.description!r} vs {description!r}"
            )
        return code
    _REGISTRY[code] = AbilityDef(code=code, description=description)
    return code


def all_abilities() -> list[AbilityDef]:
    return sorted(_REGISTRY.values(), key=lambda a: a.code)


def has_ability(code: str) -> bool:
    return code in _REGISTRY
