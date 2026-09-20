"""
A page of a book as an image (#240): rendered from the PDF the first time
anyone asks, kept in Storage beside the crops, and answered from there
after. The Next.js side signs the path like a crop's.

The PDF is read as the player, with the session token, so a page of
someone else's book is a 404 before it is anything else (the route checks
ownership; this only renders). A player stepping through a chapter asks
for one page after another, so the PDF just fetched is kept in memory for
a while — a whole book at up to 100 MB is not something to download once
per page.
"""

import asyncio
import logging
import posixpath
import time
from collections import OrderedDict
from dataclasses import dataclass, field

import pymupdf

from app.ingest.pdf import PARSE_RENDER_DPI, UnreadablePdf, open_pdf, render_page_png
from app.repo import BookRepo, BookRow
from app.storage import StorageClient, StorageError

log = logging.getLogger("book-service")

# Legible at any zoom the panel offers, and the size the parse already reads at.
PAGE_IMAGE_DPI = PARSE_RENDER_DPI
# For eyes, not for the model: a JPEG at this quality is a third of the PNG
# and reads the same on screen. (Crops stay PNG — they are what the reader saw.)
PAGE_IMAGE_JPEG_QUALITY = 82
# How long, and how much, of recently fetched PDFs to keep for the next page.
PDF_CACHE_SECONDS = 600
PDF_CACHE_BYTES = 256 * 1024 * 1024


class PageImageError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def page_image_path(storage_path: str, book_id: str, page: int) -> str:
    """Beside the PDF, one folder per book: `<user>/pages/<book>/p0206.jpg`."""
    return posixpath.join(posixpath.dirname(storage_path), "pages", book_id, f"p{page:04d}.jpg")


class PdfCache:
    """
    The last few PDFs fetched, by book id, for a bounded time and size —
    newest kept, oldest dropped. One process, one dict; nothing survives a
    restart, and nothing needs to.
    """

    def __init__(
        self, seconds: float = PDF_CACHE_SECONDS, max_bytes: int = PDF_CACHE_BYTES
    ) -> None:
        self._seconds = seconds
        self._max_bytes = max_bytes
        self._entries: OrderedDict[str, tuple[float, bytes]] = OrderedDict()

    def get(self, book_id: str) -> bytes | None:
        entry = self._entries.get(book_id)
        if entry is None:
            return None
        stored, pdf = entry
        if time.monotonic() - stored > self._seconds:
            del self._entries[book_id]
            return None
        self._entries.move_to_end(book_id)
        return pdf

    def put(self, book_id: str, pdf: bytes) -> None:
        if len(pdf) > self._max_bytes:
            return
        self._entries[book_id] = (time.monotonic(), pdf)
        self._entries.move_to_end(book_id)
        while sum(len(p) for _, p in self._entries.values()) > self._max_bytes:
            self._entries.popitem(last=False)


@dataclass(frozen=True)
class PageImages:
    storage: StorageClient
    repo: BookRepo
    # Shared with the scanner and the parser: one PyMuPDF render at a time.
    worker: asyncio.Semaphore
    pdfs: PdfCache = field(default_factory=PdfCache)

    async def get_or_render(self, book: BookRow, page: int, token: str) -> str:
        """The stored path when there is one; otherwise render, store, remember, return."""
        cached = await self.repo.get_page_image(book.id, page)
        if cached:
            return cached
        pdf = self.pdfs.get(book.id)
        if pdf is None:
            try:
                pdf = await self.storage.download(book.storage_path, token)
            except StorageError as e:
                raise PageImageError(502, f"Storage: {e.message}") from e
            self.pdfs.put(book.id, pdf)
        async with self.worker:
            try:
                jpeg = await asyncio.to_thread(_render, pdf, page)
            except UnreadablePdf as e:
                raise PageImageError(422, "The PDF could not be opened.") from e
            except IndexError as e:
                raise PageImageError(404, f"The PDF has no page {page}.") from e
        path = page_image_path(book.storage_path, book.id, page)
        try:
            await self.storage.upload_image(path, jpeg, token, "image/jpeg")
        except StorageError as e:
            raise PageImageError(502, f"Storage: {e.message}") from e
        await self.repo.set_page_image(book.id, page, path)
        log.info("page image %s p%d rendered → %s (%d bytes)", book.id, page, path, len(jpeg))
        return path


def _render(pdf: bytes, page: int) -> bytes:
    with open_pdf(pdf) as doc:
        if page > len(doc):
            raise IndexError(page)
        png = render_page_png(doc, page, PAGE_IMAGE_DPI)
    return pymupdf.Pixmap(png).tobytes("jpeg", jpg_quality=PAGE_IMAGE_JPEG_QUALITY)
