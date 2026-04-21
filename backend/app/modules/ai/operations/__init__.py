"""Registry de operations disponíveis, indexado por slug."""

from __future__ import annotations

from app.modules.ai.operations.base import AIOperation
from app.modules.ai.operations.classify import Classify
from app.modules.ai.operations.embed_text import EmbedText
from app.modules.ai.operations.extract_patient_document import ExtractPatientDocument
from app.modules.ai.operations.improve_text import ImproveText
from app.modules.ai.operations.summarize import Summarize

_OPERATIONS: dict[str, type[AIOperation]] = {
    ImproveText.slug: ImproveText,
    Summarize.slug: Summarize,
    Classify.slug: Classify,
    ExtractPatientDocument.slug: ExtractPatientDocument,
    EmbedText.slug: EmbedText,
}


def get_operation(slug: str) -> type[AIOperation]:
    try:
        return _OPERATIONS[slug]
    except KeyError as e:
        raise KeyError(f"Operation '{slug}' não registrada.") from e


def list_operations() -> list[type[AIOperation]]:
    return list(_OPERATIONS.values())


__all__ = [
    "AIOperation",
    "Classify",
    "EmbedText",
    "ExtractPatientDocument",
    "ImproveText",
    "Summarize",
    "get_operation",
    "list_operations",
]
