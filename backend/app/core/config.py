"""Configuração central via pydantic-settings.

Tudo vem de variáveis de ambiente / arquivo .env. Falha rápido na subida
se algum valor obrigatório estiver ausente.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Ambiente ────────────────────────────────────────────────────────
    env: Literal["dev", "staging", "prod"] = "dev"
    log_level: str = "INFO"
    debug: bool = False

    # ── API ────────────────────────────────────────────────────────────
    api_v1_prefix: str = "/api/v1"
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)

    # ── Postgres ───────────────────────────────────────────────────────
    database_url: str

    # ── Valkey ─────────────────────────────────────────────────────────
    valkey_url: str = "redis://valkey:6379/0"

    # ── JWT ────────────────────────────────────────────────────────────
    jwt_private_key_path: Path = Path("./secrets/jwt_private.pem")
    jwt_public_key_path: Path = Path("./secrets/jwt_public.pem")
    jwt_algorithm: Literal["RS256", "RS384", "RS512"] = "RS256"
    jwt_access_ttl_minutes: int = 15
    jwt_refresh_ttl_days: int = 30
    jwt_reset_ttl_minutes: int = 15
    work_context_ttl_minutes: int = 480
    email_verification_ttl_hours: int = 24
    # Quando True, tentativa de login via e-mail exige que ``email_verified_at``
    # esteja preenchido. Login por CPF nunca é afetado. Default False pra não
    # quebrar usuários existentes — flip para True depois do backfill.
    enforce_email_verification_login: bool = False

    # ── Segurança ──────────────────────────────────────────────────────
    password_pepper: str = Field(min_length=32)
    # Chave Fernet pra cifrar secrets em repouso (API keys de IA, senhas
    # CadSUS, etc). Gere com:
    #   python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
    secrets_encryption_key: str = Field(default="", min_length=0)

    # ── E-mail ─────────────────────────────────────────────────────────
    # Backend genérico usado pra reset de senha, verificação, parabéns,
    # relatórios, etc. Em testes: "null" (não envia). Em dev: "smtp" (MailHog).
    # Em prod: "ses" (AWS SES via aioboto3).
    email_backend: Literal["smtp", "ses", "null"] = "smtp"
    email_from: str = "nao-responder@zsaude.local"
    email_from_name: str = "zSaúde"
    # URL pública do frontend, usada para montar links (reset, verify, etc.)
    app_public_url: str = "http://localhost:5179"

    # SMTP (dev → MailHog)
    smtp_host: str = "mailhog"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = False
    # Retrocompat: `smtp_from` continua lido, mas `email_from` é o canônico.
    smtp_from: str = "nao-responder@zsaude.local"

    # SES (prod → AWS)
    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    ses_configuration_set: str = ""

    # ── Gateway de IA ──────────────────────────────────────────────────
    ai_default_timeout_seconds: int = 30
    ai_max_retries: int = 2
    ai_circuit_open_after_errors: int = 5
    ai_circuit_cooldown_seconds: int = 60
    ai_usage_log_retention_months: int = 24

    # ── Object Storage (S3/MinIO) ─────────────────────────────────────
    # Em dev: MinIO local (endpoint = http://minio:9000)
    # Em prod: AWS S3 (endpoint vazio, usa default da AWS)
    storage_endpoint: str = "http://minio:9000"
    storage_access_key: str = "minioadmin"
    storage_secret_key: str = "minioadmin"
    storage_bucket: str = "zsaude-files"
    storage_region: str = "us-east-1"

    # ── Integração CadSUS (DATASUS PDQ Supplier) ─────────────────────
    # Sem credenciais, o endpoint de busca devolve 503. Em dev, ativar
    # `cadsus_mock=true` retorna paciente fake pra testar UI sem API real.
    cadsus_mock: bool = False
    cadsus_url: str = "https://servicos.saude.gov.br/cadsus/PDQSupplier"
    cadsus_user: str = ""
    cadsus_password: str = ""
    cadsus_timeout_seconds: int = 15

    # ── Validadores ────────────────────────────────────────────────────
    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator("password_pepper")
    @classmethod
    def _reject_default_pepper(cls, v: str) -> str:
        if "change-me" in v:
            raise ValueError(
                "PASSWORD_PEPPER está com valor padrão. Gere um novo: "
                "python -c 'import secrets; print(secrets.token_urlsafe(32))'"
            )
        return v

    # ── Conveniências ──────────────────────────────────────────────────
    @property
    def is_dev(self) -> bool:
        return self.env == "dev"

    @property
    def is_prod(self) -> bool:
        return self.env == "prod"

    def read_jwt_private_key(self) -> bytes:
        return self.jwt_private_key_path.read_bytes()

    def read_jwt_public_key(self) -> bytes:
        return self.jwt_public_key_path.read_bytes()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]


settings = get_settings()
