"""
Reference text for the OCR comparison (#369): each scanned page transcribed by
a vision model, twice, so the pages worth checking by hand are the ones the
two transcriptions disagree on.

    cd book-service && set -a && . ../.env.local && set +a
    .venv/bin/python -m evals.ocr.gold                      # every materials/sample-*.pdf
    .venv/bin/python -m evals.ocr.gold --pdf materials/x.pdf --force

Writes `materials/ocr-gold/<pdf stem>/`:

- `p01.opus.txt`, `p01.second.txt` — the two transcriptions, as returned
- `p01.txt` — the reference the runner scores against; a copy of the first
  transcription until someone corrects it (never overwritten without `--force`)
- `meta.json` — models, cost, and the per-page disagreement; add a page id
  to `"checked"` once its `pNN.txt` has been read against the page

Everything here is book text, so it stays under the gitignored `materials/`.
Costs money (~$0.05 a page for both calls); never in CI.
"""

import argparse
import asyncio
import base64
import json
import sys
from pathlib import Path

import pymupdf
from anthropic import AsyncAnthropic

from app.ingest.model import CallUsage, usage_of
from evals.ocr.metrics import cer, char_scores

HERE = Path(__file__).parent
SERVICE = HERE.parent.parent
GOLD_ROOT = SERVICE / "materials" / "ocr-gold"
DEFAULT_PDFS = "materials/sample-*.pdf"

REFERENCE_MODEL = "claude-opus-5"
SECOND_MODEL = "claude-sonnet-5"
# Sharper than the 150 dpi the engines read; the API scales the long edge
# down to what the model takes anyway.
GOLD_DPI = 180
MAX_TOKENS = 8192
CONCURRENCY = 4

SYSTEM = """You transcribe one scanned page of a guitar method book, exactly as printed, \
to serve as the reference text for measuring OCR engines.

- Transcribe every printed character of prose, headings, captions, labels, running \
headers and page numbers, in reading order (a column top to bottom before the next).
- Keep the original language and characters. Do not translate, correct, complete or \
normalise anything; keep printed punctuation as printed.
- Put each heading and each paragraph on its own line.
- Where the page prints music notation or a diagram — guitar tablature, staff notation, \
numbered notation (jianpu), chord diagrams, fretboard diagrams, strum arrows — do not \
transcribe its symbols, digits or chord names. Write one line `[notation]` in its place, \
then carry on with any text printed outside it (a title or caption is text).
- Where a character is hard to read, write your best reading.

Output only the transcription."""


# Characters that exist only in traditional script. Opus once transcribed a
# simplified page in traditional characters (確定 for 确定); a reference in
# the wrong script would charge every engine for reading the page right.
TRADITIONAL_ONLY = set("這為來說於與從將還個們對會時們點擇確選樂調編譜號國學習練聽寫")


def traditional_count(text: str) -> int:
    return sum(1 for ch in text if ch in TRADITIONAL_ONLY)


def page_png(page: pymupdf.Page) -> bytes:
    return page.get_pixmap(dpi=GOLD_DPI).tobytes("png")


async def transcribe(client: AsyncAnthropic, model: str, png: bytes) -> tuple[str, CallUsage]:
    response = await client.messages.create(
        model=model,
        max_tokens=MAX_TOKENS,
        system=SYSTEM,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": base64.b64encode(png).decode(),
                        },
                    },
                    {"type": "text", "text": "Transcribe this page."},
                ],
            }
        ],
    )
    if response.stop_reason != "end_turn":
        print(f"  {model}: stop_reason={response.stop_reason}", file=sys.stderr)
    text = "".join(block.text for block in response.content if block.type == "text")
    return text.strip(), usage_of(response, model)


async def gold_for_pdf(client: AsyncAnthropic, pdf: Path, force: bool) -> dict:
    folder = GOLD_ROOT / pdf.stem
    folder.mkdir(parents=True, exist_ok=True)
    meta_path = folder / "meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    meta.setdefault("checked", [])
    meta.update(
        {
            "pdf": pdf.name,
            "reference_model": REFERENCE_MODEL,
            "second_model": SECOND_MODEL,
            "dpi": GOLD_DPI,
        }
    )
    pages = meta.setdefault("pages", {})
    slots = asyncio.Semaphore(CONCURRENCY)

    with pymupdf.open(pdf) as doc:
        pngs = [page_png(page) for page in doc]

    async def one(index: int, png: bytes) -> None:
        page_id = f"p{index + 1:02d}"
        first_path = folder / f"{page_id}.opus.txt"
        if first_path.exists() and not force:
            return
        async with slots:
            (first, u1), (second, u2) = await asyncio.gather(
                transcribe(client, REFERENCE_MODEL, png), transcribe(client, SECOND_MODEL, png)
            )
        first_path.write_text(first + "\n")
        (folder / f"{page_id}.second.txt").write_text(second + "\n")
        reference = folder / f"{page_id}.txt"
        if force or not reference.exists():
            reference.write_text(first + "\n")
        pages[page_id] = {"cost_usd": round(u1.cost_usd + u2.cost_usd, 4)}
        print(f"  {pdf.stem}/{page_id}: transcribed")

    await asyncio.gather(*(one(i, png) for i, png in enumerate(pngs)))
    # How far the two transcriptions are apart: by characters, order ignored
    # (what to check by hand — two readings of a running header in different
    # places are not a disagreement about the text), and by CER for reference.
    for page_id, row in pages.items():
        first = (folder / f"{page_id}.opus.txt").read_text()
        second = (folder / f"{page_id}.second.txt").read_text()
        row["disagreement_chars"] = round(1 - char_scores(first, second).f1, 4)
        row["disagreement_cer"] = round(cer(first, second), 4)
        reference = folder / f"{page_id}.txt"
        if (
            traditional_count(first) > 3 * traditional_count(second) + 3
            and reference.read_text() == first
        ):
            # Not hand-corrected yet, and the first transcription changed the script.
            reference.write_text(second)
            row["reference_from"] = "second: the first transcription wrote traditional characters"
    meta["pages"] = dict(sorted(pages.items()))
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")
    return meta


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--pdf", action="append", help="a PDF to transcribe (repeatable)")
    parser.add_argument("--force", action="store_true", help="redo pages, replacing pNN.txt")
    args = parser.parse_args()
    pdfs = [Path(p) for p in args.pdf] if args.pdf else sorted(SERVICE.glob(DEFAULT_PDFS))
    if not pdfs:
        print(f"no PDFs match {DEFAULT_PDFS} (materials/ is gitignored)", file=sys.stderr)
        return 2

    client = AsyncAnthropic()
    total = 0.0
    worst: list[tuple[float, str]] = []
    for pdf in pdfs:
        print(pdf.name)
        meta = await gold_for_pdf(client, pdf, args.force)
        for page_id, row in meta["pages"].items():
            total += row["cost_usd"]
            worst.append((row["disagreement_chars"], f"{pdf.stem}/{page_id}"))
    worst.sort(reverse=True)
    print(f"\n${total:.2f} for {len(worst)} pages. Check these first (most characters disputed):")
    for score, page in worst[:6]:
        print(f"  {score:6.1%}  {page}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
