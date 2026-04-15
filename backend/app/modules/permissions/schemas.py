"""Schemas do RBAC (Role / Permission)."""

from __future__ import annotations

import enum
from uuid import UUID

from pydantic import Field

from app.core.schema_base import CamelModel


# ─── Catálogo de permissões ────────────────────────────────────────────────


class PermissionOut(CamelModel):
    code: str
    module: str
    resource: str
    action: str
    description: str


class PermissionGroupOut(CamelModel):
    """Permissões agrupadas por módulo (para o selector da matriz)."""

    module: str
    permissions: list[PermissionOut]


# ─── Role ──────────────────────────────────────────────────────────────────


class RoleScopeLiteral(str, enum.Enum):
    SYSTEM = "SYSTEM"
    MUNICIPALITY = "MUNICIPALITY"


class RoleOut(CamelModel):
    id: UUID
    code: str
    name: str
    description: str | None = None
    scope: RoleScopeLiteral
    municipality_id: UUID | None = None
    parent_id: UUID | None = None
    is_system_base: bool
    archived: bool
    version: int


class RolePermissionState(str, enum.Enum):
    """Estado local de uma permissão no role."""

    GRANT = "grant"
    DENY = "deny"
    INHERIT = "inherit"


class RolePermissionEntry(CamelModel):
    """Uma linha da matriz de permissões do role.

    - ``state`` — o que **este role** diz (grant/deny/inherit).
    - ``effective`` — resultado final após percorrer a cadeia.
    - ``inherited_effective`` — o que viria do pai (null se não tem pai).
    - ``overridden_parent`` — true se este role difere do pai.
    """

    code: str
    module: str
    resource: str
    action: str
    description: str
    state: RolePermissionState
    effective: bool
    inherited_effective: bool | None = None
    overridden_parent: bool = False


class RoleDetailOut(RoleOut):
    parent: RoleOut | None = None
    permissions: list[RolePermissionEntry]


class RoleCreate(CamelModel):
    """Cria um novo role MUNICIPALITY (não cria SYSTEM via API)."""

    code: str = Field(min_length=3, max_length=60, pattern=r"^[a-z0-9_]+$")
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    parent_id: UUID | None = None


class RoleUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    parent_id: UUID | None = None
    # parent_id: sentinel para "não mexer". Pra setar null, mandar explicitamente
    # null — o endpoint aceita `Field(default=UNSET)` mas pydantic v2 não tem
    # sentinel. Tratamos "null = desvincular" sempre quando a chave veio.


class RolePermissionSet(CamelModel):
    """Um item da requisição de atualização de permissões."""

    code: str
    state: RolePermissionState


class RolePermissionsUpdate(CamelModel):
    permissions: list[RolePermissionSet]


# ─── Overrides por acesso (FacilityAccess) ──────────────────────────────────


class AccessPermissionEntry(CamelModel):
    """Uma linha da matriz de permissões de um acesso específico.

    Semântica (diferente da matriz de role):
    - ``state``        — override no acesso: ``grant``/``deny`` = explícito;
                          ``inherit`` = segue o perfil (sem override).
    - ``effective``    — resultado final (role chain + override do acesso).
    - ``role_effective``— o que o perfil sozinho daria (sem override).
    - ``overridden``   — ``state != inherit`` e o override diverge do perfil.
    """

    code: str
    module: str
    resource: str
    action: str
    description: str
    state: RolePermissionState
    effective: bool
    role_effective: bool
    overridden: bool


class AccessPermissionsDetail(CamelModel):
    user_id: UUID
    user_name: str
    facility_access_id: UUID
    facility_id: UUID
    facility_name: str
    municipality_id: UUID
    role: RoleOut | None = None
    permissions: list[AccessPermissionEntry]


class AccessPermissionsUpdate(CamelModel):
    """Payload para atualizar overrides de um acesso. Mesmos estados do role."""

    permissions: list[RolePermissionSet]
