"""Política de senhas — expiração e histórico de reuso.

Configurações (em ``system_settings``):

- ``password_expiry_days`` — dias até expirar. ``0`` = nunca expira.
- ``password_history_count`` — quantas senhas antigas bloqueiam reuso.
  ``0`` desativa o histórico.
- ``password_expiry_warn_days`` — dias antes da expiração pra UI avisar.

Pontos de uso:

- Troca própria (``POST /auth/change-password``): exige senha atual,
  aplica política.
- Reset via token (``POST /auth/reset-password``): não exige senha
  atual, mas bloqueia reuso das últimas N.
- Reset de admin (``POST /users/{id}/reset-password``): mesma política.
- Login com senha que precisa de rehash: NÃO conta como troca —
  a senha em texto plano é a mesma, só o algoritmo mudou.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.modules.system.service import get_int_sync
from app.modules.users.models import PasswordHistory, User


class PasswordReuseError(ValueError):
    """Nova senha bate com a atual ou com uma das N mais recentes do histórico."""


def _ensure_aware(dt: datetime) -> datetime:
    """Normaliza datetime naive pra UTC — Oracle volta naive em DateTime(timezone=True)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


async def _history_matches(
    session: AsyncSession, user: User, candidate_plain: str, keep_n: int,
) -> bool:
    """Retorna True se ``candidate_plain`` bate com uma das últimas ``keep_n`` senhas."""
    if keep_n <= 0:
        return False
    stmt = (
        select(PasswordHistory.password_hash)
        .where(PasswordHistory.user_id == user.id)
        .order_by(desc(PasswordHistory.created_at))
        .limit(keep_n)
    )
    for h in (await session.scalars(stmt)).all():
        if verify_password(candidate_plain, h):
            return True
    return False


async def _trim_history(session: AsyncSession, user_id, keep_n: int) -> None:
    """Deleta entradas além das ``keep_n`` mais recentes."""
    if keep_n <= 0:
        # Histórico desligado — apaga tudo.
        await session.execute(
            delete(PasswordHistory).where(PasswordHistory.user_id == user_id)
        )
        return
    # Seleciona os IDs que FICAM; apaga o resto.
    keep_stmt = (
        select(PasswordHistory.id)
        .where(PasswordHistory.user_id == user_id)
        .order_by(desc(PasswordHistory.created_at))
        .limit(keep_n)
    )
    keep_ids = [r for r in (await session.scalars(keep_stmt)).all()]
    if not keep_ids:
        return
    await session.execute(
        delete(PasswordHistory)
        .where(PasswordHistory.user_id == user_id)
        .where(PasswordHistory.id.notin_(keep_ids))
    )


async def apply_new_password(
    session: AsyncSession,
    user: User,
    new_plain: str,
    *,
    require_change: bool = False,
) -> None:
    """Aplica nova senha com a política completa.

    - Bloqueia se ``new_plain`` bate com a atual ou com alguma das N mais
      recentes do histórico (levanta ``PasswordReuseError``).
    - Move a senha atual pro histórico.
    - Atualiza ``user.password_hash``, ``password_changed_at``, e
      incrementa ``token_version`` (invalida todos os access tokens).
    - Faz trim do histórico pra manter só as N mais recentes.
    - ``require_change``: quando ``True`` marca a senha como provisória
      (``user.must_change_password = True``) — usuário é obrigado a
      trocar no próximo login. Usado em ``admin_reset_password``.
      Quando ``False`` (default, usuário trocou por conta própria),
      limpa a flag.
    """
    history_count = get_int_sync("password_history_count", 5)

    # 1. Compara com a senha atual
    if user.password_hash and verify_password(new_plain, user.password_hash):
        raise PasswordReuseError(
            "Nova senha não pode ser igual à senha atual.",
        )

    # 2. Compara com histórico
    if await _history_matches(session, user, new_plain, history_count):
        raise PasswordReuseError(
            f"Nova senha não pode ser igual a nenhuma das {history_count} anteriores.",
        )

    # 3. Preserva a senha atual no histórico (antes de sobrescrever)
    if user.password_hash:
        session.add(PasswordHistory(
            user_id=user.id,
            password_hash=user.password_hash,
        ))

    # 4. Aplica a nova
    user.password_hash = hash_password(new_plain)
    user.password_changed_at = datetime.now(UTC)
    user.must_change_password = require_change
    user.token_version += 1
    await session.flush()

    # 5. Trim do histórico
    await _trim_history(session, user.id, history_count)


def password_expires_at(user: User) -> datetime | None:
    """Quando a senha do usuário expira. ``None`` se política está desligada."""
    days = get_int_sync("password_expiry_days", 90)
    if days <= 0:
        return None
    return _ensure_aware(user.password_changed_at) + timedelta(days=days)


def is_password_expired(user: User) -> bool:
    exp = password_expires_at(user)
    return exp is not None and datetime.now(UTC) >= exp


def password_expires_in_days(user: User) -> int | None:
    """Dias restantes até expirar. Negativo = expirada. None = desligada."""
    exp = password_expires_at(user)
    if exp is None:
        return None
    delta = exp - datetime.now(UTC)
    # Arredonda pra baixo — 0.2 dias restantes ainda conta como "hoje expira".
    return int(delta.total_seconds() // 86400)
