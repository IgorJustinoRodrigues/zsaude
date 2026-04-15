"""Gera par de chaves RSA para assinar/verificar JWTs.

Uso:
    uv run python -m scripts.generate_jwt_keys [--size 4096] [--dir secrets]

Padrão: secrets/jwt_private.pem e secrets/jwt_public.pem (ambos 4096 bits).
"""

from __future__ import annotations

import argparse
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, default=4096, help="Tamanho da chave RSA em bits")
    parser.add_argument("--dir", type=Path, default=Path("secrets"), help="Diretório de saída")
    args = parser.parse_args()

    args.dir.mkdir(parents=True, exist_ok=True)

    priv_path = args.dir / "jwt_private.pem"
    pub_path = args.dir / "jwt_public.pem"

    if priv_path.exists() or pub_path.exists():
        print(f"Chaves já existem em {args.dir}. Nenhuma alteração feita.")
        return

    key = rsa.generate_private_key(public_exponent=65537, key_size=args.size)

    priv_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    priv_path.write_bytes(priv_pem)
    pub_path.write_bytes(pub_pem)
    priv_path.chmod(0o600)

    print(f"Gerado: {priv_path} ({args.size} bits)")
    print(f"Gerado: {pub_path}")


if __name__ == "__main__":
    main()
