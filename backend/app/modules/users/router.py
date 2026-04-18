"""Endpoints de usuário (próprio perfil + admin)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response

from app.core.deps import DB, CurrentUserDep
from app.core.exceptions import ForbiddenError
from app.core.pagination import Page
from app.modules.users.models import User, UserLevel, UserStatus
from app.modules.users.photo_service import UserPhotoService
from app.modules.users.schemas import (
    AdminResetPasswordRequest,
    AdminResetPasswordResponse,
    MessageResponse,
    UserCreate,
    UserDetail,
    UserListItem,
    UserListParams,
    UserPhotoDuplicateMatch,
    UserPhotoListItem,
    UserPhotoUploadResponse,
    UserRead,
    UserStats,
    UserUpdate,
    UserUpdateMe,
    user_read_from_orm,
)
from app.modules.users.service import UserService

router = APIRouter(prefix="/users", tags=["users"])


# ─── Self endpoints (/users/me) ───────────────────────────────────────────────


@router.get("/me", response_model=UserRead)
async def read_me(db: DB, user: CurrentUserDep) -> UserRead:
    record = await UserService(db).get_or_404(user.id)
    return user_read_from_orm(record)


@router.patch("/me", response_model=UserRead)
async def update_me(payload: UserUpdateMe, db: DB, user: CurrentUserDep) -> UserRead:
    record = await UserService(db).update_me(user.id, payload)
    return user_read_from_orm(record)


# ─── Admin endpoints ──────────────────────────────────────────────────────────


async def require_admin(db: DB, user: CurrentUserDep) -> User:
    """Guard: ADMIN ou MASTER podem gerenciar usuários."""
    svc = UserService(db)
    record = await svc.get_or_404(user.id)
    if record.level not in (UserLevel.ADMIN, UserLevel.MASTER):
        raise HTTPException(status_code=403, detail="Apenas administradores podem gerenciar usuários.")
    return record


AdminDep = Annotated[User, Depends(require_admin)]


def _check_create_level(actor: User, target_level: UserLevel) -> None:
    """MASTER pode criar qualquer nível. ADMIN só pode criar USER."""
    if actor.level == UserLevel.MASTER:
        return
    if actor.level == UserLevel.ADMIN and target_level == UserLevel.USER:
        return
    raise ForbiddenError("Você não tem permissão para criar usuário desse nível.")


@router.get("/stats", response_model=UserStats)
async def stats(db: DB, actor: AdminDep) -> UserStats:
    svc = UserService(db)
    scope = await svc.actor_scope(actor)
    data = await svc.stats(scope=scope)
    return UserStats(**data)


@router.get("", response_model=Page[UserListItem])
async def list_users(
    db: DB,
    actor: AdminDep,
    search: Annotated[str | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    module: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, alias="pageSize")] = 20,
) -> Page[UserListItem]:
    params = UserListParams(
        search=search,
        status=status_filter,  # type: ignore[arg-type]
        module=module,
        page=page,
        page_size=page_size,
    )
    svc = UserService(db)
    scope = await svc.actor_scope(actor)
    return await svc.list(params, scope=scope)


@router.post("", response_model=UserDetail, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, db: DB, actor: AdminDep) -> UserDetail:
    _check_create_level(actor, UserLevel(payload.level))
    svc = UserService(db)
    scope = await svc.actor_scope(actor)
    created = await svc.create(payload, scope=scope)
    return await svc.detail(created.id)


@router.get("/{user_id}", response_model=UserDetail)
async def get_user(user_id: UUID, db: DB, actor: AdminDep) -> UserDetail:
    svc = UserService(db)
    await svc.ensure_target_in_scope(actor, user_id)
    return await svc.detail(user_id)


@router.patch("/{user_id}", response_model=UserDetail)
async def update_user(user_id: UUID, payload: UserUpdate, db: DB, actor: AdminDep) -> UserDetail:
    # Só MASTER pode alterar `level`; ADMIN nunca promove nem rebaixa.
    if payload.level is not None:
        if actor.level != UserLevel.MASTER:
            raise ForbiddenError("Apenas MASTER pode alterar o nível de um usuário.")
    svc = UserService(db)
    await svc.ensure_target_in_scope(actor, user_id)
    scope = await svc.actor_scope(actor)
    await svc.update(user_id, payload, scope=scope)
    return await svc.detail(user_id)


@router.post("/{user_id}/reset-password", response_model=AdminResetPasswordResponse)
async def admin_reset_password(
    user_id: UUID,
    payload: AdminResetPasswordRequest,
    db: DB,
    actor: AdminDep,
) -> AdminResetPasswordResponse:
    svc = UserService(db)
    await svc.ensure_target_in_scope(actor, user_id)
    return await svc.admin_reset_password(user_id, payload)


def _forbid_self_destruct(actor: User, target_user_id: UUID, action: str) -> None:
    """Bloqueia o usuário de desativar/bloquear a própria conta."""
    if actor.id == target_user_id:
        raise ForbiddenError(
            f"Você não pode {action} sua própria conta. Peça a outro administrador.",
        )


@router.post("/{user_id}/activate", response_model=MessageResponse)
async def activate(user_id: UUID, db: DB, actor: AdminDep) -> MessageResponse:
    svc = UserService(db)
    await svc.ensure_target_in_scope(actor, user_id)
    await svc.set_status(user_id, UserStatus.ATIVO)
    return MessageResponse(message="Usuário ativado.")


@router.post("/{user_id}/deactivate", response_model=MessageResponse)
async def deactivate(user_id: UUID, db: DB, actor: AdminDep) -> MessageResponse:
    _forbid_self_destruct(actor, user_id, "inativar")
    svc = UserService(db)
    await svc.ensure_target_in_scope(actor, user_id)
    await svc.set_status(user_id, UserStatus.INATIVO)
    return MessageResponse(message="Usuário inativado.")


@router.post("/{user_id}/block", response_model=MessageResponse)
async def block(user_id: UUID, db: DB, actor: AdminDep) -> MessageResponse:
    _forbid_self_destruct(actor, user_id, "bloquear")
    svc = UserService(db)
    await svc.ensure_target_in_scope(actor, user_id)
    await svc.set_status(user_id, UserStatus.BLOQUEADO)
    return MessageResponse(message="Usuário bloqueado.")


# ─── Foto do usuário ──────────────────────────────────────────────────────────


_PHOTO_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
_PHOTO_ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp"}


async def _actor_can_manage_photo(db: DB, actor: User, user_id: UUID) -> None:
    """Self ou MASTER/ADMIN (no escopo) podem gerenciar a foto."""
    if actor.id == user_id:
        return
    if actor.level not in (UserLevel.ADMIN, UserLevel.MASTER):
        raise ForbiddenError("Você não pode gerenciar a foto de outro usuário.")
    if actor.level == UserLevel.ADMIN:
        await UserService(db).ensure_target_in_scope(actor, user_id)


async def _actor_can_view_photo(db: DB, actor: User, user_id: UUID) -> None:
    """Self, MASTER ou ADMIN no escopo podem ver. Usuários comuns só a própria."""
    if actor.id == user_id:
        return
    if actor.level == UserLevel.MASTER:
        return
    if actor.level == UserLevel.ADMIN:
        await UserService(db).ensure_target_in_scope(actor, user_id)
        return
    raise ForbiddenError("Acesso negado à foto deste usuário.")


@router.post("/{user_id}/photo", response_model=UserPhotoUploadResponse, status_code=201)
async def upload_user_photo(
    user_id: UUID,
    db: DB,
    actor: CurrentUserDep,
    file: Annotated[UploadFile, File(description="Imagem JPEG/PNG/WEBP, até 10 MB")],
) -> UserPhotoUploadResponse:
    actor_record = await UserService(db).get_or_404(actor.id)
    await _actor_can_manage_photo(db, actor_record, user_id)

    content = await file.read()
    mime = (file.content_type or "").lower()

    svc = UserPhotoService(db, actor_user_id=actor.id, actor_name=actor_record.name)
    photo, outcome = await svc.set_photo(
        user_id,
        content=content,
        mime_type=mime,
        original_name=file.filename or "",
    )
    duplicate = None
    if outcome.duplicate_of is not None:
        duplicate = UserPhotoDuplicateMatch(
            user_id=outcome.duplicate_of.user_id,
            user_name=outcome.duplicate_of.name,
            similarity=outcome.duplicate_of.similarity,
        )
    return UserPhotoUploadResponse(
        photo_id=photo.id,
        mime_type=photo.mime_type,
        file_size=photo.file_size,
        uploaded_at=photo.uploaded_at,
        face_enrollment=outcome.status,
        duplicate_of=duplicate,
    )


@router.get("/{user_id}/photo")
async def get_current_user_photo(
    user_id: UUID, db: DB, actor: CurrentUserDep,
) -> Response:
    actor_record = await UserService(db).get_or_404(actor.id)
    await _actor_can_view_photo(db, actor_record, user_id)

    svc = UserPhotoService(db, actor_user_id=actor.id, actor_name=actor_record.name)
    data, mime = await svc.load_current_photo_bytes(user_id)
    return Response(
        content=data,
        media_type=mime,
        headers={"Cache-Control": "private, max-age=60"},
    )


@router.delete("/{user_id}/photo", status_code=204)
async def delete_user_photo(
    user_id: UUID, db: DB, actor: CurrentUserDep,
) -> Response:
    actor_record = await UserService(db).get_or_404(actor.id)
    await _actor_can_manage_photo(db, actor_record, user_id)

    svc = UserPhotoService(db, actor_user_id=actor.id, actor_name=actor_record.name)
    await svc.remove_photo(user_id)
    return Response(status_code=204)


@router.get("/{user_id}/photos", response_model=list[UserPhotoListItem])
async def list_user_photos(
    user_id: UUID, db: DB, actor: CurrentUserDep,
) -> list[UserPhotoListItem]:
    actor_record = await UserService(db).get_or_404(actor.id)
    await _actor_can_view_photo(db, actor_record, user_id)

    svc = UserPhotoService(db, actor_user_id=actor.id, actor_name=actor_record.name)
    rows = await svc.list_photos(user_id)
    return [UserPhotoListItem.model_validate(p, from_attributes=True) for p in rows]


@router.get("/{user_id}/photos/{photo_id}")
async def get_user_photo_by_id(
    user_id: UUID, photo_id: UUID, db: DB, actor: CurrentUserDep,
) -> Response:
    actor_record = await UserService(db).get_or_404(actor.id)
    await _actor_can_view_photo(db, actor_record, user_id)

    svc = UserPhotoService(db, actor_user_id=actor.id, actor_name=actor_record.name)
    data, mime = await svc.load_photo_bytes(user_id, photo_id)
    return Response(
        content=data,
        media_type=mime,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.post("/{user_id}/photos/{photo_id}/restore", response_model=UserPhotoUploadResponse)
async def restore_user_photo(
    user_id: UUID, photo_id: UUID, db: DB, actor: CurrentUserDep,
) -> UserPhotoUploadResponse:
    actor_record = await UserService(db).get_or_404(actor.id)
    await _actor_can_manage_photo(db, actor_record, user_id)

    svc = UserPhotoService(db, actor_user_id=actor.id, actor_name=actor_record.name)
    photo = await svc.restore_photo(user_id, photo_id)
    return UserPhotoUploadResponse(
        photo_id=photo.id,
        mime_type=photo.mime_type,
        file_size=photo.file_size,
        uploaded_at=photo.uploaded_at,
        face_enrollment="ok",
    )


@router.delete("/{user_id}/face-embedding", status_code=204)
async def delete_user_face_embedding(
    user_id: UUID, db: DB, actor: CurrentUserDep,
) -> Response:
    actor_record = await UserService(db).get_or_404(actor.id)
    await _actor_can_manage_photo(db, actor_record, user_id)

    svc = UserPhotoService(db, actor_user_id=actor.id, actor_name=actor_record.name)
    await svc.delete_face_embedding(user_id)
    return Response(status_code=204)
