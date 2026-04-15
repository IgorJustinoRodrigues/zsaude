"""Registry de permissões do sistema.

As permissões são definidas **no código** (source of truth) e espelhadas na
tabela `app.permissions` via `sync_permissions()` no startup. A UI do MASTER
só lê; mudança nas permissões requer alteração de código.

Formato do código: ``modulo.recurso.acao`` (ex: ``cln.patient.edit``).
"""

from __future__ import annotations

from app.core.permissions.registry import (
    PermissionDef,
    all_permissions,
    has_permission,
    register,
)

__all__ = ["PermissionDef", "all_permissions", "has_permission", "register"]
