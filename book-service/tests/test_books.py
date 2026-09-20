"""
The routes without a database: what they refuse, and the range validation.
The full flow against the real database and Storage is `test_live_books.py`.
"""

from collections.abc import Iterator

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.books import ChapterRange, validate_ranges
from app.config import Settings
from app.ingest.toc import Chapter
from app.main import create_app
from tests.test_auth import ISSUER, SECRET, make_hs256_token


def _range(title: str, start: int, end: int) -> ChapterRange:
    return ChapterRange(title=title, page_start=start, page_end=end)


def test_ranges_are_sorted_trimmed_and_may_leave_gaps() -> None:
    ranges = [_range("  Two  ", 6, 9), _range("One", 1, 3)]
    assert validate_ranges(ranges, page_count=12) == [Chapter("One", 1, 3), Chapter("Two", 6, 9)]


@pytest.mark.parametrize(
    ("ranges", "message"),
    [
        ([_range("Backwards", 5, 4)], "ends before it starts"),
        ([_range("Long", 1, 13)], "runs past page 12"),
        ([_range("A", 1, 5), _range("B", 5, 8)], "overlaps"),
    ],
)
def test_bad_ranges_are_422(ranges: list[ChapterRange], message: str) -> None:
    with pytest.raises(HTTPException) as e:
        validate_ranges(ranges, page_count=12)
    assert e.value.status_code == 422
    assert message in e.value.detail


@pytest.fixture
def client() -> Iterator[TestClient]:
    settings = Settings(
        SUPABASE_URL=ISSUER.removesuffix("/auth/v1"),
        SUPABASE_JWT_SECRET=SECRET,
        BOOK_SERVICE_DATABASE_URL=None,
    )
    app = create_app(settings)
    with TestClient(app) as client:
        # HS256 tokens never touch the JWKS client the lifespan built.
        yield client


def test_books_need_a_session(client: TestClient) -> None:
    assert client.get("/books").status_code == 401
    assert client.post("/books", json={"title": "x"}).status_code == 401


def test_exercise_status_needs_a_session_and_a_database(client: TestClient) -> None:
    assert client.patch("/books/b/exercises/e", json={"status": "taken"}).status_code == 401
    headers = {"Authorization": f"Bearer {make_hs256_token()}"}
    response = client.patch("/books/b/exercises/e", json={"status": "taken"}, headers=headers)
    assert response.status_code == 503


def test_books_without_a_database_are_503(client: TestClient) -> None:
    headers = {"Authorization": f"Bearer {make_hs256_token()}"}
    response = client.get("/books", headers=headers)
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"]


def test_page_text_needs_a_session_and_a_database(client: TestClient) -> None:
    """#228: the text-tab reader's source, behind the same checks as every book route."""
    assert client.get("/books/b/pages/3/text").status_code == 401
    headers = {"Authorization": f"Bearer {make_hs256_token()}"}
    assert client.get("/books/b/pages/3/text", headers=headers).status_code == 503
