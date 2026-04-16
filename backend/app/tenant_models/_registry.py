"""Importa todos os modelos per-município para popular `TenantBase.metadata`.

Alembic precisa que todos os modelos estejam carregados antes do autogenerate.
"""

from __future__ import annotations

from app.tenant_models.patients import (  # noqa: F401
    Patient,
    PatientDocument,
    PatientFieldChangeType,
    PatientFieldHistory,
    PatientPhoto,
    PlanoSaudeTipo,
    Sex,
)
from app.tenant_models.cnes import (  # noqa: F401
    CnesImport,
    CnesImportFile,
    CnesProfessional,
    CnesProfessionalUnit,
    CnesTeam,
    CnesTeamProfessional,
    CnesUnit,
    CnesUnitBed,
    CnesUnitQualification,
    CnesUnitService,
)
