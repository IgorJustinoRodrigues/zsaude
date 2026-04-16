"""Cálculo de custo baseado em tokens × preço congelado."""

from __future__ import annotations


def compute_cost_cents(
    tokens_in: int,
    tokens_out: int,
    unit_cost_in_cents_per_mtok: int,
    unit_cost_out_cents_per_mtok: int,
) -> int:
    """Retorna custo total em centavos (arredondado pra cima pra evitar
    sub-cobrança em ticks minúsculos)."""
    if tokens_in <= 0 and tokens_out <= 0:
        return 0
    micros_in = tokens_in * unit_cost_in_cents_per_mtok   # cents * tokens / 1M
    micros_out = tokens_out * unit_cost_out_cents_per_mtok
    total_micros = micros_in + micros_out
    # ceildiv por 1_000_000 sem float
    return (total_micros + 999_999) // 1_000_000
