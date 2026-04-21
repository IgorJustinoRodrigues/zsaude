#!/usr/bin/env bash
# Roda os testes de paridade PostgreSQL + Oracle.
#
# Sobe um container Oracle Free 23ai via testcontainers (gerenciado pelo pytest),
# provisiona o schema ``app`` em PG e Oracle, compara contagens e valida.
#
# Uso:
#   backend/scripts/test_oracle.sh              # roda todos os testes de paridade
#   backend/scripts/test_oracle.sh -k parity    # só o parity
#   SKIP_BUILD=1 backend/scripts/test_oracle.sh # pula docker compose build
#
# Requisitos:
# - Docker rodando
# - Imagem ``gvenzl/oracle-free:23-slim`` (pre-pull recomendado, ~2GB)
# - Python + uv no PATH

set -euo pipefail

cd "$(dirname "$0")/.."

# Pre-pull da imagem pra warmup não contar no teste.
if ! docker image inspect gvenzl/oracle-free:23-slim >/dev/null 2>&1; then
    echo "➤ Baixando imagem Oracle Free 23ai (~2GB, só na primeira vez)…"
    docker pull gvenzl/oracle-free:23-slim
fi

export ORACLE_TEST=1

# Passa args extras pro pytest (ex: -k, -v, --lf)
exec uv run pytest tests/test_db_parity.py "$@"
