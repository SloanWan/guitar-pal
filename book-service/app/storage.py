"""
Supabase Storage, as the player. Every request carries the session token the
proxy forwarded, so the bucket's own policies (`scripts/create-books-bucket.sql`)
decide what this service may read or delete — there is no server-side key
that could reach another user's book.
"""

import time
from dataclasses import dataclass

import httpx

BUCKET = "books"


class StorageError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


@dataclass(frozen=True)
class StorageClient:
    storage_url: str
    anon_key: str

    def _headers(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}", "apikey": self.anon_key}

    def _object_url(self, path: str) -> str:
        return f"{self.storage_url}/object/{BUCKET}/{path}"

    async def download(self, path: str, token: str) -> bytes:
        """
        The whole PDF. Books are capped at 100 MB by the bucket; fine in memory.

        Storage sits behind a CDN that caches even authenticated reads and
        keeps serving a deleted or replaced object for a while (observed:
        `cf-cache-status: HIT` seconds after a 200 on the delete). A unique
        query string makes this read miss the cache, so a rescan after the
        player re-uploads to the same path reads the new file.
        """
        url = f"{self._object_url(path)}?scan={time.time_ns()}"
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
            response = await client.get(url, headers=self._headers(token))
        if response.status_code != 200:
            raise StorageError(response.status_code, _message(response))
        return response.content

    async def delete(self, path: str, token: str) -> None:
        """Idempotent: a missing object is not an error, the row is what matters."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.delete(self._object_url(path), headers=self._headers(token))
        if response.status_code not in (200, 404):
            raise StorageError(response.status_code, _message(response))


def _message(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:200]
    return str(body.get("message") or body.get("error") or body)[:200]
