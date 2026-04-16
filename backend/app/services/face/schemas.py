"""DTOs internos do módulo face."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class FaceResult:
    """Resultado da detecção + embedding de UM rosto na imagem."""

    embedding: list[float]          # 512 floats (ArcFace buffalo_l)
    detection_score: float          # 0..1 (confiança do detector)
    bbox: dict[str, float]          # {x, y, w, h} em pixels absolutos
    face_count: int                 # quantos rostos a imagem tinha
