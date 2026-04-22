"""Serviço de configuração do módulo Recepção.

Responsabilidades:
- Ler/escrever ``Municipality.rec_config`` e ``Facility.rec_config``.
- Validar a cascata: a unidade **só pode restringir** o que o município
  habilitou — se o município desativou totem, unidade não consegue ligar.
- Resolver a config "efetiva" pra consumo no runtime (totem, painel,
  console), mergeando defaults → município → unidade.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.rec.schemas import (
    EffectiveRecConfig,
    PainelConfig,
    RecConfig,
    RecConfigRead,
    RecConfigUpdate,
    RecepcaoConfig,
    TotemConfig,
)
from app.modules.tenants.models import Facility, Municipality


# ─── Defaults ────────────────────────────────────────────────────────────────

def default_rec_config() -> RecConfig:
    """Config padrão quando nada foi configurado em nenhum nível.

    Por padrão todas as features habilitadas e ``after_attendance='triagem'``.
    Detalhes de totem/painel (captura, modo, áudio, setores) moram em
    painels/totens lógicos, não aqui.
    """
    return RecConfig(
        totem=TotemConfig(enabled=True),
        painel=PainelConfig(enabled=True),
        recepcao=RecepcaoConfig(
            enabled=True,
            after_attendance_sector=None,
            queue_order_mode="priority_fifo",
        ),
    )


# ─── Service ─────────────────────────────────────────────────────────────────

class RecConfigService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Leitura bruta (escopo) ────────────────────────────────────────

    async def get_for_municipality(self, municipality_id: UUID) -> RecConfigRead:
        mun = await self._get_municipality_or_404(municipality_id)
        return RecConfigRead(
            scope_type="municipality",
            scope_id=str(mun.id),
            config=RecConfig.model_validate(mun.rec_config) if mun.rec_config else None,
        )

    async def get_for_facility(self, facility_id: UUID) -> RecConfigRead:
        fac = await self._get_facility_or_404(facility_id)
        return RecConfigRead(
            scope_type="facility",
            scope_id=str(fac.id),
            config=RecConfig.model_validate(fac.rec_config) if fac.rec_config else None,
        )

    # ── Escrita ───────────────────────────────────────────────────────

    async def update_for_municipality(
        self, municipality_id: UUID, payload: RecConfigUpdate,
    ) -> RecConfigRead:
        mun = await self._get_municipality_or_404(municipality_id)
        mun.rec_config = _merge_partial(mun.rec_config, payload.config)
        await self.db.flush()
        return await self.get_for_municipality(municipality_id)

    async def update_for_facility(
        self, facility_id: UUID, payload: RecConfigUpdate,
    ) -> RecConfigRead:
        fac = await self._get_facility_or_404(facility_id)

        if payload.config is not None:
            # Validação da cascata: a unidade só pode restringir o que o
            # município habilitou. Se o município tem totem desligado,
            # unidade não pode setar ``totem.enabled=True``.
            mun_effective = await self._effective_from_municipality(fac.municipality_id)
            self._assert_within_parent(payload.config, mun_effective)

        fac.rec_config = _merge_partial(fac.rec_config, payload.config)
        await self.db.flush()
        return await self.get_for_facility(facility_id)

    # ── Limpar uma seção (volta a herdar aquela seção) ───────────────

    async def clear_section_municipality(
        self, municipality_id: UUID, section: str,
    ) -> RecConfigRead:
        mun = await self._get_municipality_or_404(municipality_id)
        mun.rec_config = _drop_section(mun.rec_config, section)
        await self.db.flush()
        return await self.get_for_municipality(municipality_id)

    async def clear_section_facility(
        self, facility_id: UUID, section: str,
    ) -> RecConfigRead:
        fac = await self._get_facility_or_404(facility_id)
        fac.rec_config = _drop_section(fac.rec_config, section)
        await self.db.flush()
        return await self.get_for_facility(facility_id)

    # ── Efetivo (runtime) ─────────────────────────────────────────────

    async def effective_for_municipality(self, municipality_id: UUID) -> EffectiveRecConfig:
        """Resolve defaults → município."""
        return await self._effective_from_municipality(municipality_id)

    async def effective_for_facility(
        self, facility_id: UUID, municipality_id: UUID,
    ) -> EffectiveRecConfig:
        """Resolve defaults → município → unidade (com re-restrição pelo
        município, pra evitar que um dict legado ainda ligue algo que a
        cidade desligou depois)."""
        mun_effective = await self._effective_from_municipality(municipality_id)

        fac = await self._get_facility_or_404(facility_id)
        fac_cfg = RecConfig.model_validate(fac.rec_config) if fac.rec_config else None

        if fac_cfg is None:
            # Unidade sem override — herda município.
            return mun_effective

        totem, totem_src = _merge_totem(mun_effective.totem, fac_cfg.totem)
        painel, painel_src = _merge_painel(mun_effective.painel, fac_cfg.painel)
        recepcao, rec_src = _merge_recepcao(mun_effective.recepcao, fac_cfg.recepcao)

        # Re-restringe contra o município (defesa contra drift).
        totem = _restrict_totem(totem, mun_effective.totem)
        painel = _restrict_painel(painel, mun_effective.painel)
        recepcao = _restrict_recepcao(recepcao, mun_effective.recepcao)

        sources = dict(mun_effective.sources)
        if totem_src == "facility": sources["totem"] = "facility"
        if painel_src == "facility": sources["painel"] = "facility"
        if rec_src == "facility": sources["recepcao"] = "facility"

        return EffectiveRecConfig(
            totem=totem, painel=painel, recepcao=recepcao, sources=sources,
        )

    # ── Internos ──────────────────────────────────────────────────────

    async def _effective_from_municipality(self, municipality_id: UUID) -> EffectiveRecConfig:
        defaults = default_rec_config()
        mun = await self._get_municipality_or_404(municipality_id)
        mun_cfg = RecConfig.model_validate(mun.rec_config) if mun.rec_config else None

        if mun_cfg is None:
            assert defaults.totem and defaults.painel and defaults.recepcao
            return EffectiveRecConfig(
                totem=defaults.totem,
                painel=defaults.painel,
                recepcao=defaults.recepcao,
                sources={"totem": "default", "painel": "default", "recepcao": "default"},
            )

        assert defaults.totem and defaults.painel and defaults.recepcao
        totem, totem_src = _merge_totem(defaults.totem, mun_cfg.totem)
        painel, painel_src = _merge_painel(defaults.painel, mun_cfg.painel)
        recepcao, rec_src = _merge_recepcao(defaults.recepcao, mun_cfg.recepcao)

        return EffectiveRecConfig(
            totem=totem, painel=painel, recepcao=recepcao,
            sources={
                "totem": "municipality" if totem_src == "override" else "default",
                "painel": "municipality" if painel_src == "override" else "default",
                "recepcao": "municipality" if rec_src == "override" else "default",
            },
        )

    def _assert_within_parent(self, child: RecConfig, parent: EffectiveRecConfig) -> None:
        """Garante que a unidade não habilite feature que o município
        desligou. Só valida os flags ``enabled`` — detalhes (captura,
        modo, áudio) moram nos painéis/totens lógicos."""
        if child.totem is not None and child.totem.enabled and not parent.totem.enabled:
            raise HTTPException(
                status_code=409,
                detail="O município não habilita o totem; a unidade não pode ativá-lo.",
            )
        if child.painel is not None and child.painel.enabled and not parent.painel.enabled:
            raise HTTPException(
                status_code=409,
                detail="O município não habilita o painel; a unidade não pode ativá-lo.",
            )
        if child.recepcao is not None and child.recepcao.enabled and not parent.recepcao.enabled:
            raise HTTPException(
                status_code=409,
                detail="O município não habilita a recepção; a unidade não pode ativá-la.",
            )

    async def _get_municipality_or_404(self, municipality_id: UUID) -> Municipality:
        mun = await self.db.get(Municipality, municipality_id)
        if mun is None:
            raise HTTPException(status_code=404, detail="Município não encontrado.")
        return mun

    async def _get_facility_or_404(self, facility_id: UUID) -> Facility:
        fac = await self.db.get(Facility, facility_id)
        if fac is None:
            raise HTTPException(status_code=404, detail="Unidade não encontrada.")
        return fac


# ─── Merge parcial (PATCH) ──────────────────────────────────────────────────
#
# ``payload.config is None`` → limpar tudo (volta a herdar).
# ``payload.config`` com algumas seções preenchidas → preserva as seções
# não enviadas, sobrescreve as enviadas por inteiro (cada seção é
# "inteiro ou nada" — o PATCH sempre envia o objeto completo da seção).

def _merge_partial(existing: dict | None, incoming: RecConfig | None) -> dict | None:
    if incoming is None:
        return None
    incoming_raw = incoming.model_dump(exclude_none=True)
    base = dict(existing or {})
    base.update(incoming_raw)
    return base


_VALID_SECTIONS = {"totem", "painel", "recepcao"}


def _drop_section(existing: dict | None, section: str) -> dict | None:
    if section not in _VALID_SECTIONS:
        raise HTTPException(status_code=400, detail=f"Seção inválida: {section}")
    if not existing:
        return None
    next_dict = {k: v for k, v in existing.items() if k != section}
    return next_dict or None


# ─── Helpers de merge (runtime) ─────────────────────────────────────────────
#
# Cada bloco é "inteiro ou nada": se o override setou o bloco, ele substitui
# o pai por completo (exceto pela re-restrição que garante a cascata).

def _merge_totem(base: TotemConfig, override: TotemConfig | None) -> tuple[TotemConfig, str]:
    if override is None:
        return base, "inherited"
    return override, "override"


def _merge_painel(base: PainelConfig, override: PainelConfig | None) -> tuple[PainelConfig, str]:
    if override is None:
        return base, "inherited"
    return override, "override"


def _merge_recepcao(
    base: RecepcaoConfig, override: RecepcaoConfig | None,
) -> tuple[RecepcaoConfig, str]:
    if override is None:
        return base, "inherited"
    return override, "override"


def _restrict_totem(child: TotemConfig, parent: TotemConfig) -> TotemConfig:
    return TotemConfig(enabled=child.enabled and parent.enabled)


def _restrict_painel(child: PainelConfig, parent: PainelConfig) -> PainelConfig:
    return PainelConfig(enabled=child.enabled and parent.enabled)


def _restrict_recepcao(child: RecepcaoConfig, parent: RecepcaoConfig) -> RecepcaoConfig:
    return RecepcaoConfig(
        enabled=child.enabled and parent.enabled,
        after_attendance_sector=child.after_attendance_sector,
        forward_sector_names=child.forward_sector_names,
        queue_order_mode=child.queue_order_mode,
    )
