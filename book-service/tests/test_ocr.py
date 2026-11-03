"""
OCR on the scanned excerpt. What these pin down is calibrated behaviour
(docs/calibration.md), not PP-OCR's exact output: character errors are
expected, headings are sometimes lost, prose and section vocabulary come
through, and the notation's digits stay out (#417).
"""

from pathlib import Path

import pytest

from app.ingest.ocr import Line, PageOcr, keep_lines, looks_like_prose
from app.ingest.pdf import extract_pages, open_pdf
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


def test_prose_lines_survive_inside_a_notation_region() -> None:
    assert looks_like_prose("旋律音位置：")
    assert looks_like_prose("TIP: Example 21 also uses a new type of E5")
    for notation in ("1 2 3 1 | 3 4 5", "E5", "BEAT: 1 2 3 4", "0-3-2-0", "Am C G"):
        assert not looks_like_prose(notation), notation


def test_models_ready_needs_every_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.ingest import ocr

    files = [tmp_path / "det.onnx", tmp_path / "rec.onnx"]
    monkeypatch.setattr(ocr, "model_paths", lambda: files)
    files[0].write_bytes(b"")
    assert not ocr.models_ready()
    files[1].write_bytes(b"")
    assert ocr.models_ready()
    monkeypatch.setattr(ocr, "model_paths", lambda: None)
    assert not ocr.models_ready()


def test_keep_lines_masks_regions_by_mode() -> None:
    region = (0.0, 100.0, 500.0, 300.0)
    prose_outside = Line("正文第一段", 0.99, (10, 10, 400, 30))
    label_inside = Line("加入基本节奏型：", 0.95, (10, 120, 200, 140))
    tab_inside = Line("0 1 3 0 1 3", 0.9, (210, 150, 480, 170))
    lines = [prose_outside, label_inside, tab_inside]
    assert keep_lines(lines, [region], "all") == [prose_outside]
    assert keep_lines(lines, [region]) == [prose_outside, label_inside]
    assert keep_lines(lines, [], "all") == lines


@needs_materials
@needs_ocr
def test_typeset_pages_keep_their_layer_even_with_ocr_on(typeset_pdf: Path, ocr: PageOcr) -> None:
    with open_pdf(typeset_pdf) as doc:
        pages = extract_pages(doc, ocr)
    assert {p.text_source for p in pages} == {"layer"}


@needs_materials
@needs_ocr
def test_scanned_excerpt_reads_through_ocr(scanned_pdf: Path, ocr: PageOcr) -> None:
    with open_pdf(scanned_pdf) as doc:
        pages = extract_pages(doc, ocr)

    assert {p.text_source for p in pages} == {"ocr"}
    assert all(not p.has_text_layer and p.has_text for p in pages)
    # Prose pages come back as several hundred characters. p3 is three chord
    # definitions over diagrams and a cartoon: its prose is all there, the
    # diagrams' marks are not — Tesseract read ~270 characters of noise off them
    # ("BEEKY", "|| [| |"), which is what the layout mask keeps out (#417).
    assert all(len(p.text) > 150 for p in pages)
    for term in ("小三和弦", "增三和弦", "减三和弦"):
        assert term in pages[2].text
    assert "BEEKY" not in pages[2].text and "[|" not in pages[2].text
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
    scanned_pdf: Path, ocr: PageOcr
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
