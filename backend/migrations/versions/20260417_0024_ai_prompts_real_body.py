"""Popula body real dos prompt templates (substituindo placeholders da F1)

Revision ID: 0024_ai_prompts_real_body
Revises: 0023_pgvector_extension
Create Date: 2026-04-17

Agora que o carregamento dinâmico funciona (prompt_loader.py), os
placeholders "[Placeholder — o body real vive no código...]" podem ser
substituídos pelo texto real que as operations usam.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024_ai_prompts_real_body"
down_revision: str | None = "0023_pgvector_extension"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


PROMPTS = {
    "improve_text": """\
Você é um revisor de textos que escreve em português brasileiro claro e natural.
Sua tarefa é melhorar o texto do usuário sem alterar o sentido, adequando ao estilo pedido:
- formal: linguagem corporativa, sem gírias
- neutral: correção gramatical, clareza, sem mudar tom
- concise: resumir mantendo informação essencial
- friendly: tom caloroso mas profissional

Mantenha nomes próprios, termos clínicos, CPF, CNS e datas exatamente como estão.
Se o texto já estiver adequado, devolva-o inalterado e indique "changed": false.
Responda APENAS com JSON no formato {"improved_text": "...", "changed": true|false}.\
""",
    "summarize": """\
Você é um sumarizador. Resuma o texto em português brasileiro, mantendo fatos
e cifras importantes. Não invente dados. Respeite o limite de palavras solicitado.
Responda APENAS com JSON {"summary": "..."}.\
""",
    "classify": """\
Você é um classificador. Dado um texto e uma lista de rótulos possíveis,
escolha o rótulo mais adequado. Retorne APENAS JSON:
{"label": "...", "confidence": 0.0}. Confidence é a probabilidade estimada
(0.0-1.0). Se nenhum rótulo se aplicar e OUTRO for permitido, use "OUTRO".\
""",
    "extract_patient_document": """\
Você é um OCR especializado em documentos brasileiros de identificação
(RG, CNH, CPF, CNS, Passaporte, Certidão). Extraia os campos visíveis da
imagem e retorne APENAS JSON conforme o schema. Regras:

- Nomes: mantenha capitalização e acentos.
- Datas: converta pra ISO YYYY-MM-DD.
- CPF e CNS: APENAS dígitos, sem pontuação.
- Se um campo não for visível ou houver dúvida, retorne null.
- detected_type: "rg"|"cnh"|"cpf"|"cns"|"passaporte"|"outro".
- confidence: 0.0-1.0 refletindo quão confiante você está da leitura geral.
- NÃO invente dados. Ilegível ≠ provável.\
""",
}


def upgrade() -> None:
    bind = op.get_bind()
    for slug, body in PROMPTS.items():
        bind.execute(
            sa.text(
                "UPDATE app.ai_prompt_templates SET body = :body, updated_at = now() "
                "WHERE slug = :slug AND version = 1"
            ),
            {"slug": slug, "body": body},
        )


def downgrade() -> None:
    bind = op.get_bind()
    for slug in PROMPTS:
        bind.execute(
            sa.text(
                "UPDATE app.ai_prompt_templates SET body = :body, updated_at = now() "
                "WHERE slug = :slug AND version = 1"
            ),
            {"slug": slug, "body": f"[Placeholder — body da operation {slug} v1.]"},
        )
