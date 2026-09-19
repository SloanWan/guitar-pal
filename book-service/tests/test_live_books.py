"""
The whole A3 flow against the real Supabase project: create → upload as the
player → scan → chapters → manual ranges → delete. Opt-in, because it needs
a real session token and writes real rows (which it removes again):

    set -a && source ../.env.local && set +a
    BOOK_SERVICE_TEST_TOKEN=<access token of a signed-in user> pytest -q -s tests/test_live_books.py

The token is the `access_token` of the browser session (Supabase auth
cookie / localStorage), an hour's worth. With ANTHROPIC_API_KEY set the scan
makes its one text-TOC call (~1.5k tokens on this excerpt); without it the
excerpt comes back as one manual chapter.
"""

import os
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.conftest import needs_materials

TOKEN = os.environ.get("BOOK_SERVICE_TEST_TOKEN")

needs_live_project = pytest.mark.skipif(
    TOKEN is None or os.environ.get("BOOK_SERVICE_DATABASE_URL") is None,
    reason="set BOOK_SERVICE_TEST_TOKEN and the project's .env to run against Supabase",
)


@pytest.fixture
def client() -> Iterator[TestClient]:
    app = create_app(Settings())
    with TestClient(app) as client:
        yield client


@needs_materials
@needs_live_project
def test_upload_scan_edit_delete(client: TestClient, typeset_pdf: Path) -> None:
    settings = Settings()
    auth = {"Authorization": f"Bearer {TOKEN}"}

    created = client.post("/books", json={"title": "Live test excerpt"}, headers=auth)
    assert created.status_code == 201, created.text
    book = created.json()
    assert book["status"] == "uploaded"
    book_id, path = book["id"], book["storage_path"]
    print(f"\nbook {book_id} at {path}")

    try:
        # The browser's step: straight to Storage with the player's session.
        upload = httpx.post(
            f"{settings.storage_url}/object/books/{path}",
            headers={
                **auth,
                "apikey": settings.supabase_anon_key or "",
                "Content-Type": "application/pdf",
            },
            content=typeset_pdf.read_bytes(),
            timeout=60.0,
        )
        assert upload.status_code == 200, upload.text

        # TestClient runs the background task before returning, so the scan
        # is finished by the time the poll below happens.
        scan = client.post(f"/books/{book_id}/scan", headers=auth)
        assert scan.status_code == 202, scan.text
        assert scan.json()["status"] == "scanning"

        detail = client.get(f"/books/{book_id}", headers=auth).json()
        print("scan:", {k: detail[k] for k in ("status", "toc_source", "error")})
        for c in detail["chapters"]:
            print(
                f"  p{c['page_start']}-{c['page_end']} hints={c['exercise_hint_count']}", c["title"]
            )
        assert detail["status"] == "ready", detail
        assert detail["page_count"] == 9 and detail["scanned_pages"] == 9
        assert detail["toc_source"] in ("text", "manual")
        assert detail["chapters"][0]["page_start"] == 1
        assert detail["chapters"][-1]["page_end"] == 9
        assert sum(c["exercise_hint_count"] for c in detail["chapters"]) == 9

        assert any(b["id"] == book_id for b in client.get("/books", headers=auth).json())

        renamed = client.patch(f"/books/{book_id}", json={"title": " Renamed "}, headers=auth)
        assert renamed.status_code == 200 and renamed.json()["title"] == "Renamed"

        # The chapter parse (#202): classification per page, knowledge points
        # from the text. With ANTHROPIC_API_KEY this is ~10 model calls on the
        # excerpt; the notes and the cost are printed for docs/calibration.md.
        chapter_id = detail["chapters"][-1]["id"]
        started = client.post(f"/books/{book_id}/chapters/{chapter_id}/parse", headers=auth)
        assert started.status_code == 202, started.text
        assert started.json()["parse_status"] == "parsing"
        parsed = client.get(f"/books/{book_id}/chapters/{chapter_id}/parse", headers=auth).json()
        chapter = parsed["chapter"]
        print("parse:", {k: chapter[k] for k in ("parse_status", "parse_error", "parse_cost")})
        for n in parsed["notes"]:
            print(f"  note p{n['pages']}: {n['title']} — {n['body']}")
        for e in parsed["exercises"]:
            print(f"  exercise p{e['page']} {e['kind']}/{e['source']}")
        assert chapter["parse_status"] == "ready", chapter
        assert chapter["parsed_at"] is not None
        if settings.anthropic_api_key:
            assert len(parsed["notes"]) >= 1
            assert chapter["parse_cost"]["input_tokens"] > 0

        edited = client.put(
            f"/books/{book_id}/chapters",
            json={
                "chapters": [
                    {"title": "Opener", "page_start": 1, "page_end": 2},
                    {"title": "Key sheets", "page_start": 3, "page_end": 9},
                ]
            },
            headers=auth,
        )
        assert edited.status_code == 200, edited.text
        assert edited.json()["toc_source"] == "manual"
        assert [c["exercise_hint_count"] for c in edited.json()["chapters"]] == [2, 7]

        bad = client.put(
            f"/books/{book_id}/chapters",
            json={"chapters": [{"title": "Too long", "page_start": 1, "page_end": 40}]},
            headers=auth,
        )
        assert bad.status_code == 422
    finally:
        deleted = client.delete(f"/books/{book_id}", headers=auth)
        print(f"delete: {deleted.status_code}")
        assert deleted.status_code == 204, deleted.text

    assert client.get(f"/books/{book_id}", headers=auth).status_code == 404
    # Listed, not fetched: the CDN keeps serving a deleted object for a while.
    listing = httpx.post(
        f"{settings.storage_url}/object/list/books",
        headers={**auth, "apikey": settings.supabase_anon_key or ""},
        json={"prefix": path.split("/")[0], "limit": 100},
        timeout=30.0,
    )
    assert listing.status_code == 200, listing.text
    assert path.split("/")[1] not in [o["name"] for o in listing.json()]
