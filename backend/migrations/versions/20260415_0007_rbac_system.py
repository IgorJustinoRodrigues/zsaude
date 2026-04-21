"""RBAC: redesign de roles/permissions + overrides por acesso

Revision ID: 0007_rbac_system
Revises: 0006_user_sessions
Create Date: 2026-04-15

Mudanças:
- Dropa os stubs antigos de `permissions`, `role_permissions`, `roles` (nunca
  foram usados em produção; não há dados a migrar).
- Recria com o modelo novo:
    * ``permissions(code PK, module, resource, action, description)`` —
      catálogo sincronizado do registry em ``app.core.permissions``.
    * ``roles`` com ``scope``, ``municipality_id``, ``parent_id``,
      ``is_system_base``, ``archived``, ``version``.
    * ``role_permissions(role_id, permission_code, granted)`` — chave
      composta; ``granted=true`` concede, ``granted=false`` nega
      explicitamente; ausência = herda do pai.
    * ``facility_access_permission_overrides(facility_access_id,
      permission_code, granted)`` — override por acesso.
- Adiciona ``role_id`` (FK nullable) e ``version`` em ``facility_accesses``.
- Mantém ``role`` (str) e ``modules`` (array) em ``facility_accesses`` por
  compat até a Fase F.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db.types import UUIDType
revision: str = "0007_rbac_system"
down_revision: str | None = "0006_user_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── Drop stubs antigos (sem dados a preservar) ────────────────────────
    op.drop_table("role_permissions", schema="app")
    op.drop_table("roles", schema="app")
    op.drop_table("permissions", schema="app")

    # ── permissions (catálogo, code PK) ───────────────────────────────────
    op.create_table(
        "permissions",
        sa.Column("code", sa.String(100), primary_key=True),
        sa.Column("module", sa.String(20), nullable=False),
        sa.Column("resource", sa.String(60), nullable=False),
        sa.Column("action", sa.String(60), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        schema="app",
    )
    op.create_index("ix_permissions_module", "permissions", ["module"], schema="app")

    # ── roles ─────────────────────────────────────────────────────────────
    op.create_table(
        "roles",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("code", sa.String(60), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column(
            "scope",
            sa.String(20),
            nullable=False,
        ),
        sa.Column(
            "municipality_id",
            UUIDType(),
            sa.ForeignKey("app.municipalities.id", ondelete="CASCADE", name="fk_roles_municipality_id_municipalities"),
            nullable=True,
        ),
        sa.Column(
            "parent_id",
            UUIDType(),
            sa.ForeignKey("app.roles.id", ondelete="RESTRICT", name="fk_roles_parent_id_roles"),
            nullable=True,
        ),
        sa.Column("is_system_base", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint(
            "scope IN ('SYSTEM', 'MUNICIPALITY')",
            name="ck_roles_scope",
        ),
        sa.CheckConstraint(
            "(scope = 'SYSTEM' AND municipality_id IS NULL) OR "
            "(scope = 'MUNICIPALITY' AND municipality_id IS NOT NULL)",
            name="ck_roles_scope_municipality",
        ),
        schema="app",
    )
    op.create_index("ix_roles_scope", "roles", ["scope"], schema="app")
    op.create_index("ix_roles_municipality_id", "roles", ["municipality_id"], schema="app")
    op.create_index("ix_roles_parent_id", "roles", ["parent_id"], schema="app")
    op.create_index("ix_roles_archived", "roles", ["archived"], schema="app")

    # Partial unique indexes para enforcar code único por escopo
    op.execute(
        'CREATE UNIQUE INDEX uq_role_code_system ON app.roles (code) '
        'WHERE municipality_id IS NULL'
    )
    op.execute(
        'CREATE UNIQUE INDEX uq_role_code_municipal ON app.roles (code, municipality_id) '
        'WHERE municipality_id IS NOT NULL'
    )

    # ── role_permissions ──────────────────────────────────────────────────
    op.create_table(
        "role_permissions",
        sa.Column(
            "role_id",
            UUIDType(),
            sa.ForeignKey("app.roles.id", ondelete="CASCADE", name="fk_role_permissions_role_id_roles"),
            primary_key=True,
        ),
        sa.Column(
            "permission_code",
            sa.String(100),
            sa.ForeignKey("app.permissions.code", ondelete="CASCADE", name="fk_role_permissions_permission_code_permissions"),
            primary_key=True,
        ),
        sa.Column("granted", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        schema="app",
    )

    # ── facility_access_permission_overrides ──────────────────────────────
    op.create_table(
        "facility_access_permission_overrides",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column(
            "facility_access_id",
            UUIDType(),
            sa.ForeignKey(
                "app.facility_accesses.id",
                ondelete="CASCADE",
                name="fk_fac_access_override_access",
            ),
            nullable=False,
        ),
        sa.Column(
            "permission_code",
            sa.String(100),
            sa.ForeignKey(
                "app.permissions.code",
                ondelete="CASCADE",
                name="fk_fac_access_override_perm",
            ),
            nullable=False,
        ),
        sa.Column("granted", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint(
            "facility_access_id",
            "permission_code",
            name="uq_fac_access_override",
        ),
        schema="app",
    )
    op.create_index(
        "ix_fac_access_override_access_id",
        "facility_access_permission_overrides",
        ["facility_access_id"],
        schema="app",
    )

    # ── facility_accesses: +role_id, +version (mantém role/modules) ───────
    op.add_column(
        "facility_accesses",
        sa.Column("role_id", UUIDType(), nullable=True),
        schema="app",
    )
    op.add_column(
        "facility_accesses",
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        schema="app",
    )
    op.create_foreign_key(
        "fk_facility_accesses_role_id_roles",
        "facility_accesses",
        "roles",
        ["role_id"],
        ["id"],
        ondelete="RESTRICT",
        source_schema="app",
        referent_schema="app",
    )
    op.create_index(
        "ix_facility_accesses_role_id",
        "facility_accesses",
        ["role_id"],
        schema="app",
    )


def downgrade() -> None:
    # facility_accesses: remove novas colunas
    op.drop_index("ix_facility_accesses_role_id", table_name="facility_accesses", schema="app")
    op.drop_constraint(
        "fk_facility_accesses_role_id_roles",
        "facility_accesses",
        schema="app",
        type_="foreignkey",
    )
    op.drop_column("facility_accesses", "version", schema="app")
    op.drop_column("facility_accesses", "role_id", schema="app")

    # Dropa as novas tabelas
    op.drop_index(
        "ix_fac_access_override_access_id",
        table_name="facility_access_permission_overrides",
        schema="app",
    )
    op.drop_table("facility_access_permission_overrides", schema="app")
    op.drop_table("role_permissions", schema="app")

    op.execute("DROP INDEX IF EXISTS app.uq_role_code_municipal")
    op.execute("DROP INDEX IF EXISTS app.uq_role_code_system")
    op.drop_index("ix_roles_archived", table_name="roles", schema="app")
    op.drop_index("ix_roles_parent_id", table_name="roles", schema="app")
    op.drop_index("ix_roles_municipality_id", table_name="roles", schema="app")
    op.drop_index("ix_roles_scope", table_name="roles", schema="app")
    op.drop_table("roles", schema="app")

    op.drop_index("ix_permissions_module", table_name="permissions", schema="app")
    op.drop_table("permissions", schema="app")

    # Recria os stubs antigos (esqueleto mínimo pra downgrade voltar)
    op.create_table(
        "permissions",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("module", sa.String(10), nullable=False),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("module", "action", name="uq_permission_module_action"),
        schema="app",
    )
    op.create_table(
        "roles",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column("code", sa.String(60), unique=True, nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        schema="app",
    )
    op.create_table(
        "role_permissions",
        sa.Column("id", UUIDType(), primary_key=True),
        sa.Column(
            "role_id",
            UUIDType(),
            sa.ForeignKey("app.roles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "permission_id",
            UUIDType(),
            sa.ForeignKey("app.permissions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("role_id", "permission_id", name="uq_role_perm"),
        schema="app",
    )
