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

from app.ask.lexical import lexical_query
from app.ask.provider import Provider
from app.ask.strategies.cited import AnswerRequest, answer_call, labelled_pages, text_document
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
    provider: Provider,
    chunks: Sequence[ChunkRow],
    question: str,
    history: Sequence[AskTurn],
) -> Answer:
    """
    The retrieved chunks as the chapter. A provider that reads documents gets
    them cited, one per chunk, and the page comes off the citation; one that
    does not gets the same text as labelled pages (calibration §8).
    """
    ordered = sorted(chunks, key=lambda c: (c.page, c.index))
    if not provider.documents:
        request: AnswerRequest = labelled_pages([(c.page, c.text) for c in ordered])
        return await answer_call(provider, request, question, history)

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

    # Pages the chunks carry, as the fallback when nothing was cited: the
    # answer rests on what retrieval put in front of it either way.
    request = AnswerRequest(
        blocks=documents,
        pages_sent=tuple(dict.fromkeys(c.page for c in ordered)),
        pages_of=pages_of,
    )
    return await answer_call(provider, request, question, history)


@dataclass
class LexicalStrategy:
    provider: Provider
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
        return await answer_from_chunks(self.provider, retrieval.chunks, question, history)


@dataclass
class RagStrategy:
    provider: Provider
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
        return await answer_from_chunks(self.provider, retrieval.chunks, question, history)
