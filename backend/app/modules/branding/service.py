"""Service de identidade visual (branding).

Responsabilidades:

- CRUD de ``BrandingConfig`` por escopo (município ou unidade).
- Upload de logo reusando ``app.services.storage`` (S3/MinIO).
- Resolver de config efetiva: merge facility > municipality > padrão.

O resolver é o ponto central — é o que o frontend consome pra saber a
identidade aplicável ao usuário atual (via work context).
"""

from __future__ import annotations

import hashlib
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.file_model import AppFile
from app.db.types import new_uuid7
from app.modules.branding.models import BrandingConfig, BrandingScope
from app.modules.branding.schemas import BrandingUpdate, EffectiveBranding
from app.services.storage import get_storage


# Defaults do sistema — fallback final do resolver.
_SYSTEM_DEFAULTS: dict[str, Any] = {
    "display_name": "zSaúde",
    "header_line_1": "",
    "header_line_2": "",
    "footer_text": "",
    "primary_color": "#0ea5e9",  # sky-500
    "pdf_configs": {
        "report":       {"show_logo": True, "show_footer": True},
        "export":       {"show_logo": True, "show_footer": True},
        "prescription": {"show_logo": True, "show_footer": True, "signature_area": True},
    },
}

_ALLOWED_LOGO_MIMES = {"image/jpeg", "image/png", "image/webp", "image/svg+xml"}
_MAX_LOGO_BYTES = 5 * 1024 * 1024  # 5 MB


class BrandingService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ── CRUD básico ─────────────────────────────────────────────────

    async def get_or_create(
        self, scope: BrandingScope, scope_id: UUID,
    ) -> BrandingConfig:
        row = await self.session.scalar(
            select(BrandingConfig).where(
                BrandingConfig.scope_type == scope,
                BrandingConfig.scope_id == scope_id,
            )
        )
        if row is not None:
            return row
        row = BrandingConfig(
            id=new_uuid7(),
            scope_type=scope,
            scope_id=scope_id,
            pdf_configs={},
        )
        self.session.add(row)
        await self.session.flush()
        return row

    async def update(
        self,
        scope: BrandingScope,
        scope_id: UUID,
        payload: BrandingUpdate,
    ) -> BrandingConfig:
        cfg = await self.get_or_create(scope, scope_id)

        # Strings: ``None`` = não mexer; string (inclusive vazia) = sobrescrever.
        if payload.display_name is not None:
            cfg.display_name = payload.display_name
        if payload.header_line_1 is not None:
            cfg.header_line_1 = payload.header_line_1
        if payload.header_line_2 is not None:
            cfg.header_line_2 = payload.header_line_2
        if payload.footer_text is not None:
            cfg.footer_text = payload.footer_text
        if payload.primary_color is not None:
            cfg.primary_color = _normalize_color(payload.primary_color)

        # pdf_configs: merge por chave (pra não perder tipos que não estão no payload).
        if payload.pdf_configs is not None:
            current = dict(cfg.pdf_configs or {})
            for k, v in payload.pdf_configs.items():
                # Merge superficial: se for dict e já tem dict, faz update;
                # senão sobrescreve.
                if isinstance(v, dict) and isinstance(current.get(k), dict):
                    current[k] = {**current[k], **v}
                else:
                    current[k] = v
            cfg.pdf_configs = current

        await self.session.flush()
        return cfg

    async def upload_logo(
        self,
        scope: BrandingScope,
        scope_id: UUID,
        *,
        content: bytes,
        mime: str,
        original_name: str,
        actor_user_id: UUID | None,
        actor_user_name: str,
    ) -> BrandingConfig:
        if not content:
            raise HTTPException(status_code=400, detail="Arquivo vazio.")
        if len(content) > _MAX_LOGO_BYTES:
            raise HTTPException(status_code=413, detail="Logo muito grande (máx. 5 MB).")
        if mime not in _ALLOWED_LOGO_MIMES:
            raise HTTPException(
                status_code=415,
                detail="Formato de logo não suportado (use JPEG, PNG, WEBP ou SVG).",
            )

        cfg = await self.get_or_create(scope, scope_id)

        # Path S3: app/branding/{scope}/{scope_id}/logo.{ext}
        ext = {
            "image/jpeg": "jpg", "image/png": "png",
            "image/webp": "webp", "image/svg+xml": "svg",
        }[mime]
        file_uuid = new_uuid7()
        storage_key = f"app/branding/{scope.value}/{scope_id}/{file_uuid}.{ext}"

        storage = get_storage()
        await storage.upload(storage_key, content, mime)

        try:
            file_row = AppFile(
                id=file_uuid,
                storage_key=storage_key,
                original_name=original_name or f"logo.{ext}",
                mime_type=mime,
                size_bytes=len(content),
                checksum_sha256=hashlib.sha256(content).hexdigest(),
                category="branding_logo",
                entity_id=scope_id,
                uploaded_by=actor_user_id,
                uploaded_by_name=actor_user_name,
            )
            self.session.add(file_row)
            await self.session.flush()
            cfg.logo_file_id = file_row.id
            await self.session.flush()
        except Exception:
            # Rollback do S3 — mantém coerência.
            await storage.delete(storage_key)
            raise
        return cfg

    async def delete_logo(
        self, scope: BrandingScope, scope_id: UUID,
    ) -> BrandingConfig:
        cfg = await self.get_or_create(scope, scope_id)
        # Limpa a FK. O arquivo no S3 e o AppFile continuam rastreáveis
        # (auditoria). Orphan cleanup é trabalho de job separado.
        cfg.logo_file_id = None
        await self.session.flush()
        return cfg

    # ── Resolver de efetivo ─────────────────────────────────────────

    async def effective_for_facility(
        self, facility_id: UUID, municipality_id: UUID,
    ) -> EffectiveBranding:
        """Merge: unidade > município > sistema. Retorna config pronta pra usar."""
        facility_cfg = await self._load(BrandingScope.FACILITY, facility_id)
        municipality_cfg = await self._load(BrandingScope.MUNICIPALITY, municipality_id)

        return self._merge(
            facility=facility_cfg,
            municipality=municipality_cfg,
        )

    async def effective_for_municipality(
        self, municipality_id: UUID,
    ) -> EffectiveBranding:
        """Só cidade + sistema (sem unidade). MASTER usa."""
        cfg = await self._load(BrandingScope.MUNICIPALITY, municipality_id)
        return self._merge(facility=None, municipality=cfg)

    async def _load(
        self, scope: BrandingScope, scope_id: UUID,
    ) -> BrandingConfig | None:
        return await self.session.scalar(
            select(BrandingConfig).where(
                BrandingConfig.scope_type == scope,
                BrandingConfig.scope_id == scope_id,
            )
        )

    def _merge(
        self,
        *,
        facility: BrandingConfig | None,
        municipality: BrandingConfig | None,
    ) -> EffectiveBranding:
        """Aplica cascade campo-a-campo.

        Strings: prioridade facility > municipality > default. Valor
        "não preenchido" é string vazia ou com espaços.

        ``pdf_configs``: merge profundo (facility sobrescreve municipality
        chave a chave, municipality sobrescreve defaults).
        """
        def pick_str(key: str) -> str:
            if facility is not None:
                v = (getattr(facility, key) or "").strip()
                if v:
                    return v
            if municipality is not None:
                v = (getattr(municipality, key) or "").strip()
                if v:
                    return v
            return _SYSTEM_DEFAULTS.get(key, "")

        # pdf_configs merge em 3 camadas
        merged_pdf: dict[str, Any] = {}
        for layer in (_SYSTEM_DEFAULTS["pdf_configs"], municipality, facility):
            source = layer if isinstance(layer, dict) else (layer.pdf_configs if layer else None)
            if not source:
                continue
            for typ, conf in source.items():
                if not isinstance(conf, dict):
                    continue
                if typ not in merged_pdf:
                    merged_pdf[typ] = {}
                merged_pdf[typ].update(conf)

        # Logo: facility > municipality
        logo_file_id = None
        if facility and facility.logo_file_id:
            logo_file_id = facility.logo_file_id
        elif municipality and municipality.logo_file_id:
            logo_file_id = municipality.logo_file_id

        logo_url = None
        if logo_file_id is not None:
            # Proxy autenticado pelo backend
            logo_url = f"/api/v1/branding/logo/{logo_file_id}"

        return EffectiveBranding(
            display_name=pick_str("display_name"),
            header_line_1=pick_str("header_line_1"),
            header_line_2=pick_str("header_line_2"),
            footer_text=pick_str("footer_text"),
            primary_color=pick_str("primary_color"),
            logo_url=logo_url,
            pdf_configs=merged_pdf,
            source_municipality_id=municipality.scope_id if municipality else None,
            source_facility_id=facility.scope_id if facility else None,
        )


def _normalize_color(v: str) -> str:
    """Normaliza cor hex: "0ea5e9" → "#0ea5e9". Valor inválido = vazio."""
    v = v.strip().lower()
    if not v:
        return ""
    if not v.startswith("#"):
        v = "#" + v
    # Formato: #RRGGBB (7 chars) ou #RGB (4 chars)
    if len(v) == 4:
        # expande #RGB → #RRGGBB
        v = "#" + "".join(c * 2 for c in v[1:])
    if len(v) == 7 and all(c in "0123456789abcdef#" for c in v):
        return v
    return ""
