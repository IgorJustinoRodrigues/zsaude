"""Service de foto + reconhecimento facial do usuário.

Padrão idêntico ao de paciente (``app/modules/hsp/service.py``), mas
operando no schema global ``app`` — separado de paciente para evitar
match cruzado e permitir futura busca global (totem, ponto).

Fluxo de upload:

1. Validar MIME/size.
2. Upload S3 (``app/users/{user_id}/photo/{photo_id}.{ext}``).
3. Insert ``AppFile`` com ``category='user_photo'``.
4. Insert ``UserPhoto`` apontando para o ``AppFile``.
5. Atualiza ``user.current_photo_id``.
6. Se ``user.face_opt_in``: enroll facial via ``app.services.face``.
7. ``write_audit`` com descrição humana.
8. Em qualquer falha entre 3 e 7: ``storage.delete`` pra não deixar
   objeto órfão no bucket.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import desc, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import get_audit_context
from app.db.dialect import get_adapter
from app.db.file_model import AppFile
from app.db.types import new_uuid7
from app.modules.audit.helpers import describe_change
from app.modules.audit.writer import write_audit
from app.modules.users.models import User
from app.modules.users.photo_models import UserFaceEmbedding, UserPhoto
from app.services.face import detect_and_embed
from app.services.storage import get_storage

log = logging.getLogger(__name__)

# Mesmos limites do paciente (consistência).
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp"}
_EXT_BY_MIME = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

# Threshold de duplicata — acima disso consideramos a mesma pessoa.
# ArcFace (buffalo_l) tipicamente retorna 0.6-0.9 para a mesma pessoa sob
# condições diferentes e <0.4 para pessoas diferentes. 0.70 é um bom
# balanço: bloqueia duplicatas óbvias sem gerar muitos falsos positivos.
_DUPLICATE_THRESHOLD = 0.70

FaceStatus = Literal[
    "ok", "no_face", "low_quality", "error", "disabled", "opted_out", "duplicate",
]


@dataclass
class DuplicateUserMatch:
    user_id: UUID
    name: str
    similarity: float  # 0..1


@dataclass
class EnrollOutcome:
    status: FaceStatus
    duplicate_of: DuplicateUserMatch | None = None


class UserPhotoService:
    def __init__(self, db: AsyncSession, actor_user_id: UUID | None = None, actor_name: str = "") -> None:
        self.db = db
        self.actor_user_id = actor_user_id
        self.actor_name = actor_name or (get_audit_context().user_name or "")

    # ── helpers ─────────────────────────────────────────────────────

    async def _get_user(self, user_id: UUID) -> User:
        user = await self.db.scalar(select(User).where(User.id == user_id))
        if user is None:
            raise HTTPException(status_code=404, detail="Usuário não encontrado.")
        return user

    async def _get_current_photo(self, user: User) -> UserPhoto | None:
        if user.current_photo_id is None:
            return None
        return await self.db.scalar(
            select(UserPhoto).where(UserPhoto.id == user.current_photo_id)
        )

    @staticmethod
    def _validate_upload(content: bytes, mime: str) -> None:
        if not content:
            raise HTTPException(status_code=400, detail="Arquivo vazio.")
        if len(content) > _MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Arquivo muito grande (máx. 10 MB).")
        if mime not in _ALLOWED_MIMES:
            raise HTTPException(status_code=415, detail="Formato não suportado (use JPEG, PNG ou WEBP).")

    # ── upload ──────────────────────────────────────────────────────

    async def set_photo(
        self,
        user_id: UUID,
        *,
        content: bytes,
        mime_type: str,
        original_name: str = "",
        width: int | None = None,
        height: int | None = None,
    ) -> tuple[UserPhoto, EnrollOutcome]:
        self._validate_upload(content, mime_type)
        user = await self._get_user(user_id)

        checksum = hashlib.sha256(content).hexdigest()
        photo_uuid = new_uuid7()
        ext = _EXT_BY_MIME[mime_type]
        storage_key = f"app/users/{user_id}/photo/{photo_uuid}.{ext}"

        storage = get_storage()
        await storage.upload(storage_key, content, mime_type)

        # Dessa linha pra baixo: qualquer erro invoca storage.delete para
        # não deixar objeto órfão no bucket.
        try:
            file_row = AppFile(
                storage_key=storage_key,
                original_name=original_name or f"photo.{ext}",
                mime_type=mime_type,
                size_bytes=len(content),
                checksum_sha256=checksum,
                category="user_photo",
                entity_id=user.id,
                uploaded_by=self.actor_user_id,
                uploaded_by_name=self.actor_name,
            )
            self.db.add(file_row)
            await self.db.flush()

            photo = UserPhoto(
                id=photo_uuid,
                user_id=user.id,
                file_id=file_row.id,
                storage_key=storage_key,
                mime_type=mime_type,
                file_size=len(content),
                width=width,
                height=height,
                checksum_sha256=checksum,
                uploaded_by=self.actor_user_id,
                uploaded_by_name=self.actor_name,
            )
            self.db.add(photo)
            await self.db.flush()

            user.current_photo_id = photo.id
            await self.db.flush()
        except Exception:
            await storage.delete(storage_key)
            raise

        outcome = await self._enroll(user, photo, content)

        # Severidade + descrição extra quando duplicata detectada —
        # isso é evento de compliance/segurança, merece destaque.
        audit_extra = f"reconhecimento facial: {outcome.status}"
        audit_severity = "warning" if outcome.status == "duplicate" else "info"
        audit_details: dict[str, object] = {
            "targetUserName": user.name,
            "targetUserId": str(user.id),
            "size": len(content),
            "mime": mime_type,
            "storageKey": storage_key,
            "faceEnrollment": outcome.status,
        }
        if outcome.duplicate_of is not None:
            audit_extra += f" — bate com {outcome.duplicate_of.name} ({outcome.duplicate_of.similarity:.0%})"
            audit_details["duplicateOf"] = {
                "userId": str(outcome.duplicate_of.user_id),
                "userName": outcome.duplicate_of.name,
                "similarity": round(outcome.duplicate_of.similarity, 4),
            }

        await write_audit(
            self.db,
            module="users",
            action="user_photo_upload",
            severity=audit_severity,
            resource="user_photo",
            resource_id=str(photo.id),
            description=describe_change(
                actor=self.actor_name,
                verb="enviou foto para",
                target_kind="usuário",
                target_name=user.name,
                extra=audit_extra,
            ),
            details=audit_details,
        )
        return photo, outcome

    async def _enroll(self, user: User, photo: UserPhoto, content: bytes) -> EnrollOutcome:
        """Enroll facial sem levantar exceção. Falha nunca bloqueia upload."""
        if not user.face_opt_in:
            return EnrollOutcome("opted_out")
        if self.db.bind.dialect.name not in ("postgresql", "oracle"):
            return EnrollOutcome("disabled")

        try:
            result = await detect_and_embed(content)
        except Exception as e:  # noqa: BLE001
            log.warning(
                "user_face_enroll_error",
                extra={"user_id": str(user.id), "error": str(e)},
            )
            return EnrollOutcome("error")

        if result is None:
            return EnrollOutcome("no_face")
        if result.detection_score < 0.50:
            return EnrollOutcome("low_quality")

        # ── Detecção de duplicata ──────────────────────────────────────
        duplicate = await self._find_duplicate(user.id, result.embedding)
        if duplicate is not None:
            log.info(
                "user_face_enroll_duplicate",
                extra={
                    "user_id": str(user.id),
                    "match_id": str(duplicate.user_id),
                    "match_name": duplicate.name,
                    "similarity": duplicate.similarity,
                },
            )
            return EnrollOutcome("duplicate", duplicate_of=duplicate)

        adapter = get_adapter(self.db.bind.dialect.name)
        await adapter.execute_upsert(
            self.db,
            UserFaceEmbedding,
            {
                "user_id": user.id,
                "photo_id": photo.id,
                "embedding": result.embedding,
                "detection_score": result.detection_score,
                "bbox": result.bbox,
                "algorithm": "insightface/buffalo_l",
                "algorithm_version": "v1",
            },
            index_elements=["user_id"],
            update_columns=[
                "photo_id", "embedding", "detection_score", "bbox",
                "algorithm", "algorithm_version",
            ],
            extra_set={"updated_at": datetime.now(UTC)},
        )
        return EnrollOutcome("ok")

    async def _find_duplicate(
        self, exclude_user_id: UUID, embedding: list[float],
    ) -> DuplicateUserMatch | None:
        """Retorna o usuário mais similar (acima do threshold de duplicata)."""
        adapter = get_adapter(self.db.bind.dialect.name)
        dist = adapter.vector_cosine_distance_sql("fe.embedding", "q")
        dialect = self.db.bind.dialect.name
        max_distance = 1 - _DUPLICATE_THRESHOLD
        limit_clause = "LIMIT 1" if dialect == "postgresql" else "FETCH FIRST 1 ROWS ONLY"

        sql = f"""
            SELECT u.id, u.name, 1 - ({dist}) AS similarity
              FROM user_face_embeddings fe
              JOIN users u ON u.id = fe.user_id
             WHERE fe.user_id <> :exclude
               AND ({dist}) <= :max_dist
             ORDER BY ({dist}) ASC
            {limit_clause}
        """

        if dialect == "postgresql":
            q_param = str(embedding)
            exclude_param: object = exclude_user_id
        else:
            import array as _array
            q_param = _array.array("f", embedding)
            # Oracle ``oracledb`` não sabe serializar UUID direto; nossa
            # coluna é RAW(16), então passamos os bytes.
            exclude_param = exclude_user_id.bytes

        row = (await self.db.execute(
            text(sql),
            {"q": q_param, "max_dist": max_distance, "exclude": exclude_param},
        )).mappings().first()

        if row is None:
            return None
        return DuplicateUserMatch(
            user_id=row["id"],
            name=row["name"] or "",
            similarity=float(row["similarity"]),
        )

    # ── leitura / listagem ─────────────────────────────────────────

    async def load_current_photo_bytes(self, user_id: UUID) -> tuple[bytes, str]:
        """Retorna (bytes, mime_type) da foto ativa. 404 se não houver."""
        user = await self._get_user(user_id)
        photo = await self._get_current_photo(user)
        if photo is None:
            raise HTTPException(status_code=404, detail="Usuário sem foto.")
        data = await get_storage().download(photo.storage_key)
        return data, photo.mime_type

    async def load_photo_bytes(self, user_id: UUID, photo_id: UUID) -> tuple[bytes, str]:
        photo = await self.db.scalar(
            select(UserPhoto).where(
                UserPhoto.id == photo_id, UserPhoto.user_id == user_id
            )
        )
        if photo is None:
            raise HTTPException(status_code=404, detail="Foto não encontrada.")
        data = await get_storage().download(photo.storage_key)
        return data, photo.mime_type

    async def list_photos(self, user_id: UUID) -> list[UserPhoto]:
        await self._get_user(user_id)
        return list(
            (
                await self.db.scalars(
                    select(UserPhoto)
                    .where(UserPhoto.user_id == user_id)
                    .order_by(desc(UserPhoto.uploaded_at), desc(UserPhoto.id))
                )
            ).all()
        )

    # ── remover / restaurar ────────────────────────────────────────

    async def remove_photo(self, user_id: UUID) -> None:
        """Desvincula a foto ativa do usuário (soft-delete).

        Mantém o registro ``UserPhoto`` e o objeto S3 para permitir
        restore. Também remove o embedding facial — match dependeria
        de uma foto vinculada para ter sentido.
        """
        user = await self._get_user(user_id)
        if user.current_photo_id is None:
            return
        old_id = user.current_photo_id
        user.current_photo_id = None
        await self.db.flush()

        # Remove embedding (idempotente).
        emb = await self.db.scalar(
            select(UserFaceEmbedding).where(UserFaceEmbedding.user_id == user_id)
        )
        if emb is not None:
            await self.db.delete(emb)

        await write_audit(
            self.db,
            module="users",
            action="user_photo_remove",
            severity="warning",
            resource="user_photo",
            resource_id=str(old_id),
            description=describe_change(
                actor=self.actor_name,
                verb="removeu a foto do",
                target_kind="usuário",
                target_name=user.name,
            ),
            details={"targetUserName": user.name, "targetUserId": str(user.id)},
        )

    async def restore_photo(self, user_id: UUID, photo_id: UUID) -> UserPhoto:
        user = await self._get_user(user_id)
        photo = await self.db.scalar(
            select(UserPhoto).where(
                UserPhoto.id == photo_id, UserPhoto.user_id == user_id
            )
        )
        if photo is None:
            raise HTTPException(status_code=404, detail="Foto não encontrada.")
        if user.current_photo_id == photo.id:
            return photo

        user.current_photo_id = photo.id
        await self.db.flush()

        # Reenroll a partir dos bytes da foto restaurada (se opt-in).
        if user.face_opt_in:
            try:
                content = await get_storage().download(photo.storage_key)
                await self._enroll(user, photo, content)
            except Exception as e:  # noqa: BLE001
                log.warning("user_face_restore_enroll_failed", extra={"error": str(e)})

        await write_audit(
            self.db,
            module="users",
            action="user_photo_restore",
            severity="info",
            resource="user_photo",
            resource_id=str(photo.id),
            description=describe_change(
                actor=self.actor_name,
                verb="restaurou foto do",
                target_kind="usuário",
                target_name=user.name,
            ),
            details={"targetUserName": user.name, "targetUserId": str(user.id)},
        )
        return photo

    # ── opt-out biométrico ─────────────────────────────────────────

    async def delete_face_embedding(self, user_id: UUID) -> None:
        user = await self._get_user(user_id)
        user.face_opt_in = False
        emb = await self.db.scalar(
            select(UserFaceEmbedding).where(UserFaceEmbedding.user_id == user_id)
        )
        if emb is not None:
            await self.db.delete(emb)
        await self.db.flush()

        await write_audit(
            self.db,
            module="users",
            action="user_face_embedding_delete",
            severity="warning",
            resource="user_face_embedding",
            resource_id=str(user.id),
            description=describe_change(
                actor=self.actor_name,
                verb="removeu reconhecimento facial do",
                target_kind="usuário",
                target_name=user.name,
            ),
            details={"targetUserName": user.name, "targetUserId": str(user.id)},
        )
