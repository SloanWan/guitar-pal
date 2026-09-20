"""
`/books`: the routes the Next.js proxy forwards. Thin: validate, call the
repo, hand the long job to the scanner. Every handler starts from the
verified session, and every repo call takes its `user_id`.
"""

import logging
from datetime import datetime
from typing import Annotated, Literal

import asyncpg
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.auth import CurrentSession
from app.db import get_pool
from app.ingest.toc import MAX_TITLE_CHARS, Chapter
from app.pages import PageImageError, PageImages, pages_folder
from app.parse import MAX_PARSE_PAGES, Parser, crops_folder
from app.repo import BookRepo, BookRow, ChapterRow, ExerciseRow, NoteRow
from app.scan import Scanner
from app.storage import StorageClient, StorageError

log = logging.getLogger("book-service")

router = APIRouter(prefix="/books", tags=["books"])

# --- request / response shapes ------------------------------------------------


class CreateBook(BaseModel):
    title: str = Field(min_length=1, max_length=MAX_TITLE_CHARS)


class RenameBook(BaseModel):
    title: str = Field(min_length=1, max_length=MAX_TITLE_CHARS)


class ChapterRange(BaseModel):
    title: str = Field(min_length=1, max_length=MAX_TITLE_CHARS)
    page_start: int = Field(ge=1)
    page_end: int = Field(ge=1)


class ReplaceChapters(BaseModel):
    chapters: list[ChapterRange] = Field(min_length=1)


class BookOut(BaseModel):
    id: str
    title: str
    page_count: int | None
    storage_path: str
    status: Literal["uploaded", "scanning", "ready", "failed"]
    toc_source: Literal["outline", "text", "vision", "manual"] | None
    error: str | None
    scanned_pages: int
    created_at: datetime

    @classmethod
    def of(cls, row: BookRow) -> "BookOut":
        return cls(
            id=row.id,
            title=row.title,
            page_count=row.page_count,
            storage_path=row.storage_path,
            status=row.status,
            toc_source=row.toc_source,
            error=row.error,
            scanned_pages=row.scanned_pages,
            created_at=row.created_at,
        )


class ParseCost(BaseModel):
    input_tokens: int
    output_tokens: int
    usd: float


class ChapterOut(BaseModel):
    id: str
    index: int
    title: str
    page_start: int
    page_end: int
    exercise_hint_count: int
    parsed_at: datetime | None
    parse_status: Literal["idle", "parsing", "ready", "failed"]
    parse_error: str | None
    parse_cost: ParseCost
    parse_warnings: list[dict[str, object]]

    @classmethod
    def of(cls, row: ChapterRow) -> "ChapterOut":
        return cls(
            id=row.id,
            index=row.index,
            title=row.title,
            page_start=row.page_start,
            page_end=row.page_end,
            exercise_hint_count=row.exercise_hint_count,
            parsed_at=row.parsed_at,
            parse_status=row.parse_status,
            parse_error=row.parse_error,
            parse_cost=ParseCost(
                input_tokens=row.parse_input_tokens,
                output_tokens=row.parse_output_tokens,
                usd=row.parse_cost_usd,
            ),
            parse_warnings=list(row.parse_warnings),
        )


class BookDetail(BookOut):
    chapters: list[ChapterOut]


class NoteOut(BaseModel):
    id: str
    title: str
    body: str
    pages: list[int]
    draft_ids: list[str]

    @classmethod
    def of(cls, row: NoteRow) -> "NoteOut":
        return cls(
            id=row.id,
            title=row.title,
            body=row.body,
            pages=list(row.pages),
            draft_ids=list(row.draft_ids),
        )


class ExerciseOut(BaseModel):
    id: str
    page: int
    kind: Literal["strum", "progression", "tab", "chord_diagram"]
    source: Literal["literal", "derived"]
    draft: dict[str, object]
    warnings: list[dict[str, object]]
    crop_path: str | None
    status: Literal["proposed", "taken", "dismissed"]

    @classmethod
    def of(cls, row: ExerciseRow) -> "ExerciseOut":
        return cls(
            id=row.id,
            page=row.page,
            kind=row.kind,
            source=row.source,
            draft=row.draft,
            warnings=row.warnings,
            crop_path=row.crop_path,
            status=row.status,
        )


class ChapterParse(BaseModel):
    """The chapter card: the chapter's parse state and, once ready, what it produced."""

    chapter: ChapterOut
    notes: list[NoteOut]
    exercises: list[ExerciseOut]


# --- the manual ranges ----------------------------------------------------------


def validate_ranges(ranges: list[ChapterRange], page_count: int) -> list[Chapter]:
    """
    The player's own chapters: in page order, inside the book, not
    overlapping. Gaps are allowed — pages nobody wants parsed are fine —
    and titles are the player's, kept as typed.
    """
    chapters: list[Chapter] = []
    previous_end = 0
    for r in sorted(ranges, key=lambda r: r.page_start):
        if r.page_end < r.page_start:
            raise HTTPException(422, f"'{r.title}' ends before it starts.")
        if r.page_end > page_count:
            raise HTTPException(422, f"'{r.title}' runs past page {page_count}.")
        if r.page_start <= previous_end:
            raise HTTPException(422, f"'{r.title}' overlaps the chapter before it.")
        chapters.append(Chapter(" ".join(r.title.split()), r.page_start, r.page_end))
        previous_end = r.page_end
    return chapters


# --- dependencies ------------------------------------------------------------------


def get_repo(pool: Annotated[asyncpg.Pool, Depends(get_pool)]) -> BookRepo:
    return BookRepo(pool)


def get_storage(request: Request) -> StorageClient:
    storage = getattr(request.app.state, "storage", None)
    if storage is None:
        raise HTTPException(503, "Book import is not configured on this deployment (no Storage).")
    return storage


def get_scanner(request: Request) -> Scanner:
    scanner = getattr(request.app.state, "scanner", None)
    if scanner is None:
        raise HTTPException(503, "Book import is not configured on this deployment.")
    return scanner


def get_parser(request: Request) -> Parser:
    parser = getattr(request.app.state, "parser", None)
    if parser is None:
        raise HTTPException(503, "Book import is not configured on this deployment.")
    return parser


def get_pages(request: Request) -> PageImages:
    pages = getattr(request.app.state, "pages", None)
    if pages is None:
        raise HTTPException(503, "Book import is not configured on this deployment.")
    return pages


Repo = Annotated[BookRepo, Depends(get_repo)]
Storage = Annotated[StorageClient, Depends(get_storage)]


async def owned_book(repo: BookRepo, user_id: str, book_id: str) -> BookRow:
    book = await repo.get_book(user_id, book_id)
    if book is None:
        # Another user's book and a book that does not exist look the same.
        raise HTTPException(404, "Book not found.")
    return book


async def owned_chapter(
    repo: BookRepo, user_id: str, book_id: str, chapter_id: str
) -> tuple[BookRow, ChapterRow]:
    found = await repo.get_chapter(user_id, chapter_id)
    if found is None or found[0].id != book_id:
        raise HTTPException(404, "Chapter not found.")
    return found


# --- routes ------------------------------------------------------------------


@router.post("", status_code=201, response_model=BookOut)
async def create_book(body: CreateBook, session: CurrentSession, repo: Repo) -> BookOut:
    """
    The row first, so the browser knows the path to upload to. The upload
    itself goes straight to Storage with the player's session, then
    `POST /books/{id}/scan`.
    """
    return BookOut.of(await repo.create_book(session.user_id, body.title.strip()))


@router.get("", response_model=list[BookOut])
async def list_books(session: CurrentSession, repo: Repo) -> list[BookOut]:
    return [BookOut.of(b) for b in await repo.list_books(session.user_id)]


@router.get("/{book_id}", response_model=BookDetail)
async def get_book(book_id: str, session: CurrentSession, repo: Repo) -> BookDetail:
    book = await owned_book(repo, session.user_id, book_id)
    chapters = await repo.list_chapters(book.id)
    return BookDetail(
        **BookOut.of(book).model_dump(), chapters=[ChapterOut.of(c) for c in chapters]
    )


@router.patch("/{book_id}", response_model=BookOut)
async def rename_book(
    book_id: str, body: RenameBook, session: CurrentSession, repo: Repo
) -> BookOut:
    """The title starts as the upload's file name; this is the player fixing it."""
    book = await repo.rename_book(session.user_id, book_id, body.title.strip())
    if book is None:
        raise HTTPException(404, "Book not found.")
    return BookOut.of(book)


@router.post("/{book_id}/scan", status_code=202, response_model=BookOut)
async def scan_book(
    book_id: str,
    session: CurrentSession,
    repo: Repo,
    scanner: Annotated[Scanner, Depends(get_scanner)],
    background: BackgroundTasks,
) -> BookOut:
    """
    Schedules the whole-book pass; poll `GET /books/{id}` for progress. A
    book already scanning answers 409 rather than starting a second job.
    """
    await owned_book(repo, session.user_id, book_id)
    book = await repo.start_scan(session.user_id, book_id)
    if book is None:
        raise HTTPException(409, "This book is being scanned already.")
    # The scan reads the PDF with this same session token; a token that
    # expires mid-scan only matters for the download, which happens first.
    background.add_task(scanner.run, book.id, book.storage_path, session.token)
    return BookOut.of(book)


@router.put("/{book_id}/chapters", response_model=BookDetail)
async def replace_chapters(
    book_id: str, body: ReplaceChapters, session: CurrentSession, repo: Repo
) -> BookDetail:
    book = await owned_book(repo, session.user_id, book_id)
    if book.status == "scanning":
        raise HTTPException(409, "Wait for the scan to finish before editing chapters.")
    if book.page_count is None:
        raise HTTPException(409, "Scan the book first, so its page count is known.")
    await repo.replace_chapters(book.id, validate_ranges(body.chapters, book.page_count))
    return await get_book(book_id, session, repo)


@router.get("/{book_id}/chapters/{chapter_id}/parse", response_model=ChapterParse)
async def get_chapter_parse(
    book_id: str, chapter_id: str, session: CurrentSession, repo: Repo
) -> ChapterParse:
    """Status while parsing; the card once ready. Poll this."""
    _, chapter = await owned_chapter(repo, session.user_id, book_id, chapter_id)
    return ChapterParse(
        chapter=ChapterOut.of(chapter),
        notes=[NoteOut.of(n) for n in await repo.list_notes(chapter.id)],
        exercises=[ExerciseOut.of(e) for e in await repo.list_exercises(chapter.id)],
    )


@router.post("/{book_id}/chapters/{chapter_id}/parse", status_code=202, response_model=ChapterOut)
async def parse_chapter(
    book_id: str,
    chapter_id: str,
    session: CurrentSession,
    repo: Repo,
    parser: Annotated[Parser, Depends(get_parser)],
    background: BackgroundTasks,
) -> ChapterOut:
    """
    Schedules the chapter parse. Re-parsing a `ready` or `failed` chapter is
    allowed and replaces what it produced; a chapter over the page cap is
    refused with the number, so the client can offer the range editor.
    """
    book, chapter = await owned_chapter(repo, session.user_id, book_id, chapter_id)
    if book.status != "ready":
        raise HTTPException(409, "Scan the book first.")
    pages = chapter.page_end - chapter.page_start + 1
    if pages > MAX_PARSE_PAGES:
        raise HTTPException(
            422,
            f"This chapter is {pages} pages; the parse takes at most {MAX_PARSE_PAGES}."
            " Split it into shorter chapters first.",
        )
    claimed = await repo.start_parse(chapter.id)
    if claimed is None:
        raise HTTPException(409, "This chapter is being parsed already.")
    background.add_task(parser.run, book, claimed, session.token)
    return ChapterOut.of(claimed)


class PageImageOut(BaseModel):
    """A Storage path in the player's own folder; the browser signs it like a crop's."""

    path: str


@router.get("/{book_id}/pages/{page}/image", response_model=PageImageOut)
async def get_page_image(
    book_id: str,
    page: int,
    session: CurrentSession,
    repo: Repo,
    pages: Annotated[PageImages, Depends(get_pages)],
) -> PageImageOut:
    """
    The page as printed, for reading a note or a draft against its source
    (#240). Rendered on the first request and kept, so a second look is only
    a signed URL. Any page of the book, parsed or not.
    """
    book = await owned_book(repo, session.user_id, book_id)
    if book.page_count is None:
        raise HTTPException(409, "Scan the book first, so its page count is known.")
    if not 1 <= page <= book.page_count:
        raise HTTPException(404, f"The book has pages 1–{book.page_count}.")
    try:
        return PageImageOut(path=await pages.get_or_render(book, page, session.token))
    except PageImageError as e:
        raise HTTPException(e.status, e.message) from e


class ExerciseStatusIn(BaseModel):
    status: Literal["proposed", "taken", "dismissed"]


@router.patch("/{book_id}/exercises/{exercise_id}", response_model=ExerciseOut)
async def set_exercise_status(
    book_id: str,
    exercise_id: str,
    body: ExerciseStatusIn,
    session: CurrentSession,
    repo: Repo,
) -> ExerciseOut:
    """`taken` when a draft was opened in its editor, so the card shows what was used."""
    row = await repo.set_exercise_status(session.user_id, exercise_id, body.status)
    if row is None:
        raise HTTPException(404, "Draft not found.")
    return ExerciseOut.of(row)


@router.delete("/{book_id}", status_code=204)
async def delete_book(book_id: str, session: CurrentSession, repo: Repo, storage: Storage) -> None:
    """
    The PDF first, as the player; then what was written beside it — the
    page images and every chapter's crops (#243); then the row, and every
    row under it. A folder that will not clear is logged and left: the
    book is gone either way, and the leftovers can be swept later.
    """
    book = await owned_book(repo, session.user_id, book_id)
    try:
        await storage.delete(book.storage_path, session.token)
    except StorageError as e:
        raise HTTPException(502, f"Storage: {e.message}") from e
    folders = [pages_folder(book.storage_path, book.id)] + [
        crops_folder(book.storage_path, c.id) for c in await repo.list_chapters(book.id)
    ]
    for folder in folders:
        try:
            await storage.remove_tree(folder, session.token)
        except StorageError as e:
            log.warning("delete %s: %s left behind: %s %s", book.id, folder, e.status, e.message)
    await repo.delete_book(session.user_id, book_id)
