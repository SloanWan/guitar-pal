import logging
from collections.abc import Sequence
from pathlib import Path

import pytest

from app.ingest.pdf import (
    OutlineEntry,
    PageText,
    extract_pages,
    open_pdf,
    read_outline,
    render_page_png,
)
from app.ingest.toc import (
    DIGEST_MAX_CHARS,
    WHOLE_BOOK_TITLE,
    Chapter,
    ChapterStart,
    TocResult,
    chapters_from_outline,
    contents_pages,
    find_chapters,
    finish_chapters,
    has_readable_text,
    is_scanned,
    toc_digest,
    vision_toc_pages,
)
from tests.conftest import needs_live_model, needs_materials


class FakeReader:
    """A reader that answers with a fixed list and remembers what it was asked."""

    def __init__(self, answer: Sequence[ChapterStart]) -> None:
        self.answer = answer
        self.calls: list[object] = []

    async def __call__(self, request: object) -> Sequence[ChapterStart]:
        self.calls.append(request)
        return self.answer


def _load(path: Path) -> tuple[list[OutlineEntry], list[PageText]]:
    with open_pdf(path) as doc:
        return read_outline(doc), extract_pages(doc)


# --- finish_chapters --------------------------------------------------------


def test_finish_chapters_orders_dedupes_and_derives_ends() -> None:
    starts = [
        ChapterStart("Three", 10),
        ChapterStart("One", 2),
        ChapterStart("  Two  spaced ", 6),
        ChapterStart("Duplicate of two", 6),
        ChapterStart("", 8),
        ChapterStart("Out of range", 99),
        ChapterStart("Zero", 0),
    ]
    assert finish_chapters(starts, page_count=12) == (
        Chapter("Page 1", 1, 1),
        Chapter("One", 2, 5),
        Chapter("Two spaced", 6, 9),
        Chapter("Three", 10, 12),
    )


def test_finish_chapters_truncates_titles_to_the_column_limit() -> None:
    (chapter,) = finish_chapters([ChapterStart("x" * 300, 1)], page_count=1)
    assert len(chapter.title) == 200


# --- 1. outline ---------------------------------------------------------------


@needs_materials
def test_outline_flattens_to_the_shallowest_level_with_two_entries(bookmarked_pdf: Path) -> None:
    outline, pages = _load(bookmarked_pdf)
    assert len(outline) == 9
    # Level 1 has one entry (the chapter), level 2 one (the section): the seven
    # key sheets at level 3 are the first level that gives the reader a choice.
    chapters = chapters_from_outline(outline, len(pages))
    assert [c.title for c in chapters] == ["Pages 1–2", *(f"Key of {k} Major" for k in "CDEFGAB")]
    assert [(c.page_start, c.page_end) for c in chapters] == [
        (1, 2),
        *((n, n) for n in range(3, 10)),
    ]


def test_outline_skips_bookmarks_without_a_destination() -> None:
    outline = [
        OutlineEntry(1, "Broken", -1),
        OutlineEntry(1, "Start", 1),
        OutlineEntry(1, "End", 5),
    ]
    assert chapters_from_outline(outline, 8) == (Chapter("Start", 1, 4), Chapter("End", 5, 8))


def test_pages_before_the_first_chapter_are_a_chapter_too() -> None:
    assert chapters_from_outline([OutlineEntry(1, "Only", 3)], 6) == (
        Chapter("Pages 1–2", 1, 2),
        Chapter("Only", 3, 6),
    )


def test_outline_with_one_entry_is_one_chapter() -> None:
    assert chapters_from_outline([OutlineEntry(1, "Only", 1)], 6) == (Chapter("Only", 1, 6),)


# --- 2. text layer ------------------------------------------------------------


@needs_materials
def test_typeset_excerpt_digest(typeset_pdf: Path) -> None:
    _, pages = _load(typeset_pdf)
    assert not is_scanned(pages)
    # The excerpt has no contents page; the digest is the page heads alone.
    assert contents_pages(pages) == []
    digest = toc_digest(pages)
    assert digest.startswith("The book has 9 pages.")
    # Page-number lines are dropped from the heads; running headers stay.
    assert "p1: CHAPTER 1 — INTRODUCTION / Songwriting Cheat Sheets" in digest
    assert "p4: CHAPTER 3 — SONGWRITING CHEAT SHEETS / Key of D Major" in digest
    assert len(digest) < 2_000  # ~500 tokens: what the text-TOC call costs on this excerpt


def test_contents_page_is_found_by_heading_or_page_numbers() -> None:
    assert contents_pages([PageText(1, "Contents\nChapter 1 ... 3\nChapter 2 ... 9", "layer")]) == [
        1
    ]
    assert contents_pages([PageText(1, "目录\n第一章 和弦 3", "layer")]) == [1]
    dotted = "\n".join(f"{n}. Lesson {n} ........ {n * 4}" for n in range(1, 8))
    assert contents_pages([PageText(1, dotted, "layer")]) == [1]
    assert (
        contents_pages([PageText(1, "Chapter 1\nOpen chords and how to hold them.", "layer")]) == []
    )
    # Lines ending in numbers that do not run upward are a diagram, not a contents page.
    frets = "\n".join(
        f"string {s} fret {n}" for s, n in zip("EADGBEAD", (3, 1, 7, 2, 9, 4, 8, 5), strict=True)
    )
    assert contents_pages([PageText(1, frets, "layer")]) == []


def test_digest_thins_out_for_a_long_book() -> None:
    line = "A long heading line that fills the width of the page and then some more"
    pages = [PageText(n, "\n".join([line] * 6), "layer") for n in range(1, 1201)]
    digest = toc_digest(pages)
    assert len(digest) <= DIGEST_MAX_CHARS
    assert "first 1 line(s)" in digest


# --- 3. scanned ---------------------------------------------------------------


@needs_materials
def test_scanned_excerpt_is_scanned_and_renders_its_front_matter(scanned_pdf: Path) -> None:
    _, pages = _load(scanned_pdf)
    assert is_scanned(pages)
    assert vision_toc_pages(pages) == [1, 2, 3, 4, 5, 6, 7, 8]
    with open_pdf(scanned_pdf) as doc:
        png = render_page_png(doc, 1)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    assert len(png) < 1_000_000


# --- the pipeline -------------------------------------------------------------


@needs_materials
@pytest.mark.asyncio
async def test_outline_wins_without_any_model_call(bookmarked_pdf: Path) -> None:
    outline, pages = _load(bookmarked_pdf)
    reader = FakeReader([ChapterStart("Should not be used", 1)])
    result = await find_chapters(
        outline=outline, pages=pages, read_text_toc=reader, read_vision_toc=reader, render_page=None
    )
    assert result.source == "outline"
    assert len(result.chapters) == 8
    assert reader.calls == []


@needs_materials
@pytest.mark.asyncio
async def test_typeset_book_without_bookmarks_asks_the_text_reader(typeset_pdf: Path) -> None:
    outline, pages = _load(typeset_pdf)
    assert outline == []
    text_reader = FakeReader([ChapterStart("Songwriting Cheat Sheets", 1)])
    vision_reader = FakeReader([ChapterStart("Should not be used", 1)])
    result = await find_chapters(
        outline=outline,
        pages=pages,
        read_text_toc=text_reader,
        read_vision_toc=vision_reader,
        render_page=lambda n: b"",
    )
    assert result == TocResult("text", (Chapter("Songwriting Cheat Sheets", 1, 9),))
    assert text_reader.calls == [toc_digest(pages)]
    assert vision_reader.calls == []


@needs_materials
@pytest.mark.asyncio
async def test_typeset_book_nobody_can_read_is_one_manual_chapter(typeset_pdf: Path) -> None:
    """An excerpt with no findable structure is still openable as a whole."""
    outline, pages = _load(typeset_pdf)
    whole = TocResult("manual", (Chapter(WHOLE_BOOK_TITLE, 1, 9),))
    for read_text_toc in (FakeReader([]), None):
        result = await find_chapters(
            outline=outline,
            pages=pages,
            read_text_toc=read_text_toc,
            read_vision_toc=None,
            render_page=None,
        )
        assert result == whole


@needs_materials
@pytest.mark.asyncio
async def test_scanned_book_goes_to_vision_then_manual(scanned_pdf: Path) -> None:
    outline, pages = _load(scanned_pdf)
    text_reader = FakeReader([ChapterStart("Should not be used", 1)])
    rendered: list[int] = []

    def render(n: int) -> bytes:
        rendered.append(n)
        return b"png"

    vision_reader = FakeReader(
        [ChapterStart("第七章 和弦", 1), ChapterStart("第八章 C大调和A小调", 4)]
    )
    result = await find_chapters(
        outline=outline,
        pages=pages,
        read_text_toc=text_reader,
        read_vision_toc=vision_reader,
        render_page=render,
    )
    assert result == TocResult(
        "vision", (Chapter("第七章 和弦", 1, 3), Chapter("第八章 C大调和A小调", 4, 10))
    )
    assert text_reader.calls == []
    assert rendered == [1, 2, 3, 4, 5, 6, 7, 8]
    assert vision_reader.calls == [[(n, b"png") for n in range(1, 9)]]

    without_vision = await find_chapters(
        outline=outline,
        pages=pages,
        read_text_toc=text_reader,
        read_vision_toc=None,
        render_page=None,
    )
    assert without_vision == TocResult("manual", (Chapter(WHOLE_BOOK_TITLE, 1, 10),))


# --- live: the real model on the real excerpt ---------------------------------


@needs_materials
@needs_live_model
@pytest.mark.asyncio
async def test_live_text_toc_on_the_typeset_excerpt(
    typeset_pdf: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """
    One real call (~300 tokens in, a few dozen out). The excerpt opens on the
    chapter 3 title page and then runs its section 3.1; the model should
    anchor on the chapter page, or at worst on the section's first page.
    """
    from app.ingest.model import AnthropicTextTocReader

    outline, pages = _load(typeset_pdf)
    with caplog.at_level(logging.INFO, logger="book-service"):
        result = await find_chapters(
            outline=outline,
            pages=pages,
            read_text_toc=AnthropicTextTocReader(),
            read_vision_toc=None,
            render_page=None,
        )
    print("\n".join(r.message for r in caplog.records if "text toc" in r.message))
    print(result)
    assert result.source == "text"
    assert any(c.page_start in (1, 2) and "songwriting" in c.title.lower() for c in result.chapters)


def test_scanned_and_readable_are_judged_by_text_source() -> None:
    layer = PageText(1, "x" * 100, "layer")
    ocr = PageText(2, "y" * 100, "ocr")
    none = PageText(3, "", "none")
    # A scan is a scan whether or not OCR read it; readable means any text at all.
    assert is_scanned([ocr, ocr, none]) and has_readable_text([ocr, ocr, none])
    assert is_scanned([none, none, layer]) and not has_readable_text([none, none, layer])
    assert not is_scanned([layer, layer, none]) and has_readable_text([layer, layer, none])
    assert is_scanned([]) and not has_readable_text([])
