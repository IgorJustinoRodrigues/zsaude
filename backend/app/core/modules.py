"""Catálogo de módulos operacionais do sistema.

Fonte única. Quando criar um módulo novo, basta adicionar o código aqui
(e alinhar o frontend). O código é de 3 letras, prefixo das permissões
associadas (``<modulo>.<recurso>.<acao>``).

Rótulos humanos vivem no frontend — o backend trabalha apenas com códigos.
"""

from __future__ import annotations

OPERATIONAL_MODULES: frozenset[str] = frozenset({
    "cln",  # Clínica
    "dgn",  # Diagnóstico
    "hsp",  # Hospitalar
    "pln",  # Planos
    "fsc",  # Fiscal Sanitário
    "ops",  # Operações
    "ind",  # Indicadores
    "rec",  # Recepção (totem, balcão, painel de chamadas — funções
            # habilitáveis por município/unidade).
    "esu",  # Integra Esus
})
