"""Gera DDL (CREATE TABLE) para o dialect especificado.

Uso:
    python scripts/generate_ddl.py postgresql > ddl_pg.sql
    python scripts/generate_ddl.py oracle > ddl_oracle.sql

Gera DDL para os schemas app (Base) e tenant (TenantBase) a partir dos
models SQLAlchemy, compilando para o dialect escolhido.
"""

from __future__ import annotations

import sys

from sqlalchemy import create_engine
from sqlalchemy.schema import CreateIndex, CreateTable


def generate_ddl(dialect: str) -> str:
    """Gera DDL string para o dialect informado."""
    # Importa models para popular metadata
    from app.db.base import Base
    from app.db.models_registry import _registry  # noqa: F401 - side effect
    from app.tenant_models import TenantBase
    from app.tenant_models._registry import *  # noqa: F401, F403 - side effect

    if dialect == "postgresql":
        url = "postgresql://fake:fake@localhost/fake"
    elif dialect == "oracle":
        url = "oracle://fake:fake@localhost/fake"
    elif dialect == "sqlite":
        url = "sqlite://"
    else:
        raise ValueError(f"Dialect não suportado: {dialect}")

    eng = create_engine(url, strategy="mock", executor=lambda *a, **kw: None)

    lines: list[str] = []

    lines.append(f"-- DDL para dialect: {dialect}")
    lines.append(f"-- Gerado automaticamente a partir dos models SQLAlchemy")
    lines.append("")

    lines.append("-- ═══ Schema APP ═══")
    lines.append("")
    for table in Base.metadata.sorted_tables:
        ddl = CreateTable(table).compile(dialect=eng.dialect)
        lines.append(str(ddl).strip() + ";")
        lines.append("")
        for index in table.indexes:
            idx_ddl = CreateIndex(index).compile(dialect=eng.dialect)
            lines.append(str(idx_ddl).strip() + ";")
        lines.append("")

    lines.append("-- ═══ Schema TENANT (per-municipality) ═══")
    lines.append("")
    for table in TenantBase.metadata.sorted_tables:
        try:
            ddl = CreateTable(table).compile(dialect=eng.dialect)
            lines.append(str(ddl).strip() + ";")
            lines.append("")
            for index in table.indexes:
                idx_ddl = CreateIndex(index).compile(dialect=eng.dialect)
                lines.append(str(idx_ddl).strip() + ";")
            lines.append("")
        except Exception as e:
            lines.append(f"-- SKIP {table.name}: {e}")
            lines.append("")

    return "\n".join(lines)


def main() -> None:
    if len(sys.argv) < 2:
        print("Uso: python scripts/generate_ddl.py <dialect>")
        print("  dialect: postgresql, oracle, sqlite")
        sys.exit(1)

    dialect = sys.argv[1].lower()
    print(generate_ddl(dialect))


if __name__ == "__main__":
    main()
