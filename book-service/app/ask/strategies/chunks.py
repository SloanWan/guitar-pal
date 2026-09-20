"""
The chunk strategies: `lexical` and `rag` find a few chunks of the chapter,
and the answer call gets those as text documents, one per chunk, titled by
page. A `char_location` citation names its document, and the document
names its page.
"""

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from anthropic import AsyncAnthropic

from app.ask.lexical import lexical_query
from app.ask.strategies.cited import answer_with_documents, text_document
from app.ask.types import Answer, AskContext, AskTurn, Retrieval
from app.repo import ChunkRow

log = logging.getLogger("book-service")

# Chunks a question is answered from; a chunk is a page, so this is a few pages.
TOP_K = 6


class ChunkStore(Protocol):
    async def search_chunks_lexical(
        self, chapter_id: str, query: str, limit: int
    ) -> list[ChunkRow]: ...

    async def search_chunks_by_embedding(
        self, chapter_id: str, embedding: Sequence[float], limit: int
    ) -> list[ChunkRow]: ...


class Embedder(Protocol):
    """Text → vectors. `query` and `documents` may embed differently (Voyage's input_type)."""

    dimension: int

    async def embed_query(self, text: str) -> list[float]: ...

    async def embed_documents(self, texts: Sequence[str]) -> list[list[float]]: ...


async def answer_from_chunks(
    client: AsyncAnthropic,
    chunks: Sequence[ChunkRow],
    question: str,
    history: Sequence[AskTurn],
) -> Answer:
    ordered = sorted(chunks, key=lambda c: (c.page, c.index))
    documents = [
        text_document(f"Page {c.page}", c.text, cached=(i == 0)) for i, c in enumerate(ordered)
    ]

    def pages_of(citation: Any) -> Sequence[int]:
        if getattr(citation, "type", None) != "char_location":
            return ()
        index = getattr(citation, "document_index", None)
        if not isinstance(index, int) or not 0 <= index < len(ordered):
            return ()
        return [ordered[index].page]

    return await answer_with_documents(client, documents, pages_of, question, history)


@dataclass
class LexicalStrategy:
    client: AsyncAnthropic
    store: ChunkStore
    name: str = "lexical"

    async def retrieve(self, ctx: AskContext, question: str) -> Retrieval:
        chunks = await self.store.search_chunks_lexical(
            ctx.chapter.id, lexical_query(question), TOP_K
        )
        log.info("ask lexical: %d chunk(s) on pages %s", len(chunks), [c.page for c in chunks])
        return Retrieval(usable=len(chunks) > 0, chunks=chunks)

    async def answer(
        self, ctx: AskContext, question: str, history: Sequence[AskTurn], retrieval: Retrieval
    ) -> Answer:
        return await answer_from_chunks(self.client, retrieval.chunks, question, history)


@dataclass
class RagStrategy:
    client: AsyncAnthropic
    store: ChunkStore
    embedder: Embedder
    name: str = "rag"

    async def retrieve(self, ctx: AskContext, question: str) -> Retrieval:
        vector = await self.embedder.embed_query(question)
        chunks = await self.store.search_chunks_by_embedding(ctx.chapter.id, vector, TOP_K)
        log.info("ask rag: %d chunk(s) on pages %s", len(chunks), [c.page for c in chunks])
        return Retrieval(usable=len(chunks) > 0, chunks=chunks)

    async def answer(
        self, ctx: AskContext, question: str, history: Sequence[AskTurn], retrieval: Retrieval
    ) -> Answer:
        return await answer_from_chunks(self.client, retrieval.chunks, question, history)
