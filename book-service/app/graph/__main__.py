"""
Calibration by hand: run the chapter graph over a page range of a local PDF
and print what it made of each page, the knowledge points, the drafts and
the cost. No database, no Storage; the same graph the parse job runs. With
`BOOK_SERVICE_VALIDATE_URL` and `BOOK_SERVICE_INTERNAL_SECRET` set (a dev
server on the Next.js side) the extractors run too, and every crop they
read lands in `--crops` as `p0206-1.png`.

    python -m app.graph book.pdf --pages 24-32
    python -m app.graph book.pdf --pages 1-10 --ocr --dpi 100 --crops /tmp/crops
    python -m app.graph book.pdf --pages 204-207 --ocr --notes-only   # the notes call alone
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from dataclasses import asdict
from pathlib import Path

from anthropic import AsyncAnthropic

from app.graph.chapter import ChapterParseGraph
from app.ingest.pdf import (
    CLASSIFY_RENDER_DPI,
    OCR_DEFAULT_LANGUAGES,
    OcrConfig,
    extract_page,
    open_pdf,
    render_page_png,
)
from app.ingest.tag import tag_text
from app.parse import DocRenderer, ParsePage, ParseTools
from app.repo import BookRow, ChapterRow
from app.validate import ValidatorClient


class DirCropSink:
    """Crops into a local folder, for looking at."""

    def __init__(self, folder: Path) -> None:
        self._folder = folder

    async def save(self, name: str, png: bytes) -> str | None:
        self._folder.mkdir(parents=True, exist_ok=True)
        (self._folder / name).write_bytes(png)
        return str(self._folder / name)


async def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.graph")
    parser.add_argument("pdf")
    parser.add_argument("--pages", required=True, help="e.g. 24-32 (1-based, inclusive)")
    parser.add_argument("--dpi", type=int, default=CLASSIFY_RENDER_DPI, help="page image dpi")
    parser.add_argument("--ocr", action="store_true", help="OCR pages without a text layer")
    parser.add_argument("--all-images", action="store_true", help="send every page's image")
    parser.add_argument("--crops", type=Path, default=Path("crops"), help="where crops go")
    parser.add_argument("--dump", type=Path, help="write the drafts and warnings as JSON here")
    parser.add_argument(
        "--notes-only",
        action="store_true",
        help="run only the knowledge-points call over the text: no images, no classification",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    logging.getLogger("book-service").setLevel(logging.INFO)

    first, last = (int(n) for n in args.pages.split("-"))
    ocr = None
    if args.ocr:
        tessdata = os.environ.get("TESSDATA_PREFIX")
        if tessdata is None:
            sys.exit("--ocr needs TESSDATA_PREFIX")
        ocr = OcrConfig(Path(tessdata), languages=OCR_DEFAULT_LANGUAGES)

    pages: list[ParsePage] = []
    with open_pdf(args.pdf) as doc:
        for n in range(first, min(last, len(doc)) + 1):
            text = extract_page(doc[n - 1], n, ocr)
            tagged = tag_text(text.text).may_have_exercise
            wants = not args.notes_only and (args.all_images or not text.has_text_layer or tagged)
            pages.append(
                ParsePage(
                    page=n,
                    text=text.text,
                    has_text_layer=text.has_text_layer,
                    may_have_exercise=tagged,
                    image=render_page_png(doc, n, args.dpi) if wants else None,
                )
            )

    book = BookRow(
        id="cli",
        user_id="cli",
        title=Path(args.pdf).stem,
        page_count=None,
        storage_path="",
        status="ready",
        toc_source=None,
        error=None,
        scanned_pages=0,
        created_at=None,  # type: ignore[arg-type]
    )
    chapter = ChapterRow(
        id="cli",
        index=0,
        title=f"pages {first}-{last}",
        page_start=first,
        page_end=last,
        exercise_hint_count=0,
        parsed_at=None,
        parse_status="parsing",
        parse_error=None,
        parse_input_tokens=0,
        parse_output_tokens=0,
        parse_cost_usd=0.0,
        parse_warnings=[],
    )
    validate_url = os.environ.get("BOOK_SERVICE_VALIDATE_URL")
    secret = os.environ.get("BOOK_SERVICE_INTERNAL_SECRET")
    validator = ValidatorClient(validate_url, secret) if validate_url and secret else None
    if validator is None:
        print("no BOOK_SERVICE_VALIDATE_URL / BOOK_SERVICE_INTERNAL_SECRET: extractors off")
    graph = ChapterParseGraph(AsyncAnthropic(), validator)
    started = time.perf_counter()
    if args.notes_only:
        result = await graph.notes_only(book, chapter, pages)
    else:
        with open_pdf(args.pdf) as doc:
            tools = ParseTools(DocRenderer(doc, asyncio.Semaphore(1)), DirCropSink(args.crops))
            result = await graph(book, chapter, pages, tools)
    seconds = time.perf_counter() - started

    with_images = sum(1 for p in pages if p.image is not None)
    print(
        f"\n{args.pdf} p{first}-{last}: {len(pages)} pages,"
        f" {with_images} with images @ {args.dpi} dpi"
    )
    print(
        f"  {seconds:.1f}s, {result.usage.input_tokens} in / {result.usage.output_tokens} out,"
        f" ${result.usage.cost_usd:.4f}"
    )
    print(f"  notes: {len(result.notes)}")
    for n in result.notes:
        print(f"    p{list(n.pages)}: {n.title} — {n.body[:120]}{'…' if len(n.body) > 120 else ''}")
    print(f"  exercises: {len(result.exercises)}")
    for e in result.exercises:
        measures = e.draft.get("measures", [])
        print(
            f"    p{e.page} {e.kind}/{e.source}: {e.draft.get('name')!r},"
            f" {len(measures) if isinstance(measures, list) else '?'} bars,"
            f" bpm {e.draft.get('bpm')}, {len(e.warnings)} warning(s) → {e.crop_path}"
        )
        for w in e.warnings:
            print(f"      {w.get('code')}: {w.get('message')}")
    print(f"  warnings: {len(result.warnings)}")
    for w in result.warnings:
        print(f"    {w.get('code')}: {w.get('message')}")
    if args.dump:
        args.dump.write_text(
            json.dumps(
                {
                    "notes": [asdict(n) for n in result.notes],
                    "exercises": [asdict(e) for e in result.exercises],
                    "warnings": result.warnings,
                    "usage": asdict(result.usage),
                },
                ensure_ascii=False,
                indent=1,
            )
        )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
