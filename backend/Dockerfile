# syntax=docker/dockerfile:1.9

# ─── Estágio: builder (uv) ────────────────────────────────────────────────────
FROM python:3.13-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

# Build tools necessários para wheels que não têm binários pré-compilados
# (ex: ml-dtypes/onnx dependem de gcc + cmake em alguns arm64).
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential cmake && \
    rm -rf /var/lib/apt/lists/*

# uv: fast Python package manager
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /usr/local/bin/uv

WORKDIR /app

# Instala dependências em layer separada (cache amigável)
COPY pyproject.toml uv.lock* ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev || \
    uv sync --no-install-project --no-dev

# Copia código
COPY app ./app
COPY migrations ./migrations
COPY scripts ./scripts
COPY alembic.ini ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev || uv sync --no-dev

# ─── Estágio: runner ──────────────────────────────────────────────────────────
FROM python:3.13-slim AS runner

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app \
    INSIGHTFACE_HOME=/home/app/.insightface

# Libs nativas pro opencv-python-headless (usado pelo InsightFace).
# libgl1 + libglib2.0-0 são exigidos por cv2 mesmo na versão headless.
RUN apt-get update && \
    apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

# Usuário não-root + home pra cache de modelos do InsightFace.
RUN groupadd --system --gid 1001 app && \
    useradd  --system --uid 1001 --gid app --create-home --home-dir /home/app --shell /usr/sbin/nologin app && \
    mkdir -p /home/app/.insightface && \
    chown -R app:app /home/app

WORKDIR /app

# Copia venv e código do builder
COPY --from=builder --chown=app:app /app /app

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=3)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
