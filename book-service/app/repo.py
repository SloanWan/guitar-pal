"""
The book tables, as plain SQL over the asyncpg pool. Every query that reads
or writes a book takes the verified `user_id` and filters by it — that filter
is the ownership check (see README, "Ownership"); nothing here trusts a
book id on its own.

Rows come back as dataclasses so the routes and the scan job share one
shape and the tests can build them without a database.
"""

import json
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

import asyncpg

from app.ingest.pdf import TextSource
from app.ingest.toc import Chapter, TocSource

BookStatus = Literal["uploaded", "scanning", "ready", "failed"]
ParseStatus = Literal["idle", "parsing", "ready", "failed"]
ExerciseKind = Literal["strum", "progression", "tab", "chord_diagram"]
ExerciseSource = Literal["literal", "derived"]
ExerciseStatus = Literal["proposed", "taken", "dismissed"]


@dataclass(frozen=True)
class BookRow:
    id: str
    user_id: str
    title: str
    page_count: int | None
    storage_path: str
    status: BookStatus
    toc_source: TocSource | None
    error: str | None
    scanned_pages: int
    created_at: datetime


@dataclass(frozen=True)
class ChapterRow:
    id: str
    index: int
    title: str
    page_start: int
    page_end: int
    exercise_hint_count: int
    parsed_at: datetime | None
    parse_status: ParseStatus
    parse_error: str | None
    parse_input_tokens: int
    parse_output_tokens: int
    parse_cost_usd: float
    parse_warnings: list[dict[str, object]]


@dataclass(frozen=True)
class PageRow:
    """One `book_pages` row as the parse reads it back."""

    page: int
    text: str
    text_source: TextSource
    may_have_exercise: bool


@dataclass(frozen=True)
class NoteRecord:
    """A knowledge point as the parse produced it; `draft_ids` are filled after exercises exist."""

    title: str
    body: str
    pages: tuple[int, ...]


@dataclass(frozen=True)
class NoteRow(NoteRecord):
    id: str
    index: int
    draft_ids: tuple[str, ...]


@dataclass(frozen=True)
class ExerciseRecord:
    page: int
    kind: ExerciseKind
    source: ExerciseSource
    draft: dict[str, object]
    warnings: list[dict[str, object]]
    crop_path: str | None


@dataclass(frozen=True)
class ExerciseRow(ExerciseRecord):
    id: str
    status: ExerciseStatus


@dataclass(frozen=True)
class ChunkRecord:
    page: int
    index: int
    text: str


@dataclass(frozen=True)
class Usage:
    """What a parse spent, as the row records it."""

    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


@dataclass(frozen=True)
class PageRecord:
    """One `book_pages` row as the scan writes it."""

    page: int
    text: str
    text_source: TextSource
    may_have_exercise: bool


BOOK_COLUMNS = """
    id, user_id, title, page_count, storage_path, status, toc_source, error,
    scanned_pages, created_at
"""
CHAPTER_COLUMNS = """
    id, index, title, page_start, page_end, exercise_hint_count, parsed_at,
    parse_status, parse_error, parse_input_tokens, parse_output_tokens, parse_cost_usd,
    parse_warnings
"""


def _book(record: asyncpg.Record) -> BookRow:
    return BookRow(
        id=str(record["id"]),
        user_id=str(record["user_id"]),
        title=record["title"],
        page_count=record["page_count"],
        storage_path=record["storage_path"],
        status=record["status"],
        toc_source=record["toc_source"],
        error=record["error"],
        scanned_pages=record["scanned_pages"],
        created_at=record["created_at"],
    )


def _chapter(record: asyncpg.Record) -> ChapterRow:
    return ChapterRow(
        id=str(record["id"]),
        index=record["index"],
        title=record["title"],
        page_start=record["page_start"],
        page_end=record["page_end"],
        exercise_hint_count=record["exercise_hint_count"],
        parsed_at=record["parsed_at"],
        parse_status=record["parse_status"],
        parse_error=record["parse_error"],
        parse_input_tokens=record["parse_input_tokens"],
        parse_output_tokens=record["parse_output_tokens"],
        parse_cost_usd=float(record["parse_cost_usd"]),
        parse_warnings=_json_list(record["parse_warnings"]),
    )


def _exercise(r: asyncpg.Record) -> ExerciseRow:
    return ExerciseRow(
        id=str(r["id"]),
        page=r["page"],
        kind=r["kind"],
        source=r["source"],
        draft=json.loads(r["draft"]),
        warnings=json.loads(r["warnings"]),
        crop_path=r["crop_path"],
        status=r["status"],
    )


def _json_list(value: object) -> list[dict[str, object]]:
    """A jsonb list column as asyncpg hands it over (text), or already decoded."""
    decoded = json.loads(value) if isinstance(value, str) else value
    return [d for d in decoded if isinstance(d, dict)] if isinstance(decoded, list) else []


def _prefixed(columns: str, alias: str, prefix: str) -> str:
    """`a, b` → `t.a as pa, t.b as pb`, for a join that returns two rows' worth of columns."""
    names = [c.strip() for c in columns.split(",") if c.strip()]
    return ", ".join(f"{alias}.{n} as {prefix}{n}" for n in names)


def storage_path(user_id: str, book_id: str) -> str:
    """`{user_id}/{book_id}.pdf`: the bucket's policies key on the first folder."""
    return f"{user_id}/{book_id}.pdf"


class BookRepo:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    # --- books -------------------------------------------------------------

    async def create_book(self, user_id: str, title: str) -> BookRow:
        book_id = str(uuid.uuid4())
        record = await self._pool.fetchrow(
            f"""
            insert into user_books (id, user_id, title, storage_path)
            values ($1, $2, $3, $4)
            returning {BOOK_COLUMNS}
            """,
            book_id,
            user_id,
            title,
            storage_path(user_id, book_id),
        )
        assert record is not None
        return _book(record)

    async def list_books(self, user_id: str) -> list[BookRow]:
        records = await self._pool.fetch(
            f"select {BOOK_COLUMNS} from user_books where user_id = $1 order by created_at desc",
            user_id,
        )
        return [_book(r) for r in records]

    async def get_book(self, user_id: str, book_id: str) -> BookRow | None:
        record = await self._pool.fetchrow(
            f"select {BOOK_COLUMNS} from user_books where user_id = $1 and id = $2",
            user_id,
            book_id,
        )
        return _book(record) if record else None

    async def rename_book(self, user_id: str, book_id: str, title: str) -> BookRow | None:
        record = await self._pool.fetchrow(
            f"""
            update user_books set title = $3
             where user_id = $1 and id = $2
            returning {BOOK_COLUMNS}
            """,
            user_id,
            book_id,
            title,
        )
        return _book(record) if record else None

    async def delete_book(self, user_id: str, book_id: str) -> BookRow | None:
        """Chapters and pages go with it (`on delete cascade`)."""
        record = await self._pool.fetchrow(
            f"delete from user_books where user_id = $1 and id = $2 returning {BOOK_COLUMNS}",
            user_id,
            book_id,
        )
        return _book(record) if record else None

    # --- the scan ------------------------------------------------------------

    async def start_scan(self, user_id: str, book_id: str) -> BookRow | None:
        """
        Claim the book for a scan: only one process wins the row, and a book
        already scanning stays with whoever has it. Returns None when the
        book is not the user's or is scanning already.
        """
        record = await self._pool.fetchrow(
            f"""
            update user_books
               set status = 'scanning', error = null, scanned_pages = 0, toc_source = null
             where user_id = $1 and id = $2 and status <> 'scanning'
            returning {BOOK_COLUMNS}
            """,
            user_id,
            book_id,
        )
        return _book(record) if record else None

    async def set_scan_progress(self, book_id: str, page_count: int, scanned_pages: int) -> None:
        await self._pool.execute(
            "update user_books set page_count = $2, scanned_pages = $3 where id = $1",
            book_id,
            page_count,
            scanned_pages,
        )

    async def finish_scan(
        self,
        book_id: str,
        *,
        page_count: int,
        toc_source: TocSource,
        chapters: Sequence[Chapter],
        pages: Sequence[PageRecord],
    ) -> None:
        """One transaction: the previous scan's rows out, this one's in, status ready."""
        async with self._pool.acquire() as conn, conn.transaction():
            await conn.execute("delete from book_pages where book_id = $1", book_id)
            await conn.execute("delete from book_chapters where book_id = $1", book_id)
            await conn.executemany(
                """
                insert into book_pages (book_id, page, has_text_layer, text_source,
                                        may_have_exercise, text)
                values ($1, $2, $3, $4, $5, $6)
                """,
                [
                    (
                        book_id,
                        p.page,
                        p.text_source == "layer",
                        p.text_source,
                        p.may_have_exercise,
                        p.text,
                    )
                    for p in pages
                ],
            )
            await _insert_chapters(conn, book_id, chapters)
            await conn.execute(
                """
                update user_books
                   set status = 'ready', toc_source = $2, page_count = $3,
                       scanned_pages = $3, error = null
                 where id = $1
                """,
                book_id,
                toc_source,
                page_count,
            )

    async def fail_scan(self, book_id: str, message: str) -> None:
        await self._pool.execute(
            "update user_books set status = 'failed', error = $2 where id = $1",
            book_id,
            message,
        )

    # --- chapters ----------------------------------------------------------

    async def list_chapters(self, book_id: str) -> list[ChapterRow]:
        records = await self._pool.fetch(
            f"select {CHAPTER_COLUMNS} from book_chapters where book_id = $1 order by index",
            book_id,
        )
        return [_chapter(r) for r in records]

    async def get_chapter(self, user_id: str, chapter_id: str) -> tuple[BookRow, ChapterRow] | None:
        """The chapter with its book, only when the book is the user's."""
        record = await self._pool.fetchrow(
            f"""
            select {_prefixed(BOOK_COLUMNS, "b", "book_")}, {_prefixed(CHAPTER_COLUMNS, "c", "")}
              from book_chapters c
              join user_books b on b.id = c.book_id
             where b.user_id = $1 and c.id = $2
            """,
            user_id,
            chapter_id,
        )
        if record is None:
            return None
        book = _book(
            {k.removeprefix("book_"): v for k, v in record.items() if k.startswith("book_")}
        )
        chapter = _chapter({k: v for k, v in record.items() if not k.startswith("book_")})
        return book, chapter

    async def list_pages(self, book_id: str, page_start: int, page_end: int) -> list[PageRow]:
        records = await self._pool.fetch(
            """
            select page, text, text_source, may_have_exercise
              from book_pages
             where book_id = $1 and page between $2 and $3
             order by page
            """,
            book_id,
            page_start,
            page_end,
        )
        return [
            PageRow(
                page=r["page"],
                text=r["text"],
                text_source=r["text_source"],
                may_have_exercise=r["may_have_exercise"],
            )
            for r in records
        ]

    # --- the parse -----------------------------------------------------------

    async def start_parse(self, chapter_id: str) -> ChapterRow | None:
        """Claim the chapter, as `start_scan` claims a book. None when already parsing."""
        record = await self._pool.fetchrow(
            f"""
            update book_chapters
               set parse_status = 'parsing', parse_error = null
             where id = $1 and parse_status <> 'parsing'
            returning {CHAPTER_COLUMNS}
            """,
            chapter_id,
        )
        return _chapter(record) if record else None

    async def finish_parse(
        self,
        chapter_id: str,
        *,
        notes: Sequence[NoteRecord],
        exercises: Sequence[ExerciseRecord],
        chunks: Sequence[ChunkRecord],
        usage: Usage,
        warnings: Sequence[dict[str, object]] = (),
    ) -> None:
        """One transaction: the previous parse's rows out, this one's in, chapter ready."""
        async with self._pool.acquire() as conn, conn.transaction():
            for table in ("book_notes", "book_exercises", "book_chunks"):
                await conn.execute(f"delete from {table} where chapter_id = $1", chapter_id)
            await conn.executemany(
                """
                insert into book_notes (chapter_id, index, title, body, pages)
                values ($1, $2, $3, $4, $5)
                """,
                [(chapter_id, i, n.title, n.body, list(n.pages)) for i, n in enumerate(notes)],
            )
            await conn.executemany(
                """
                insert into book_exercises
                  (chapter_id, page, kind, source, draft, warnings, crop_path)
                values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
                """,
                [
                    (
                        chapter_id,
                        e.page,
                        e.kind,
                        e.source,
                        json.dumps(e.draft),
                        json.dumps(e.warnings),
                        e.crop_path,
                    )
                    for e in exercises
                ],
            )
            await conn.executemany(
                "insert into book_chunks (chapter_id, page, index, text) values ($1, $2, $3, $4)",
                [(chapter_id, c.page, c.index, c.text) for c in chunks],
            )
            await conn.execute(
                """
                update book_chapters
                   set parse_status = 'ready', parsed_at = now(), parse_error = null,
                       parse_input_tokens = $2, parse_output_tokens = $3, parse_cost_usd = $4,
                       parse_warnings = $5::jsonb
                 where id = $1
                """,
                chapter_id,
                usage.input_tokens,
                usage.output_tokens,
                usage.cost_usd,
                json.dumps(list(warnings)),
            )

    async def fail_parse(self, chapter_id: str, message: str, usage: Usage | None = None) -> None:
        usage = usage or Usage()
        await self._pool.execute(
            """
            update book_chapters
               set parse_status = 'failed', parse_error = $2,
                   parse_input_tokens = $3, parse_output_tokens = $4, parse_cost_usd = $5
             where id = $1
            """,
            chapter_id,
            message,
            usage.input_tokens,
            usage.output_tokens,
            usage.cost_usd,
        )

    async def list_notes(self, chapter_id: str) -> list[NoteRow]:
        records = await self._pool.fetch(
            """
            select id, index, title, body, pages, draft_ids
              from book_notes where chapter_id = $1 order by index
            """,
            chapter_id,
        )
        return [
            NoteRow(
                id=str(r["id"]),
                index=r["index"],
                title=r["title"],
                body=r["body"],
                pages=tuple(r["pages"]),
                draft_ids=tuple(str(d) for d in r["draft_ids"]),
            )
            for r in records
        ]

    async def set_exercise_status(
        self, user_id: str, exercise_id: str, status: ExerciseStatus
    ) -> ExerciseRow | None:
        """The draft's status, through the exercise → chapter → book → user chain."""
        record = await self._pool.fetchrow(
            """
            update book_exercises e
               set status = $3
              from book_chapters c
              join user_books b on b.id = c.book_id
             where e.id = $2 and e.chapter_id = c.id and b.user_id = $1
            returning e.id, e.page, e.kind, e.source, e.draft, e.warnings, e.crop_path, e.status
            """,
            user_id,
            exercise_id,
            status,
        )
        return _exercise(record) if record else None

    async def list_exercises(self, chapter_id: str) -> list[ExerciseRow]:
        records = await self._pool.fetch(
            """
            select id, page, kind, source, draft, warnings, crop_path, status
              from book_exercises where chapter_id = $1 order by page, created_at
            """,
            chapter_id,
        )
        return [_exercise(r) for r in records]

    async def replace_chapters(self, book_id: str, chapters: Sequence[Chapter]) -> None:
        """The player's own ranges: `manual` from here on, hint counts recomputed."""
        async with self._pool.acquire() as conn, conn.transaction():
            await conn.execute("delete from book_chapters where book_id = $1", book_id)
            await _insert_chapters(conn, book_id, chapters)
            await conn.execute("update user_books set toc_source = 'manual' where id = $1", book_id)


async def _insert_chapters(
    conn: asyncpg.Connection, book_id: str, chapters: Sequence[Chapter]
) -> None:
    # Hint counts come from the pages just written, so a manual re-draw of the
    # ranges keeps them right without re-tagging anything.
    await conn.executemany(
        """
        insert into book_chapters (book_id, index, title, page_start, page_end,
                                   exercise_hint_count)
        values ($1, $2, $3, $4, $5,
                (select count(*) from book_pages
                  where book_id = $1 and may_have_exercise
                    and page between $4 and $5))
        """,
        [(book_id, i, c.title, c.page_start, c.page_end) for i, c in enumerate(chapters)],
    )
