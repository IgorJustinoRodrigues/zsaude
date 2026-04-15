"""Contexto de auditoria propagado via contextvars por requisição.

O decorator `@audited` e o writer para AuditLog ficam no módulo audit; aqui
apenas o carrier (request_id, user_id, facility_id, ip, user-agent).
"""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass, field
from uuid import UUID


@dataclass(slots=True)
class AuditContext:
    request_id: str = ""
    user_id: UUID | None = None
    municipality_id: UUID | None = None
    municipality_ibge: str | None = None
    facility_id: UUID | None = None
    role: str | None = None
    ip: str | None = None
    user_agent: str | None = None
    extras: dict[str, str] = field(default_factory=dict)


_audit_ctx: ContextVar[AuditContext] = ContextVar("audit_ctx", default=AuditContext())


def get_audit_context() -> AuditContext:
    return _audit_ctx.get()


def set_audit_context(ctx: AuditContext) -> None:
    _audit_ctx.set(ctx)


def update_audit_context(**kwargs: object) -> None:
    ctx = _audit_ctx.get()
    for k, v in kwargs.items():
        if hasattr(ctx, k):
            setattr(ctx, k, v)
    _audit_ctx.set(ctx)
