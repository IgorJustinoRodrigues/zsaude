"""Modelos CNES — snapshot dos arquivos LFCES importados do SCNES/DATASUS.

Vivem no schema do município. Separado de ``app.facilities`` (nosso cadastro
interno, selecionável no work-context): ``cnes_units`` é a visão oficial do
CNES na competência da última importação. A sincronização entre ambos fica
como feature posterior (botão "Atualizar cadastro a partir do CNES").
"""

from app.tenant_models.cnes.units import CnesUnit
from app.tenant_models.cnes.professionals import CnesProfessional, CnesProfessionalUnit
from app.tenant_models.cnes.beds import CnesUnitBed
from app.tenant_models.cnes.services import CnesUnitService
from app.tenant_models.cnes.teams import CnesTeam, CnesTeamProfessional
from app.tenant_models.cnes.qualifications import CnesUnitQualification
from app.tenant_models.cnes.imports import CnesImport, CnesImportFile, CnesImportStatus

__all__ = [
    "CnesUnit",
    "CnesProfessional",
    "CnesProfessionalUnit",
    "CnesUnitBed",
    "CnesUnitService",
    "CnesTeam",
    "CnesTeamProfessional",
    "CnesUnitQualification",
    "CnesImport",
    "CnesImportFile",
    "CnesImportStatus",
]
