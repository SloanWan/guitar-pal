"""
The PyMuPDF boundary: everything that touches a PDF file lives here, so the
rest of the ingest package works on plain strings and tuples.

PyMuPDF is CPU-bound and synchronous; the endpoint (A3) runs these under
`asyncio.to_thread` so the event loop keeps answering status polls.

OCR is PP-OCRv6 tiny with a layout mask (`ocr.py`, #417). It runs per page,
only on pages without a text layer, so a mixed PDF gets the cheap path
wherever it can.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import pymupdf

from app.ingest.ocr import PageOcr

# Below this many characters a page's "text layer" is a stray watermark or a
# page number, not text a reader could search or a model could read from.
MIN_TEXT_LAYER_CHARS = 40

# Enough for a model to read a scanned table of contents; small enough that a
# page image stays well under a megabyte.
TOC_RENDER_DPI = 110
# What the chapter parse reads notation and tab from: legible digits on a
# tab line, ~3k image tokens for an A4 page — used only on pages an
# extractor is sent to.
PARSE_RENDER_DPI = 150
# What the classifier sees. Calibration: 100 dpi sorted every page the same
# as 150 and reported the same regions, at ~1.3k image tokens instead of ~3k.
CLASSIFY_RENDER_DPI = 100

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


def extract_page(page: pymupdf.Page, index: int, ocr: PageOcr | None = None) -> PageText:
    """One page's text: the layer when it has one, else OCR when configured."""
    text = page.get_text("text").strip()
    if len(text) >= MIN_TEXT_LAYER_CHARS:
        return PageText(page=index, text=text, text_source="layer")
    if ocr is not None:
        text = ocr.read(page)
        if len(text) >= MIN_TEXT_LAYER_CHARS:
            return PageText(page=index, text=text, text_source="ocr")
    return PageText(page=index, text="", text_source="none")


def extract_pages(doc: pymupdf.Document, ocr: PageOcr | None = None) -> list[PageText]:
    """Every page in reading order. A scan with `ocr` set takes seconds per page."""
    return [extract_page(page, index, ocr) for index, page in enumerate(doc, start=1)]


def render_page_png(doc: pymupdf.Document, page: int, dpi: int = TOC_RENDER_DPI) -> bytes:
    """One page as a PNG, for the vision steps."""
    return doc[page - 1].get_pixmap(dpi=dpi).tobytes("png")


def crop_page_png(
    doc: pymupdf.Document,
    page: int,
    region: tuple[float, float, float, float],
    dpi: int = PARSE_RENDER_DPI,
) -> bytes:
    """
    Part of a page as a PNG: `region` is (x0, y0, x1, y1) as fractions of the
    page's width and height, which is how the classifier reports where a
    thing sits, independent of dpi. Clamped to the page.
    """
    rect = doc[page - 1].rect
    x0, y0, x1, y1 = (min(max(v, 0.0), 1.0) for v in region)
    clip = pymupdf.Rect(
        rect.x0 + rect.width * min(x0, x1),
        rect.y0 + rect.height * min(y0, y1),
        rect.x0 + rect.width * max(x0, x1),
        rect.y0 + rect.height * max(y0, y1),
    )
    if clip.is_empty:
        clip = rect
    return doc[page - 1].get_pixmap(dpi=dpi, clip=clip).tobytes("png")
