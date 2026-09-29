"""
The chapter graph with the model replaced, on the real excerpts: which
pages get an image, how classifications and notes come back, how usage adds
up. The prompts' quality is the live test's business (`test_live_books.py`).
"""

import asyncio
import logging
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.ask.provider import Provider, anthropic_provider
from app.graph.chapter import ChapterParseGraph, note_pages
from app.graph.prompts import (
    CLASSIFY_SYSTEM,
    NOTES_SYSTEM,
    NoteOut,
    NotesOut,
    PageClassOut,
    RegionOut,
)
from app.ingest.pdf import OcrConfig, extract_pages, open_pdf
from app.ingest.tag import tag_text
from app.parse import ParsePage, Parser, page_needs_image
from app.repo import BookRow, ChapterRow, NoteRecord, PageRow, Usage
from tests.conftest import needs_materials, needs_ocr
from tests.test_scan import FakeStorage

BOOK = BookRow(
    id="b",
    user_id="u",
    title="A book",
    page_count=9,
    storage_path="u/b.pdf",
    status="ready",
    toc_source="text",
    error=None,
    scanned_pages=9,
    created_at=None,  # type: ignore[arg-type]
)
CHAPTER = ChapterRow(
    id="c",
    index=0,
    title="Songwriting",
    page_start=1,
    page_end=9,
    exercise_hint_count=9,
    parsed_at=None,
    parse_status="parsing",
    parse_error=None,
    parse_input_tokens=0,
    parse_output_tokens=0,
    parse_cost_usd=0.0,
    parse_warnings=[],
)


@dataclass
class FakeMessages:
    """Answers the classifier and the notes call by their system prompt; records requests."""

    kinds: dict[int, str]
    requests: list[dict] = field(default_factory=list)

    async def parse(self, **kwargs: object) -> object:
        self.requests.append(kwargs)
        usage = SimpleNamespace(input_tokens=1000, output_tokens=50)
        if kwargs["system"] == CLASSIFY_SYSTEM:
            first = kwargs["messages"][0]["content"][0]["text"]  # type: ignore[index]
            page = int(first.rsplit("Page ", 1)[1].rstrip("."))
            kind = self.kinds.get(page, "prose")
            regions = [RegionOut(kind="tab", bbox=[0, 0.5, 1, 1])] if kind == "mixed" else []
            out = PageClassOut(kind=kind, regions=regions, note=f"page {page}")
        elif kwargs["system"] == NOTES_SYSTEM:
            out = NotesOut(
                notes=[
                    NoteOut(title="Diatonic chords", body="Seven chords fit.", pages=[3, 99, 2, 3]),
                    NoteOut(title="Printed numbering", body="Cited p.204.", pages=[204]),
                    NoteOut(title="", body="dropped: no title", pages=[2]),
                ]
            )
        else:
            raise AssertionError("unexpected system prompt")
        return SimpleNamespace(stop_reason="end_turn", parsed_output=out, usage=usage)


def _client(kinds: dict[int, str]) -> SimpleNamespace:
    return SimpleNamespace(messages=FakeMessages(kinds))


def _pages(path: Path, ocr: OcrConfig | None = None) -> list[PageRow]:
    with open_pdf(path) as doc:
        return [
            PageRow(p.page, p.text, p.text_source, tag_text(p.text).may_have_exercise)
            for p in extract_pages(doc, ocr)
        ]


def _parse_pages(rows: list[PageRow]) -> list[ParsePage]:
    return [
        ParsePage(
            r.page,
            r.text,
            r.text_source == "layer",
            r.may_have_exercise,
            image=b"png" if page_needs_image(r) else None,
        )
        for r in rows
    ]


def test_note_pages_keeps_the_chapters_pages_once_in_the_order_cited() -> None:
    assert note_pages([206, 204, 206, 999, 205], {204, 205, 206, 207}) == (206, 204, 205)
    assert note_pages([], {1, 2}) == ()
    assert note_pages([9, 10], {1, 2}) == ()


@needs_materials
@pytest.mark.asyncio
async def test_graph_classifies_every_page_and_writes_notes(typeset_pdf: Path) -> None:
    client = _client({3: "progression_map", 4: "mixed"})
    graph = ChapterParseGraph(anthropic_provider(client))  # type: ignore[arg-type]
    pages = _parse_pages(_pages(typeset_pdf))

    result = await graph(BOOK, CHAPTER, pages)

    classify = [r for r in client.messages.requests if r["system"] == CLASSIFY_SYSTEM]
    notes = [r for r in client.messages.requests if r["system"] == NOTES_SYSTEM]
    assert len(classify) == 9 and len(notes) == 1
    # Every page of this excerpt is tagged, so every classification carries the image.
    assert all(any(b["type"] == "image" for b in r["messages"][0]["content"]) for r in classify)
    # The notes call sees the chapter text page by page.
    assert "[Page 3]" in notes[0]["messages"][0]["content"]

    assert [n.title for n in result.notes] == ["Diatonic chords", "Printed numbering"]
    # Pages the chapter has, once each, in the model's order (#245): 99 is out.
    assert result.notes[0].pages == (3, 2)
    # A note whose pages are all outside the chapter keeps none, not a wrong one.
    assert result.notes[1].pages == ()
    assert result.exercises == []  # no validator: no extractor runs
    # Nine classifications on the classifier's model, one notes call on the parse model.
    assert result.usage == Usage(input_tokens=10_000, output_tokens=500, cost_usd=0.0288)


@needs_materials
@needs_ocr
@pytest.mark.asyncio
async def test_scanned_pages_are_all_looked_at(scanned_pdf: Path, ocr: OcrConfig) -> None:
    rows = _pages(scanned_pdf, ocr)
    assert all(page_needs_image(r) for r in rows)
    client = _client({})
    result = await ChapterParseGraph(anthropic_provider(client))(BOOK, CHAPTER, _parse_pages(rows))  # type: ignore[arg-type]
    classify = [r for r in client.messages.requests if r["system"] == CLASSIFY_SYSTEM]
    assert len(classify) == 10
    assert all("(from OCR)" in r["messages"][0]["content"][1]["text"] for r in classify)
    assert result.usage.input_tokens == 11_000


@pytest.mark.asyncio
async def test_blank_page_costs_no_call() -> None:
    client = _client({})
    pages = [ParsePage(1, "", False, False, image=None)]
    result = await ChapterParseGraph(anthropic_provider(client))(BOOK, CHAPTER, pages)  # type: ignore[arg-type]
    assert [r["system"] for r in client.messages.requests] == []  # notes skipped too: no text
    assert result.usage == Usage()


@dataclass
class JsonMessages:
    """A provider without structured output: every call streams back JSON as text."""

    requests: list[dict] = field(default_factory=list)

    def stream(self, **kwargs: object) -> "FinalMessage":
        self.requests.append(kwargs)
        system = str(kwargs["system"])
        if system.startswith(CLASSIFY_SYSTEM):
            text = '{"kind": "mixed", "regions": [{"kind": "tab", "bbox": [0, 0.5, 1, 1]}],'
            text += ' "note": "half tab"}'
        elif system.startswith(NOTES_SYSTEM):
            note = '{"title": "音阶", "body": "七个音。", "pages": [2]}'
            text = f'Here: ```json\n{{"notes": [{note}]}}\n```'
        else:
            raise AssertionError("unexpected system prompt")
        block = SimpleNamespace(type="text", text=text)
        usage = SimpleNamespace(input_tokens=100, output_tokens=900)
        return FinalMessage(SimpleNamespace(stop_reason="end_turn", content=[block], usage=usage))


@dataclass
class FinalMessage:
    message: object

    async def __aenter__(self) -> "FinalMessage":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def get_final_message(self) -> object:
        return self.message


@pytest.mark.asyncio
async def test_a_provider_without_structured_output_parses_from_json() -> None:
    messages = JsonMessages()
    provider = Provider(
        name="deepseek",
        client=SimpleNamespace(messages=messages),  # type: ignore[arg-type]
        model="big",
        small_model="small",
        documents=False,
        structured_output=False,
        effort="low",
        thinking_tokens=10_000,
    )
    pages = [ParsePage(2, "音阶", False, True, image=b"png")]

    result = await ChapterParseGraph(provider)(BOOK, CHAPTER, pages)

    classify, notes = sorted(messages.requests, key=lambda r: r["model"] != "small")
    # The schema rides in the system prompt, nested regions spelled out.
    assert '"regions": [{' in classify["system"] and '"bbox": [number, …]' in classify["system"]
    # Each call's own cap plus the provider's room to think.
    assert classify["max_tokens"] == 1024 + 10_000
    assert notes["model"] == "big" and notes["max_tokens"] == 8192 + 10_000
    assert "output_format" not in classify and "output_format" not in notes
    assert [(n.title, n.pages) for n in result.notes] == [("音阶", (2,))]


# --- the job around the graph -------------------------------------------------


@dataclass
class FakeParseStore:
    rows: list[PageRow]
    finished: dict | None = None
    failed: str | None = None

    async def list_pages(self, book_id: str, page_start: int, page_end: int) -> list[PageRow]:
        return [r for r in self.rows if page_start <= r.page <= page_end]

    async def finish_parse(
        self, chapter_id: str, *, notes, exercises, chunks, usage, warnings=()
    ) -> None:
        self.finished = {
            "notes": list(notes),
            "exercises": list(exercises),
            "chunks": list(chunks),
            "usage": usage,
            "warnings": list(warnings),
        }

    async def fail_parse(self, chapter_id: str, message: str, usage: Usage | None = None) -> None:
        self.failed = message


async def _recording_graph(book, chapter, pages, tools=None):
    _recording_graph.pages = pages  # type: ignore[attr-defined]
    # The renderer is only good while the parse holds the PDF open: use it here.
    _recording_graph.crop = (  # type: ignore[attr-defined]
        await tools.renderer.render(3, (0.0, 0.5, 1.0, 1.0), 72) if tools else None
    )
    from app.parse import ChapterResult

    return ChapterResult(notes=[NoteRecord("t", "b", (1,))], exercises=[], chunks=[])


@needs_materials
@pytest.mark.asyncio
async def test_parser_renders_only_the_pages_the_graph_needs(
    typeset_pdf: Path, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger="book-service")
    rows = _pages(typeset_pdf)
    # Pretend the two prose pages were not tagged, so they go text-only.
    rows = [PageRow(r.page, r.text, r.text_source, r.page > 2) for r in rows]
    store = FakeParseStore(rows)
    parser = Parser(
        storage=FakeStorage({"u/b.pdf": typeset_pdf.read_bytes()}),  # type: ignore[arg-type]
        store=store,
        graph=_recording_graph,
        worker=asyncio.Semaphore(1),
    )
    await parser.run(BOOK, CHAPTER, "token")

    assert store.failed is None
    pages = _recording_graph.pages  # type: ignore[attr-defined]
    assert [p.image is None for p in pages] == [True, True] + [False] * 7
    assert all(p.image[:8] == b"\x89PNG\r\n\x1a\n" for p in pages if p.image)
    # The graph got a renderer over the same PDF, for the extractors' crops.
    crop = _recording_graph.crop  # type: ignore[attr-defined]
    assert crop is not None and crop[:8] == b"\x89PNG\r\n\x1a\n"
    assert store.finished is not None
    assert [n.title for n in store.finished["notes"]] == ["t"]
    # Chunks default to one per page of text when the graph leaves them empty.
    assert [c.page for c in store.finished["chunks"]] == list(range(1, 10))
    # The summary line says where the time went, step by step, in order.
    summary = next(r.getMessage() for r in caplog.records if "exercises" in r.getMessage())
    steps = ["pages", "download", "render_wait", "render", "sweep", "graph", "write"]
    found = [s for s in summary.split("; ", 1)[1].split("(", 1)[1].split() if s in steps]
    assert found == steps and "pdf " in summary


@needs_materials
@pytest.mark.asyncio
async def test_reparse_starts_from_an_empty_crop_folder(typeset_pdf: Path) -> None:
    """#246: the last parse's crops go before the graph writes this parse's."""
    rows = _pages(typeset_pdf)
    storage = FakeStorage(
        {
            "u/b.pdf": typeset_pdf.read_bytes(),
            "u/crops/c/p0003-1.png": b"last time",
            "u/crops/c/p0003-2.png": b"last time",
            "u/crops/other/p0001-1.png": b"another chapter",
        }
    )

    async def graph(book, chapter, pages, tools=None):
        from app.parse import ChapterResult

        assert tools is not None
        # By the time an extractor saves a crop, the folder is empty.
        assert not any(path.startswith("u/crops/c/") for path in storage.files)
        await tools.crops.save("p0003-1.png", b"this time")
        return ChapterResult()

    parser = Parser(
        storage=storage,  # type: ignore[arg-type]
        store=FakeParseStore(rows),
        graph=graph,
        worker=asyncio.Semaphore(1),
    )
    await parser.run(BOOK, CHAPTER, "token")

    assert storage.cleared == ["u/crops/c"]
    assert sorted(storage.files) == [
        "u/b.pdf",
        "u/crops/c/p0003-1.png",
        "u/crops/other/p0001-1.png",
    ]
    assert storage.files["u/crops/c/p0003-1.png"] == b"this time"


@pytest.mark.asyncio
async def test_parser_without_pages_fails_with_a_rescan_message() -> None:
    store = FakeParseStore([])
    parser = Parser(
        storage=FakeStorage({}),
        store=store,
        graph=_recording_graph,  # type: ignore[arg-type]
        worker=asyncio.Semaphore(1),
    )
    await parser.run(BOOK, CHAPTER, "token")
    assert store.failed is not None and "Rescan" in store.failed
