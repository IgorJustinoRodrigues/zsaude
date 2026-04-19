"""Importa todos os modelos para que `Base.metadata` esteja completa
antes do Alembic autogenerate.

Nada mais deve ser feito aqui.
"""

from __future__ import annotations

from app.modules.ai.models import (  # noqa: F401
    AICapabilityRoute,
    AIModel,
    AIMunicipalityKey,
    AIPromptTemplate,
    AIProvider,
    AIQuota,
    AIQuotaAlert,
    AIUsageLog,
)
from app.modules.audit.models import AuditLog  # noqa: F401
from app.modules.auth.models import (  # noqa: F401
    EmailVerification,
    LoginAttempt,
    PasswordReset,
    RefreshToken,
)
from app.modules.branding.models import BrandingConfig  # noqa: F401
from app.modules.email_templates.models import EmailTemplate  # noqa: F401
from app.modules.permissions.models import (  # noqa: F401
    FacilityAccessPermissionOverride,
    Permission,
    Role,
    RolePermission,
)
from app.modules.reference.models import (  # noqa: F401
    RefDeficiencia,
    RefEscolaridade,
    RefEstadoCivil,
    RefEtnia,
    RefIdentidadeGenero,
    RefLogradouro,
    RefNacionalidade,
    RefOrientacaoSexual,
    RefParentesco,
    RefPovoTradicional,
    RefRaca,
    RefReligiao,
    RefTipoDocumento,
    RefTipoSanguineo,
)
from app.modules.sessions.models import UserSession  # noqa: F401
from app.modules.sigtap.models import (  # noqa: F401
    SigtapCbo,
    SigtapCid,
    SigtapFormaOrganizacao,
    SigtapGrupoHabilitacao,
    SigtapHabilitacao,
    SigtapImport,
    SigtapImportFile,
    SigtapModalidade,
    SigtapProcedure,
    SigtapProcedureCbo,
    SigtapProcedureCid,
    SigtapProcedureCompatibilidade,
    SigtapProcedureDescription,
    SigtapProcedureDetalhe,
    SigtapProcedureHabilitacao,
    SigtapProcedureLeito,
    SigtapProcedureModalidade,
    SigtapProcedureRegistro,
    SigtapProcedureRegraCond,
    SigtapProcedureServico,
    SigtapRegistro,
    SigtapService,
    SigtapServiceClassification,
)
from app.modules.system.models import SystemSetting  # noqa: F401
from app.modules.tenants.models import (  # noqa: F401
    Facility,
    FacilityAccess,
    Municipality,
    MunicipalityAccess,
    Neighborhood,
)
from app.modules.users.models import PasswordHistory, User  # noqa: F401
from app.modules.users.photo_models import UserFaceEmbedding, UserPhoto  # noqa: F401
from app.db.file_model import AppFile  # noqa: F401
