"""Helpers para descrições humanas em logs de auditoria.

Objetivo: transformar eventos técnicos (IDs, enums, structs) em texto
legível tipo **"Igor Santos editou o paciente João Silva (telefone,
e-mail)"** que aparece direto no log/UI sem precisar de join.

Padrão de uso::

    from app.modules.audit.helpers import describe_change, diff_fields

    # Antes do UPDATE, capture o snapshot
    before = snapshot_fields(patient, ["name", "cpf", "phone"])
    # ... aplica mudanças ...
    after = snapshot_fields(patient, ["name", "cpf", "phone"])
    changes = diff_fields(before, after)

    await write_audit(
        session, module="hsp", action="patient_update", severity="info",
        resource="patient", resource_id=str(patient.id),
        description=describe_change(
            actor=user_name, verb="editou",
            target_kind="paciente", target_name=patient.name,
            changed_fields=[c.label for c in changes],
        ),
        details={"changes": [c.as_dict() for c in changes]},
    )

Resultado:
- ``description``: "Igor Santos editou o paciente João Silva (nome, telefone)"
- ``details``: ``[{"field": "name", "label": "nome", "before": "João", "after": "João Silva"}]``

Funções:

- ``describe_change``: monta a frase humana.
- ``diff_fields``: compara dois dicts retornando lista de ``FieldChange``.
- ``snapshot_fields``: captura valores atuais de um objeto ORM.
- ``humanize_field``: mapeia nome técnico (``birth_date``) → label PT (``data de nascimento``).
- ``humanize_value``: formata valores (datas, booleans, enums) pra display.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum
from typing import Any, Iterable


# ── Labels em português para nomes de campos técnicos ──────────────────────
# Adicionar conforme novos campos aparecem em audits. Fallback: snake_case
# vira "snake case" legível.

_FIELD_LABELS: dict[str, str] = {
    # Identificação
    "name":                 "nome",
    "social_name":          "nome social",
    "cpf":                  "CPF",
    "cns":                  "CNS",
    "rg":                   "RG",
    "prontuario":           "prontuário",
    "birth_date":           "data de nascimento",
    "sex":                  "sexo",
    "mother_name":          "nome da mãe",
    "father_name":          "nome do pai",
    # Endereço
    "cep":                  "CEP",
    "endereco":             "endereço",
    "numero":               "número",
    "bairro":               "bairro",
    "uf":                   "UF",
    "complemento":          "complemento",
    "municipio_ibge":       "município",
    # Contato
    "phone":                "telefone",
    "cellphone":            "celular",
    "email":                "e-mail",
    # Clínico
    "alergias":             "alergias",
    "tem_alergia":          "tem alergia",
    "doencas_cronicas":     "doenças crônicas",
    "gestante":             "gestante",
    "fumante":              "fumante",
    "etilista":             "etilista",
    # Perfil/acesso
    "role_id":              "perfil",
    "role_code":            "perfil",
    "facility_id":          "unidade",
    "municipality_id":      "município",
    "active":               "ativo",
    "is_active":            "ativo",
    "status":               "status",
    "level":                "nível",
    "primary_role":         "perfil principal",
    # Configuração
    "key":                  "chave",
    "value":                "valor",
    "description":          "descrição",
    # Município / unidade
    "short_name":           "nome curto",
    "type":                 "tipo",
    "cnes":                 "CNES",
    "ibge":                 "código IBGE",
    "state":                "UF",
    "neighborhoods":        "bairros",
    "archived":             "arquivado",
    "codigo":               "código",
    "descricao":            "descrição",
    # Timestamps (raramente vão pro audit, mas por segurança)
    "created_at":           "criado em",
    "updated_at":           "atualizado em",
    "data_obito":           "data de óbito",
}


def humanize_field(name: str) -> str:
    """Converte ``birth_date`` → ``data de nascimento`` (ou snake_case → snake case)."""
    if name in _FIELD_LABELS:
        return _FIELD_LABELS[name]
    return name.replace("_", " ")


def humanize_value(value: Any) -> str:
    """Formata valor pra display em log humano.

    - ``None`` → ``"(vazio)"``
    - ``bool`` → ``"sim"`` / ``"não"``
    - ``date`` / ``datetime`` → ISO ``"2026-04-18"`` / ``"2026-04-18 10:30"``
    - ``Enum`` → ``.value``
    - string vazia → ``"(vazio)"``
    - demais → ``str(value)``
    """
    if value is None:
        return "(vazio)"
    if isinstance(value, bool):
        return "sim" if value else "não"
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Enum):
        return str(value.value)
    s = str(value)
    if s == "" or s.isspace():
        return "(vazio)"
    return s


# ── Diff de campos ────────────────────────────────────────────────────────

@dataclass
class FieldChange:
    field: str       # nome técnico: "birth_date"
    label: str       # nome humano: "data de nascimento"
    before: Any      # valor anterior cru (pra machine-readable)
    after: Any       # valor novo cru
    before_str: str  # valor anterior formatado
    after_str: str   # valor novo formatado

    def as_dict(self) -> dict:
        """Serialização JSON-safe pra gravar em ``audit_logs.details``."""
        return {
            "field": self.field,
            "label": self.label,
            "before": self.before_str,
            "after": self.after_str,
        }


def diff_fields(
    before: dict[str, Any], after: dict[str, Any],
    *,
    ignore: Iterable[str] = (),
) -> list[FieldChange]:
    """Compara dois dicts e retorna lista de campos que mudaram.

    Só reporta campos que EXISTEM em ambos os dicts e têm valor diferente.
    Ignora campos em ``ignore`` (ex: ``{"updated_at"}``).
    """
    ignore_set = set(ignore) | {"updated_at", "created_at"}
    out: list[FieldChange] = []
    for key in before.keys() & after.keys():
        if key in ignore_set:
            continue
        b, a = before[key], after[key]
        if b == a:
            continue
        out.append(FieldChange(
            field=key,
            label=humanize_field(key),
            before=b,
            after=a,
            before_str=humanize_value(b),
            after_str=humanize_value(a),
        ))
    return out


def snapshot_fields(obj: Any, fields: Iterable[str]) -> dict[str, Any]:
    """Captura valores atuais de um objeto ORM pros campos listados."""
    return {f: getattr(obj, f, None) for f in fields}


# ── Descrição humana do evento ────────────────────────────────────────────

def describe_change(
    *,
    actor: str,
    verb: str,
    target_kind: str = "",
    target_name: str = "",
    changed_fields: Iterable[str] | None = None,
    extra: str = "",
) -> str:
    """Monta uma descrição humana tipo:

    - ``"Igor Santos editou o paciente João Silva (nome, telefone)"``
    - ``"Igor Santos criou o paciente Maria Fernanda (prontuário GOI-0001)"``
    - ``"Sistema aplicou reindex facial em 120 pacientes"``

    Parâmetros:
    - ``actor``: nome da pessoa que fez a ação. Fallback ``"Sistema"``.
    - ``verb``: verbo conjugado em PT, ex: ``"editou"``, ``"criou"``,
      ``"removeu"``, ``"arquivou"``, ``"consultou"``.
    - ``target_kind``: tipo do alvo — ``"paciente"``, ``"unidade"``, etc.
      Se vazio, omite.
    - ``target_name``: nome/identificador do alvo. Se vazio, omite.
    - ``changed_fields``: iterável com os labels humanos. Se vier, gera
      sufixo ``"(campo1, campo2)"``.
    - ``extra``: texto livre adicional, já formatado.
    """
    actor_disp = actor.strip() or "Sistema"
    parts = [actor_disp, verb]

    if target_kind and target_name:
        parts.append(f"o {target_kind}" if _masc(target_kind) else f"a {target_kind}")
        parts.append(target_name)
    elif target_kind:
        parts.append(target_kind)
    elif target_name:
        parts.append(target_name)

    sentence = " ".join(parts)

    if changed_fields:
        fields_str = ", ".join(changed_fields)
        sentence += f" ({fields_str})"

    if extra:
        sentence += f" — {extra}"

    return sentence


def _masc(noun: str) -> bool:
    """Heurística simples pt-BR: palavras que em geral são masculinas."""
    noun = noun.lower()
    # Casos comuns no sistema
    if noun in {
        "paciente", "usuário", "perfil", "município", "município",
        "modelo", "provedor", "documento", "arquivo", "papel",
    }:
        return True
    if noun in {"unidade", "foto", "configuração", "permissão", "rota",
                "sessão", "etnia", "raça", "nacionalidade"}:
        return False
    # Fallback: palavras terminadas em 'a' costumam ser femininas
    return not noun.endswith("a")
