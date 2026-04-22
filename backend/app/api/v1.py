"""Agregador da API v1."""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.ai.router import (
    operations_router as ai_operations_router,
    sys_router as ai_sys_router,
)
from app.modules.attendances.router import router as attendances_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.branding.router import (
    admin_router as branding_admin_router,
    router as branding_router,
)
from app.modules.cnes.admin_router import admin_router as cnes_admin_router
from app.modules.cnes.router import router as cnes_router
from app.modules.email_credentials.router import router as email_credentials_router
from app.modules.email_templates.router import router as email_templates_router
from app.modules.notifications.router import (
    admin_router as notifications_admin_router,
    router as notifications_router,
)
from app.modules.dgn.router import router as dgn_router
from app.modules.hsp.router import router as hsp_router
from app.modules.hsp.face_router import router as hsp_face_router
from app.modules.devices.router import (
    public_router as devices_public_router,
    router as devices_router,
)
from app.modules.rec.router import (
    admin_router as rec_admin_router,
    router as rec_router,
)
from app.modules.tts.router import (
    admin_router as tts_admin_router,
    router as tts_router,
)
from app.modules.painels.router import (
    admin_router as painels_admin_router,
    router as painels_router,
)
from app.modules.sectors.router import (
    admin_router as sectors_admin_router,
    router as sectors_router,
)
from app.modules.totens.router import (
    admin_router as totens_admin_router,
    router as totens_router,
)
from app.modules.permissions.admin_router import (
    access_router as roles_admin_access_router,
    router as roles_admin_router,
)
from app.modules.permissions.router import router as roles_router
from app.modules.reference.router import router as reference_router
from app.modules.sessions.router import router as sessions_router
from app.modules.sigtap.router import router as sigtap_router
from app.modules.sigtap.search_router import router as sigtap_search_router
from app.modules.system.router import router as system_router
from app.modules.tenants.admin_router import router as tenants_admin_router
from app.modules.tenants.directory_router import router as directory_router
from app.modules.tenants.router import router as tenants_router
from app.modules.users.router import router as users_router
from app.modules.users.ws_router import router as users_ws_router

api_v1 = APIRouter()
api_v1.include_router(auth_router)
# sessions_router vem antes de users_router porque tem /users/presence
# que colide com /users/{user_id}. FastAPI usa primeira rota que casa.
api_v1.include_router(sessions_router)
api_v1.include_router(users_router)
api_v1.include_router(users_ws_router)
api_v1.include_router(tenants_router)
api_v1.include_router(directory_router)
api_v1.include_router(tenants_admin_router)
api_v1.include_router(roles_router)
api_v1.include_router(roles_admin_router)
api_v1.include_router(roles_admin_access_router)
api_v1.include_router(system_router)
api_v1.include_router(reference_router)
api_v1.include_router(audit_router)
api_v1.include_router(dgn_router)
api_v1.include_router(hsp_router)
api_v1.include_router(hsp_face_router)
api_v1.include_router(cnes_router)
api_v1.include_router(cnes_admin_router)
api_v1.include_router(sigtap_router)
api_v1.include_router(sigtap_search_router)
api_v1.include_router(ai_operations_router)
api_v1.include_router(ai_sys_router)
api_v1.include_router(branding_admin_router)
api_v1.include_router(branding_router)
api_v1.include_router(email_templates_router)
api_v1.include_router(email_credentials_router)
api_v1.include_router(notifications_router)
api_v1.include_router(notifications_admin_router)
api_v1.include_router(rec_router)
api_v1.include_router(rec_admin_router)
api_v1.include_router(tts_router)
api_v1.include_router(tts_admin_router)
api_v1.include_router(devices_public_router)
api_v1.include_router(devices_router)
api_v1.include_router(sectors_admin_router)
api_v1.include_router(sectors_router)
api_v1.include_router(painels_admin_router)
api_v1.include_router(painels_router)
api_v1.include_router(totens_admin_router)
api_v1.include_router(totens_router)
api_v1.include_router(attendances_router)
