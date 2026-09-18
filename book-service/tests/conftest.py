"""
The ingest tests run against two real excerpts in `materials/` (gitignored:
textbooks are copyrighted). Tests that need them skip when the folder is
absent — CI has no materials and runs the rest.

  materials/SongWritingFromMajorKeys.pdf     9 typeset pages, text layer, no bookmarks
  materials/吉他自学三月通-和弦部分.pdf        10 scanned pages, no text layer
"""

import os
from pathlib import Path

import pymupdf
import pytest

from app.ingest.pdf import OcrConfig

BOOK_SERVICE = Path(__file__).resolve().parent.parent
MATERIALS = BOOK_SERVICE / "materials"
# `tools/fetch-tessdata.sh` puts the language files here; a deployment names
# its own directory in TESSDATA_PREFIX.
TESSDATA = Path(os.environ.get("TESSDATA_PREFIX", BOOK_SERVICE / "tessdata"))
TYPESET_PDF = MATERIALS / "SongWritingFromMajorKeys.pdf"
SCANNED_PDF = MATERIALS / "吉他自学三月通-和弦部分.pdf"

needs_materials = pytest.mark.skipif(
    not (TYPESET_PDF.exists() and SCANNED_PDF.exists()),
    reason="real textbook excerpts not present in book-service/materials/",
)

needs_ocr = pytest.mark.skipif(
    bool(OcrConfig(TESSDATA).missing_languages()),
    reason="Tesseract language data not present (tools/fetch-tessdata.sh)",
)

# The live model call costs money; opt in per run.
needs_live_model = pytest.mark.skipif(
    os.environ.get("BOOK_SERVICE_LIVE_MODEL") != "1",
    reason="set BOOK_SERVICE_LIVE_MODEL=1 (and ANTHROPIC_API_KEY) to call the model",
)


@pytest.fixture
def typeset_pdf() -> Path:
    return TYPESET_PDF


@pytest.fixture
def scanned_pdf() -> Path:
    return SCANNED_PDF


@pytest.fixture
def ocr() -> OcrConfig:
    return OcrConfig(TESSDATA)


@pytest.fixture
def bookmarked_pdf(tmp_path: Path) -> Path:
    """
    The typeset excerpt with the bookmarks its publisher could have added:
    the book's own structure (chapter 3, its section 3.1, the seven key
    sheets under it) written into a copy, so the outline path runs on real
    pages rather than a made-up file.
    """
    doc = pymupdf.open(TYPESET_PDF)
    doc.set_toc(
        [
            [1, "Chapter 3: Songwriting Cheat Sheets", 1],
            [2, "3.1 Major songwriting chord maps", 2],
            [3, "Key of C Major", 3],
            [3, "Key of D Major", 4],
            [3, "Key of E Major", 5],
            [3, "Key of F Major", 6],
            [3, "Key of G Major", 7],
            [3, "Key of A Major", 8],
            [3, "Key of B Major", 9],
        ]
    )
    path = tmp_path / "bookmarked.pdf"
    doc.save(path)
    doc.close()
    return path
