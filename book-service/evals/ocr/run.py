"""
OCR engines on our own scans (#369): every engine reads every page of the
sample PDFs, and each read is scored against the page's reference text.

    cd book-service
    .venv/bin/python -m evals.ocr.run                          # all engines, materials/sample-*.pdf
    .venv/bin/python -m evals.ocr.run --engines tesseract-fast,ppocrv6-small
    .venv/bin/python -m evals.ocr.run --rescore <run id>       # after correcting references

Reads are kept as text under `materials/ocr-reads/<run id>/` (book text,
gitignored), so a corrected reference only needs `--rescore`, not another
run. Scores go to `evals/ocr/results/<run id>.json` — numbers, ids and page
numbers only — rewritten after every page so a results page can follow the
run as it goes. Pages without a reference yet are read and timed, not scored.

Needs `tessdata/` (fast) and `tessdata/best/` for the Tesseract engines; PP-OCR
is a service dependency since #417, and RapidOCR downloads the models a variant
asks for on first use. Never in CI: it takes minutes and reads gitignored
material.
"""

import argparse
import json
import multiprocessing
import statistics
import sys
import time
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from datetime import UTC, datetime
from pathlib import Path

import pymupdf

from app.ingest.ocr import OCR_DPI
from evals.ocr.engines import ENGINES
from evals.ocr.gold import GOLD_ROOT
from evals.ocr.metrics import cer, char_scores
from evals.ocr.pipeline import Read
from evals.runlog import finish, new_run, write_run

HERE = Path(__file__).parent
SERVICE = HERE.parent.parent
RESULTS = HERE / "results"
READS_ROOT = SERVICE / "materials" / "ocr-reads"
DEFAULT_PDFS = "materials/sample-*.pdf"

# Read once by whatever shows the results: direction says which way is better.
METRICS = [
    {
        "key": "cer",
        "label": "CER",
        "direction": "lower",
        "unit": "ratio",
        "format": "percent",
        "description": "Edit distance over the reference length, whitespace removed.",
    },
    {
        "key": "char_recall",
        "label": "Char recall",
        "direction": "higher",
        "unit": "ratio",
        "format": "percent",
        "description": "Share of the reference's characters the read found, order ignored.",
    },
    {
        "key": "char_precision",
        "label": "Char precision",
        "direction": "higher",
        "unit": "ratio",
        "format": "percent",
        "description": "Share of the read's characters that are in the "
        "reference; notation read as text lowers it.",
    },
    {
        "key": "char_f1",
        "label": "Char F1",
        "direction": "higher",
        "unit": "ratio",
        "format": "percent",
        "description": "Harmonic mean of the two.",
    },
    {
        "key": "seconds_per_page",
        "label": "s / page",
        "direction": "lower",
        "unit": "s",
        "format": "fixed2",
        "description": "Wall time to read one page at 150 dpi, model load excluded.",
    },
    {
        "key": "cost_usd_per_page",
        "label": "$ / page",
        "direction": "lower",
        "unit": "usd",
        "format": "usd",
        "description": "API spend per page; the local engines cost nothing.",
    },
]
SCORED = ("cer", "char_recall", "char_precision", "char_f1")


def reference_for(stem: str, page_id: str) -> tuple[str | None, bool]:
    """The page's reference text, and whether someone has checked it by hand."""
    folder = GOLD_ROOT / stem
    path = folder / f"{page_id}.txt"
    if not path.exists():
        return None, False
    meta_path = folder / "meta.json"
    checked = json.loads(meta_path.read_text()).get("checked", []) if meta_path.exists() else []
    return path.read_text(), page_id in checked


def score(case: dict, read: str) -> None:
    reference, checked = reference_for(case["pdf"], case["page_id"])
    case["reference"] = "checked" if checked else ("unchecked" if reference is not None else None)
    if reference is None:
        return
    scores = char_scores(reference, read)
    case["metrics"].update(
        cer=round(cer(reference, read), 4),
        char_recall=round(scores.recall, 4),
        char_precision=round(scores.precision, 4),
        char_f1=round(scores.f1, 4),
    )


def summarise(run: dict) -> None:
    """Per engine: the mean of each metric over the pages that have it."""
    for subject in run["subjects"]:
        rows = [c for c in run["cases"] if c["subject"] == subject["id"]]
        summary = {}
        for metric in METRICS:
            values = [c["metrics"][metric["key"]] for c in rows if metric["key"] in c["metrics"]]
            if values:
                summary[metric["key"]] = round(statistics.fmean(values), 4)
        scored = [c for c in rows if "cer" in c["metrics"]]
        subject["summary"] = summary
        subject["pages"] = len(rows)
        subject["pages_scored"] = len(scored)
        if len(scored) > 1:
            spread = statistics.stdev(c["metrics"]["cer"] for c in scored)
            subject["spread"] = {"cer": round(spread, 4)}
        # Per book: the same means over each PDF's pages, for the by-book chart.
        breakdown: dict[str, dict[str, float]] = {}
        for pdf in sorted({c["pdf"] for c in scored}):
            pages = [c for c in scored if c["pdf"] == pdf]
            breakdown[pdf] = {
                key: round(statistics.fmean(c["metrics"][key] for c in pages), 4) for key in SCORED
            }
        subject["breakdown"] = breakdown


def write(run: dict, path: Path) -> None:
    summarise(run)
    write_run(run, path)


# Each engine reads in a child process: a page that crashes the engine (as
# Tesseract does on some notation-heavy scans) costs that page, not the run.
_read_page: Callable[[pymupdf.Page], str | Read] | None = None
_docs: dict[str, pymupdf.Document] = {}


def _load(engine_id: str) -> None:
    global _read_page
    _read_page = ENGINES[engine_id].build()


def _ready() -> bool:
    return _read_page is not None


def _read(pdf: str, index: int) -> tuple[Read, float]:
    """One page through the child's engine, timed inside the child."""
    assert _read_page is not None
    doc = _docs.get(pdf) or _docs.setdefault(pdf, pymupdf.open(pdf))
    tick = time.perf_counter()
    got = _read_page(doc[index])
    seconds = time.perf_counter() - tick
    return (got if isinstance(got, Read) else Read(text=got)), seconds


def _start(engine_id: str) -> ProcessPoolExecutor:
    """A one-process pool with the engine loaded; raises if it cannot load."""
    pool = ProcessPoolExecutor(
        max_workers=1,
        mp_context=multiprocessing.get_context("spawn"),
        initializer=_load,
        initargs=(engine_id,),
    )
    pool.submit(_ready).result()
    return pool


def run_engines(
    engine_ids: list[str],
    pdfs: list[Path],
    issue: int = 369,
    title: str = "OCR engines on scanned guitar books",
) -> Path:
    pages_by_pdf = {}
    for pdf in pdfs:
        with pymupdf.open(pdf) as doc:
            pages_by_pdf[pdf] = doc.page_count
    run = new_run(
        suite="ocr",
        title=title,
        issue=issue,
        metrics=METRICS,
        subjects=[
            {"id": e.id, "label": e.label, "group": e.group, "notes": e.notes}
            for e in (ENGINES[i] for i in engine_ids)
        ],
        total=len(engine_ids) * sum(pages_by_pdf.values()),
        config={
            "dpi": OCR_DPI,
            "pdfs": [{"name": pdf.name, "pages": n} for pdf, n in pages_by_pdf.items()],
            "reference": "claude-opus-5 transcription per page; 'checked' once read by hand",
        },
    )
    run_id = run["run_id"]
    total = run["progress"]["total"]
    reads_dir = READS_ROOT / run_id
    path = RESULTS / f"{run_id}.json"
    write(run, path)
    print(f"run {run_id} → {path.relative_to(SERVICE)}  ({total} page reads)")

    for subject in run["subjects"]:
        engine = ENGINES[subject["id"]]
        subject["status"] = "loading"
        write(run, path)
        loaded = time.perf_counter()
        try:
            pool = _start(engine.id)
        except Exception as e:  # a missing model or data file fails this engine, not the run
            subject["status"] = "failed"
            subject["error"] = str(e) or type(e).__name__
            print(f"  {engine.id}: {subject['error']}", file=sys.stderr)
            run["progress"]["done"] += sum(pages_by_pdf.values())
            write(run, path)
            continue
        subject["load_seconds"] = round(time.perf_counter() - loaded, 2)
        subject["status"] = "running"
        for pdf in pdfs:
            for index in range(pages_by_pdf[pdf]):
                page_id = f"p{index + 1:02d}"
                case = {
                    "subject": engine.id,
                    "case": f"{pdf.stem}/{page_id}",
                    "pdf": pdf.stem,
                    "page_id": page_id,
                    "metrics": {},
                }
                try:
                    got, seconds = pool.submit(_read, str(pdf), index).result()
                    text = got.text
                    case["metrics"]["seconds_per_page"] = round(seconds, 3)
                    case["metrics"]["cost_usd_per_page"] = round(got.cost_usd, 6)
                    if got.detail:
                        case["detail"] = got.detail
                except BrokenProcessPool:
                    # The engine took its process down (Tesseract segfaults on some
                    # pages). Scored as an empty read: the scan would get nothing.
                    text = ""
                    case["error"] = "crashed"
                    pool = _start(engine.id)
                except Exception as e:  # e.g. a model download that timed out
                    text = ""
                    case["error"] = f"{type(e).__name__}: {e}"[:200]
                out = reads_dir / engine.id / pdf.stem / f"{page_id}.txt"
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_text(text + "\n")
                case["chars_read"] = len(text)
                score(case, text)
                run["cases"].append(case)
                run["progress"]["done"] += 1
                write(run, path)
                shown = case["metrics"].get("cer")
                note = f"CER {shown:.1%}" if shown is not None else "no reference"
                took = case["metrics"].get("seconds_per_page")
                timing = f"{took:5.2f}s" if took is not None else "CRASH "
                print(f"  {engine.id:16} {case['case']:42} {timing}  {note}")
        pool.shutdown()
        subject["crashes"] = sum(
            1 for c in run["cases"] if c["subject"] == engine.id and c.get("error")
        )
        subject["status"] = "done"
        write(run, path)

    finish(run)
    write(run, path)
    return path


def rescore(run_id: str) -> Path:
    path = RESULTS / f"{run_id}.json"
    run = json.loads(path.read_text())
    reads_dir = READS_ROOT / run_id
    for case in run["cases"]:
        read = (reads_dir / case["subject"] / case["pdf"] / f"{case['page_id']}.txt").read_text()
        case["metrics"] = {
            k: v
            for k, v in case["metrics"].items()
            if k in ("seconds_per_page", "cost_usd_per_page")
        }
        score(case, read)
    run["rescored_at"] = datetime.now(UTC).isoformat()
    write(run, path)
    return path


def print_summary(path: Path) -> None:
    run = json.loads(path.read_text())
    print(f"\n{'engine':18} {'CER':>7} {'recall':>7} {'prec.':>7} {'F1':>7} {'s/page':>7}  scored")
    for s in run["subjects"]:
        m = s.get("summary", {})
        cells = [f"{m[k]:7.1%}" if k in m else f"{'—':>7}" for k in SCORED]
        secs = f"{m['seconds_per_page']:7.2f}" if "seconds_per_page" in m else f"{'—':>7}"
        scored = f"{s.get('pages_scored', 0)}/{s.get('pages', 0)}"
        print(f"{s['label']:18} {' '.join(cells)} {secs}  {scored}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--engines", default=",".join(ENGINES), help="comma-separated ids")
    parser.add_argument("--pdf", action="append", help="a PDF to read (repeatable)")
    parser.add_argument("--rescore", metavar="RUN_ID", help="re-score a run's saved reads")
    parser.add_argument("--issue", type=int, default=369, help="the issue the run answers")
    parser.add_argument("--title", default="OCR engines on scanned guitar books")
    args = parser.parse_args()

    if args.rescore:
        path = rescore(args.rescore)
    else:
        engine_ids = [e for e in args.engines.split(",") if e]
        unknown = [e for e in engine_ids if e not in ENGINES]
        if unknown:
            print(
                f"unknown engines: {', '.join(unknown)}; known: {', '.join(ENGINES)}",
                file=sys.stderr,
            )
            return 2
        pdfs = [Path(p) for p in args.pdf] if args.pdf else sorted(SERVICE.glob(DEFAULT_PDFS))
        if not pdfs:
            print(f"no PDFs match {DEFAULT_PDFS} (materials/ is gitignored)", file=sys.stderr)
            return 2
        path = run_engines(engine_ids, pdfs, args.issue, args.title)
    print_summary(path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
