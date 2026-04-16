"""Engine de reconhecimento facial — InsightFace singleton.

Exposição mínima:
- ``detect_and_embed(bytes)`` → ``FaceResult | None``: detecta rosto e
  gera embedding 512-dim (ArcFace buffalo_l).
- ``warm()`` → carrega o modelo antecipadamente (idempotente).

Thread-safe. Singleton: um ``FaceAnalysis`` por processo. ``onnxruntime``
paraleliza internamente; o pool externo só serializa o acesso ao objeto
Python não-reentrante.

Modo stub: ``ZSAUDE_FACE_STUB=1`` pula o download do modelo e gera
embeddings determinísticos a partir do hash da imagem. Usado em testes.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.services.face.schemas import FaceResult

log = logging.getLogger(__name__)

_STUB = os.getenv("ZSAUDE_FACE_STUB", "").lower() in ("1", "true", "yes")

# Pool dedicado — InsightFace é CPU-bound e bloqueia. 2 workers é suficiente
# pra 10-30 req/min em hospital (latência ~100-300ms por chamada).
_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="face")

# Singleton protegido por lock. Carrega lazy na primeira chamada.
_analysis: Any = None
_lock = threading.Lock()


def _get_analysis() -> Any:
    """Retorna o ``FaceAnalysis`` inicializado. Bloqueia na primeira chamada.

    Em modo stub, retorna None — o caller deve checar.
    """
    global _analysis
    if _STUB:
        return None
    if _analysis is not None:
        return _analysis
    with _lock:
        if _analysis is not None:
            return _analysis
        # Import aqui pra não carregar a lib no import do módulo (acelera
        # startup de tarefas que não usam face, tipo testes de outros módulos).
        from insightface.app import FaceAnalysis  # type: ignore[import-untyped]

        log.info("face_model_loading")
        fa = FaceAnalysis(
            name="buffalo_l",
            providers=["CPUExecutionProvider"],
            allowed_modules=["detection", "recognition"],
        )
        fa.prepare(ctx_id=-1, det_size=(640, 640))
        _analysis = fa
        log.info("face_model_loaded")
        return _analysis


def _stub_embedding(data: bytes) -> FaceResult:
    """Embedding determinístico pra testes — mesma imagem gera mesmo vetor."""
    digest = hashlib.sha512(data).digest()
    # Expande pros 512 floats necessários (sha512 = 64 bytes).
    raw = digest + digest[::-1] + digest + digest[::-1]
    vector = [(b - 128) / 128.0 for b in raw[:512]]
    # Normaliza L2 pra cosine sim fazer sentido.
    norm = sum(x * x for x in vector) ** 0.5 or 1.0
    vector = [x / norm for x in vector]
    return FaceResult(
        embedding=vector,
        detection_score=0.99,
        bbox={"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0},
        face_count=1,
    )


def _biggest_face(faces: list[Any]) -> Any:
    """Pega o rosto com maior bbox (mais próximo da câmera)."""
    def area(f: Any) -> float:
        x1, y1, x2, y2 = f.bbox
        return max(0.0, (x2 - x1)) * max(0.0, (y2 - y1))
    return max(faces, key=area)


def _run_sync(data: bytes) -> FaceResult | None:
    """Caminho síncrono — roda no thread pool."""
    if _STUB:
        return _stub_embedding(data)

    # Decodifica bytes → ndarray BGR (formato esperado por InsightFace).
    import cv2  # type: ignore[import-untyped]
    import numpy as np

    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        log.info("face_decode_failed", extra={"bytes": len(data)})
        return None

    fa = _get_analysis()
    faces = fa.get(img)
    if not faces:
        return None

    face = _biggest_face(faces)
    bbox = face.bbox
    return FaceResult(
        embedding=[float(x) for x in face.normed_embedding],
        detection_score=float(face.det_score),
        bbox={
            "x": float(bbox[0]),
            "y": float(bbox[1]),
            "w": float(bbox[2] - bbox[0]),
            "h": float(bbox[3] - bbox[1]),
        },
        face_count=len(faces),
    )


async def detect_and_embed(data: bytes) -> FaceResult | None:
    """Detecta o rosto principal e retorna embedding + metadata.

    Retorna None se nenhum rosto for encontrado ou a imagem não decodificar.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_pool, _run_sync, data)


async def warm() -> None:
    """Pré-carrega o modelo em background. Idempotente. Não propaga erro —
    se falhar, o primeiro match real tenta de novo."""
    if _STUB:
        return
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(_pool, _get_analysis)
    except Exception as e:  # noqa: BLE001
        log.warning("face_warm_failed", extra={"error": str(e)})


def stub_mode() -> bool:
    return _STUB


# Shim pra testes que querem aquecer sem esperar IO real.
_ = io  # reservado — remove lint warning se o import ficar sem uso no futuro
