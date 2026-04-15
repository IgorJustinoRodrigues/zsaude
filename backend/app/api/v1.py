"""Agregador da API v1."""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.tenants.router import router as tenants_router
from app.modules.users.router import router as users_router

api_v1 = APIRouter()
api_v1.include_router(auth_router)
api_v1.include_router(users_router)
api_v1.include_router(tenants_router)
