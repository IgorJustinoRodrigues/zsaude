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

    # ── Segurança ──────────────────────────────────────────────────────
    password_pepper: str = Field(min_length=32)

    # ── SMTP ───────────────────────────────────────────────────────────
    smtp_host: str = "mailhog"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "nao-responder@zsaude.local"

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
