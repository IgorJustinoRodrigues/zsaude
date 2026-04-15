"""Importa todos os modelos para que `Base.metadata` esteja completa
antes do Alembic autogenerate.

Nada mais deve ser feito aqui.
"""

from __future__ import annotations

from app.modules.audit.models import AuditLog  # noqa: F401
from app.modules.auth.models import LoginAttempt, PasswordReset, RefreshToken  # noqa: F401
from app.modules.permissions.models import (  # noqa: F401
    FacilityAccessPermissionOverride,
    Permission,
    Role,
    RolePermission,
)
from app.modules.sessions.models import UserSession  # noqa: F401
from app.modules.system.models import SystemSetting  # noqa: F401
from app.modules.tenants.models import (  # noqa: F401
    Facility,
    FacilityAccess,
    Municipality,
    MunicipalityAccess,
    Neighborhood,
)
from app.modules.users.models import User  # noqa: F401
