"""Reconhecimento facial local (InsightFace + pgvector).

Fora do gateway de IA: não usa LLM, não tem custo por chamada. Roda em
CPU do próprio backend. Foto do paciente nunca sai do sistema (browser
autenticado → backend auto-hospedado → pgvector).
"""

from app.services.face.engine import (
    FaceResult,
    detect_and_embed,
    warm,
)

__all__ = ["FaceResult", "detect_and_embed", "warm"]
