"""Object Storage Service — S3-compatível (AWS S3 e MinIO).

Uso:
    from app.services.storage import get_storage

    storage = get_storage()
    await storage.upload("mun_5208707/patients/uuid/photo.jpg", data, "image/jpeg")
    url = await storage.presigned_url("mun_5208707/patients/uuid/photo.jpg")
    data = await storage.download("mun_5208707/patients/uuid/photo.jpg")
"""

from __future__ import annotations

import logging
from functools import lru_cache

import aioboto3
from botocore.config import Config as BotoConfig

from app.core.config import settings

log = logging.getLogger(__name__)


class StorageService:
    """Interface S3-compatível. Funciona com MinIO (local) e AWS S3 (prod)."""

    def __init__(self) -> None:
        self._session = aioboto3.Session(
            aws_access_key_id=settings.storage_access_key,
            aws_secret_access_key=settings.storage_secret_key,
            region_name=settings.storage_region,
        )
        self._endpoint = settings.storage_endpoint or None
        self._bucket = settings.storage_bucket
        self._client_config = BotoConfig(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        )

    def _client(self):
        return self._session.client(
            "s3",
            endpoint_url=self._endpoint,
            config=self._client_config,
        )

    async def upload(self, key: str, data: bytes, content_type: str) -> str:
        """Upload de arquivo. Retorna a key."""
        async with self._client() as s3:
            await s3.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
        log.info("storage_upload", extra={"key": key, "size": len(data), "content_type": content_type})
        return key

    async def download(self, key: str) -> bytes:
        """Download de arquivo. Retorna bytes."""
        async with self._client() as s3:
            response = await s3.get_object(Bucket=self._bucket, Key=key)
            data = await response["Body"].read()
        return data

    async def delete(self, key: str) -> None:
        """Deleta arquivo do bucket."""
        async with self._client() as s3:
            await s3.delete_object(Bucket=self._bucket, Key=key)
        log.info("storage_delete", extra={"key": key})

    async def presigned_url(self, key: str, expires: int = 3600) -> str:
        """Gera URL temporária para download direto (sem proxy pela API).

        Quando ``STORAGE_PUBLIC_ENDPOINT`` está setado, **assina** usando
        esse endpoint — não dá pra só reescrever o host depois porque o
        host entra no cálculo da assinatura S3v4. Em dev, o browser
        acessa via ``localhost:9002`` mesmo com o backend falando com
        ``minio:9000`` dentro do Docker.
        """
        public = settings.storage_public_endpoint
        endpoint_for_signing = public.rstrip("/") if public else self._endpoint
        async with self._session.client(
            "s3",
            endpoint_url=endpoint_for_signing,
            config=self._client_config,
        ) as s3:
            url = await s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=expires,
            )
        return url

    async def exists(self, key: str) -> bool:
        """Verifica se o arquivo existe no bucket."""
        async with self._client() as s3:
            try:
                await s3.head_object(Bucket=self._bucket, Key=key)
                return True
            except Exception:
                return False


@lru_cache(maxsize=1)
def get_storage() -> StorageService:
    return StorageService()
