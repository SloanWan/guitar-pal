"""
The chapter parse, as the background job `POST …/chapters/{id}/parse` starts.

Load the chapter's pages from the scan → download the PDF as the player and
render the pages the graph will look at → run the graph (classify, extract,
notes; `app/graph/`) → write notes, exercises and chunks in one transaction
with what it cost. Any failure marks the chapter `failed` with a message;
a crash mid-way is what `fail_stale_scans` cleans up at the next start.

Which pages get an image: every page without a text layer (OCR text cannot
carry notation, so the model has to see it) and every page the scan tagged
`may_have_exercise`. A prose page with a text layer is classified from its
text alone — that is the cheap call the epic asks for. The image is the
classifier's size; an extractor re-renders its page at reading size through
`ParseTools`, which also puts the crop it read beside the PDF in Storage so
the chapter card can show it.
"""

import asyncio
import logging
import posixpath
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Protocol

import pymupdf

from app.ingest.pdf import (
    CLASSIFY_RENDER_DPI,
    UnreadablePdf,
    crop_page_png,
    open_pdf,
    render_page_png,
)
from app.repo import (
    BookRow,
    ChapterRow,
    ChunkRecord,
    ExerciseRecord,
    NoteRecord,
    PageRow,
    Usage,
)
from app.storage import StorageClient, StorageError, sweep_folders
from app.validate import ValidatorError

log = logging.getLogger("book-service")

# The cost guard: above this the client is told to split the chapter.
MAX_PARSE_PAGES = 40

MISSING_FILE_MESSAGE = "The PDF was not found in Storage. Upload the book again."
UNREADABLE_MESSAGE = "The file could not be opened as a PDF."
NO_PAGES_MESSAGE = "The chapter's pages were not found. Rescan the book."
VALIDATOR_MESSAGE = "The draft validator could not be reached. Try again."
FAILED_MESSAGE = "The parse failed. Try again."


@dataclass(frozen=True)
class ParsePage:
    """One page as the graph sees it: the scan's text, and an image when it needs one."""

    page: int
    text: str
    has_text_layer: bool
    may_have_exercise: bool
    image: bytes | None

    @property
    def needs_image(self) -> bool:
        return not self.has_text_layer or self.may_have_exercise


@dataclass
class ChapterResult:
    notes: list[NoteRecord] = field(default_factory=list)
    exercises: list[ExerciseRecord] = field(default_factory=list)
    chunks: list[ChunkRecord] = field(default_factory=list)
    usage: Usage = field(default_factory=Usage)
    # Chapter-level warnings: a draft dropped after repair, a page skipped.
    warnings: list[dict[str, object]] = field(default_factory=list)


Region = tuple[float, float, float, float]


class PageRenderer(Protocol):
    """A page, or part of one, at the dpi an extractor reads at."""

    async def render(self, page: int, region: Region | None, dpi: int) -> bytes: ...


class CropSink(Protocol):
    """Keeps the crop an extractor read, and says where; None when it could not."""

    async def save(self, name: str, png: bytes) -> str | None: ...


@dataclass(frozen=True)
class ParseTools:
    renderer: PageRenderer
    crops: CropSink


class ChapterGraph(Protocol):
    """What turns a chapter's pages into its results. `app/graph/` is the real one."""

    async def __call__(
        self,
        book: BookRow,
        chapter: ChapterRow,
        pages: Sequence[ParsePage],
        tools: ParseTools | None = None,
    ) -> ChapterResult: ...


class ParseStore(Protocol):
    """The slice of `BookRepo` the job uses."""

    async def list_pages(self, book_id: str, page_start: int, page_end: int) -> list[PageRow]: ...

    async def finish_parse(
        self,
        chapter_id: str,
        *,
        notes: Sequence[NoteRecord],
        exercises: Sequence[ExerciseRecord],
        chunks: Sequence[ChunkRecord],
        usage: Usage,
        warnings: Sequence[dict[str, object]] = (),
    ) -> None: ...

    async def fail_parse(
        self, chapter_id: str, message: str, usage: Usage | None = None
    ) -> None: ...


def page_needs_image(page: PageRow) -> bool:
    return page.text_source != "layer" or page.may_have_exercise


def chunks_from_pages(pages: Sequence[PageRow]) -> list[ChunkRecord]:
    """One chunk per page for now; #203 decides whether it wants finer pieces."""
    return [ChunkRecord(page=p.page, index=0, text=p.text) for p in pages if p.text.strip()]


@dataclass
class Parser:
    storage: StorageClient
    store: ParseStore
    graph: ChapterGraph
    worker: asyncio.Semaphore

    async def run(self, book: BookRow, chapter: ChapterRow, token: str) -> None:
        try:
            await self._parse(book, chapter, token)
        except StorageError as e:
            log.warning("parse %s: storage %s %s", chapter.id, e.status, e.message)
            await self.store.fail_parse(
                chapter.id, MISSING_FILE_MESSAGE if e.status == 404 else f"Storage: {e.message}"
            )
        except _ParseFailed as e:
            await self.store.fail_parse(chapter.id, e.message)
        except ValidatorError as e:
            log.error("parse %s: %s", chapter.id, e)
            await self.store.fail_parse(chapter.id, VALIDATOR_MESSAGE)
        except Exception:
            log.exception("parse %s failed", chapter.id)
            await self.store.fail_parse(chapter.id, FAILED_MESSAGE)

    async def _parse(self, book: BookRow, chapter: ChapterRow, token: str) -> None:
        rows = await self.store.list_pages(book.id, chapter.page_start, chapter.page_end)
        if not rows:
            raise _ParseFailed(NO_PAGES_MESSAGE)

        wanted = [r.page for r in rows if page_needs_image(r)]
        images: dict[int, bytes] = {}
        tools: ParseTools | None = None
        pdf: bytes | None = None
        if wanted:
            pdf = await self.storage.download(book.storage_path, token)
            async with self.worker:
                images = await asyncio.to_thread(_render, pdf, wanted)

        pages = [
            ParsePage(
                page=r.page,
                text=r.text,
                has_text_layer=r.text_source == "layer",
                may_have_exercise=r.may_have_exercise,
                image=images.get(r.page),
            )
            for r in rows
        ]
        if pdf is not None:
            folder = crops_folder(book.storage_path, chapter.id)
            # A re-parse starts from an empty folder (#246): crops are named by
            # page and ordinal, so a parse that finds fewer exercises than the
            # last one would otherwise leave the extra ones behind.
            await sweep_folders(self.storage, [folder], token, f"parse {chapter.id}")
            crops = StorageCropSink(self.storage, folder, token)
            try:
                with open_pdf(pdf) as doc:
                    tools = ParseTools(DocRenderer(doc, self.worker), crops)
                    result = await self.graph(book, chapter, pages, tools)
            except UnreadablePdf as e:
                raise _ParseFailed(UNREADABLE_MESSAGE) from e
        else:
            result = await self.graph(book, chapter, pages)
        if not result.chunks:
            result.chunks = chunks_from_pages(rows)

        await self.store.finish_parse(
            chapter.id,
            notes=result.notes,
            exercises=result.exercises,
            chunks=result.chunks,
            usage=result.usage,
            warnings=result.warnings,
        )
        log.info(
            "parse %s: %d pages (%d with images), %d notes, %d exercises, %d warnings,"
            " %d/%d tokens, $%.4f",
            chapter.id,
            len(pages),
            len(images),
            len(result.notes),
            len(result.exercises),
            len(result.warnings),
            result.usage.input_tokens,
            result.usage.output_tokens,
            result.usage.cost_usd,
        )


class _ParseFailed(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def crops_folder(storage_path: str, chapter_id: str) -> str:
    """Crops live beside the PDF, one folder per chapter, replaced on re-parse."""
    return posixpath.join(posixpath.dirname(storage_path), "crops", chapter_id)


@dataclass(frozen=True)
class DocRenderer:
    """`PageRenderer` over an open PyMuPDF document, one render at a time."""

    doc: pymupdf.Document
    worker: asyncio.Semaphore

    async def render(self, page: int, region: Region | None, dpi: int) -> bytes:
        async with self.worker:
            if region is None:
                return await asyncio.to_thread(render_page_png, self.doc, page, dpi)
            return await asyncio.to_thread(crop_page_png, self.doc, page, region, dpi)


@dataclass(frozen=True)
class StorageCropSink:
    """`CropSink` into Supabase Storage. A failed upload costs the thumbnail, not the draft."""

    storage: StorageClient
    folder: str
    token: str

    async def save(self, name: str, png: bytes) -> str | None:
        path = posixpath.join(self.folder, name)
        try:
            await self.storage.upload_png(path, png, self.token)
        except StorageError as e:
            log.warning("crop %s not stored: %s %s", path, e.status, e.message)
            return None
        return path


def _render(pdf: bytes, pages: Sequence[int]) -> dict[int, bytes]:
    try:
        with open_pdf(pdf) as doc:
            return {n: render_page_png(doc, n, CLASSIFY_RENDER_DPI) for n in pages if n <= len(doc)}
    except UnreadablePdf as e:
        raise _ParseFailed(UNREADABLE_MESSAGE) from e


async def text_only_graph(
    book: BookRow,
    chapter: ChapterRow,
    pages: Sequence[ParsePage],
    tools: ParseTools | None = None,
) -> ChapterResult:
    """No model at all: chunks from the text, nothing else. What runs without an API key."""
    return ChapterResult(
        chunks=[ChunkRecord(page=p.page, index=0, text=p.text) for p in pages if p.text.strip()]
    )
