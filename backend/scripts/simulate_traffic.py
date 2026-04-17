"""Simulador de tráfego para gerar logs massivos.

Simula uso real da API: login, seleção de contexto, busca de pacientes,
criação, edição, etc. Gera tráfego distribuído entre municípios.

Uso:
    # Roda por 5 minutos com 10 workers (gera ~100k+ requests)
    docker compose exec app .venv/bin/python scripts/simulate_traffic.py --duration 300 --workers 10

    # Roda por 30 min com 20 workers (~1M+ requests)
    docker compose exec app .venv/bin/python scripts/simulate_traffic.py --duration 1800 --workers 20
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import random
import time
from dataclasses import dataclass

import httpx

API_BASE = "http://localhost:8000"
DEFAULT_PASSWORD = "Admin@123"


@dataclass
class WorkerStats:
    requests: int = 0
    errors: int = 0
    logins: int = 0
    patient_searches: int = 0
    patient_views: int = 0


async def _login(client: httpx.AsyncClient, login: str) -> str | None:
    try:
        r = await client.post(f"{API_BASE}/api/v1/auth/login",
                              json={"login": login, "password": DEFAULT_PASSWORD})
        if r.status_code == 200:
            return r.json().get("accessToken")
    except Exception:
        pass
    return None


def _fake_context(ibge: str) -> str:
    """Cria JWT fake com ibge (middleware só faz decode sem verificar assinatura)."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(json.dumps({
        "ibge": ibge, "typ": "context",
        "iat": int(time.time()), "exp": int(time.time()) + 3600,
    }).encode()).rstrip(b"=").decode()
    return f"{header}.{payload}."


# Municípios e seus IBGEs (mesmos do seed)
MUNICIPALITIES = [
    ("5208707", "admin.goiania"),   ("5201405", "admin.aparecid"),  ("5201108", "admin.anapolis"),
    ("5218805", "admin.rioverde"),  ("5212501", "admin.luziania"),  ("5200258", "admin.aguaslin"),
    ("5221858", "admin.valparai"),  ("5221403", "admin.trindade"),  ("5220454", "admin.senadorc"),
    ("5208004", "admin.formosa"),   ("5208608", "admin.goianesi"),  ("5211503", "admin.itumbiar"),
    ("5205109", "admin.catalao"),   ("5211909", "admin.jatai"),     ("5217609", "admin.planalti"),
    ("5204507", "admin.caldasno"),  ("5214838", "admin.novogama"),  ("5210208", "admin.inhumas"),
    ("5213103", "admin.mineiros"),  ("5211800", "admin.jaragua"),   ("5218003", "admin.porangat"),
    ("5213806", "admin.morrinho"),  ("5221601", "admin.uruacu"),    ("5209150", "admin.goiatuba"),
    ("5205307", "admin.ceres"),     ("5218508", "admin.quirinop"),  ("5217302", "admin.pirenopo"),
    ("5208905", "admin.goias"),     ("5214606", "admin.niqueland"), ("5206206", "admin.cristali"),
]

# Endpoints que simulamos
ENDPOINTS = [
    ("GET", "/api/v1/auth/me"),
    ("GET", "/api/v1/hsp/patients?page=1&page_size=20"),
    ("GET", "/api/v1/hsp/patients?page=1&page_size=20&search=maria"),
    ("GET", "/api/v1/hsp/patients?page=1&page_size=20&search=silva"),
    ("GET", "/api/v1/hsp/patients?page=1&page_size=20&search=joao"),
    ("GET", "/api/v1/hsp/patients/lookup?name=santos"),
    ("GET", "/api/v1/hsp/patients/lookup?cpf=123"),
    ("GET", "/api/v1/users?page=1&page_size=20"),
    ("GET", "/api/v1/system/settings"),
    ("GET", "/api/v1/reference/racas"),
    ("GET", "/api/v1/reference/etnias"),
    ("GET", "/api/v1/reference/nacionalidades"),
    ("GET", "/api/v1/reference/estados-civis"),
    ("GET", "/api/v1/reference/escolaridades"),
    ("GET", "/api/v1/reference/tipos-sanguineos"),
]


async def worker(worker_id: int, duration: int, stats: WorkerStats) -> None:
    """Worker que simula um usuário do sistema."""
    end_time = time.monotonic() + duration

    async with httpx.AsyncClient(timeout=10) as client:
        while time.monotonic() < end_time:
            # Escolhe município aleatório
            ibge, login = random.choice(MUNICIPALITIES)
            ctx = _fake_context(ibge)

            # Login (10% das vezes faz login fresh)
            token = None
            if random.random() < 0.1:
                token = await _login(client, login)
                stats.logins += 1
                stats.requests += 1

            if token is None:
                # Login com master (sempre funciona)
                token = await _login(client, "igor.santos")
                stats.requests += 1
                if token is None:
                    await asyncio.sleep(0.5)
                    continue

            headers = {
                "Authorization": f"Bearer {token}",
                "X-Work-Context": ctx,
            }

            # Batch de 5-15 requests simulando navegação
            batch_size = random.randint(5, 15)
            for _ in range(batch_size):
                if time.monotonic() >= end_time:
                    break

                method, url = random.choice(ENDPOINTS)
                try:
                    if method == "GET":
                        r = await client.get(f"{API_BASE}{url}", headers=headers)
                    else:
                        r = await client.post(f"{API_BASE}{url}", headers=headers, json={})
                    stats.requests += 1
                    if r.status_code >= 500:
                        stats.errors += 1
                    if "patients" in url:
                        stats.patient_searches += 1
                except Exception:
                    stats.errors += 1
                    stats.requests += 1

                # Pausa entre requests (simula humano)
                await asyncio.sleep(random.uniform(0.01, 0.1))

            # Login falho ocasional (simula tentativa errada)
            if random.random() < 0.05:
                try:
                    await client.post(f"{API_BASE}/api/v1/auth/login",
                                      json={"login": "hacker", "password": "wrong123"})
                    stats.requests += 1
                except Exception:
                    pass

            await asyncio.sleep(random.uniform(0.05, 0.3))


async def main() -> None:
    parser = argparse.ArgumentParser(description="Simulador de tráfego zSaúde")
    parser.add_argument("--duration", type=int, default=60, help="Duração em segundos (default: 60)")
    parser.add_argument("--workers", type=int, default=5, help="Número de workers paralelos (default: 5)")
    args = parser.parse_args()

    print(f"Iniciando simulação: {args.workers} workers por {args.duration}s")
    print(f"Alvo: {API_BASE}")
    print(f"Municípios: {len(MUNICIPALITIES)}")
    print()

    stats_list = [WorkerStats() for _ in range(args.workers)]
    start = time.monotonic()

    tasks = [worker(i, args.duration, stats_list[i]) for i in range(args.workers)]
    await asyncio.gather(*tasks)

    elapsed = time.monotonic() - start
    total = WorkerStats()
    for s in stats_list:
        total.requests += s.requests
        total.errors += s.errors
        total.logins += s.logins
        total.patient_searches += s.patient_searches

    print(f"\n{'='*60}")
    print(f"Simulação concluída em {elapsed:.1f}s")
    print(f"  Total requests:      {total.requests:,}")
    print(f"  Requests/segundo:    {total.requests / elapsed:.1f}")
    print(f"  Erros:               {total.errors:,}")
    print(f"  Logins:              {total.logins:,}")
    print(f"  Buscas pacientes:    {total.patient_searches:,}")
    print(f"  Error rate:          {total.errors / max(total.requests, 1) * 100:.2f}%")
    print(f"{'='*60}")


if __name__ == "__main__":
    asyncio.run(main())
