"""
A page as an image (#240): where it lands, that it is rendered once and
answered from Storage after, and what the route refuses. The render runs
on a real excerpt from `materials/` (gitignored), with Storage and the
repo faked; the route is checked without a database like the others.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.pages import PageImageError, PageImages, PdfCache, page_image_path
from app.repo import BookRow
from app.storage import StorageError
from tests.conftest import TYPESET_PDF, needs_materials
from tests.test_auth import make_hs256_token
from tests.test_books import client  # noqa: F401 — the fixture

BOOK = BookRow(
    id="b1",
    user_id="u1",
    title="Songwriting",
    page_count=9,
    storage_path="u1/b1.pdf",
    status="ready",
    toc_source="text",
    error=None,
    scanned_pages=9,
    created_at=datetime(2026, 9, 20, tzinfo=UTC),
)


def test_page_images_live_beside_the_pdf_one_folder_per_book() -> None:
    assert page_image_path("u1/b1.pdf", "b1", 6) == "u1/pages/b1/p0006.jpg"


def test_the_pdf_cache_forgets_by_age_and_by_size() -> None:
    cache = PdfCache(seconds=100, max_bytes=10)
    cache.put("a", b"12345")
    cache.put("b", b"12345")
    assert cache.get("a") == b"12345"
    # A third that does not fit pushes out the least recently used ("b").
    cache.put("c", b"123")
    assert cache.get("b") is None
    assert cache.get("a") == b"12345"
    assert cache.get("c") == b"123"
    # Bigger than the whole cache: never kept.
    cache.put("d", b"x" * 11)
    assert cache.get("d") is None
    # Age: an entry older than the window is gone on the next look.
    stale = PdfCache(seconds=0)
    stale.put("a", b"1")
    assert stale.get("a") is None


@dataclass
class FakeStorage:
    pdf: bytes
    downloads: int = 0
    uploaded: dict[str, bytes] = field(default_factory=dict)
    refuse_download: bool = False

    async def download(self, path: str, token: str) -> bytes:
        self.downloads += 1
        if self.refuse_download:
            raise StorageError(404, "Object not found")
        assert path == BOOK.storage_path
        return self.pdf

    async def upload_image(self, path: str, data: bytes, token: str, content_type: str) -> None:
        assert content_type == "image/jpeg"
        self.uploaded[path] = data


@dataclass
class FakeRepo:
    images: dict[tuple[str, int], str] = field(default_factory=dict)

    async def get_page_image(self, book_id: str, page: int) -> str | None:
        return self.images.get((book_id, page))

    async def set_page_image(self, book_id: str, page: int, path: str) -> None:
        self.images[(book_id, page)] = path


def _service(storage: FakeStorage, repo: FakeRepo) -> PageImages:
    # The fakes stand in for the real clients; PageImages only calls what they have.
    return PageImages(storage=storage, repo=repo, worker=asyncio.Semaphore(1))  # type: ignore[arg-type]


@needs_materials
def test_a_page_is_rendered_once_and_answered_from_storage_after() -> None:
    storage = FakeStorage(TYPESET_PDF.read_bytes())
    repo = FakeRepo()
    service = _service(storage, repo)

    first = asyncio.run(service.get_or_render(BOOK, 3, "token"))
    assert first == "u1/pages/b1/p0003.jpg"
    assert storage.downloads == 1
    jpeg = storage.uploaded[first]
    assert jpeg[:3] == b"\xff\xd8\xff"
    # A real render of that page, at the parse's dpi (an A4-ish page is ~1240 px wide).
    assert 1000 < pymupdf.Pixmap(jpeg).width < 1500
    assert repo.images[("b1", 3)] == first

    second = asyncio.run(service.get_or_render(BOOK, 3, "token"))
    assert second == first
    assert storage.downloads == 1, "the second look must not fetch the PDF again"
    assert len(storage.uploaded) == 1

    # The next page of the same book renders from the PDF already in memory.
    asyncio.run(service.get_or_render(BOOK, 4, "token"))
    assert storage.downloads == 1, "stepping to another page must not fetch the PDF again"
    assert len(storage.uploaded) == 2


@needs_materials
def test_a_page_past_the_pdf_and_a_missing_object_are_named() -> None:
    storage = FakeStorage(TYPESET_PDF.read_bytes())
    service = _service(storage, FakeRepo())
    with pytest.raises(PageImageError) as e:
        asyncio.run(service.get_or_render(BOOK, 99, "token"))
    assert e.value.status == 404
    assert storage.uploaded == {}

    # A fresh service: the one above now holds the PDF in memory.
    refusing = FakeStorage(b"", refuse_download=True)
    with pytest.raises(PageImageError) as e:
        asyncio.run(_service(refusing, FakeRepo()).get_or_render(BOOK, 1, "token"))
    assert e.value.status == 502


def test_page_image_needs_a_session_and_a_database(client: TestClient) -> None:  # noqa: F811
    assert client.get("/books/b/pages/1/image").status_code == 401
    headers = {"Authorization": f"Bearer {make_hs256_token()}"}
    assert client.get("/books/b/pages/1/image", headers=headers).status_code == 503
