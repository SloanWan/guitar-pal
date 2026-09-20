"""
Calibration by hand: run the whole-book pass over a local PDF and print what
it found. No database, no Storage — the same functions the scan endpoint
(A3) runs, on a file on disk. Numbers worth keeping go to docs/calibration.md.

    python -m app.ingest book.pdf            # outline + tags, no model call
    python -m app.ingest book.pdf --ocr      # OCR pages without a text layer (TESSDATA_PREFIX)
    python -m app.ingest book.pdf --ask      # also the text-TOC model call
    python -m app.ingest book.pdf --tags     # list every tagged page with reasons
"""

import argparse
import asyncio
import logging
import os
import sys
import time
from collections import Counter
from pathlib import Path

from app.ingest.pdf import (
    OCR_DEFAULT_DPI,
    OCR_DEFAULT_LANGUAGES,
    OcrConfig,
    extract_page,
    open_pdf,
    read_outline,
)
from app.ingest.tag import tag_text
from app.ingest.toc import find_chapters, is_scanned


def ocr_config(args: argparse.Namespace) -> OcrConfig | None:
    if not args.ocr:
        return None
    # Read the environment directly: the CLI needs no database or Supabase settings.
    tessdata = args.tessdata or os.environ.get("TESSDATA_PREFIX")
    if tessdata is None:
        sys.exit("--ocr needs --tessdata or TESSDATA_PREFIX (see tools/fetch-tessdata.sh)")
    languages = args.languages or os.environ.get(
        "BOOK_SERVICE_OCR_LANGUAGES", OCR_DEFAULT_LANGUAGES
    )
    config = OcrConfig(Path(tessdata), languages=languages, dpi=args.dpi)
    if missing := config.missing_languages():
        sys.exit(f"missing under {config.tessdata}: {', '.join(missing)}.traineddata")
    return config


async def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.ingest")
    parser.add_argument("pdf")
    parser.add_argument("--ask", action="store_true", help="make the text-TOC model call")
    parser.add_argument("--tags", action="store_true", help="print every tagged page")
    parser.add_argument("--ocr", action="store_true", help="OCR pages without a text layer")
    parser.add_argument("--tessdata", help="tessdata directory (default: TESSDATA_PREFIX)")
    parser.add_argument(
        "--languages", help="Tesseract languages (default: BOOK_SERVICE_OCR_LANGUAGES)"
    )
    parser.add_argument("--dpi", type=int, default=OCR_DEFAULT_DPI, help="OCR render dpi")
    args = parser.parse_args()
    # So the model call's token usage shows up beside the result.
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    logging.getLogger("book-service").setLevel(logging.INFO)

    read_text_toc = None
    if args.ask:
        from app.ingest.model import AnthropicTextTocReader

        read_text_toc = AnthropicTextTocReader()
    ocr = ocr_config(args)

    with open_pdf(args.pdf) as doc:
        outline = read_outline(doc)
        started = time.perf_counter()
        pages = [extract_page(page, index, ocr) for index, page in enumerate(doc, start=1)]
        extract_seconds = time.perf_counter() - started
        result = await find_chapters(
            outline=outline,
            pages=pages,
            read_text_toc=read_text_toc,
            read_vision_toc=None,
            render_page=None,
        )

    tags = {p.page: tag_text(p.text) for p in pages}
    tagged = [n for n, t in tags.items() if t.may_have_exercise]
    sources = Counter(p.text_source for p in pages)

    print(f"{args.pdf}")
    print(
        f"  pages={len(pages)} text_source={dict(sources)} scanned={is_scanned(pages)}"
        f" extract={extract_seconds:.1f}s ({extract_seconds / len(pages):.2f}s/page)"
    )
    print(f"  outline_entries={len(outline)} toc_source={result.source}")
    for ch in result.chapters:
        hints = sum(1 for n in tagged if ch.page_start <= n <= ch.page_end)
        print(f"    p{ch.page_start:>4}-{ch.page_end:<4} hints={hints:<3} {ch.title}")
    reasons = Counter(r for t in tags.values() for r in t.reasons)
    print(f"  tagged={len(tagged)}/{len(pages)} reasons={dict(reasons)}")
    if args.tags:
        for n in tagged:
            print(f"    p{n}: {', '.join(tags[n].reasons)}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
