"""
The book tables, as plain SQL over the asyncpg pool. Every query that reads
or writes a book takes the verified `user_id` and filters by it — that filter
is the ownership check (see README, "Ownership"); nothing here trusts a
book id on its own.

Rows come back as dataclasses so the routes and the scan job share one
shape and the tests can build them without a database.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

import asyncpg

from app.ingest.pdf import TextSource
from app.ingest.toc import Chapter, TocSource

BookStatus = Literal["uploaded", "scanning", "ready", "failed"]


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
CHAPTER_COLUMNS = "id, index, title, page_start, page_end, exercise_hint_count, parsed_at"


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
    )


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
