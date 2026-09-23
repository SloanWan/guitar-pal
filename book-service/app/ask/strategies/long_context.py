"""
`long_context`: the whole chapter in the prompt, one way or the other.

Two shapes, chosen by what can actually be read (calibration §8):

- **The PDF, cited.** Only when the provider reads `document` blocks *and*
  every page of the chapter carries a text layer. The chapter's pages are
  cut out of the book's PDF into one document block with citations on and
  the cache mark, and the pages come off the API's `page_location`
  citations. This is the exact path, and it is the typeset case.
- **Labelled pages.** Everything else — every scanned chapter, and every
  DeepSeek call. A PDF's citations are built from its text layer, so a scan
  yields none however well the model reads the page images; the chapter
  goes over as the scan's own text, `[Page N]` at a time, and the pages
  come from what was sent.

There is no retrieval step either way: the whole chapter is in front of the
model, and what it did not cover is what the answer step says it did not.
"""

import asyncio
import base64
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

import pymupdf

from app.ask.provider import Provider
from app.ask.strategies.cited import AnswerRequest, answer_call, labelled_pages
from app.ask.types import Answer, AskContext, AskTurn, Retrieval
from app.ingest.pdf import UnreadablePdf, open_pdf
from app.pages import PdfCache
from app.storage import StorageClient

log = logging.getLogger("book-service")

# A page of OCR past this is not what an answer turns on; keeps a 40-page
# chapter inside a sane prompt.
MAX_PAGE_CHARS = 8_000


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


def has_text_layer(ctx: AskContext) -> bool:
    """Whether every page of the chapter carries text the PDF itself can be cited on."""
    pages = [p for p in ctx.pages if ctx.chapter.page_start <= p.page <= ctx.chapter.page_end]
    return bool(pages) and all(p.text_source == "layer" for p in pages)


def chapter_pages(ctx: AskContext) -> list[tuple[int, str]]:
    """The chapter's pages with text, in order, each capped."""
    return [
        (p.page, p.text.strip()[:MAX_PAGE_CHARS])
        for p in ctx.pages
        if ctx.chapter.page_start <= p.page <= ctx.chapter.page_end and p.text.strip()
    ]


@dataclass
class LongContextStrategy:
    provider: Provider
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
        if self.provider.documents and has_text_layer(ctx):
            request = await self._pdf_request(ctx)
        else:
            pages = chapter_pages(ctx)
            if not pages:
                raise ChapterUnavailable(
                    409, "This chapter has no readable text. Rescan the book, then parse it."
                )
            log.info(
                "ask long_context: %d page(s) as text (%s)",
                len(pages),
                "provider reads no documents" if not self.provider.documents else "no text layer",
            )
            request = labelled_pages(pages)
        return await answer_call(self.provider, request, question, history)

    async def _pdf_request(self, ctx: AskContext) -> AnswerRequest:
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
            if start < 1:
                return ()
            end = int(getattr(citation, "end_page_number", start) or start)
            # end_page_number is exclusive: a one-page citation has end = start + 1.
            return [offset + p for p in range(start, max(start, end - 1) + 1)]

        return AnswerRequest(blocks=[document], pages_of=pages_of)
