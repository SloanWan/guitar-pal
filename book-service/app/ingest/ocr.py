"""
OCR for scanned pages (#417): PP-OCRv6 tiny through RapidOCR on ONNX Runtime,
CPU only, with a layout model in front that keeps notation out of the prose.

Calibration (docs/calibration.md §11–§12), 26 scanned sample pages: Tesseract
`tessdata_fast` read them at ~70% character F1 and 2.7 s a page; PP-OCRv6 tiny
alone at 83%, its precision pulled down by tab digits read as text; with the
CDLA layout mask 93.5% at 0.74 s. PP-DocLayoutV3 scores 0.8 higher but weighs
130 MB to CDLA's 7 MB, so the image and the server's memory stay small.

The layout classes have no music notation; on our pages tab, staves and
numbered notation come out as `figure`, `table` or `equation`. Those regions
also hold real prose — a "旋律音位置：" label, a TIP paragraph printed inside
the example — so the mask drops only the lines in them that do not read as
prose.

The models are fetched once, at build time (`python -m app.ingest.ocr
--fetch`, the Dockerfile's deps stage), never on a request: `models_ready()`
looks for the files without downloading, and a process without them scans
with no OCR. This module imports no other `app` module, so the Dockerfile can
run it before the app is copied.
"""

import argparse
import re
import sys
import threading
from dataclasses import dataclass
from importlib.util import find_spec
from pathlib import Path
from typing import Any

import numpy as np
import pymupdf

# The scan's render for OCR. Calibration: the gain over 150 dpi was nil for
# Tesseract, and PP-OCR was measured here.
OCR_DPI = 150
OCR_VERSION = "PP-OCRv6"
OCR_SIZE = "tiny"
LAYOUT_MODEL = "pp_layout_cdla"

# Classes a region of notation lands in, per layout model.
NOTATION_CLASSES = {
    "pp_doc_layoutv3": {"image", "chart"},
    "pp_layout_cdla": {"figure", "table", "equation"},
}

# What RapidOCR and rapid-layout download into their package folders.
MODEL_FILES = (
    ("rapidocr", "models/PP-OCRv6_det_tiny.onnx"),
    ("rapidocr", "models/PP-OCRv6_rec_tiny.onnx"),
    ("rapidocr", "models/ch_ppocr_mobile_v2.0_cls_mobile.onnx"),
    ("rapid_layout", "models/layout_cdla.onnx"),
)

CJK = re.compile(r"[一-鿿]")
WORD = re.compile(r"[A-Za-z]{3,}")

Box = tuple[float, float, float, float]


@dataclass(frozen=True)
class Line:
    text: str
    score: float
    box: Box  # x0, y0, x1, y1 in page pixels at the OCR render


def looks_like_prose(text: str) -> bool:
    """
    A line worth keeping inside a notation region: a label or a sentence, not
    fret numbers, numbered notation, chord names or a beat count.
    """
    return len(CJK.findall(text)) >= 2 or len(WORD.findall(text)) >= 2


def inside(line: Line, region: Box) -> bool:
    cx = (line.box[0] + line.box[2]) / 2
    cy = (line.box[1] + line.box[3]) / 2
    return region[0] <= cx <= region[2] and region[1] <= cy <= region[3]


def keep_lines(lines: list[Line], regions: list[Box], mode: str = "notation_lines") -> list[Line]:
    """
    Lines outside every notation region always stay. Inside one, `all` drops
    every line and `notation_lines` drops only those that do not read as prose.
    """
    out = []
    for line in lines:
        if not any(inside(line, r) for r in regions):
            out.append(line)
        elif mode == "notation_lines" and looks_like_prose(line.text):
            out.append(line)
    return out


def page_bgr(page: pymupdf.Page, dpi: int = OCR_DPI) -> np.ndarray:
    pix = page.get_pixmap(dpi=dpi)
    image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)[:, :, :3]
    return np.ascontiguousarray(image[:, :, ::-1])


def no_telemetry() -> None:
    """ONNX Runtime's Linux wheel carries a telemetry client (1DS); a book service has
    nothing to report, so its events are off before any session is made."""
    import onnxruntime

    onnxruntime.disable_telemetry_events()


def build_ocr(version: str = OCR_VERSION, size: str = OCR_SIZE) -> Any:
    """A RapidOCR engine; downloads its models into the package the first time."""
    from rapidocr import LangDet, LangRec, ModelType, OCRVersion, RapidOCR

    no_telemetry()
    return RapidOCR(
        params={
            "Global.log_level": "warning",
            "Det.ocr_version": OCRVersion(version),
            "Det.model_type": ModelType(size),
            "Det.lang_type": LangDet.CH,
            "Rec.ocr_version": OCRVersion(version),
            "Rec.model_type": ModelType(size),
            "Rec.lang_type": LangRec.CH,
        }
    )


def build_layout(model: str = LAYOUT_MODEL) -> Any:
    from rapid_layout import ModelType, RapidLayout

    no_telemetry()
    return RapidLayout(model_type=ModelType(model))


def ocr_lines(engine: Any, image: np.ndarray) -> list[Line]:
    result = engine(image)
    lines = []
    for text, score, quad in zip(
        result.txts or (),
        result.scores or (),
        result.boxes if result.boxes is not None else (),
        strict=True,
    ):
        xs = [p[0] for p in quad]
        ys = [p[1] for p in quad]
        lines.append(Line(text, float(score), (min(xs), min(ys), max(xs), max(ys))))
    return lines


def notation_regions(layout: Any, image: np.ndarray, model: str = LAYOUT_MODEL) -> list[Box]:
    found = layout(image)
    wanted = NOTATION_CLASSES[model]
    return [
        (float(box[0]), float(box[1]), float(box[2]), float(box[3]))
        for box, name in zip(found.boxes or [], found.class_names or [], strict=True)
        if name in wanted
    ]


def model_paths() -> list[Path] | None:
    """Where the model files go; None when a package is not installed."""
    paths = []
    for package, relative in MODEL_FILES:
        spec = find_spec(package)
        if spec is None or spec.origin is None:
            return None
        paths.append(Path(spec.origin).parent / relative)
    return paths


def models_ready() -> bool:
    """The packages are installed and every model is on disk: OCR needs no download."""
    paths = model_paths()
    return paths is not None and all(p.is_file() for p in paths)


class PageOcr:
    """
    One engine per process, built on first use. Reading is serialised: the scan
    runs in `asyncio.to_thread`, and one CPU-bound page at a time is what the
    box can give anyway.
    """

    def __init__(self, dpi: int = OCR_DPI) -> None:
        self.dpi = dpi
        self._lock = threading.Lock()
        self._ocr: Any = None
        self._layout: Any = None

    def load(self) -> None:
        with self._lock:
            if self._ocr is None:
                self._ocr = build_ocr()
                self._layout = build_layout()

    def read(self, page: pymupdf.Page) -> str:
        """The page's prose, line by line, without the notation's digits."""
        self.load()
        image = page_bgr(page, self.dpi)
        with self._lock:
            lines = ocr_lines(self._ocr, image)
            regions = notation_regions(self._layout, image)
        return "\n".join(line.text for line in keep_lines(lines, regions)).strip()


def fetch_models() -> None:
    """
    Download every model now. RapidOCR fetches its detector on the first
    detection and its recogniser on the first line found, not when it is
    built, so one printed line is read; reading nothing is an error, which
    fails the image build instead of shipping a scan without OCR.
    """
    import cv2

    image = np.full((80, 400, 3), 255, np.uint8)
    cv2.putText(image, "Guitar Pal 123", (10, 55), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 0, 0), 3)
    lines = ocr_lines(build_ocr(), image)
    notation_regions(build_layout(), image)
    if not lines:
        raise RuntimeError("OCR read nothing from its test line")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.ingest.ocr")
    parser.add_argument("--fetch", action="store_true", help="download the models (build time)")
    args = parser.parse_args(argv)
    if args.fetch:
        fetch_models()
    paths = model_paths()
    if paths is None:
        print("rapidocr / rapid-layout are not installed", file=sys.stderr)
        return 1
    for p in paths:
        print(f"{'ok ' if p.is_file() else 'missing'} {p}")
    return 0 if models_ready() else 1


if __name__ == "__main__":
    sys.exit(main())
