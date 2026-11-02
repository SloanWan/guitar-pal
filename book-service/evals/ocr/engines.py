"""
The OCR engines under comparison (#369), each reading one PDF page.

Tesseract runs as the scan did before #417 (PyMuPDF's bundled library, one
thread); only the language data differs between `fast` and `best`. PP-OCR runs
through RapidOCR on ONNX Runtime, CPU only, with its default thread pool — the
scan's engine since #417 (`ppocrv6-tiny+cdla` is its exact reading). Every
engine reads the page at the scan's 150 dpi.
"""

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pymupdf

from app.ingest.ocr import OCR_DPI
from evals.ocr.pipeline import Read, pipeline

SERVICE = Path(__file__).parent.parent.parent
TESSDATA_FAST = SERVICE / "tessdata"
TESSDATA_BEST = SERVICE / "tessdata" / "best"
# What the scan read with before #417: both languages, since a book's is not
# known at upload.
TESSERACT_LANGUAGES = "chi_sim+eng"


@dataclass(frozen=True)
class Engine:
    id: str
    label: str
    group: str
    notes: str
    # Built lazily: model files load (and on first use, download) here. A plain
    # engine returns the text; a layered one (#375) a Read with its cost.
    build: Callable[[], Callable[[pymupdf.Page], str | Read]]


def _tesseract(tessdata: Path) -> Callable[[], Callable[[pymupdf.Page], str]]:
    def build() -> Callable[[pymupdf.Page], str]:
        # Checked up front: Tesseract only raises when *no* language loads.
        missing = [
            lang
            for lang in TESSERACT_LANGUAGES.split("+")
            if not (tessdata / f"{lang}.traineddata").is_file()
        ]
        if missing:
            raise RuntimeError(f"{tessdata} lacks {', '.join(missing)}.traineddata")

        def read(page: pymupdf.Page) -> str:
            textpage = page.get_textpage_ocr(
                language=TESSERACT_LANGUAGES, dpi=OCR_DPI, full=True, tessdata=str(tessdata)
            )
            return page.get_text("text", textpage=textpage).strip()

        return read

    return build


def _rapidocr(version: str, size: str) -> Callable[[], Callable[[pymupdf.Page], str]]:
    def build() -> Callable[[pymupdf.Page], str]:
        from rapidocr import LangDet, LangRec, ModelType, OCRVersion, RapidOCR

        ocr_version = OCRVersion(version)
        model_type = ModelType(size)
        engine = RapidOCR(
            params={
                "Global.log_level": "warning",
                "Det.ocr_version": ocr_version,
                "Det.model_type": model_type,
                "Det.lang_type": LangDet.CH,
                "Rec.ocr_version": ocr_version,
                "Rec.model_type": model_type,
                "Rec.lang_type": LangRec.CH,
            }
        )

        def read(page: pymupdf.Page) -> str:
            pix = page.get_pixmap(dpi=OCR_DPI)
            image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
            if pix.n == 4:
                image = image[:, :, :3]
            result = engine(np.ascontiguousarray(image[:, :, ::-1]))  # RGB → BGR
            return "\n".join(result.txts or ())

        return read

    return build


ENGINES: dict[str, Engine] = {
    engine.id: engine
    for engine in [
        Engine(
            "tesseract-fast",
            "Tesseract fast",
            "Tesseract",
            "tessdata_fast chi_sim+eng — what the scan uses today",
            _tesseract(TESSDATA_FAST),
        ),
        Engine(
            "tesseract-best",
            "Tesseract best",
            "Tesseract",
            "tessdata_best chi_sim+eng",
            _tesseract(TESSDATA_BEST),
        ),
        Engine(
            "ppocrv5-mobile",
            "PP-OCRv5 mobile",
            "PP-OCR (RapidOCR)",
            "ONNX Runtime, CPU",
            _rapidocr("PP-OCRv5", "mobile"),
        ),
        Engine(
            "ppocrv5-server",
            "PP-OCRv5 server",
            "PP-OCR (RapidOCR)",
            "ONNX Runtime, CPU",
            _rapidocr("PP-OCRv5", "server"),
        ),
        Engine(
            "ppocrv6-tiny",
            "PP-OCRv6 tiny",
            "PP-OCR (RapidOCR)",
            "ONNX Runtime, CPU",
            _rapidocr("PP-OCRv6", "tiny"),
        ),
        Engine(
            "ppocrv6-small",
            "PP-OCRv6 small",
            "PP-OCR (RapidOCR)",
            "ONNX Runtime, CPU — RapidOCR's default",
            _rapidocr("PP-OCRv6", "small"),
        ),
        Engine(
            "ppocrv6-medium",
            "PP-OCRv6 medium",
            "PP-OCR (RapidOCR)",
            "ONNX Runtime, CPU",
            _rapidocr("PP-OCRv6", "medium"),
        ),  # #375: PP-OCRv6 tiny with layers. A — a layout model keeps notation out
        # of the prose; B — unsure lines read again by a vision model; C — the
        # page corrected by a text model. B and C sit on A's best mask.
        Engine(
            "ppocrv6-tiny+v3-all",
            "PP-OCRv6 tiny + layout, drop regions",
            "PP-OCR + layers (#375)",
            "PP-DocLayoutV3: every line in an image/chart region dropped",
            pipeline(layout="pp_doc_layoutv3", mask="all"),
        ),
        Engine(
            "ppocrv6-tiny+v3",
            "PP-OCRv6 tiny + layout, drop notation lines",
            "PP-OCR + layers (#375)",
            "PP-DocLayoutV3: lines in image/chart regions dropped unless they read as prose",
            pipeline(layout="pp_doc_layoutv3"),
        ),
        Engine(
            "ppocrv6-tiny+cdla",
            "PP-OCRv6 tiny + CDLA layout, drop notation lines",
            "PP-OCR + layers (#375)",
            "PP layout (CDLA): figure/table/equation regions, prose lines kept",
            pipeline(layout="pp_layout_cdla"),
        ),
        Engine(
            "ppocrv6-tiny+v3+reread-sonnet",
            "PP-OCRv6 tiny + layout + re-read (Sonnet 5)",
            "PP-OCR + layers (#375)",
            "lines scored under 0.85 read again from a 300 dpi crop by claude-sonnet-5",
            pipeline(layout="pp_doc_layoutv3", reread_with=("anthropic", "claude-sonnet-5")),
        ),
        Engine(
            "ppocrv6-tiny+v3+reread-deepseek",
            "PP-OCRv6 tiny + layout + re-read (DeepSeek)",
            "PP-OCR + layers (#375)",
            "lines scored under 0.85 read again from a 300 dpi crop by deepseek-flash",
            pipeline(layout="pp_doc_layoutv3", reread_with=("deepseek", "deepseek-flash")),
        ),
        Engine(
            "ppocrv6-tiny+v3+correct-deepseek",
            "PP-OCRv6 tiny + layout + text correction (DeepSeek)",
            "PP-OCR + layers (#375)",
            "the page's text corrected from context by deepseek-flash, no image",
            pipeline(layout="pp_doc_layoutv3", correct_with=("deepseek", "deepseek-flash")),
        ),
    ]
}
