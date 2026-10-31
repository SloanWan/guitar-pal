"""
The embedding client the `rag` strategy needs. Anthropic has no embeddings
endpoint, so this is Voyage's (`VOYAGE_API_KEY`); the model and its
dimension are settings, and the dimension must match migration 0007's
column. Not exercised live yet — no key on hand when it was written — so
the request shape is Voyage's documented one and the tests fake the
transport.
"""

from collections.abc import Sequence
from dataclasses import dataclass

import httpx

VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
DEFAULT_MODEL = "voyage-3.5-lite"
DEFAULT_DIMENSION = 1024
# Voyage takes up to 128 inputs per call.
BATCH = 64


class EmbeddingError(Exception):
    pass


@dataclass(frozen=True)
class VoyageEmbedder:
    api_key: str
    model: str = DEFAULT_MODEL
    dimension: int = DEFAULT_DIMENSION
    transport: httpx.AsyncBaseTransport | None = None

    async def embed_query(self, text: str) -> list[float]:
        return (await self._embed([text], "query"))[0]

    async def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for start in range(0, len(texts), BATCH):
            out += await self._embed(list(texts[start : start + BATCH]), "document")
        return out

    async def _embed(self, texts: list[str], input_type: str) -> list[list[float]]:
        if not texts:
            return []
        async with httpx.AsyncClient(timeout=60.0, transport=self.transport) as client:
            response = await client.post(
                VOYAGE_URL,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "input": texts,
                    "model": self.model,
                    "input_type": input_type,
                    "output_dimension": self.dimension,
                },
            )
        if response.status_code != 200:
            raise EmbeddingError(f"Voyage {response.status_code}: {response.text[:200]}")
        data = response.json().get("data")
        if not isinstance(data, list) or len(data) != len(texts):
            raise EmbeddingError("Voyage answered with the wrong number of embeddings")
        vectors = [row.get("embedding") for row in sorted(data, key=lambda r: r.get("index", 0))]
        for v in vectors:
            if not isinstance(v, list) or len(v) != self.dimension:
                raise EmbeddingError("Voyage answered with an embedding of the wrong size")
        return vectors
