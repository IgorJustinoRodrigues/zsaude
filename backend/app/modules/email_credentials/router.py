"""Endpoints de administração das credenciais SES por escopo."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.core.deps import DB, MasterDep
from app.core.email import EmailMessage
from app.modules.email_credentials.models import (
    SYSTEM_SCOPE_ID,
    CredentialsScope,
    EmailCredentials,
)
from app.modules.email_credentials.schemas import (
    EmailCredentialsRead,
    EmailCredentialsTestRequest,
    EmailCredentialsTestResponse,
    EmailCredentialsUpsert,
    ScopeType,
)
from app.modules.email_credentials.service import EmailCredentialsService

router = APIRouter(prefix="/email-credentials", tags=["email-credentials"])


def _scope_enum(scope_type: ScopeType) -> CredentialsScope:
    return CredentialsScope(scope_type)


def _resolve_scope_id(scope_type: CredentialsScope, scope_id: UUID | None) -> UUID:
    if scope_type == CredentialsScope.SYSTEM:
        return SYSTEM_SCOPE_ID
    if scope_id is None:
        raise HTTPException(
            status_code=400,
            detail="scope_id é obrigatório para municipality/facility.",
        )
    return scope_id


def _to_read(row: EmailCredentials) -> EmailCredentialsRead:
    return EmailCredentialsRead(
        id=row.id,
        scope_type=row.scope_type.value if hasattr(row.scope_type, "value") else str(row.scope_type),
        scope_id=row.scope_id,
        from_email=row.from_email,
        from_name=row.from_name or "",
        aws_region=row.aws_region,
        aws_access_key_id=row.aws_access_key_id,
        aws_secret_set=bool(row.aws_secret_access_key_enc),
        ses_configuration_set=row.ses_configuration_set,
        is_active=bool(row.is_active),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=EmailCredentialsRead | None)
async def get_credentials(
    db: DB,
    _: MasterDep,
    scope_type: ScopeType = Query(...),
    scope_id: UUID | None = Query(default=None),
) -> EmailCredentialsRead | None:
    """Retorna as credenciais do escopo (ou null se não configurado)."""
    st = _scope_enum(scope_type)
    sid = _resolve_scope_id(st, scope_id)
    row = await EmailCredentialsService(db).get(st, sid)
    return _to_read(row) if row else None


@router.put("", response_model=EmailCredentialsRead)
async def upsert_credentials(
    payload: EmailCredentialsUpsert,
    db: DB,
    _: MasterDep,
) -> EmailCredentialsRead:
    st = _scope_enum(payload.scope_type)
    sid = _resolve_scope_id(st, payload.scope_id)
    try:
        row = await EmailCredentialsService(db).upsert(
            st, sid,
            from_email=payload.from_email,
            from_name=payload.from_name,
            aws_region=payload.aws_region,
            aws_access_key_id=payload.aws_access_key_id,
            aws_secret_access_key=payload.aws_secret_access_key,
            ses_configuration_set=payload.ses_configuration_set,
            is_active=payload.is_active,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _to_read(row)


@router.delete("", status_code=204)
async def delete_credentials(
    db: DB,
    _: MasterDep,
    scope_type: ScopeType = Query(...),
    scope_id: UUID | None = Query(default=None),
) -> None:
    st = _scope_enum(scope_type)
    sid = _resolve_scope_id(st, scope_id)
    await EmailCredentialsService(db).delete(st, sid)


@router.post("/test", response_model=EmailCredentialsTestResponse)
async def test_send(
    payload: EmailCredentialsTestRequest,
    db: DB,
    _: MasterDep,
) -> EmailCredentialsTestResponse:
    """Dispara um e-mail de teste pro destinatário informado, usando as
    credenciais resolvidas em cascata a partir do ``scope`` dado.
    """
    svc = EmailCredentialsService(db)
    st = _scope_enum(payload.scope_type)
    mun_id = payload.scope_id if st == CredentialsScope.MUNICIPALITY else None
    fac_id = payload.scope_id if st == CredentialsScope.FACILITY else None
    creds = await svc.resolve(municipality_id=mun_id, facility_id=fac_id)
    email_service = svc.build_email_service(creds)
    try:
        msg_id = await email_service.send(
            EmailMessage(
                to=[payload.to],
                subject=f"[Teste] Credenciais de envio — {creds.source}",
                text=(
                    f"Teste de envio a partir do escopo {creds.source}.\n"
                    f"Remetente: {creds.from_name} <{creds.from_email}>\n"
                    f"Região: {creds.aws_region}\n"
                    "Se você recebeu este e-mail, as credenciais estão OK."
                ),
                html=(
                    f"<p>Teste de envio a partir do escopo <strong>{creds.source}</strong>.</p>"
                    f"<p>Remetente: {creds.from_name} &lt;{creds.from_email}&gt;<br>"
                    f"Região: {creds.aws_region}</p>"
                    "<p>Se você recebeu este e-mail, as credenciais estão OK.</p>"
                ),
                tags={"category": "credentials_test"},
            )
        )
    except Exception as exc:  # noqa: BLE001
        return EmailCredentialsTestResponse(
            ok=False, error=str(exc), source=creds.source, from_email=creds.from_email,
        )
    return EmailCredentialsTestResponse(
        ok=True, message_id=msg_id, source=creds.source, from_email=creds.from_email,
    )
