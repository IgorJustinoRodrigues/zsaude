"""Registry em memória das permissões declaradas no código."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class PermissionDef:
    code: str
    module: str
    resource: str
    action: str
    description: str


_REGISTRY: dict[str, PermissionDef] = {}


def register(code: str, description: str) -> str:
    """Registra uma permissão. Retorna o próprio código (para usar como constante)."""
    if code in _REGISTRY:
        existing = _REGISTRY[code]
        if existing.description != description:
            raise ValueError(
                f"Permissão {code!r} já registrada com descrição diferente: "
                f"{existing.description!r} vs {description!r}"
            )
        return code

    parts = code.split(".")
    if len(parts) != 3 or not all(parts):
        raise ValueError(
            f"Código deve ser 'modulo.recurso.acao', recebido {code!r}"
        )

    module, resource, action = parts
    _REGISTRY[code] = PermissionDef(
        code=code,
        module=module,
        resource=resource,
        action=action,
        description=description,
    )
    return code


def all_permissions() -> list[PermissionDef]:
    """Todas as permissões registradas, ordenadas pelo code."""
    return sorted(_REGISTRY.values(), key=lambda p: p.code)


def has_permission(code: str) -> bool:
    return code in _REGISTRY
