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
from sqlalchemy.sql import expression
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import get_audit_context
from app.core.deps import WorkContext
from app.db.file_model import TenantFile
from app.db.types import new_uuid7
from app.modules.audit.helpers import describe_change
from app.modules.audit.writer import write_audit
from app.modules.hsp.schemas import DocumentInput, PatientCreate, PatientUpdate
from app.services.storage import get_storage
from app.tenant_models.patients import (
    Patient,
    PatientAddress,
    PatientDocument,
    PatientFieldChangeType,
    PatientFieldHistory,
    PatientPhoto,
)

# ── Campos que o histórico acompanha ────────────────────────────────────────
# Inclui todos os editáveis. ``current_photo_id`` é tratado separadamente
# em ``set_photo``/``remove_photo``.

_TRACKED_FIELDS: tuple[str, ...] = (
    "prontuario", "name", "social_name", "cpf", "cns",
    "birth_date", "sex", "naturalidade_ibge", "naturalidade_uf", "pais_nascimento",
    "identidade_genero_id", "orientacao_sexual_id",
    "nacionalidade_id", "raca_id", "etnia_id", "estado_civil_id",
    "escolaridade_id", "religiao_id", "povo_tradicional_id",
    "cbo_id", "ocupacao_livre",
    "situacao_rua", "frequenta_escola", "renda_familiar", "beneficiario_bolsa_familia",
    "cep", "logradouro_id", "endereco", "numero", "complemento", "bairro",
    "municipio_ibge", "uf", "pais", "area_microarea", "latitude", "longitude",
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


from app.db.query_helpers import unaccent_ilike as _unaccent_ilike


def _is_empty(v: Any) -> bool:
    """Considera vazio para fins de comparação: None, "", lista vazia."""
    return v is None or v == "" or v == []


def _values_equal(a: Any, b: Any) -> bool:
    """Compara dois valores tratando vazios equivalentes (None ≡ "" ≡ [])."""
    if _is_empty(a) and _is_empty(b):
        return True
    return a == b


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


# ── Helpers de foto ─────────────────────────────────────────────────────────


async def load_photo_bytes(db: AsyncSession, photo: PatientPhoto) -> bytes:
    """Lê o conteúdo binário da foto.

    Ordem: S3 via ``photo.file_id`` → ``files.storage_key``; fallback pro
    campo legado ``photo.content``. Levanta 404 se nenhum dos dois estiver
    disponível (registro inconsistente).
    """
    if photo.file_id is not None:
        storage_key = await db.scalar(
            select(TenantFile.storage_key).where(TenantFile.id == photo.file_id)
        )
        if storage_key:
            return await get_storage().download(storage_key)
    if photo.content:
        return bytes(photo.content)
    raise HTTPException(status_code=404, detail="Foto sem conteúdo disponível.")


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

        dialect = self.db.bind.dialect.name
        if dialect == "oracle":
            sql = (
                "SELECT COALESCE(MAX(CAST(prontuario AS INTEGER)), 0) "
                "FROM patients WHERE REGEXP_LIKE(prontuario, '^[0-9]+$')"
            )
        else:
            sql = (
                "SELECT COALESCE(MAX(CAST(prontuario AS integer)), 0) "
                "FROM patients WHERE prontuario ~ '^[0-9]+$'"
            )
        last = await self.db.scalar(sa_text(sql))
        n = int(last or 0) + 1
        # Colisão improvável, mas garantimos:
        for _ in range(5):
            candidate = f"{n:06d}"
            exists = await self.db.scalar(select(Patient.id).where(Patient.prontuario == candidate))
            if exists is None:
                return candidate
            n += 1
        return f"{n:06d}"

    # ── Lookup pré-cadastro ────────────────────────────────────────
    async def lookup_patients(
        self,
        *,
        cpf: str | None = None,
        cns: str | None = None,
        documento: str | None = None,
        name: str | None = None,
        birth_date: date | None = None,
        mother_name: str | None = None,
        father_name: str | None = None,
        limit: int = 10,
    ) -> list[Patient]:
        """Busca paciente para evitar duplicatas no pré-cadastro.

        - CPF/CNS: match exato em ``patients`` (ignora pontuação).
        - documento: match exato em ``patient_documents.numero``.
        - name + birth_date + mother_name: cada combinação acumula como
          AND, reduzindo falsos positivos com homônimos.
        - name sozinho: ilike (varredura limitada a `limit`).
        """
        clauses: list[Any] = []

        if cpf:
            clean = re.sub(r"\D", "", cpf)
            if len(clean) == 11:
                clauses.append(Patient.cpf == clean)

        if cns:
            clean = re.sub(r"\D", "", cns)
            if len(clean) == 15:
                clauses.append(Patient.cns == clean)

        if documento:
            clean_doc = (documento or "").strip()
            if clean_doc:
                doc_subq = select(PatientDocument.patient_id).where(
                    PatientDocument.numero == clean_doc
                )
                clauses.append(Patient.id.in_(doc_subq))

        # Bloco "Nome + nascimento + filiação" — combinados em AND para
        # reduzir falsos positivos. Vai como um único OR-arm no where geral.
        name_term = (name or "").strip()
        mother_term = (mother_name or "").strip()
        father_term = (father_name or "").strip()
        if name_term or mother_term or father_term:
            sub: list[Any] = []
            if name_term:
                sub.append(or_(
                    _unaccent_ilike(Patient.name, name_term),
                    _unaccent_ilike(Patient.social_name, name_term),
                ))
            if birth_date:
                sub.append(Patient.birth_date == birth_date)
            if mother_term:
                sub.append(_unaccent_ilike(Patient.mother_name, mother_term))
            if father_term:
                sub.append(_unaccent_ilike(Patient.father_name, father_term))
            clauses.append(and_(*sub))

        if not clauses:
            return []

        q = (
            select(Patient)
            .where(or_(*clauses))
            .order_by(Patient.name)
            .limit(limit)
        )
        return list((await self.db.scalars(q)).all())

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
            term = search.strip()
            like = f"%{term}%"
            filters.append(
                or_(
                    # Texto livre: ignora maiúsculas/minúsculas e acentos.
                    _unaccent_ilike(Patient.name, term),
                    _unaccent_ilike(Patient.social_name, term),
                    # Códigos: case-insensitive match.
                    func.lower(Patient.cpf).like(func.lower(like)),
                    func.lower(Patient.cns).like(func.lower(like)),
                    func.lower(Patient.prontuario).like(func.lower(like)),
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
        # CPF é opcional no cadastro simplificado. Quando vier, valida +
        # checa duplicata; quando ausente, segue.
        cpf: str | None = None
        if payload.cpf:
            cpf = _validate_cpf(payload.cpf)
            existing = await self.db.scalar(select(Patient).where(Patient.cpf == cpf))
            if existing is not None:
                raise HTTPException(status_code=409, detail="CPF já cadastrado neste município.")

        prontuario = payload.prontuario or await self._next_prontuario()
        dup_pront = await self.db.scalar(select(Patient).where(Patient.prontuario == prontuario))
        if dup_pront is not None:
            raise HTTPException(status_code=409, detail="Prontuário já em uso.")

        data = payload.model_dump(exclude={"prontuario", "cpf", "documents"})
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

        # Documentos enviados na criação.
        for doc in payload.documents:
            await self._add_document(patient.id, doc, log=True)

        # Registra a criação como um único log (change_type=create).
        await self._record_history(
            patient_id=patient.id,
            field_name="__create__",
            old_value=None,
            new_value=f"prontuario={prontuario}, cpf={cpf or '-'}",
            change_type=PatientFieldChangeType.CREATE,
            reason=None,
        )

        await write_audit(
            self.db,
            module="hsp", action="patient_create", severity="info",
            resource="patient", resource_id=str(patient.id),
            description=describe_change(
                actor=self.user_name, verb="cadastrou o paciente",
                target_name=patient.name,
                extra=f"prontuário {prontuario}",
            ),
            details={
                "patientName": patient.name,
                "prontuario": prontuario,
                "cpf": cpf or "",
                "documentsCount": len(payload.documents),
            },
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
        data = payload.model_dump(exclude_unset=True, exclude={"reason", "documents"})
        reason = payload.reason
        documents_payload = payload.documents  # None = manter; lista = reconciliar

        if "cpf" in data:
            # CPF é opcional — permite limpar (None/"") ou trocar.
            raw_cpf = (data["cpf"] or "").strip() or None
            if raw_cpf and raw_cpf != patient.cpf:
                raw_cpf = _validate_cpf(raw_cpf)
                dup = await self.db.scalar(
                    select(Patient).where(and_(Patient.cpf == raw_cpf, Patient.id != patient_id))
                )
                if dup is not None:
                    raise HTTPException(status_code=409, detail="CPF já cadastrado neste município.")
            data["cpf"] = raw_cpf

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
            # Trata None ≡ "" ≡ [] como equivalentes — evita log falso quando
            # o frontend manda string vazia pra um campo nullable do banco.
            if _values_equal(old_val, new_val):
                continue
            changes[field] = (old_val, new_val)
            setattr(patient, field, new_val)

        if changes:
            patient.updated_by = self.ctx.user_id
            patient.data_ultima_revisao_cadastro = datetime.now(UTC)
            await self.db.flush()

            for field, (old_val, new_val) in changes.items():
                await self._record_history(
                    patient_id=patient.id,
                    field_name=field,
                    old_value=_serialize(old_val),
                    new_value=_serialize(new_val),
                    change_type=PatientFieldChangeType.UPDATE,
                    reason=reason,
                )

        # Documentos: reconciliação se documents foi passado
        doc_changes = 0
        if documents_payload is not None:
            doc_changes = await self._reconcile_documents(patient.id, documents_payload, reason)

        if changes or doc_changes:
            from app.modules.audit.helpers import humanize_field, humanize_value
            changed_labels = [humanize_field(f) for f in changes.keys()]
            if doc_changes:
                changed_labels.append(f"{doc_changes} documento(s)")
            await write_audit(
                self.db,
                module="hsp", action="patient_update", severity="info",
                resource="patient", resource_id=str(patient.id),
                description=describe_change(
                    actor=self.user_name, verb="editou o paciente",
                    target_name=patient.name,
                    changed_fields=changed_labels,
                    extra=(f"motivo: {reason}" if reason else ""),
                ),
                details={
                    "patientName": patient.name,
                    "changes": [
                        {
                            "field": field,
                            "label": humanize_field(field),
                            "before": humanize_value(old),
                            "after": humanize_value(new),
                        }
                        for field, (old, new) in changes.items()
                    ],
                    "documentChanges": doc_changes,
                    "reason": reason or "",
                },
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
            description=describe_change(
                actor=self.user_name, verb="desativou o paciente",
                target_name=patient.name,
                extra=(f"motivo: {reason}" if reason else ""),
            ),
            details={"patientName": patient.name, "reason": reason or ""},
        )
        return patient

    async def reactivate_patient(self, patient_id: UUID, reason: str | None) -> Patient:
        """Reativa paciente previamente desativado. Idempotente."""
        patient = await self.get_patient(patient_id)
        if patient.active:
            return patient
        patient.active = True
        patient.updated_by = self.ctx.user_id
        await self.db.flush()

        await self._record_history(
            patient_id=patient.id,
            field_name="active",
            old_value="false",
            new_value="true",
            change_type=PatientFieldChangeType.UPDATE,
            reason=reason,
        )

        await write_audit(
            self.db, module="hsp", action="patient_reactivate", severity="info",
            resource="patient", resource_id=str(patient.id),
            description=describe_change(
                actor=self.user_name, verb="reativou o paciente",
                target_name=patient.name,
                extra=(f"motivo: {reason}" if reason else ""),
            ),
            details={"patientName": patient.name, "reason": reason or ""},
        )
        return patient

    # ── Foto ───────────────────────────────────────────────────────
    async def set_photo(
        self,
        patient_id: UUID,
        *,
        content: bytes,
        mime_type: str,
        original_name: str = "",
        width: int | None = None,
        height: int | None = None,
    ) -> PatientPhoto:
        patient = await self.get_patient(patient_id)
        checksum = hashlib.sha256(content).hexdigest()

        photo_uuid = new_uuid7()
        ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(mime_type, "bin")
        ibge = self.ctx.municipality_ibge
        storage_key = f"mun_{ibge}/patients/{patient_id}/photos/{photo_uuid}.{ext}"

        storage = get_storage()
        await storage.upload(storage_key, content, mime_type)

        # Se o DB falhar daqui pra baixo, o objeto fica órfão no bucket —
        # removemos na mão pra não vazar storage.
        try:
            file_record = TenantFile(
                storage_key=storage_key,
                original_name=original_name or f"photo.{ext}",
                mime_type=mime_type,
                size_bytes=len(content),
                checksum_sha256=checksum,
                category="patient_photo",
                entity_id=patient.id,
                uploaded_by=self.ctx.user_id,
                uploaded_by_name=self.user_name,
            )
            self.db.add(file_record)
            await self.db.flush()

            photo = PatientPhoto(
                id=photo_uuid,
                patient_id=patient.id,
                file_id=file_record.id,
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
        except Exception:
            await storage.delete(storage_key)
            raise

        old_photo_id = patient.current_photo_id
        patient.current_photo_id = photo.id
        patient.updated_by = self.ctx.user_id
        await self.db.flush()

        from app.modules.hsp import face_service
        enroll = await face_service.enroll_from_photo(
            self.db,
            patient_id=patient.id,
            photo_bytes=content,
            photo_id=photo.id,
        )
        face_status = enroll.status
        photo.face_status = face_status  # type: ignore[attr-defined]
        if enroll.duplicate_of is not None:
            # Expõe os metadados do match pro router compor a resposta.
            photo.face_duplicate_of = {  # type: ignore[attr-defined]
                "entityId": str(enroll.duplicate_of.entity_id),
                "name": enroll.duplicate_of.name,
                "similarity": round(enroll.duplicate_of.similarity, 4),
            }

        await self._record_history(
            patient_id=patient.id,
            field_name="current_photo_id",
            old_value=_serialize(old_photo_id),
            new_value=str(photo.id),
            change_type=PatientFieldChangeType.PHOTO_UPLOAD,
            reason=None,
        )

        # Duplicata é evento de segurança/compliance — severity warning.
        audit_extra = f"reconhecimento facial: {face_status}"
        audit_severity = "warning" if face_status == "duplicate" else "info"
        audit_details: dict[str, object] = {
            "patientName": patient.name,
            "size": len(content),
            "mime": mime_type,
            "storageKey": storage_key,
            "faceEnrollment": face_status,
        }
        if enroll.duplicate_of is not None:
            audit_extra += f" — bate com {enroll.duplicate_of.name} ({enroll.duplicate_of.similarity:.0%})"
            audit_details["duplicateOf"] = {
                "patientId": str(enroll.duplicate_of.entity_id),
                "patientName": enroll.duplicate_of.name,
                "similarity": round(enroll.duplicate_of.similarity, 4),
            }

        await write_audit(
            self.db, module="hsp", action="patient_photo_upload", severity=audit_severity,
            resource="patient_photo", resource_id=str(photo.id),
            description=describe_change(
                actor=self.user_name, verb="enviou nova foto para",
                target_name=patient.name,
                extra=audit_extra,
            ),
            details=audit_details,
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
            description=describe_change(
                actor=self.user_name, verb="removeu a foto de",
                target_name=patient.name,
            ),
            details={"patientName": patient.name},
        )

    async def list_photos(self, patient_id: UUID) -> list[PatientPhoto]:
        """Todas as fotos já enviadas — mais recente primeiro."""
        await self.get_patient(patient_id)
        return list((await self.db.scalars(
            select(PatientPhoto)
            .where(PatientPhoto.patient_id == patient_id)
            .order_by(desc(PatientPhoto.uploaded_at), desc(PatientPhoto.id))
        )).all())

    async def restore_photo(self, patient_id: UUID, photo_id: UUID) -> PatientPhoto:
        """Aponta ``current_photo_id`` para uma foto antiga existente.

        Útil quando o usuário enviou uma foto errada e quer reverter pra
        anterior sem precisar reenviar. Gera entrada no histórico.
        """
        patient = await self.get_patient(patient_id)
        photo = await self.db.scalar(
            select(PatientPhoto).where(
                and_(PatientPhoto.id == photo_id, PatientPhoto.patient_id == patient_id)
            )
        )
        if photo is None:
            raise HTTPException(status_code=404, detail="Foto não encontrada.")
        if patient.current_photo_id == photo.id:
            return photo  # já é a atual

        old_id = patient.current_photo_id
        patient.current_photo_id = photo.id
        patient.updated_by = self.ctx.user_id
        await self.db.flush()

        await self._record_history(
            patient_id=patient.id,
            field_name="current_photo_id",
            old_value=_serialize(old_id),
            new_value=str(photo.id),
            change_type=PatientFieldChangeType.PHOTO_UPLOAD,
            reason="restore",
        )

        await write_audit(
            self.db, module="hsp", action="patient_photo_restore", severity="info",
            resource="patient_photo", resource_id=str(photo.id),
            description=describe_change(
                actor=self.user_name, verb="restaurou foto antiga de",
                target_name=patient.name,
            ),
            details={"patientName": patient.name, "photoId": str(photo.id)},
        )
        return photo

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

    # ── Documentos ─────────────────────────────────────────────────
    async def list_documents(self, patient_id: UUID) -> list[PatientDocument]:
        await self.get_patient(patient_id)
        return list((await self.db.scalars(
            select(PatientDocument)
            .where(PatientDocument.patient_id == patient_id)
            .order_by(PatientDocument.tipo_codigo, PatientDocument.created_at)
        )).all())

    async def _add_document(
        self, patient_id: UUID, payload: DocumentInput, *, log: bool = True,
    ) -> PatientDocument:
        doc = PatientDocument(
            patient_id=patient_id,
            tipo_documento_id=payload.tipo_documento_id,
            tipo_codigo=payload.tipo_codigo or "",
            numero=payload.numero or "",
            orgao_emissor=payload.orgao_emissor or "",
            uf_emissor=payload.uf_emissor or "",
            pais_emissor=payload.pais_emissor or "",
            data_emissao=payload.data_emissao,
            data_validade=payload.data_validade,
            observacao=payload.observacao or "",
        )
        self.db.add(doc)
        await self.db.flush()
        if log:
            await self._record_history(
                patient_id=patient_id,
                field_name=f"document:{doc.tipo_codigo or doc.id}",
                old_value=None,
                new_value=doc.numero,
                change_type=PatientFieldChangeType.DOCUMENT_ADD,
                reason=None,
            )
        return doc

    async def _update_document(
        self, current: PatientDocument, payload: DocumentInput, reason: str | None,
    ) -> bool:
        """Aplica updates no documento. Retorna True se algo mudou."""
        fields = (
            "tipo_documento_id", "tipo_codigo", "numero", "orgao_emissor",
            "uf_emissor", "pais_emissor", "data_emissao", "data_validade",
            "observacao",
        )
        changed: list[str] = []
        for f in fields:
            new_val = getattr(payload, f)
            if new_val is None and f in ("tipo_documento_id", "data_emissao", "data_validade"):
                pass  # permitir limpar nullable
            elif new_val is None:
                continue
            if getattr(current, f) != new_val:
                setattr(current, f, new_val)
                changed.append(f)
        if not changed:
            return False
        await self.db.flush()
        await self._record_history(
            patient_id=current.patient_id,
            field_name=f"document:{current.tipo_codigo or current.id}",
            old_value=None,
            new_value=",".join(changed),
            change_type=PatientFieldChangeType.DOCUMENT_UPDATE,
            reason=reason,
        )
        return True

    async def _remove_document(self, doc: PatientDocument, reason: str | None) -> None:
        await self._record_history(
            patient_id=doc.patient_id,
            field_name=f"document:{doc.tipo_codigo or doc.id}",
            old_value=doc.numero,
            new_value=None,
            change_type=PatientFieldChangeType.DOCUMENT_REMOVE,
            reason=reason,
        )
        await self.db.delete(doc)
        await self.db.flush()

    async def _reconcile_documents(
        self, patient_id: UUID, payload: list[DocumentInput], reason: str | None,
    ) -> int:
        """Sincroniza a lista de documentos com o payload.

        - Itens com ``id`` que existem → update
        - Itens sem ``id`` → criar
        - Documentos atuais cujo id não está no payload → remover

        Retorna o total de operações (add + update + remove).
        """
        current = await self.list_documents(patient_id)
        current_by_id = {d.id: d for d in current}
        payload_ids: set[UUID] = {d.id for d in payload if d.id}

        ops = 0
        # Add + update
        for item in payload:
            if item.id and item.id in current_by_id:
                if await self._update_document(current_by_id[item.id], item, reason):
                    ops += 1
            else:
                await self._add_document(patient_id, item, log=True)
                ops += 1

        # Remove os que sumiram
        for doc_id, doc in current_by_id.items():
            if doc_id not in payload_ids:
                await self._remove_document(doc, reason)
                ops += 1

        return ops

    # ── Endereços secundários ──────────────────────────────────────
    async def list_addresses(self, patient_id: UUID) -> list[PatientAddress]:
        await self.get_patient(patient_id)
        return list((await self.db.scalars(
            select(PatientAddress)
            .where(PatientAddress.patient_id == patient_id)
            .order_by(PatientAddress.display_order, PatientAddress.created_at)
        )).all())

    async def create_address(
        self, patient_id: UUID, payload,
    ) -> PatientAddress:
        await self.get_patient(patient_id)
        if not payload.label or not payload.label.strip():
            raise HTTPException(status_code=400, detail="Informe uma descrição (ex.: Trabalho, Casa da mãe).")
        addr = PatientAddress(
            patient_id=patient_id,
            label=payload.label.strip()[:60],
            cep=(payload.cep or "").strip(),
            endereco=(payload.endereco or "").strip(),
            numero=(payload.numero or "").strip(),
            complemento=(payload.complemento or "").strip(),
            bairro=(payload.bairro or "").strip(),
            municipio_ibge=(payload.municipio_ibge or "").strip(),
            uf=(payload.uf or "").strip().upper()[:2],
            pais=(payload.pais or "BRA").strip().upper()[:3],
            observacao=(payload.observacao or "").strip(),
        )
        self.db.add(addr)
        await self.db.flush()
        return addr

    async def update_address(
        self, patient_id: UUID, address_id: UUID, payload,
    ) -> PatientAddress:
        addr = await self.db.scalar(
            select(PatientAddress).where(
                and_(PatientAddress.id == address_id, PatientAddress.patient_id == patient_id)
            )
        )
        if addr is None:
            raise HTTPException(status_code=404, detail="Endereço não encontrado.")
        if payload.label is not None and payload.label.strip():
            addr.label = payload.label.strip()[:60]
        addr.cep = (payload.cep or "").strip()
        addr.endereco = (payload.endereco or "").strip()
        addr.numero = (payload.numero or "").strip()
        addr.complemento = (payload.complemento or "").strip()
        addr.bairro = (payload.bairro or "").strip()
        addr.municipio_ibge = (payload.municipio_ibge or "").strip()
        addr.uf = (payload.uf or "").strip().upper()[:2]
        addr.pais = (payload.pais or "BRA").strip().upper()[:3]
        addr.observacao = (payload.observacao or "").strip()
        await self.db.flush()
        return addr

    async def delete_address(self, patient_id: UUID, address_id: UUID) -> None:
        addr = await self.db.scalar(
            select(PatientAddress).where(
                and_(PatientAddress.id == address_id, PatientAddress.patient_id == patient_id)
            )
        )
        if addr is None:
            raise HTTPException(status_code=404, detail="Endereço não encontrado.")
        await self.db.delete(addr)
        await self.db.flush()

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
