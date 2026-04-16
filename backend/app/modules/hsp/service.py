"""Service layer do cadastro de paciente.

Concentra:
- Validações de negócio (CPF, unicidade, formato).
- Cálculo de diff campo-a-campo → grava ``patient_field_history``.
- Upload de foto com cálculo de checksum + atualização do ponteiro
  ``patients.current_photo_id``.
- Audit log global (compliance) via ``write_audit``.
"""

from __future__ import annotations

import hashlib
import re
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import get_audit_context
from app.core.deps import WorkContext
from app.modules.audit.writer import write_audit
from app.modules.hsp.schemas import PatientCreate, PatientUpdate
from app.tenant_models.patients import (
    Patient,
    PatientFieldChangeType,
    PatientFieldHistory,
    PatientPhoto,
)

# ── Campos que o histórico acompanha ────────────────────────────────────────
# Inclui todos os editáveis. ``current_photo_id`` é tratado separadamente
# em ``set_photo``/``remove_photo``.

_TRACKED_FIELDS: tuple[str, ...] = (
    "prontuario", "name", "social_name", "cpf", "cns",
    "rg", "rg_orgao_emissor", "rg_uf", "rg_data_emissao",
    "tipo_documento_id", "numero_documento",
    "passaporte", "pais_passaporte", "nis_pis", "titulo_eleitor", "cadunico",
    "birth_date", "sex", "naturalidade_ibge", "naturalidade_uf", "pais_nascimento",
    "identidade_genero_id", "orientacao_sexual_id",
    "nacionalidade_id", "raca_id", "etnia_id", "estado_civil_id",
    "escolaridade_id", "religiao_id", "povo_tradicional_id",
    "cbo_id", "ocupacao_livre",
    "situacao_rua", "frequenta_escola", "renda_familiar", "beneficiario_bolsa_familia",
    "cep", "logradouro_id", "endereco", "numero", "complemento", "bairro",
    "municipio_ibge", "uf", "pais", "area_microarea",
    "phone", "cellphone", "phone_recado", "email", "idioma_preferencial",
    "mother_name", "mother_unknown", "father_name", "father_unknown",
    "responsavel_nome", "responsavel_cpf", "responsavel_parentesco_id",
    "contato_emergencia_nome", "contato_emergencia_telefone",
    "contato_emergencia_parentesco_id",
    "tipo_sanguineo_id", "alergias", "tem_alergia", "doencas_cronicas",
    "deficiencias", "gestante", "dum", "fumante", "etilista",
    "observacoes_clinicas",
    "plano_tipo", "convenio_nome", "convenio_numero_carteirinha", "convenio_validade",
    "unidade_saude_id", "vinculado", "observacoes", "consentimento_lgpd",
)


def _serialize(value: Any) -> str | None:
    """Normaliza valor pra armazenar no histórico (text)."""
    if value is None:
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (list, tuple)):
        return ",".join(str(v) for v in value)
    return str(value)


# ── Validação de CPF (Mod11) ────────────────────────────────────────────────

_CPF_RE = re.compile(r"^\d{11}$")


def _validate_cpf(cpf: str) -> str:
    cpf = re.sub(r"\D", "", cpf or "")
    if not _CPF_RE.match(cpf):
        raise HTTPException(status_code=400, detail="CPF deve conter 11 dígitos.")
    if cpf == cpf[0] * 11:
        raise HTTPException(status_code=400, detail="CPF inválido.")
    for i in (9, 10):
        s = sum(int(cpf[j]) * ((i + 1) - j) for j in range(i))
        d = (s * 10) % 11
        if d == 10:
            d = 0
        if d != int(cpf[i]):
            raise HTTPException(status_code=400, detail="CPF inválido.")
    return cpf


# ── Service ─────────────────────────────────────────────────────────────────


class PatientService:
    def __init__(self, db: AsyncSession, ctx: WorkContext, user_name: str = "") -> None:
        self.db = db
        self.ctx = ctx
        self.user_name = user_name

    # ── Prontuário ─────────────────────────────────────────────────
    async def _next_prontuario(self) -> str:
        """Gera prontuário sequencial local (6 dígitos zero-padded).

        Usa ``max(CAST(prontuario AS integer))`` entre os que são totalmente
        numéricos; se o maior estiver ocupado, tenta N+1 até achar um livre.
        """
        from sqlalchemy import text as sa_text

        last = await self.db.scalar(sa_text(
            "SELECT COALESCE(MAX(CAST(prontuario AS integer)), 0) "
            "FROM patients WHERE prontuario ~ '^[0-9]+$'"
        ))
        n = int(last or 0) + 1
        # Colisão improvável, mas garantimos:
        for _ in range(5):
            candidate = f"{n:06d}"
            exists = await self.db.scalar(select(Patient.id).where(Patient.prontuario == candidate))
            if exists is None:
                return candidate
            n += 1
        return f"{n:06d}"

    # ── Listagem / busca ───────────────────────────────────────────
    async def list_patients(
        self,
        *,
        search: str | None,
        active: bool | None,
        page: int,
        page_size: int,
        sort: str,
        dir_: str,
    ) -> tuple[list[Patient], int]:
        filters: list[Any] = []
        if search:
            term = f"%{search.strip()}%"
            filters.append(
                or_(
                    Patient.name.ilike(term),
                    Patient.social_name.ilike(term),
                    Patient.cpf.ilike(term),
                    Patient.cns.ilike(term),
                    Patient.prontuario.ilike(term),
                )
            )
        if active is not None:
            filters.append(Patient.active == active)

        where = and_(*filters) if filters else None

        count_q = select(func.count()).select_from(Patient)
        if where is not None:
            count_q = count_q.where(where)
        total = await self.db.scalar(count_q) or 0

        sort_map = {
            "name":       Patient.name,
            "prontuario": Patient.prontuario,
            "cpf":        Patient.cpf,
            "created_at": Patient.created_at,
            "updated_at": Patient.updated_at,
        }
        order_col = sort_map.get(sort, Patient.name)
        order = desc(order_col) if dir_ == "desc" else order_col.asc()

        q = select(Patient)
        if where is not None:
            q = q.where(where)
        q = q.order_by(order).offset((page - 1) * page_size).limit(page_size)

        rows = list((await self.db.scalars(q)).all())
        return rows, total

    # ── Create ─────────────────────────────────────────────────────
    async def create_patient(self, payload: PatientCreate) -> Patient:
        cpf = _validate_cpf(payload.cpf)

        existing = await self.db.scalar(select(Patient).where(Patient.cpf == cpf))
        if existing is not None:
            raise HTTPException(status_code=409, detail="CPF já cadastrado neste município.")

        prontuario = payload.prontuario or await self._next_prontuario()
        dup_pront = await self.db.scalar(select(Patient).where(Patient.prontuario == prontuario))
        if dup_pront is not None:
            raise HTTPException(status_code=409, detail="Prontuário já em uso.")

        data = payload.model_dump(exclude={"prontuario", "cpf"})
        # Converte UUIDs em list[UUID] (deficiencias) pra list[str] no JSONB
        if "deficiencias" in data and data["deficiencias"]:
            data["deficiencias"] = [str(u) for u in data["deficiencias"]]

        patient = Patient(
            prontuario=prontuario,
            cpf=cpf,
            created_by=self.ctx.user_id,
            **data,
        )
        self.db.add(patient)
        await self.db.flush()

        # Registra a criação como um único log (change_type=create) com
        # detalhes em new_value (JSON-ish).
        await self._record_history(
            patient_id=patient.id,
            field_name="__create__",
            old_value=None,
            new_value=f"prontuario={prontuario}, cpf={cpf}",
            change_type=PatientFieldChangeType.CREATE,
            reason=None,
        )

        await write_audit(
            self.db,
            module="hsp",
            action="patient_create",
            severity="info",
            resource="patient",
            resource_id=str(patient.id),
            description=f"Criou paciente {patient.name} (prontuário {prontuario})",
            details={"prontuario": prontuario, "cpf": cpf},
        )

        return patient

    # ── Get ────────────────────────────────────────────────────────
    async def get_patient(self, patient_id: UUID) -> Patient:
        p = await self.db.scalar(select(Patient).where(Patient.id == patient_id))
        if p is None:
            raise HTTPException(status_code=404, detail="Paciente não encontrado.")
        return p

    # ── Update (com diff) ──────────────────────────────────────────
    async def update_patient(self, patient_id: UUID, payload: PatientUpdate) -> Patient:
        patient = await self.get_patient(patient_id)
        data = payload.model_dump(exclude_unset=True, exclude={"reason"})
        reason = payload.reason

        if "cpf" in data and data["cpf"] and data["cpf"] != patient.cpf:
            cpf = _validate_cpf(data["cpf"])
            dup = await self.db.scalar(
                select(Patient).where(and_(Patient.cpf == cpf, Patient.id != patient_id))
            )
            if dup is not None:
                raise HTTPException(status_code=409, detail="CPF já cadastrado neste município.")
            data["cpf"] = cpf

        if "prontuario" in data and data["prontuario"] and data["prontuario"] != patient.prontuario:
            dup = await self.db.scalar(
                select(Patient).where(
                    and_(Patient.prontuario == data["prontuario"], Patient.id != patient_id)
                )
            )
            if dup is not None:
                raise HTTPException(status_code=409, detail="Prontuário já em uso.")

        # Converte deficiencias (UUIDs) pra list[str]
        if "deficiencias" in data and data["deficiencias"] is not None:
            data["deficiencias"] = [str(u) for u in data["deficiencias"]]

        changes: dict[str, tuple[Any, Any]] = {}
        for field, new_val in data.items():
            if field not in _TRACKED_FIELDS:
                continue
            old_val = getattr(patient, field)
            if old_val == new_val:
                continue
            changes[field] = (old_val, new_val)
            setattr(patient, field, new_val)

        if not changes:
            return patient

        patient.updated_by = self.ctx.user_id
        patient.data_ultima_revisao_cadastro = datetime.now(UTC)
        await self.db.flush()

        # Histórico campo a campo
        for field, (old_val, new_val) in changes.items():
            await self._record_history(
                patient_id=patient.id,
                field_name=field,
                old_value=_serialize(old_val),
                new_value=_serialize(new_val),
                change_type=PatientFieldChangeType.UPDATE,
                reason=reason,
            )

        await write_audit(
            self.db,
            module="hsp",
            action="patient_update",
            severity="info",
            resource="patient",
            resource_id=str(patient.id),
            description=f"Atualizou paciente {patient.name}",
            details={"changedFields": list(changes.keys()), "reason": reason or ""},
        )

        return patient

    # ── Soft-delete ────────────────────────────────────────────────
    async def deactivate_patient(self, patient_id: UUID, reason: str | None) -> Patient:
        patient = await self.get_patient(patient_id)
        if not patient.active:
            return patient
        patient.active = False
        patient.updated_by = self.ctx.user_id
        await self.db.flush()

        await self._record_history(
            patient_id=patient.id,
            field_name="active",
            old_value="true",
            new_value="false",
            change_type=PatientFieldChangeType.DELETE,
            reason=reason,
        )

        await write_audit(
            self.db, module="hsp", action="patient_deactivate", severity="warning",
            resource="patient", resource_id=str(patient.id),
            description=f"Desativou paciente {patient.name}",
            details={"reason": reason or ""},
        )
        return patient

    # ── Foto ───────────────────────────────────────────────────────
    async def set_photo(
        self,
        patient_id: UUID,
        *,
        content: bytes,
        mime_type: str,
        width: int | None = None,
        height: int | None = None,
    ) -> PatientPhoto:
        patient = await self.get_patient(patient_id)
        checksum = hashlib.sha256(content).hexdigest()

        photo = PatientPhoto(
            patient_id=patient.id,
            content=content,
            mime_type=mime_type,
            file_size=len(content),
            width=width,
            height=height,
            checksum_sha256=checksum,
            uploaded_by=self.ctx.user_id,
            uploaded_by_name=self.user_name,
        )
        self.db.add(photo)
        await self.db.flush()

        old_photo_id = patient.current_photo_id
        patient.current_photo_id = photo.id
        patient.updated_by = self.ctx.user_id
        await self.db.flush()

        await self._record_history(
            patient_id=patient.id,
            field_name="current_photo_id",
            old_value=_serialize(old_photo_id),
            new_value=str(photo.id),
            change_type=PatientFieldChangeType.PHOTO_UPLOAD,
            reason=None,
        )

        await write_audit(
            self.db, module="hsp", action="patient_photo_upload", severity="info",
            resource="patient_photo", resource_id=str(photo.id),
            description=f"Nova foto para {patient.name}",
            details={"patientId": str(patient.id), "size": len(content), "mime": mime_type},
        )
        return photo

    async def remove_photo(self, patient_id: UUID) -> None:
        patient = await self.get_patient(patient_id)
        if patient.current_photo_id is None:
            return
        old_id = patient.current_photo_id
        patient.current_photo_id = None
        patient.updated_by = self.ctx.user_id
        await self.db.flush()

        await self._record_history(
            patient_id=patient.id,
            field_name="current_photo_id",
            old_value=str(old_id),
            new_value=None,
            change_type=PatientFieldChangeType.PHOTO_REMOVE,
            reason=None,
        )

        await write_audit(
            self.db, module="hsp", action="patient_photo_remove", severity="warning",
            resource="patient_photo", resource_id=str(old_id),
            description=f"Removeu foto de {patient.name}",
            details={"patientId": str(patient.id)},
        )

    async def get_photo(self, patient_id: UUID, photo_id: UUID | None = None) -> PatientPhoto:
        if photo_id is None:
            patient = await self.get_patient(patient_id)
            if patient.current_photo_id is None:
                raise HTTPException(status_code=404, detail="Paciente sem foto.")
            photo_id = patient.current_photo_id

        photo = await self.db.scalar(
            select(PatientPhoto).where(
                and_(PatientPhoto.id == photo_id, PatientPhoto.patient_id == patient_id)
            )
        )
        if photo is None:
            raise HTTPException(status_code=404, detail="Foto não encontrada.")
        return photo

    # ── Histórico ──────────────────────────────────────────────────
    async def list_history(
        self,
        patient_id: UUID,
        *,
        field: str | None,
        page: int,
        page_size: int,
    ) -> tuple[list[PatientFieldHistory], int]:
        await self.get_patient(patient_id)

        filters: list[Any] = [PatientFieldHistory.patient_id == patient_id]
        if field:
            filters.append(PatientFieldHistory.field_name == field)

        total = await self.db.scalar(
            select(func.count()).select_from(PatientFieldHistory).where(and_(*filters))
        ) or 0

        rows = list((await self.db.scalars(
            select(PatientFieldHistory)
            .where(and_(*filters))
            # id é UUIDv7 (monotônico) — desempata quando changed_at é igual
            # (vários writes na mesma transação compartilham o now()).
            .order_by(desc(PatientFieldHistory.changed_at), desc(PatientFieldHistory.id))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )).all())
        return rows, total

    # ── Helper histórico ───────────────────────────────────────────
    async def _record_history(
        self,
        *,
        patient_id: UUID,
        field_name: str,
        old_value: str | None,
        new_value: str | None,
        change_type: PatientFieldChangeType,
        reason: str | None,
    ) -> None:
        actx = get_audit_context()
        row = PatientFieldHistory(
            patient_id=patient_id,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            change_type=change_type,
            changed_by=self.ctx.user_id,
            changed_by_name=self.user_name,
            changed_by_role=self.ctx.role or "",
            reason=(reason or "")[:500],
            ip=(actx.ip or "")[:45],
            request_id=(actx.request_id or "")[:50],
        )
        self.db.add(row)
