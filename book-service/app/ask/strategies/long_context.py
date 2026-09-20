"""
`long_context`: the chapter itself, as a PDF, in the prompt.

The chapter's pages are cut out of the book's PDF (as the player, with the
session token — the same download the page images make, and the same
cache) into one document block with citations on and the cache mark, so
the first question of a thread pays for the chapter and the ones after it
read it back. There is no retrieval step: everything is in front of the
model, and whether the chapter covered the question is what its citations
say — an answer that cites nothing goes down the general route.
"""

import asyncio
import base64
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

import pymupdf
from anthropic import AsyncAnthropic

from app.ask.strategies.cited import answer_with_documents
from app.ask.types import Answer, AskContext, AskTurn, Retrieval
from app.ingest.pdf import UnreadablePdf, open_pdf
from app.pages import PdfCache
from app.storage import StorageClient

log = logging.getLogger("book-service")


class ChapterUnavailable(Exception):
    """The chapter's PDF could not be had: the route answers 502/422 with the message."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def chapter_pdf(pdf: bytes, page_start: int, page_end: int) -> bytes:
    """The pages `page_start..page_end` (1-based, inclusive) as a PDF of their own."""
    with open_pdf(pdf) as doc:
        last = min(page_end, len(doc))
        if page_start > last:
            raise UnreadablePdf(f"no pages {page_start}-{page_end}")
        out = pymupdf.open()
        out.insert_pdf(doc, from_page=page_start - 1, to_page=last - 1)
        try:
            return out.tobytes(garbage=3, deflate=True)
        finally:
            out.close()


@dataclass
class LongContextStrategy:
    client: AsyncAnthropic
    storage: StorageClient
    worker: asyncio.Semaphore
    pdfs: PdfCache = field(default_factory=PdfCache)
    name: str = "long_context"

    async def retrieve(self, ctx: AskContext, question: str) -> Retrieval:
        # Nothing to find: the whole chapter goes to the model.
        return Retrieval(usable=True)

    async def answer(
        self, ctx: AskContext, question: str, history: Sequence[AskTurn], retrieval: Retrieval
    ) -> Answer:
        pdf = self.pdfs.get(ctx.book.id)
        if pdf is None:
            pdf = await self.storage.download(ctx.book.storage_path, ctx.token)
            self.pdfs.put(ctx.book.id, pdf)
        async with self.worker:
            try:
                sliced = await asyncio.to_thread(
                    chapter_pdf, pdf, ctx.chapter.page_start, ctx.chapter.page_end
                )
            except UnreadablePdf as e:
                raise ChapterUnavailable(422, "The PDF could not be opened.") from e
        document: dict[str, object] = {
            "type": "document",
            "source": {
                "type": "base64",
                "media_type": "application/pdf",
                "data": base64.standard_b64encode(sliced).decode("ascii"),
            },
            "title": f"{ctx.book.title} — {ctx.chapter.title}",
            "citations": {"enabled": True},
            "cache_control": {"type": "ephemeral"},
        }
        offset = ctx.chapter.page_start - 1

        def pages_of(citation: Any) -> Sequence[int]:
            if getattr(citation, "type", None) != "page_location":
                return ()
            start = int(getattr(citation, "start_page_number", 0) or 0)
            end = int(getattr(citation, "end_page_number", start) or start)
            # end_page_number is exclusive in the API; a one-page citation has end = start + 1.
            last = max(start, end - 1)
            return [offset + p for p in range(start, last + 1) if start >= 1]

        return await answer_with_documents(self.client, [document], pages_of, question, history)
