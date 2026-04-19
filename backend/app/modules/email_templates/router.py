"""Endpoints de administração de templates de e-mail.

Todos exigem MASTER — na próxima iteração adicionamos endpoints pra ADMIN
editar templates do próprio município / suas unidades.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.core.deps import DB, MasterDep
from app.core.email_templates import render_string
from app.modules.email_templates.catalog import CATALOG, TemplateCatalogEntry
from app.modules.email_templates.models import (
    SYSTEM_SCOPE_ID,
    EmailTemplate,
    TemplateScope,
)
from app.modules.email_templates.repository import EmailTemplateRepository
from app.modules.email_templates.schemas import (
    EmailTemplatePreviewRequest,
    EmailTemplatePreviewResponse,
    EmailTemplateRead,
    EmailTemplateUpsert,
    ScopeType,
    TemplateCatalogRead,
    TemplateVariableRead,
)
from app.modules.email_templates.service import EmailTemplateService

router = APIRouter(prefix="/email-templates", tags=["email-templates"])


def _scope_enum(scope_type: ScopeType) -> TemplateScope:
    return TemplateScope(scope_type)


def _resolve_scope_id(scope_type: TemplateScope, scope_id: UUID | None) -> UUID:
    if scope_type == TemplateScope.SYSTEM:
        return SYSTEM_SCOPE_ID
    if scope_id is None:
        raise HTTPException(
            status_code=400,
            detail="scope_id é obrigatório para municipality/facility.",
        )
    return scope_id


def _catalog_entry_or_404(code: str) -> TemplateCatalogEntry:
    entry = CATALOG.get(code)
    if entry is None:
        raise HTTPException(
            status_code=404, detail=f"Template '{code}' não registrado no catálogo.",
        )
    return entry


def _row_to_read(row: EmailTemplate) -> EmailTemplateRead:
    return EmailTemplateRead.model_validate(row)


# ─── Catálogo (quais códigos + variáveis) ───────────────────────────────────


@router.get("/catalog", response_model=list[TemplateCatalogRead])
async def list_catalog(_: MasterDep) -> list[TemplateCatalogRead]:
    return [
        TemplateCatalogRead(
            code=e.code,
            label=e.label,
            description=e.description,
            default_subject=e.default_subject,
            variables=[
                TemplateVariableRead(
                    name=v.name, description=v.description, example=v.example,
                )
                for v in e.variables
            ],
        )
        for e in CATALOG.values()
    ]


# ─── Listar overrides por escopo ────────────────────────────────────────────


@router.get("", response_model=list[EmailTemplateRead])
async def list_by_scope(
    db: DB,
    _: MasterDep,
    scope_type: ScopeType = Query(...),
    scope_id: UUID | None = Query(default=None),
) -> list[EmailTemplateRead]:
    st = _scope_enum(scope_type)
    sid = _resolve_scope_id(st, scope_id)
    rows = await EmailTemplateRepository(db).list_by_scope(st, sid)
    return [_row_to_read(r) for r in rows]


# ─── Get / Upsert / Delete de um código específico ──────────────────────────


@router.get("/{code}", response_model=EmailTemplateRead | None)
async def get_override(
    code: str,
    db: DB,
    _: MasterDep,
    scope_type: ScopeType = Query(...),
    scope_id: UUID | None = Query(default=None),
) -> EmailTemplateRead | None:
    """Retorna o override (ou ``None`` se não há linha pra esse escopo).

    Use esse endpoint pra saber se um escopo está **herdando** (None) ou
    tem customização própria.
    """
    _catalog_entry_or_404(code)
    st = _scope_enum(scope_type)
    sid = _resolve_scope_id(st, scope_id)
    row = await EmailTemplateRepository(db).get_one(code, st, sid)
    return _row_to_read(row) if row else None


@router.put("/{code}", response_model=EmailTemplateRead)
async def upsert(
    code: str,
    payload: EmailTemplateUpsert,
    db: DB,
    _: MasterDep,
) -> EmailTemplateRead:
    entry = _catalog_entry_or_404(code)
    st = _scope_enum(payload.scope_type)
    sid = _resolve_scope_id(st, payload.scope_id)

    # Valida sintaxe E variáveis renderizando com o contexto de exemplo do
    # catálogo. Se o template usa uma variável desconhecida, o StrictUndefined
    # do Jinja2 dispara antes de gravar.
    example_ctx = entry.example_context()
    try:
        render_string(payload.subject, example_ctx, autoescape=False)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Subject inválido: {exc}") from exc
    if payload.body_html:
        try:
            render_string(payload.body_html, example_ctx, autoescape=True)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=422, detail=f"Body HTML inválido: {exc}") from exc
    if payload.body_text:
        try:
            render_string(payload.body_text, example_ctx, autoescape=False)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=422, detail=f"Body texto inválido: {exc}") from exc

    if not payload.body_html and not payload.body_text:
        raise HTTPException(
            status_code=422,
            detail="Informe ao menos um corpo (HTML ou texto).",
        )

    row = await EmailTemplateRepository(db).upsert(
        code, st, sid,
        subject=payload.subject,
        body_html=payload.body_html,
        body_text=payload.body_text,
        from_name=payload.from_name,
        is_active=payload.is_active,
    )
    return _row_to_read(row)


@router.delete("/{code}", status_code=204)
async def delete_override(
    code: str,
    db: DB,
    _: MasterDep,
    scope_type: ScopeType = Query(...),
    scope_id: UUID | None = Query(default=None),
) -> None:
    _catalog_entry_or_404(code)
    st = _scope_enum(scope_type)
    sid = _resolve_scope_id(st, scope_id)
    await EmailTemplateRepository(db).delete(code, st, sid)


# ─── Preview ────────────────────────────────────────────────────────────────


@router.post("/{code}/preview", response_model=EmailTemplatePreviewResponse)
async def preview(
    code: str,
    payload: EmailTemplatePreviewRequest,
    db: DB,
    _: MasterDep,
) -> EmailTemplatePreviewResponse:
    """Renderiza com contexto de exemplo.

    Se ``subject``/``bodyHtml``/``bodyText`` vierem no body, renderiza
    AQUELAS fontes (preview ao vivo durante edição, sem salvar). Senão,
    resolve via cascata a partir de ``scopeType``/``scopeId`` (preview do
    estado atualmente gravado).
    """
    entry = _catalog_entry_or_404(code)
    context = payload.context or entry.example_context()

    # Edição ao vivo: renderiza o source passado no body.
    if payload.subject is not None or payload.body_html is not None or payload.body_text is not None:
        try:
            subject = render_string(
                payload.subject or entry.default_subject, context, autoescape=False,
            )
            html = (
                render_string(payload.body_html, context, autoescape=True)
                if payload.body_html
                else None
            )
            text = (
                render_string(payload.body_text, context, autoescape=False)
                if payload.body_text
                else None
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return EmailTemplatePreviewResponse(
            subject=subject, body_html=html, body_text=text, from_name=None,
        )

    # Preview do estado gravado (cascata).
    rendered = await EmailTemplateService(db).render(
        code,
        context,
        municipality_id=(
            payload.scope_id if payload.scope_type == "municipality" else None
        ),
        facility_id=(
            payload.scope_id if payload.scope_type == "facility" else None
        ),
    )
    return EmailTemplatePreviewResponse(
        subject=rendered.subject,
        body_html=rendered.html,
        body_text=rendered.text,
        from_name=rendered.from_name,
    )
