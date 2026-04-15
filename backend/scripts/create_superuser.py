"""Cria um superusuário.

Uso:
    uv run python -m scripts.create_superuser --login alice --email alice@example.com --name "Alice" --cpf 12345678909
"""

from __future__ import annotations

import argparse
import asyncio
import getpass

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import dispose_engine, sessionmaker
from app.modules.users.models import User, UserStatus


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--login", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--cpf", required=True)
    parser.add_argument("--phone", default="")
    args = parser.parse_args()

    password = getpass.getpass("Senha: ")
    if len(password) < 8:
        print("Senha muito curta (mín. 8).")
        return

    async with sessionmaker()() as session:
        existing = await session.scalar(select(User).where(User.login == args.login))
        if existing is not None:
            print(f"Login já existe: {args.login}")
            return

        user = User(
            login=args.login,
            email=args.email,
            name=args.name,
            cpf="".join(c for c in args.cpf if c.isdigit()),
            phone=args.phone,
            password_hash=hash_password(password),
            status=UserStatus.ATIVO,
            is_active=True,
            is_superuser=True,
            primary_role="Administrador",
        )
        session.add(user)
        await session.commit()
        print(f"Superusuário criado: {user.login} ({user.id})")

    await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
