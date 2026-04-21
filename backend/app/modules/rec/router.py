"""Router do módulo Recepção — por ora apenas um placeholder.

Rotas reais (ticket, counter, call, panel) entram conforme as funções
forem implementadas. O router existe hoje pra:

- Registrar o módulo no ``api_v1`` (aparece no OpenAPI com a tag ``rec``).
- Servir de ponto de acoplamento pras novas rotas sem refator de import.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import CurrentContextDep

router = APIRouter(prefix="/rec", tags=["rec"])


@router.get("/ping")
async def ping(ctx: CurrentContextDep) -> dict[str, str]:
    """Endpoint trivial pra validar que o módulo está montado e o
    work-context chega corretamente. Será substituído quando a primeira
    função real (totem/balcão/painel) for implementada.
    """
    return {
        "module": "rec",
        "municipality_ibge": ctx.municipality_ibge,
        "facility_id": str(ctx.facility_id),
    }
