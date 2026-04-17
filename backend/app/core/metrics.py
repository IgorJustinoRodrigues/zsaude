"""Métricas Prometheus do zSaúde.

Centralizadas aqui para evitar imports circulares e facilitar reuso.
"""

from prometheus_client import Counter, Gauge, Histogram, Info

# ── App info ─────────────────────────────────────────────────────────────────

APP_INFO = Info("zsaude", "zSaúde application info")

# ── HTTP ─────────────────────────────────────────────────────────────────────

HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status", "municipality"],
)

HTTP_REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "path", "municipality"],
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
)

HTTP_REQUESTS_IN_PROGRESS = Gauge(
    "http_requests_in_progress",
    "Number of HTTP requests currently being processed",
    ["method"],
)

# ── Auth ─────────────────────────────────────────────────────────────────────

AUTH_LOGIN_TOTAL = Counter(
    "auth_login_total",
    "Login attempts",
    ["status"],  # success, invalid_credentials, blocked, inactive
)

# ── Database ─────────────────────────────────────────────────────────────────

DB_POOL_SIZE = Gauge("db_pool_size", "Database connection pool size")
DB_POOL_CHECKED_IN = Gauge("db_pool_checked_in", "DB connections available (idle)")
DB_POOL_CHECKED_OUT = Gauge("db_pool_checked_out", "DB connections in use (active)")
DB_POOL_OVERFLOW = Gauge("db_pool_overflow", "DB connections in overflow")

# ── AI Gateway ───────────────────────────────────────────────────────────────

AI_REQUESTS_TOTAL = Counter(
    "ai_requests_total",
    "AI API calls",
    ["provider", "capability", "status"],  # status: success, error
)

AI_REQUEST_DURATION = Histogram(
    "ai_request_duration_seconds",
    "AI API call latency",
    ["provider"],
    buckets=[0.1, 0.5, 1, 2.5, 5, 10, 30, 60],
)

# ── Business ─────────────────────────────────────────────────────────────────

ACTIVE_MUNICIPALITIES = Gauge("active_municipalities_total", "Number of active municipalities")
ACTIVE_USERS = Gauge("active_users_total", "Number of active users")
PATIENTS_TOTAL = Gauge("patients_total", "Total patients across all municipalities")

# Mapping IBGE → nome do município (para label join no Grafana)
MUNICIPALITY_INFO = Gauge(
    "municipality_info",
    "Municipality metadata (value always 1, labels carry info)",
    ["ibge", "name", "state"],
)
