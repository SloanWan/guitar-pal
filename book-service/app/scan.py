"""
The whole-book scan, as the background job `POST /books/{id}/scan` starts.

Download the PDF as the player → read every page (OCR where there is no
text layer) → tag pages → find chapters → write it all in one transaction.
Any failure marks the book `failed` with a message the player can act on;
a crash mid-way is what `fail_stale_scans` cleans up at the next start.

PyMuPDF and Tesseract are CPU-bound and synchronous, so the page loop runs
in a worker thread behind a semaphore of one — two uploads at once queue
rather than fight for the core — while the event loop keeps answering
status polls with the progress the loop reports every few pages.
"""

import asyncio
import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Protocol

from app.ingest.pdf import (
    OcrConfig,
    OutlineEntry,
    PageText,
    UnreadablePdf,
    extract_page,
    open_pdf,
    read_outline,
    render_page_png,
)
from app.ingest.tag import tag_text
from app.ingest.toc import (
    Chapter,
    TextTocReader,
    TocSource,
    VisionTocReader,
    find_chapters,
    is_scanned,
    vision_toc_pages,
)
from app.repo import PageRecord
from app.storage import StorageClient, StorageError, sweep_folders

log = logging.getLogger("book-service")

PROGRESS_EVERY_PAGES = 5
MISSING_FILE_MESSAGE = "The PDF was not found in Storage. Upload it again."
EMPTY_PDF_MESSAGE = "The PDF has no pages."
UNREADABLE_MESSAGE = "The file could not be opened as a PDF."
FAILED_MESSAGE = "The scan failed. Try again, or draw the chapter ranges by hand."


class ScanStore(Protocol):
    """The slice of `BookRepo` the job writes through."""

    async def set_scan_progress(
        self, book_id: str, page_count: int, scanned_pages: int
    ) -> None: ...

    async def finish_scan(
        self,
        book_id: str,
        *,
        page_count: int,
        toc_source: TocSource,
        chapters: Sequence[Chapter],
        pages: Sequence[PageRecord],
    ) -> None: ...

    async def fail_scan(self, book_id: str, message: str) -> None: ...


@dataclass
class Scanner:
    storage: StorageClient
    store: ScanStore
    ocr: OcrConfig | None
    read_text_toc: TextTocReader | None
    read_vision_toc: VisionTocReader | None
    worker: asyncio.Semaphore

    async def run(
        self,
        book_id: str,
        storage_path: str,
        token: str,
        stale_folders: Sequence[str] = (),
    ) -> None:
        """
        `stale_folders` are what a rescan replaces beside the PDF — the old
        chapters' crops, the page images (#246). They go right before the new
        rows are written, so a scan that fails leaves the old book whole.
        """
        try:
            await self._scan(book_id, storage_path, token, stale_folders)
        except StorageError as e:
            log.warning("scan %s: storage %s %s", book_id, e.status, e.message)
            await self.store.fail_scan(
                book_id, MISSING_FILE_MESSAGE if e.status == 404 else f"Storage: {e.message}"
            )
        except _ScanFailed as e:
            await self.store.fail_scan(book_id, e.message)
        except Exception:
            log.exception("scan %s failed", book_id)
            await self.store.fail_scan(book_id, FAILED_MESSAGE)

    async def _scan(
        self, book_id: str, storage_path: str, token: str, stale_folders: Sequence[str]
    ) -> None:
        pdf = await self.storage.download(storage_path, token)
        loop = asyncio.get_running_loop()

        def report(page_count: int, scanned: int) -> None:
            # Called from the worker thread; the write happens on the loop.
            asyncio.run_coroutine_threadsafe(
                self.store.set_scan_progress(book_id, page_count, scanned), loop
            )

        async with self.worker:
            outline, pages, thumbnails = await asyncio.to_thread(
                _read_book, pdf, self.ocr, report, self.read_vision_toc is not None
            )
        if not pages:
            raise _ScanFailed(EMPTY_PDF_MESSAGE)

        result = await find_chapters(
            outline=outline,
            pages=pages,
            read_text_toc=self.read_text_toc,
            read_vision_toc=self.read_vision_toc,
            render_page=thumbnails.get if thumbnails else None,
        )
        records = [
            PageRecord(
                page=p.page,
                text=p.text,
                text_source=p.text_source,
                may_have_exercise=tag_text(p.text).may_have_exercise,
            )
            for p in pages
        ]
        await sweep_folders(self.storage, stale_folders, token, f"scan {book_id}")
        await self.store.finish_scan(
            book_id,
            page_count=len(pages),
            toc_source=result.source,
            chapters=result.chapters,
            pages=records,
        )
        log.info(
            "scan %s: %d pages, chapters from %s (%d), %d tagged",
            book_id,
            len(pages),
            result.source,
            len(result.chapters),
            sum(1 for r in records if r.may_have_exercise),
        )


class _ScanFailed(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _read_book(
    pdf: bytes,
    ocr: OcrConfig | None,
    report: Callable[[int, int], None],
    want_thumbnails: bool,
) -> tuple[list[OutlineEntry], list[PageText], dict[int, bytes]]:
    """The synchronous part, in the worker thread: every page, with progress."""
    try:
        with open_pdf(pdf) as doc:
            page_count = len(doc)
            # The page count first, so the status shows `0 / N` before the
            # first (slow, OCR'd) page rather than nothing for a while.
            report(page_count, 0)
            outline = read_outline(doc)
            pages: list[PageText] = []
            for index, page in enumerate(doc, start=1):
                pages.append(extract_page(page, index, ocr))
                if index % PROGRESS_EVERY_PAGES == 0:
                    report(page_count, index)
            # The vision-TOC step sees a scan's front matter only; rendered
            # here, while the document is open, when there is a reader for it.
            thumbnails: dict[int, bytes] = {}
            if want_thumbnails and pages and is_scanned(pages):
                thumbnails = {n: render_page_png(doc, n) for n in vision_toc_pages(pages)}
            return outline, pages, thumbnails
    except UnreadablePdf as e:
        raise _ScanFailed(UNREADABLE_MESSAGE) from e
