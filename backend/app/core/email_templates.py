"""Renderizador de templates de e-mail.

Templates ficam em ``app/templates/email/<nome>.{html,txt}``. Renderizados
com Jinja2 em modo sandboxed (segurança para o PR 3, quando MASTER/ADMIN
poderão escrever corpo de template pela UI).

API mínima:
    html, text = render("password_reset", {"user_name": "Igor", "link": "..."})
"""

from __future__ import annotations

from pathlib import Path

from jinja2 import FileSystemLoader, StrictUndefined, TemplateNotFound, select_autoescape
from jinja2.sandbox import SandboxedEnvironment

_TEMPLATES_DIR = Path(__file__).resolve().parents[1] / "templates" / "email"


def _make_env() -> SandboxedEnvironment:
    env = SandboxedEnvironment(
        loader=FileSystemLoader(str(_TEMPLATES_DIR)),
        autoescape=select_autoescape(enabled_extensions=("html",), default=False),
        undefined=StrictUndefined,  # falha se variável faltar — catch bugs cedo
        trim_blocks=True,
        lstrip_blocks=True,
    )
    return env


_env = _make_env()


def render(template_name: str, context: dict) -> tuple[str | None, str | None]:
    """Renderiza ``<template_name>.html`` e ``.txt``. Ambos são opcionais.

    Retorna ``(html, text)`` — qualquer um ``None`` quando o arquivo não existe.
    É responsabilidade do chamador garantir que ao menos um dos dois exista.
    """
    html: str | None = None
    text: str | None = None
    try:
        html = _env.get_template(f"{template_name}.html").render(context)
    except TemplateNotFound:
        pass
    try:
        text = _env.get_template(f"{template_name}.txt").render(context)
    except TemplateNotFound:
        pass
    return html, text


def render_string(source: str, context: dict, *, autoescape: bool = True) -> str:
    """Renderiza uma string ad-hoc (usado no PR 3, templates do banco).

    ``autoescape`` deve ser ``True`` para HTML e ``False`` para texto/assunto.
    """
    env = SandboxedEnvironment(
        autoescape=autoescape,
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    return env.from_string(source).render(context)
