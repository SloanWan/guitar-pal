"""
OCR on the scanned excerpt. What these pin down is calibrated behaviour
(docs/calibration.md), not Tesseract's exact output: character errors are
expected, headings are often lost, prose and section vocabulary come through.
"""

from pathlib import Path

import pytest

from app.ingest.pdf import OcrConfig, extract_pages, open_pdf
from app.ingest.tag import tag_text
from app.ingest.toc import (
    Chapter,
    ChapterStart,
    TocResult,
    contents_pages,
    find_chapters,
    has_readable_text,
    is_scanned,
    toc_digest,
)
from tests.conftest import needs_materials, needs_ocr
from tests.test_toc import FakeReader


def test_missing_languages_are_named(tmp_path: Path) -> None:
    (tmp_path / "eng.traineddata").write_bytes(b"")
    assert OcrConfig(tmp_path, languages="chi_sim+eng").missing_languages() == ["chi_sim"]
    assert OcrConfig(tmp_path, languages="eng").missing_languages() == []


@needs_materials
@needs_ocr
def test_typeset_pages_keep_their_layer_even_with_ocr_on(typeset_pdf: Path, ocr: OcrConfig) -> None:
    with open_pdf(typeset_pdf) as doc:
        pages = extract_pages(doc, ocr)
    assert {p.text_source for p in pages} == {"layer"}


@needs_materials
@needs_ocr
def test_scanned_excerpt_reads_through_ocr(scanned_pdf: Path, ocr: OcrConfig) -> None:
    with open_pdf(scanned_pdf) as doc:
        pages = extract_pages(doc, ocr)

    assert {p.text_source for p in pages} == {"ocr"}
    assert all(not p.has_text_layer and p.has_text for p in pages)
    # Prose pages come back as several hundred characters; diagram pages as fragments.
    assert all(len(p.text) > 300 for p in pages)
    # Still a scan for the vision step, readable for the text step.
    assert is_scanned(pages)
    assert has_readable_text(pages)
    # Diagram pages are full of lines ending in fret numbers; none is a contents page.
    assert contents_pages(pages) == []

    # The chord-change section (p9) mentions 练习; the theory pages before it do not.
    tags = {p.page: tag_text(p.text).reasons for p in pages}
    assert tags[9] == ("keyword",)
    assert tags[1] == ()
    assert not any("tab_lines" in r or "stroke_notation" in r for r in tags.values())


@needs_materials
@needs_ocr
@pytest.mark.asyncio
async def test_scanned_book_with_ocr_tries_text_before_vision(
    scanned_pdf: Path, ocr: OcrConfig
) -> None:
    with open_pdf(scanned_pdf) as doc:
        pages = extract_pages(doc, ocr)
    digest = toc_digest(pages)
    assert not any(line.endswith("[no text]") for line in digest.splitlines())

    # Calibration: from this digest the real model found chapter 8 at p4 and
    # not chapter 7, whose banner OCR did not read; p1-3 still get a chapter.
    text_reader = FakeReader([ChapterStart("第八章", 4)])
    vision_reader = FakeReader([ChapterStart("Should not be used", 1)])
    result = await find_chapters(
        outline=[],
        pages=pages,
        read_text_toc=text_reader,
        read_vision_toc=vision_reader,
        render_page=lambda n: b"",
    )
    assert result == TocResult("text", (Chapter("Pages 1–3", 1, 3), Chapter("第八章", 4, 10)))
    assert text_reader.calls == [digest]
    assert vision_reader.calls == []

    # When the text step finds nothing the scan still gets its vision step.
    rendered: list[int] = []
    result = await find_chapters(
        outline=[],
        pages=pages,
        read_text_toc=FakeReader([]),
        read_vision_toc=vision_reader,
        render_page=lambda n: rendered.append(n) or b"png",
    )
    assert result.source == "vision"
    assert rendered == [1, 2, 3, 4, 5, 6, 7, 8]
