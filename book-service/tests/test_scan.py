"""
The scan job's orchestration, on the real typeset excerpt: what it writes,
what it reports, and how each way of failing lands on the book. Storage and
the store are fakes here — they are the job's outputs, not what is under
test; the live test drives the real ones.
"""

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from app.ingest.toc import Chapter, ChapterStart, TocSource
from app.repo import PageRecord
from app.scan import (
    FAILED_MESSAGE,
    MISSING_FILE_MESSAGE,
    UNREADABLE_MESSAGE,
    Scanner,
)
from app.storage import StorageError
from tests.conftest import needs_materials
from tests.test_toc import FakeReader


@dataclass
class FakeStorage:
    files: dict[str, bytes]
    # Folders `remove_tree` was asked to clear, in order (#246).
    cleared: list[str] = field(default_factory=list)
    # A folder that refuses to clear, to see the job carry on without it.
    refuse: str | None = None

    async def download(self, path: str, token: str) -> bytes:
        if path not in self.files:
            raise StorageError(404, "Object not found")
        return self.files[path]

    async def upload_png(self, path: str, data: bytes, token: str) -> None:
        self.files[path] = data

    async def remove_tree(self, prefix: str, token: str) -> int:
        if prefix == self.refuse:
            raise StorageError(403, "not yours")
        self.cleared.append(prefix)
        folder = prefix.rstrip("/") + "/"
        gone = [path for path in self.files if path.startswith(folder)]
        for path in gone:
            del self.files[path]
        return len(gone)


@dataclass
class FakeStore:
    progress: list[tuple[int, int]] = field(default_factory=list)
    finished: dict | None = None
    failed: str | None = None

    async def set_scan_progress(self, book_id: str, page_count: int, scanned_pages: int) -> None:
        self.progress.append((page_count, scanned_pages))

    async def finish_scan(
        self,
        book_id: str,
        *,
        page_count: int,
        toc_source: TocSource,
        chapters: Sequence[Chapter],
        pages: Sequence[PageRecord],
    ) -> None:
        self.finished = {
            "page_count": page_count,
            "toc_source": toc_source,
            "chapters": tuple(chapters),
            "pages": list(pages),
        }

    async def fail_scan(self, book_id: str, message: str) -> None:
        self.failed = message


def _scanner(files: dict[str, bytes], store: FakeStore, reader=None) -> Scanner:
    return Scanner(
        storage=FakeStorage(files),  # type: ignore[arg-type]
        store=store,
        ocr=None,
        read_text_toc=reader,
        read_vision_toc=None,
        worker=asyncio.Semaphore(1),
    )


@needs_materials
@pytest.mark.asyncio
async def test_scan_writes_pages_tags_and_chapters(typeset_pdf: Path) -> None:
    store = FakeStore()
    reader = FakeReader([ChapterStart("Songwriting Cheat Sheets", 1)])
    scanner = _scanner({"u/b.pdf": typeset_pdf.read_bytes()}, store, reader)

    await scanner.run("b", "u/b.pdf", "token")

    assert store.failed is None
    assert store.progress == [(9, 0), (9, 5)]  # the count first, then every five pages
    assert store.finished is not None
    assert store.finished["page_count"] == 9
    assert store.finished["toc_source"] == "text"
    assert store.finished["chapters"] == (Chapter("Songwriting Cheat Sheets", 1, 9),)
    pages = store.finished["pages"]
    assert [p.page for p in pages] == list(range(1, 10))
    assert all(p.text_source == "layer" and p.text for p in pages)
    # The key sheets (p3-p9) carry progressions; the two prose pages are keyword-only but tagged.
    assert all(p.may_have_exercise for p in pages)


@needs_materials
@pytest.mark.asyncio
async def test_scan_without_a_reader_is_one_manual_chapter(typeset_pdf: Path) -> None:
    store = FakeStore()
    await _scanner({"u/b.pdf": typeset_pdf.read_bytes()}, store).run("b", "u/b.pdf", "t")
    assert store.finished is not None
    assert store.finished["toc_source"] == "manual"
    assert store.finished["chapters"] == (Chapter("Whole book", 1, 9),)


@needs_materials
@pytest.mark.asyncio
async def test_rescan_clears_the_old_chapters_crops_and_page_images_not_the_new(
    typeset_pdf: Path,
) -> None:
    """#246: what the last scan wrote beside the PDF goes before the new rows land."""
    store = FakeStore()
    storage = FakeStorage(
        {
            "u/b.pdf": typeset_pdf.read_bytes(),
            "u/crops/old-1/p0003-1.png": b"old",
            "u/crops/old-2/p0004-1.png": b"old",
            "u/pages/b/p0001.jpg": b"old",
            "u/crops/other-book-chapter/p0001-1.png": b"keep",
        },
        refuse="u/crops/old-2",
    )
    scanner = Scanner(
        storage=storage,  # type: ignore[arg-type]
        store=store,
        ocr=None,
        read_text_toc=None,
        read_vision_toc=None,
        worker=asyncio.Semaphore(1),
    )
    stale = ["u/pages/b", "u/crops/old-1", "u/crops/old-2"]

    await scanner.run("b", "u/b.pdf", "token", stale)

    assert store.failed is None and store.finished is not None
    assert storage.cleared == ["u/pages/b", "u/crops/old-1"]
    assert sorted(storage.files) == [
        "u/b.pdf",
        "u/crops/old-2/p0004-1.png",  # refused: logged and left, the scan still finished
        "u/crops/other-book-chapter/p0001-1.png",
    ]


@pytest.mark.asyncio
async def test_a_failed_scan_leaves_the_old_folders_alone() -> None:
    store = FakeStore()
    storage = FakeStorage({"u/b.pdf": b"not a pdf", "u/crops/old/p0001-1.png": b"old"})
    await _scanner_with(storage, store).run("b", "u/b.pdf", "t", ["u/crops/old"])
    assert store.failed == UNREADABLE_MESSAGE
    assert storage.cleared == []
    assert "u/crops/old/p0001-1.png" in storage.files


def _scanner_with(storage: FakeStorage, store: FakeStore) -> Scanner:
    return Scanner(
        storage=storage,  # type: ignore[arg-type]
        store=store,
        ocr=None,
        read_text_toc=None,
        read_vision_toc=None,
        worker=asyncio.Semaphore(1),
    )


@pytest.mark.asyncio
async def test_missing_file_fails_with_an_upload_again_message() -> None:
    store = FakeStore()
    await _scanner({}, store).run("b", "u/b.pdf", "t")
    assert store.failed == MISSING_FILE_MESSAGE
    assert store.finished is None


@pytest.mark.asyncio
async def test_not_a_pdf_fails_as_unreadable() -> None:
    store = FakeStore()
    await _scanner({"u/b.pdf": b"this is not a pdf"}, store).run("b", "u/b.pdf", "t")
    assert store.failed == UNREADABLE_MESSAGE


@needs_materials
@pytest.mark.asyncio
async def test_a_reader_that_raises_fails_the_scan_not_the_process(typeset_pdf: Path) -> None:
    class Boom:
        async def __call__(self, digest: str) -> list[ChapterStart]:
            raise RuntimeError("model down")

    store = FakeStore()
    await _scanner({"u/b.pdf": typeset_pdf.read_bytes()}, store, Boom()).run("b", "u/b.pdf", "t")
    assert store.failed == FAILED_MESSAGE
