"""Testes do cálculo de custo (pure function, sem DB)."""

from __future__ import annotations

from app.modules.ai.costs import compute_cost_cents


def test_zero_tokens_zero_cost() -> None:
    assert compute_cost_cents(0, 0, 100, 500) == 0


def test_basic_cost() -> None:
    # 1M tokens in a 15c/Mtok = 15 cents; 1M out a 60c/Mtok = 60 cents → 75
    assert compute_cost_cents(1_000_000, 1_000_000, 15, 60) == 75


def test_small_amounts_ceil_up() -> None:
    # 100 tokens a 15c/Mtok = 0.0015 cents → arredonda pra 1.
    assert compute_cost_cents(100, 0, 15, 0) == 1


def test_zero_pricing() -> None:
    # Ollama local = preço 0 → custo 0 independente de tokens.
    assert compute_cost_cents(999_999, 999_999, 0, 0) == 0


def test_asymmetric_pricing() -> None:
    # Tokens de entrada baratos, saída cara.
    c = compute_cost_cents(500_000, 1_000, 2, 60)
    # 500k * 2 / 1M = 1; 1000 * 60 / 1M ≈ 0.06 → 1 + 1 = 2 (ambos arredondam pra cima)
    # Nota: a função soma antes de dividir, então é (500000*2 + 1000*60) / 1M = (1_000_000 + 60_000) / 1M → ceildiv → 2
    assert c == 2
