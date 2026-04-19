"""Catálogo de códigos de template reconhecidos pelo sistema.

Cada feature que manda e-mail registra aqui seu código + variáveis
disponíveis. A UI de edição (PR futura) mostra essa lista pra:

- Validar a lista de códigos permitidos
- Renderizar preview com contexto de exemplo
- Documentar pro admin quais variáveis ele pode usar no template
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class TemplateVariable:
    name: str            # "user.name", "reset_link", ...
    description: str
    example: str         # valor exemplo usado no preview


@dataclass(frozen=True, slots=True)
class TemplateCatalogEntry:
    code: str                               # "password_reset"
    label: str                              # "Redefinição de senha"
    description: str                        # texto curto pro admin entender
    default_subject: str                    # usado quando não há override no banco
    variables: tuple[TemplateVariable, ...]

    def example_context(self) -> dict[str, str]:
        return {v.name: v.example for v in self.variables}


CATALOG: dict[str, TemplateCatalogEntry] = {
    "password_reset": TemplateCatalogEntry(
        code="password_reset",
        label="Redefinição de senha",
        description=(
            "Disparado quando o usuário pede recuperação de senha via "
            "tela de login. Link válido pelo tempo configurado."
        ),
        default_subject="Redefinição de senha",
        variables=(
            TemplateVariable("app_name", "Nome do produto/plataforma.", "zSaúde"),
            TemplateVariable("user_name", "Nome completo do destinatário.", "Igor Justino"),
            TemplateVariable(
                "reset_link",
                "URL pública para o usuário criar uma nova senha.",
                "https://zsaude.example/redefinir-senha?token=ABC",
            ),
            TemplateVariable(
                "expires_in_minutes",
                "Minutos de validade do link.",
                "15",
            ),
        ),
    ),
}


def get_entry(code: str) -> TemplateCatalogEntry | None:
    return CATALOG.get(code)
