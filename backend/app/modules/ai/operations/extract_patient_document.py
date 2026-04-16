"""Operation: extrair dados de documento de paciente via visão.

Entrada: data URL da imagem (JPEG base64) já recortada pelo scanner.
Saída: dicionário com os campos identificados (qualquer campo pode vir None).
Usa capability ``chat_vision`` — a rota aponta pra um modelo com suporte.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any

from pydantic import Field

from app.core.schema_base import CamelModel as BaseModel
from app.modules.ai.operations.base import AIOperation
from app.modules.ai.providers.base import ChatMessage, ChatRequest, ContentPart
from app.modules.ai.service import AIService


class ExtractPatientDocumentInput(BaseModel):
    # Aceita data URL ou https. Data URL é o caso normal do scanner (<2MB).
    image_url: str = Field(min_length=10, max_length=20 * 1024 * 1024)
    # Tipo esperado: ajuda o modelo a não alucinar campos (ex: RG não tem CNS).
    hint_document_type: str | None = None  # "cpf"|"rg"|"cnh"|"cns"|"passaporte"|None


class ExtractPatientDocumentOutput(BaseModel):
    name: str | None = None
    social_name: str | None = None
    cpf: str | None = None           # só dígitos
    rg: str | None = None
    cns: str | None = None           # só dígitos
    birth_date: str | None = None    # ISO YYYY-MM-DD
    mother_name: str | None = None
    father_name: str | None = None
    detected_type: str | None = None # o tipo que o modelo acha que é
    confidence: float = 0.0


_SYSTEM = """\
Você é um OCR especializado em documentos brasileiros de identificação
(RG, CNH, CPF, CNS, Passaporte, Certidão). Extraia os campos visíveis da
imagem e retorne APENAS JSON conforme o schema. Regras:

- Nomes: mantenha capitalização e acentos.
- Datas: converta pra ISO YYYY-MM-DD.
- CPF e CNS: APENAS dígitos, sem pontuação.
- Se um campo não for visível ou houver dúvida, retorne null.
- detected_type: "rg"|"cnh"|"cpf"|"cns"|"passaporte"|"outro".
- confidence: 0.0-1.0 refletindo quão confiante você está da leitura geral.
- NÃO invente dados. Ilegível ≠ provável.
"""


# OpenAI strict mode exige que *todos* os properties estejam em required.
# Campos opcionais expressam "ausência" via `{"type": ["string", "null"]}` —
# o modelo devolve null quando não detectar.
_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "name", "social_name", "cpf", "rg", "cns", "birth_date",
        "mother_name", "father_name", "detected_type", "confidence",
    ],
    "properties": {
        "name":          {"type": ["string", "null"]},
        "social_name":   {"type": ["string", "null"]},
        "cpf":           {"type": ["string", "null"]},
        "rg":            {"type": ["string", "null"]},
        "cns":           {"type": ["string", "null"]},
        "birth_date":    {"type": ["string", "null"]},
        "mother_name":   {"type": ["string", "null"]},
        "father_name":   {"type": ["string", "null"]},
        "detected_type": {"type": ["string", "null"]},
        "confidence":    {"type": "number"},
    },
}


def _digits(s: str | None) -> str | None:
    if not s:
        return None
    return re.sub(r"\D", "", s) or None


class ExtractPatientDocument(AIOperation[ExtractPatientDocumentInput, ExtractPatientDocumentOutput]):
    slug = "extract_patient_document"
    capability = "chat_vision"
    prompt_slug = "extract_patient_document"
    prompt_version = 1

    input_model = ExtractPatientDocumentInput
    output_model = ExtractPatientDocumentOutput

    @classmethod
    async def _run(
        cls,
        service: AIService,
        input_dto: ExtractPatientDocumentInput,
        *,
        module_code: str,
        idempotency_key: str | None,
    ) -> tuple[ExtractPatientDocumentOutput, dict[str, Any]]:
        hint = (
            f"Dica do operador: provavelmente é '{input_dto.hint_document_type}'."
            if input_dto.hint_document_type else ""
        )
        req = ChatRequest(
            messages=[
                ChatMessage(role="system", content=_SYSTEM),
                ChatMessage(
                    role="user",
                    content=[
                        ContentPart(kind="text", text=hint or "Extraia os campos do documento."),
                        # detail="low" força 512×512 (~85 tokens de imagem em vez de
                        # ~37k em high). Documentos de identidade são texto legível
                        # em resolução baixa, então funciona bem e corta ~90% do custo.
                        ContentPart(kind="image", image_url=input_dto.image_url, image_detail="low"),
                    ],
                ),
            ],
            temperature=0.0,
            max_tokens=600,
            response_schema=_RESPONSE_SCHEMA,
        )

        start = time.monotonic()
        resp = await service.call_chat(
            req,
            capability=cls.capability,
            module_code=module_code,
            operation_slug=cls.slug,
            prompt_template=(cls.prompt_slug, cls.prompt_version),
            idempotency_key=idempotency_key,
        )
        latency_ms = int((time.monotonic() - start) * 1000)

        try:
            parsed = json.loads(resp.text or "{}")
        except json.JSONDecodeError:
            parsed = {}

        output = ExtractPatientDocumentOutput(
            name=parsed.get("name") or None,
            social_name=parsed.get("social_name") or None,
            cpf=_digits(parsed.get("cpf")),
            rg=(parsed.get("rg") or None),
            cns=_digits(parsed.get("cns")),
            birth_date=parsed.get("birth_date") or None,
            mother_name=parsed.get("mother_name") or None,
            father_name=parsed.get("father_name") or None,
            detected_type=parsed.get("detected_type") or None,
            confidence=float(parsed.get("confidence", 0.0) or 0.0),
        )
        return (
            output,
            {"tokens_in": resp.tokens_in, "tokens_out": resp.tokens_out, "latency_ms": latency_ms},
        )
