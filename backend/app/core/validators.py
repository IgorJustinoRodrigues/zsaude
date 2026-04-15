"""Validadores brasileiros (CPF, CNPJ, CNS, CEP).

Todos aceitam com ou sem máscara e retornam o valor normalizado (só dígitos)
ou lançam ValueError.
"""

from __future__ import annotations

import re

_DIGITS = re.compile(r"\D")


def _only_digits(v: str) -> str:
    return _DIGITS.sub("", v)


# ─── CPF ──────────────────────────────────────────────────────────────────────


def validate_cpf(value: str) -> str:
    cpf = _only_digits(value)
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        raise ValueError("CPF inválido.")

    def _dv(nums: str, weights: range) -> int:
        s = sum(int(d) * w for d, w in zip(nums, weights, strict=True))
        r = (s * 10) % 11
        return r if r < 10 else 0

    dv1 = _dv(cpf[:9], range(10, 1, -1))
    dv2 = _dv(cpf[:10], range(11, 1, -1))
    if int(cpf[9]) != dv1 or int(cpf[10]) != dv2:
        raise ValueError("CPF inválido.")
    return cpf


# ─── CNPJ ─────────────────────────────────────────────────────────────────────


def validate_cnpj(value: str) -> str:
    cnpj = _only_digits(value)
    if len(cnpj) != 14 or cnpj == cnpj[0] * 14:
        raise ValueError("CNPJ inválido.")

    def _dv(nums: str, weights: list[int]) -> int:
        s = sum(int(d) * w for d, w in zip(nums, weights, strict=True))
        r = s % 11
        return 0 if r < 2 else 11 - r

    dv1 = _dv(cnpj[:12], [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    dv2 = _dv(cnpj[:13], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    if int(cnpj[12]) != dv1 or int(cnpj[13]) != dv2:
        raise ValueError("CNPJ inválido.")
    return cnpj


# ─── CNS (Cartão Nacional de Saúde) ───────────────────────────────────────────


def validate_cns(value: str) -> str:
    cns = _only_digits(value)
    if len(cns) != 15:
        raise ValueError("CNS inválido.")

    if cns[0] in {"1", "2"}:
        pis = cns[:11]
        soma = sum(int(pis[i]) * (15 - i) for i in range(11))
        dv = soma % 11
        if dv == 10:
            soma += 2
            resto = soma % 11
            dv = 11 - resto
            resultado = pis + "001" + str(dv)
        else:
            dv = 11 - dv
            resultado = pis + "000" + str(dv) if dv < 11 else pis + "000" + "0"
        if resultado != cns:
            raise ValueError("CNS inválido.")
    elif cns[0] in {"7", "8", "9"}:
        soma = sum(int(cns[i]) * (15 - i) for i in range(15))
        if soma % 11 != 0:
            raise ValueError("CNS inválido.")
    else:
        raise ValueError("CNS inválido.")
    return cns


# ─── CEP ──────────────────────────────────────────────────────────────────────


def validate_cep(value: str) -> str:
    cep = _only_digits(value)
    if len(cep) != 8:
        raise ValueError("CEP inválido.")
    return cep
