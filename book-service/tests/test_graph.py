"""
The chapter graph with the model replaced, on the real excerpts: which
pages get an image, how classifications and notes come back, how usage adds
up. The prompts' quality is the live test's business (`test_live_books.py`).
"""

import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.graph.chapter import ChapterParseGraph
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
                    NoteOut(title="Diatonic chords", body="Seven chords fit a key.", pages=[2, 99]),
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


@needs_materials
@pytest.mark.asyncio
async def test_graph_classifies_every_page_and_writes_notes(typeset_pdf: Path) -> None:
    client = _client({3: "progression_map", 4: "mixed"})
    graph = ChapterParseGraph(client)  # type: ignore[arg-type]
    pages = _parse_pages(_pages(typeset_pdf))

    result = await graph(BOOK, CHAPTER, pages)

    classify = [r for r in client.messages.requests if r["system"] == CLASSIFY_SYSTEM]
    notes = [r for r in client.messages.requests if r["system"] == NOTES_SYSTEM]
    assert len(classify) == 9 and len(notes) == 1
    # Every page of this excerpt is tagged, so every classification carries the image.
    assert all(any(b["type"] == "image" for b in r["messages"][0]["content"]) for r in classify)
    # The notes call sees the chapter text page by page.
    assert "[Page 3]" in notes[0]["messages"][0]["content"]

    assert [n.title for n in result.notes] == ["Diatonic chords"]
    assert result.notes[0].pages == (2,)  # page 99 is not in the chapter
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
    result = await ChapterParseGraph(client)(BOOK, CHAPTER, _parse_pages(rows))  # type: ignore[arg-type]
    classify = [r for r in client.messages.requests if r["system"] == CLASSIFY_SYSTEM]
    assert len(classify) == 10
    assert all("(from OCR)" in r["messages"][0]["content"][1]["text"] for r in classify)
    assert result.usage.input_tokens == 11_000


@pytest.mark.asyncio
async def test_blank_page_costs_no_call() -> None:
    client = _client({})
    pages = [ParsePage(1, "", False, False, image=None)]
    result = await ChapterParseGraph(client)(BOOK, CHAPTER, pages)  # type: ignore[arg-type]
    assert [r["system"] for r in client.messages.requests] == []  # notes skipped too: no text
    assert result.usage == Usage()


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
async def test_parser_renders_only_the_pages_the_graph_needs(typeset_pdf: Path) -> None:
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
