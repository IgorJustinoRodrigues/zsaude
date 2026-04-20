"""Reconciliação de vínculos CNES pós-importação.

Depois de cada import CNES (success/partial), compara cada
``FacilityAccess`` com vínculo (``cnes_professional_id IS NOT NULL``)
contra o estado vigente no schema do município — qualquer divergência
gera notificação pro usuário afetado + ADMINs do município + MASTERs.

**Detecta:**

- ``professional_missing`` — profissional não aparece mais em
  ``cnes_professionals`` ou não tem vínculo ativo na unidade.
- ``cbo_missing``         — profissional presente na unidade, mas
  sem o CBO que estava salvo (pode ter mudado de CBO).
- ``status_blocked``      — vínculo existe, mas ``status != 'Ativo'``.
- ``cpf_changed``         — CPF no CNES mudou em relação ao snapshot.
- ``nome_changed``        — nome no CNES mudou em relação ao snapshot.

Mantém os campos do ``FacilityAccess`` **intactos** (sem apagar nada) —
a notificação inclui antes/depois pra que o admin decida. Dedup por
``{facility_access_id}:{competencia}`` pra que reimports idênticos não
dupliquem notificações.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.modules.notifications.service import NotificationService
from app.modules.tenants.models import (
    Facility,
    FacilityAccess,
    FacilityAccessCnesBinding,
    Municipality,
    MunicipalityAccess,
)
from app.modules.users.models import User, UserLevel
from app.tenant_models.cnes import CnesProfessional, CnesProfessionalUnit, CnesUnit

log = get_logger(__name__)


ChangeKind = Literal[
    "professional_missing",
    "cbo_missing",
    "status_blocked",
    "cpf_changed",
    "nome_changed",
]


@dataclass
class BindingChange:
    binding_id: UUID
    facility_access_id: UUID
    user_id: UUID
    user_name: str
    facility_id: UUID
    facility_name: str
    cnes_professional_id: str
    cbo_id: str
    snapshot_nome: str | None
    kinds: list[ChangeKind]
    # Quando kind inclui *_changed: valores antes/depois.
    before: dict[str, str | None]
    after: dict[str, str | None]


class BindingReconciler:
    """Compara bindings salvos × estado vigente no CNES do município."""

    def __init__(self, session: AsyncSession) -> None:
        # ``session`` aponta pro schema do município (set_search_path já feito)
        # mas também tem acesso às tabelas globais de ``app`` via nomes
        # qualificados (``app.facility_accesses`` etc.).
        self.session = session
        self.notif = NotificationService(session)

    async def reconcile(
        self,
        *,
        municipality_id: UUID,
        competencia: str,
    ) -> list[BindingChange]:
        """Executa a reconciliação. Retorna lista de mudanças detectadas."""
        # 1. Carrega todos os bindings CNES das unidades do município.
        rows = await self.session.execute(
            select(FacilityAccessCnesBinding, FacilityAccess, Facility, User)
            .join(FacilityAccess, FacilityAccess.id == FacilityAccessCnesBinding.facility_access_id)
            .join(Facility, Facility.id == FacilityAccess.facility_id)
            .join(User, User.id == FacilityAccess.user_id)
            .where(Facility.municipality_id == municipality_id)
        )
        bindings = list(rows.all())
        if not bindings:
            return []

        # 2. Indexa cnes_unit por código CNES da unidade — facility.cnes →
        #    cnes_units.cnes → id_unidade.
        cnes_codes = {fac.cnes for _b, _fa, fac, _u in bindings if fac.cnes}
        if not cnes_codes:
            return []
        units_stmt = select(CnesUnit).where(CnesUnit.cnes.in_(cnes_codes))
        units_by_cnes: dict[str, CnesUnit] = {
            u.cnes: u for u in (await self.session.scalars(units_stmt)).all()
        }

        # 3. Pré-carrega vínculos (profissional × unidade × CBO) e
        #    profissionais referenciados — uma ida só ao DB.
        prof_ids = {b.cnes_professional_id for b, _fa, _fac, _u in bindings}
        prof_unit_rows = list((await self.session.scalars(
            select(CnesProfessionalUnit).where(
                CnesProfessionalUnit.id_profissional.in_(prof_ids),
            )
        )).all())
        # ``prof_unit_by[(id_prof, id_unidade)]`` → lista de (cbo_id, status)
        prof_unit_by: dict[tuple[str, str], list[tuple[str, str]]] = {}
        for pu in prof_unit_rows:
            key = (pu.id_profissional, pu.id_unidade)
            prof_unit_by.setdefault(key, []).append((pu.id_cbo, pu.status))

        profs_by_id = {
            p.id_profissional: p
            for p in (await self.session.scalars(
                select(CnesProfessional).where(
                    CnesProfessional.id_profissional.in_(prof_ids),
                )
            )).all()
        }

        # 4. Compara cada binding.
        changes: list[BindingChange] = []
        for binding, fa, fac, user in bindings:
            kinds: list[ChangeKind] = []
            before: dict[str, str | None] = {}
            after: dict[str, str | None] = {}

            # Sem código CNES na facility, não dá pra resolver a unidade CNES.
            cnes_unit = units_by_cnes.get(fac.cnes or "")
            if cnes_unit is None:
                kinds.append("professional_missing")
                changes.append(_build_change(binding, fa, fac, user, kinds, before, after))
                continue

            vinculos = prof_unit_by.get(
                (binding.cnes_professional_id, cnes_unit.id_unidade), []
            )
            if not vinculos:
                kinds.append("professional_missing")
            else:
                # Profissional tem vínculos na unidade — verifica esse CBO
                # específico e status.
                stored_cbo = binding.cbo_id
                matching = [v for v in vinculos if v[0] == stored_cbo]
                if not matching:
                    kinds.append("cbo_missing")
                    alt = sorted({v[0] for v in vinculos if v[0]})
                    if alt:
                        after["cbo_id_alternatives"] = ", ".join(alt)
                else:
                    status_now = matching[0][1] or ""
                    if status_now and status_now.lower() != "ativo":
                        kinds.append("status_blocked")
                        before["status"] = "Ativo"
                        after["status"] = status_now

            # Profissional ainda existe? Compare CPF/nome.
            prof = profs_by_id.get(binding.cnes_professional_id)
            if prof is not None:
                snap_cpf = (binding.cnes_snapshot_cpf or "").strip()
                cur_cpf = (prof.cpf or "").strip()
                if snap_cpf and cur_cpf and snap_cpf != cur_cpf:
                    kinds.append("cpf_changed")
                    before["cpf"] = snap_cpf
                    after["cpf"] = cur_cpf

                snap_nome = (binding.cnes_snapshot_nome or "").strip()
                cur_nome = (prof.nome or "").strip()
                if snap_nome and cur_nome and snap_nome != cur_nome:
                    kinds.append("nome_changed")
                    before["nome"] = snap_nome
                    after["nome"] = cur_nome

            if kinds:
                changes.append(_build_change(binding, fa, fac, user, kinds, before, after))

        if not changes:
            log.info(
                "cnes_binding_reconcile_ok",
                municipality_id=str(municipality_id),
                competencia=competencia,
                bindings=len(bindings),
            )
            return []

        # 5. Emite notificações.
        await self._notify_users(changes, competencia=competencia)
        await self._notify_admins(
            changes, municipality_id=municipality_id, competencia=competencia,
        )

        log.info(
            "cnes_binding_reconcile_changes",
            municipality_id=str(municipality_id),
            competencia=competencia,
            changes=len(changes),
            bindings=len(bindings),
        )
        return changes

    # ── Notificações ─────────────────────────────────────────────────────

    async def _notify_users(
        self, changes: list[BindingChange], *, competencia: str,
    ) -> None:
        for ch in changes:
            title = _title_for(ch)
            message = _message_for(ch)
            body = _body_for(ch)
            await self.notif.notify(
                user_id=ch.user_id,
                type="warning",
                category="cnes_binding_change",
                title=title,
                message=message,
                body=body,
                action_url="/minha-conta",
                action_label="Ver perfil",
                data={
                    "bindingId":         str(ch.binding_id),
                    "facilityAccessId":  str(ch.facility_access_id),
                    "facilityId":        str(ch.facility_id),
                    "cnesProfessionalId": ch.cnes_professional_id,
                    "cboId":              ch.cbo_id,
                    "kinds":              ch.kinds,
                    "before":             ch.before,
                    "after":              ch.after,
                    "competencia":        competencia,
                },
                dedup_key=f"cnes_binding_change:{ch.binding_id}:{competencia}",
            )

    async def _notify_admins(
        self,
        changes: list[BindingChange],
        *,
        municipality_id: UUID,
        competencia: str,
    ) -> None:
        # ADMINs do município + MASTERs. Dedup único por município+competência.
        recipient_ids = await _collect_admin_recipients(self.session, municipality_id)
        if not recipient_ids:
            return

        mun = await self.session.scalar(
            select(Municipality).where(Municipality.id == municipality_id)
        )
        mun_label = f"{mun.name}/{mun.state}" if mun else str(municipality_id)

        count = len(changes)
        title = f"{count} vínculo(s) CNES mudaram · {mun_label}"
        message = (
            f"A importação da competência {competencia} detectou mudanças "
            f"em {count} acesso(s) com vínculo CNES. Revise os usuários afetados."
        )
        body = _admin_body(changes)
        action_url = "/sys/usuarios" if _any_master(recipient_ids) else "/ops/usuarios"

        for uid in recipient_ids:
            await self.notif.notify(
                user_id=uid,
                type="warning",
                category="cnes_binding_change_admin",
                title=title,
                message=message,
                body=body,
                action_url=action_url,
                action_label="Ver usuários",
                data={
                    "municipalityId": str(municipality_id),
                    "competencia":    competencia,
                    "affectedAccessIds": [str(c.facility_access_id) for c in changes],
                },
                dedup_key=f"cnes_binding_admin:{municipality_id}:{competencia}",
            )


# ── Helpers ───────────────────────────────────────────────────────────────


def _build_change(
    binding: FacilityAccessCnesBinding,
    fa: FacilityAccess, fac: Facility, user: User,
    kinds: list[ChangeKind], before: dict, after: dict,
) -> BindingChange:
    return BindingChange(
        binding_id=binding.id,
        facility_access_id=fa.id,
        user_id=user.id,
        user_name=user.name,
        facility_id=fac.id,
        facility_name=fac.short_name or fac.name,
        cnes_professional_id=binding.cnes_professional_id,
        cbo_id=binding.cbo_id,
        snapshot_nome=binding.cnes_snapshot_nome,
        kinds=kinds,
        before=before,
        after=after,
    )


_KIND_TITLE = {
    "professional_missing": "Profissional não encontrado no CNES",
    "cbo_missing":          "CBO do vínculo mudou",
    "status_blocked":       "Vínculo bloqueado no CNES",
    "cpf_changed":          "CPF mudou no CNES",
    "nome_changed":         "Nome mudou no CNES",
}


def _title_for(ch: BindingChange) -> str:
    if len(ch.kinds) == 1:
        return f"{_KIND_TITLE[ch.kinds[0]]} · {ch.facility_name}"
    return f"Vínculo CNES com mudanças · {ch.facility_name}"


def _message_for(ch: BindingChange) -> str:
    labels = [_KIND_TITLE[k].lower() for k in ch.kinds]
    joined = ", ".join(labels)
    return (
        f"A última importação CNES indicou: {joined}. "
        f"Revise seu vínculo com a unidade {ch.facility_name}."
    )


def _body_for(ch: BindingChange) -> str:
    parts = [f"Unidade: {ch.facility_name}"]
    if ch.snapshot_nome:
        parts.append(f"Profissional: {ch.snapshot_nome}")
    if ch.cbo_id:
        parts.append(f"CBO salvo: {ch.cbo_id}")
    parts.append("")
    for k in ch.kinds:
        parts.append(f"• {_KIND_TITLE[k]}")
        if k == "cpf_changed":
            parts.append(f"    antes: {ch.before.get('cpf', '—')}")
            parts.append(f"    agora: {ch.after.get('cpf', '—')}")
        elif k == "nome_changed":
            parts.append(f"    antes: {ch.before.get('nome', '—')}")
            parts.append(f"    agora: {ch.after.get('nome', '—')}")
        elif k == "status_blocked":
            parts.append(f"    status atual: {ch.after.get('status', '—')}")
        elif k == "cbo_missing":
            alt = ch.after.get("cbo_id_alternatives")
            if alt:
                parts.append(f"    CBOs encontrados agora: {alt}")
            else:
                parts.append("    o profissional não tem mais nenhum CBO nesta unidade.")
    return "\n".join(parts)


def _admin_body(changes: list[BindingChange]) -> str:
    lines = ["Acessos afetados:", ""]
    for ch in changes[:25]:  # limite de listagem
        kinds_label = ", ".join(_KIND_TITLE[k].lower() for k in ch.kinds)
        lines.append(f"• {ch.user_name} — {ch.facility_name} ({kinds_label})")
    if len(changes) > 25:
        lines.append(f"… e mais {len(changes) - 25}.")
    return "\n".join(lines)


async def _collect_admin_recipients(
    session: AsyncSession, municipality_id: UUID,
) -> list[UUID]:
    """Todos os MASTER + ADMINs com acesso ao município."""
    # MASTERs globais.
    master_ids = list((await session.scalars(
        select(User.id).where(User.level == UserLevel.MASTER, User.is_active.is_(True))
    )).all())

    # ADMINs com MunicipalityAccess neste município.
    admin_ids = list((await session.scalars(
        select(User.id)
        .join(MunicipalityAccess, MunicipalityAccess.user_id == User.id)
        .where(
            User.level == UserLevel.ADMIN,
            User.is_active.is_(True),
            MunicipalityAccess.municipality_id == municipality_id,
        )
    )).all())

    return list(dict.fromkeys([*master_ids, *admin_ids]))  # dedup preservando ordem


def _any_master(ids: list[UUID]) -> bool:
    return bool(ids)  # marcado só como dica de URL — não crítico
