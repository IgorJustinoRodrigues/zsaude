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
    "email_verification": TemplateCatalogEntry(
        code="email_verification",
        label="Verificação de e-mail",
        description=(
            "Link de confirmação do e-mail cadastrado. Enviado quando o "
            "usuário solicita verificação (ou troca o endereço). Só após "
            "a confirmação o e-mail pode ser usado pra login."
        ),
        default_subject="Confirme seu e-mail no {{ app_name }}",
        variables=(
            TemplateVariable("app_name", "Nome do produto/plataforma.", "zSaúde"),
            TemplateVariable("user_name", "Nome completo do destinatário.", "Igor Justino"),
            TemplateVariable(
                "verify_link",
                "URL pública para o usuário confirmar o e-mail.",
                "https://zsaude.example/verificar-email?token=ABC",
            ),
            TemplateVariable(
                "expires_in_hours",
                "Horas de validade do link.",
                "24",
            ),
        ),
    ),
    "birthday_birth": TemplateCatalogEntry(
        code="birthday_birth",
        label="Parabéns — aniversário",
        description=(
            "Enviado no dia do aniversário do usuário, às 8h (fuso do "
            "município). Só usuários ativos com e-mail verificado recebem. "
            "O template pode ser personalizado por município/unidade."
        ),
        default_subject="Feliz aniversário, {{ user_first_name }}! 🎉",
        variables=(
            TemplateVariable("app_name", "Nome do produto/plataforma.", "zSaúde"),
            TemplateVariable(
                "user_name",
                "Nome completo do destinatário (ou social_name quando preenchido).",
                "Igor",
            ),
            TemplateVariable(
                "user_first_name", "Primeiro nome do destinatário.", "Igor",
            ),
            TemplateVariable(
                "municipality_name",
                "Nome do município do destinatário. Vazio quando o envio é genérico (sem personalização).",
                "Anápolis",
            ),
            TemplateVariable(
                "age",
                "Idade que o usuário está completando neste aniversário.",
                "36",
            ),
        ),
    ),
    "birthday_usage": TemplateCatalogEntry(
        code="birthday_usage",
        label="Aniversário de uso da plataforma",
        description=(
            "Disparado no aniversário da data de criação da conta. Comemora "
            "cada ano completo que o usuário está com o zSaúde."
        ),
        default_subject="{{ years }} {% if years == 1 %}ano{% else %}anos{% endif %} com o {{ app_name }}!",
        variables=(
            TemplateVariable("app_name", "Nome do produto/plataforma.", "zSaúde"),
            TemplateVariable(
                "user_name", "Nome completo do destinatário.", "Igor Justino",
            ),
            TemplateVariable(
                "user_first_name", "Primeiro nome do destinatário.", "Igor",
            ),
            TemplateVariable(
                "municipality_name",
                "Nome do município do destinatário (ou vazio em envios genéricos).",
                "Anápolis",
            ),
            TemplateVariable(
                "years",
                "Quantos anos completos de uso (cadastro) o usuário está comemorando.",
                "2",
            ),
        ),
    ),
}


def get_entry(code: str) -> TemplateCatalogEntry | None:
    return CATALOG.get(code)
