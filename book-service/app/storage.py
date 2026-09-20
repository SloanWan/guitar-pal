"""
Supabase Storage, as the player. Every request carries the session token the
proxy forwarded, so the bucket's own policies (`scripts/create-books-bucket.sql`)
decide what this service may read or delete — there is no server-side key
that could reach another user's book.
"""

import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass

import httpx

BUCKET = "books"
# Storage lists at most this many objects per call, and deletes this many per call.
LIST_PAGE = 1000
DELETE_BATCH = 100

log = logging.getLogger("book-service")


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

    async def upload_png(self, path: str, data: bytes, token: str) -> None:
        """A crop beside the PDF, under the player's folder, replacing any old one."""
        await self.upload_image(path, data, token, "image/png")

    async def upload_image(self, path: str, data: bytes, token: str, content_type: str) -> None:
        """An image under the player's folder, replacing any old one."""
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                self._object_url(path),
                headers={**self._headers(token), "Content-Type": content_type, "x-upsert": "true"},
                content=data,
            )
        if response.status_code != 200:
            raise StorageError(response.status_code, _message(response))

    async def delete(self, path: str, token: str) -> None:
        """Idempotent: a missing object is not an error, the row is what matters."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.delete(self._object_url(path), headers=self._headers(token))
        if response.status_code not in (200, 404):
            raise StorageError(response.status_code, _message(response))

    async def list_objects(self, prefix: str, token: str) -> list[str]:
        """Every object under a folder, as full paths, across as many pages as it takes."""
        return [path for path, is_object in await self._list(prefix, token) if is_object]

    async def list_folders(self, prefix: str, token: str) -> list[str]:
        """The subfolders directly under a folder, as full paths (#246's sweep reads these)."""
        return [path for path, is_object in await self._list(prefix, token) if not is_object]

    async def _list(self, prefix: str, token: str) -> list[tuple[str, bool]]:
        """Everything Storage lists under a folder: (full path, whether it is an object)."""
        folder = prefix.rstrip("/")
        entries: list[tuple[str, bool]] = []
        async with httpx.AsyncClient(timeout=30.0) as client:
            offset = 0
            while True:
                response = await client.post(
                    f"{self.storage_url}/object/list/{BUCKET}",
                    headers=self._headers(token),
                    json={"prefix": folder, "limit": LIST_PAGE, "offset": offset},
                )
                if response.status_code != 200:
                    raise StorageError(response.status_code, _message(response))
                page = response.json()
                # A folder entry (no id) is a subfolder, not an object.
                entries += [(f"{folder}/{o['name']}", bool(o.get("id"))) for o in page]
                if len(page) < LIST_PAGE:
                    return entries
                offset += LIST_PAGE

    async def delete_many(self, paths: list[str], token: str) -> None:
        """Objects in batches; a missing one is not an error."""
        async with httpx.AsyncClient(timeout=60.0) as client:
            for start in range(0, len(paths), DELETE_BATCH):
                response = await client.request(
                    "DELETE",
                    f"{self.storage_url}/object/{BUCKET}",
                    headers=self._headers(token),
                    json={"prefixes": paths[start : start + DELETE_BATCH]},
                )
                if response.status_code not in (200, 404):
                    raise StorageError(response.status_code, _message(response))

    async def remove_tree(self, prefix: str, token: str) -> int:
        """
        Everything under a folder (#243). Returns how many objects went.
        Only the folder's own objects: Storage lists one level, so a nested
        folder is an entry here, not a set of paths — none of the folders
        this service writes nest.
        """
        paths = await self.list_objects(prefix, token)
        if paths:
            await self.delete_many(paths, token)
        return len(paths)


def _message(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:200]
    return str(body.get("message") or body.get("error") or body)[:200]


async def sweep_folders(
    storage: StorageClient, folders: Sequence[str], token: str, what: str
) -> None:
    """
    Clears folders about to be written over (#246). A folder that will not
    clear is logged and left — the rows are what matter, and leftovers can be
    swept by hand (`scripts/sweep-orphan-crops.py`).
    """
    for folder in folders:
        try:
            removed = await storage.remove_tree(folder, token)
        except StorageError as e:
            log.warning("%s: %s left behind: %s %s", what, folder, e.status, e.message)
            continue
        if removed:
            log.info("%s: cleared %d object(s) under %s", what, removed, folder)
