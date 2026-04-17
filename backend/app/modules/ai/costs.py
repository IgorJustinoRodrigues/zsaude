"""Cálculo de custo baseado em tokens × preço congelado."""

from __future__ import annotations


def compute_cost_cents(
    tokens_in: int,
    tokens_out: int,
    unit_cost_in_cents_per_mtok: int,
    unit_cost_out_cents_per_mtok: int,
) -> float:
    """Retorna custo total em centavos com precisão decimal.

    Exemplo: 1991 tokens × 10 ¢/Mtok = 0.01991 centavos.
    O banco armazena como NUMERIC(12,6); o display mostra em USD com
    casas decimais adequadas.
    """
    if tokens_in <= 0 and tokens_out <= 0:
        return 0.0
    cost_in = tokens_in * unit_cost_in_cents_per_mtok / 1_000_000
    cost_out = tokens_out * unit_cost_out_cents_per_mtok / 1_000_000
    return round(cost_in + cost_out, 6)
