"""
The PyMuPDF boundary: everything that touches a PDF file lives here, so the
rest of the ingest package works on plain strings and tuples.

PyMuPDF is CPU-bound and synchronous; the endpoint (A3) runs these under
`asyncio.to_thread` so the event loop keeps answering status polls.

OCR is Tesseract, through the copy PyMuPDF's wheel already links against —
only the language data files have to be present (`tools/fetch-tessdata.sh`,
or the Dockerfile). It runs per page, only on pages without a text layer,
so a mixed PDF gets the cheap path wherever it can.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import pymupdf

# Below this many characters a page's "text layer" is a stray watermark or a
# page number, not text a reader could search or a model could read from.
MIN_TEXT_LAYER_CHARS = 40

# Enough for a model to read a scanned table of contents; small enough that a
# page image stays well under a megabyte.
TOC_RENDER_DPI = 110

# Calibration (docs/calibration.md): on a scanned Chinese method book the
# `fast` data at 150 dpi read the most terms and the most headings; higher
# dpi and the `best` data (10x slower) read no better. Both languages because
# the book's language is not known at upload; `chi_sim` alone is ~30% faster
# on a Chinese-only deployment (`BOOK_SERVICE_OCR_LANGUAGES`).
OCR_DEFAULT_LANGUAGES = "chi_sim+eng"
OCR_DEFAULT_DPI = 150

TextSource = Literal["layer", "ocr", "none"]


@dataclass(frozen=True)
class OutlineEntry:
    level: int
    title: str
    page: int  # 1-based; PyMuPDF reports -1 for a bookmark with no destination


@dataclass(frozen=True)
class PageText:
    page: int  # 1-based
    text: str
    text_source: TextSource

    @property
    def has_text_layer(self) -> bool:
        """The PDF carried this text itself (what `book_pages.has_text_layer` records)."""
        return self.text_source == "layer"

    @property
    def has_text(self) -> bool:
        """There is text to read, from the layer or from OCR."""
        return self.text_source != "none"


@dataclass(frozen=True)
class OcrConfig:
    tessdata: Path
    languages: str = OCR_DEFAULT_LANGUAGES
    dpi: int = OCR_DEFAULT_DPI

    def missing_languages(self) -> list[str]:
        """
        Language files not present under `tessdata`. Checked up front because
        Tesseract only raises when *no* language loads: with one of two
        missing it quietly reads the page in the other.
        """
        return [
            lang
            for lang in self.languages.split("+")
            if not (self.tessdata / f"{lang}.traineddata").is_file()
        ]


class UnreadablePdf(ValueError):
    """The bytes or file are not a PDF PyMuPDF can open."""


@contextmanager
def open_pdf(source: bytes | str | Path) -> Iterator[pymupdf.Document]:
    try:
        doc = (
            pymupdf.open(stream=source, filetype="pdf")
            if isinstance(source, bytes)
            else pymupdf.open(source)
        )
    except Exception as e:
        raise UnreadablePdf(str(e)) from e
    try:
        yield doc
    finally:
        doc.close()


def read_outline(doc: pymupdf.Document) -> list[OutlineEntry]:
    """The PDF's bookmarks, as authored; empty when the file has none."""
    return [
        OutlineEntry(level=level, title=title, page=page)
        for level, title, page in doc.get_toc(simple=True)
    ]


def ocr_page(page: pymupdf.Page, ocr: OcrConfig) -> str:
    """Tesseract over the whole page image. Raises if no language loads."""
    textpage = page.get_textpage_ocr(
        language=ocr.languages, dpi=ocr.dpi, full=True, tessdata=str(ocr.tessdata)
    )
    return page.get_text("text", textpage=textpage).strip()


def extract_page(page: pymupdf.Page, index: int, ocr: OcrConfig | None = None) -> PageText:
    """One page's text: the layer when it has one, else OCR when configured."""
    text = page.get_text("text").strip()
    if len(text) >= MIN_TEXT_LAYER_CHARS:
        return PageText(page=index, text=text, text_source="layer")
    if ocr is not None:
        text = ocr_page(page, ocr)
        if len(text) >= MIN_TEXT_LAYER_CHARS:
            return PageText(page=index, text=text, text_source="ocr")
    return PageText(page=index, text="", text_source="none")


def extract_pages(doc: pymupdf.Document, ocr: OcrConfig | None = None) -> list[PageText]:
    """Every page in reading order. A scan with `ocr` set takes seconds per page."""
    return [extract_page(page, index, ocr) for index, page in enumerate(doc, start=1)]


def render_page_png(doc: pymupdf.Document, page: int, dpi: int = TOC_RENDER_DPI) -> bytes:
    """One page as a PNG, for the vision steps."""
    return doc[page - 1].get_pixmap(dpi=dpi).tobytes("png")
