"""
The Storage client's folder operations (#243): listing across pages,
deleting in batches, and the tree removal that `DELETE /books/{id}` uses
for a book's crops and page images. Storage itself is an httpx mock
transport, so the requests are checked, not the network.
"""

import asyncio
import json
from collections.abc import Iterator

import httpx
import pytest

from app.pages import pages_folder
from app.parse import crops_folder
from app.storage import DELETE_BATCH, LIST_PAGE, StorageClient, StorageError


def test_the_folders_a_book_writes_beside_its_pdf() -> None:
    assert pages_folder("u1/b1.pdf", "b1") == "u1/pages/b1"
    assert crops_folder("u1/b1.pdf", "c1") == "u1/crops/c1"


class FakeStorage:
    """Answers list and delete like Storage would, remembering what was asked."""

    def __init__(self, objects: list[str]) -> None:
        self.objects = objects
        self.deleted: list[list[str]] = []
        self.list_calls = 0

    def handle(self, request: httpx.Request) -> httpx.Response:
        if request.headers["Authorization"] != "Bearer tok":
            return httpx.Response(403, json={"message": "not yours"})
        if request.method == "POST" and request.url.path.endswith("/object/list/books"):
            self.list_calls += 1
            body = json.loads(request.content)
            under = [o for o in self.objects if o.startswith(body["prefix"] + "/")]
            page = under[body["offset"] : body["offset"] + body["limit"]]
            names = [{"id": f"id-{o}", "name": o.removeprefix(body["prefix"] + "/")} for o in page]
            # Storage lists a subfolder as an entry without an id.
            names.append({"id": None, "name": "sub"})
            return httpx.Response(200, json=names)
        if request.method == "DELETE" and request.url.path.endswith("/object/books"):
            prefixes = json.loads(request.content)["prefixes"]
            self.deleted.append(prefixes)
            self.objects = [o for o in self.objects if o not in prefixes]
            return httpx.Response(200, json=[])
        return httpx.Response(404, json={"message": "nope"})


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeStorage]:
    fake = FakeStorage([])
    real = httpx.AsyncClient

    def client(**kwargs: object) -> httpx.AsyncClient:
        return real(transport=httpx.MockTransport(fake.handle))

    monkeypatch.setattr(httpx, "AsyncClient", client)
    yield fake


def test_remove_tree_lists_every_page_and_deletes_in_batches(fake: FakeStorage) -> None:
    fake.objects = [f"u1/crops/c1/p{i:04d}.png" for i in range(LIST_PAGE + 5)] + ["u1/other.pdf"]
    storage = StorageClient("https://x/storage/v1", "anon")
    removed = asyncio.run(storage.remove_tree("u1/crops/c1/", "tok"))
    assert removed == LIST_PAGE + 5
    assert fake.list_calls == 2
    assert [len(batch) for batch in fake.deleted] == [DELETE_BATCH] * 10 + [5]
    assert fake.objects == ["u1/other.pdf"], "only the folder's objects went"


def test_list_folders_names_the_subfolders_and_not_the_objects(fake: FakeStorage) -> None:
    """The one-off sweep (#246) reads a player's chapter folders this way."""
    fake.objects = ["u1/crops/c1/p0001-1.png", "u1/crops/c2/p0002-1.png"]
    storage = StorageClient("https://x/storage/v1", "anon")
    # The fake lists one subfolder entry ("sub", no id) beside every page of objects.
    assert asyncio.run(storage.list_folders("u1/crops", "tok")) == ["u1/crops/sub"]
    assert asyncio.run(storage.list_objects("u1/crops/c1", "tok")) == ["u1/crops/c1/p0001-1.png"]


def test_an_empty_folder_deletes_nothing_and_a_refusal_is_named(fake: FakeStorage) -> None:
    storage = StorageClient("https://x/storage/v1", "anon")
    assert asyncio.run(storage.remove_tree("u1/pages/b1", "tok")) == 0
    assert fake.deleted == []
    with pytest.raises(StorageError) as e:
        asyncio.run(storage.delete_many(["u1/x.png"], "bad"))
    assert e.value.status == 403
    assert e.value.message == "not yours"
