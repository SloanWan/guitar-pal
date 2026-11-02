"""
Which pages can the chapter parse skip? (#375 follow-up)

The parse sends every scanned page to the classifier (a vision call) to
find the notation an extractor should read. A layout model can see where
notation is for free; if it — or the tag rules on the OCR text, or both —
says a page has none, the classifier call could be skipped. This measures
how many calls that saves and how many notation pages it would miss.

Reference: the parse's own classifier (`ChapterParseGraph.classify_page`,
Sonnet 5, the page at 100 dpi plus its text), cached per page under
`materials/notation-ref/` so a rerun costs nothing. A page "has notation"
when it is classified tab, strum notation, chord diagrams, a progression map,
a fretboard diagram, or mixed.

    cd book-service && set -a && . ../.env.local && set +a
    .venv/bin/python -m evals.notation.run

Writes `evals/notation/results/<run>.json` for `/dev/evals` — page ids and
verdicts, no book text. Costs ~$0.005 a page the first time (the reference).
"""

import asyncio
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import pymupdf
from anthropic import AsyncAnthropic

from app.ask.provider import anthropic_provider
from app.graph.chapter import ChapterParseGraph
from app.ingest.ocr import NOTATION_CLASSES, build_ocr, ocr_lines, page_bgr
from app.ingest.pdf import CLASSIFY_RENDER_DPI, MIN_TEXT_LAYER_CHARS
from app.ingest.tag import tag_text
from app.parse import ParsePage
from evals.runlog import finish, new_run, write_run

HERE = Path(__file__).parent
SERVICE = HERE.parent.parent
REF_ROOT = SERVICE / "materials" / "notation-ref"
RESULTS = HERE / "results"

# (pdf, first page, last page), 1-based inclusive: scanned Chinese prose and
# theory, chord charts, dense tab, an English rock method, a translated
# electric-guitar method, and one text-layer book.
PAGES = [
    ("sample-tab-乐理-编曲-10p.pdf", 1, 10),
    ("sample-乐理-和声语汇-7p.pdf", 1, 7),
    ("sample-text-tab-scanned-3p.pdf", 1, 3),
    ("sample-text-tab-scanned-6p.pdf", 1, 6),
    ("吉他自学三月通.pdf", 10, 44),
    ("吉他自学三月通.pdf", 100, 119),
    ("吉他自学三月通-和弦部分.pdf", 1, 10),
    ("Heavy_Metal_Rhythm_Guitar*.pdf", 10, 24),
    ("电吉他手的养成计划*.pdf", 20, 39),
    ("SongWritingFromMajorKeys.pdf", 1, 9),
]


def find_pdf(name: str) -> Path | None:
    """A file in `materials/` by name, or by a glob when the local name is long."""
    return next(iter(sorted((SERVICE / "materials").glob(name))), None)


NOTATION_KINDS = {
    "tab",
    "strum_notation",
    "chord_diagrams",
    "progression_map",
    "fretboard_diagram",
    "mixed",
}
# A layout region smaller than this share of the page is an icon or an
# ornament (a headstock in the margin), not an example.
MIN_REGION_SHARE = 0.03

METRICS = [
    {
        "key": "skip_rate",
        "label": "Calls saved",
        "direction": "higher",
        "format": "percent",
        "description": (
            "Pages the detector says have no notation: classifier calls the parse would skip."
        ),
    },
    {
        "key": "recall",
        "label": "Notation pages kept",
        "direction": "higher",
        "format": "percent",
        "description": (
            "Of the pages the classifier finds notation on, the share the detector also"
            " flags. Anything missed is an exercise never read."
        ),
    },
    {
        "key": "missed",
        "label": "Missed pages",
        "direction": "lower",
        "format": "fixed0",
        "description": "Notation pages the detector would skip.",
    },
    {"key": "precision", "label": "Precision", "direction": "higher", "format": "percent"},
    {
        "key": "seconds_per_page",
        "label": "s / page",
        "direction": "lower",
        "format": "fixed2",
        "description": (
            "Detector time per page (OCR included where it reads text); the classifier"
            " call it saves is ~3–6 s."
        ),
    },
]


@dataclass
class PageFacts:
    case: str
    has_layer: bool
    text: str
    ocr_seconds: float
    regions: dict[str, list[float]]  # layout model → region shares of the page
    layout_seconds: dict[str, float]


async def reference(
    graph: ChapterParseGraph, pdf: Path, index: int, text: str, layer: bool
) -> dict:
    """The classifier's verdict for one page, cached."""
    path = REF_ROOT / pdf.stem / f"p{index + 1:03d}.json"
    if path.exists():
        return json.loads(path.read_text())
    with pymupdf.open(pdf) as doc:
        png = doc[index].get_pixmap(dpi=CLASSIFY_RENDER_DPI).tobytes("png")
    page = ParsePage(index + 1, text, layer, False, png)
    result: dict | None = None
    error = ""
    for _ in range(2):
        try:
            out = await graph.classify_page({"page": page, "chapter_title": pdf.stem})
        except Exception as e:  # e.g. a reply that loops until max_tokens and breaks its JSON
            error = f"{type(e).__name__}: {str(e)[:160]}"
            continue
        c = out["classified"][0]
        result = {
            "kind": c.kind,
            "regions": [r.kind for r in c.regions],
            "note": c.note,
            "cost_usd": sum(u.cost_usd for u in out["usage"]),
        }
        break
    if result is None:
        # The classifier failed twice; the page is left out of the scores.
        result = {"kind": "error", "regions": [], "note": error, "cost_usd": 0.0}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    return result


def has_notation(ref: dict) -> bool:
    return ref["kind"] in NOTATION_KINDS


def detectors(facts: PageFacts) -> dict[str, tuple[bool, float, dict]]:
    """Each detector's verdict for the page, its time, and why."""
    tag = tag_text(facts.text)
    big = {m: [s for s in shares if s >= MIN_REGION_SHARE] for m, shares in facts.regions.items()}
    v3, cdla = "pp_doc_layoutv3", "pp_layout_cdla"
    t_ocr = 0.0 if facts.has_layer else facts.ocr_seconds
    why_tag = {"tag_reasons": list(tag.reasons)}
    return {
        "everything": (True, 0.0, {}),
        "tags": (tag.may_have_exercise, t_ocr, why_tag),
        "v3": (
            bool(facts.regions[v3]),
            facts.layout_seconds[v3],
            {"regions": len(facts.regions[v3])},
        ),
        "v3-big": (bool(big[v3]), facts.layout_seconds[v3], {"regions": len(big[v3])}),
        "cdla": (
            bool(facts.regions[cdla]),
            facts.layout_seconds[cdla],
            {"regions": len(facts.regions[cdla])},
        ),
        "v3-big+tags": (
            bool(big[v3]) or tag.may_have_exercise,
            facts.layout_seconds[v3] + t_ocr,
            {"regions": len(big[v3]), **why_tag},
        ),
        "cdla+tags": (
            bool(facts.regions[cdla]) or tag.may_have_exercise,
            facts.layout_seconds[cdla] + t_ocr,
            {"regions": len(facts.regions[cdla]), **why_tag},
        ),
    }


SUBJECTS = [
    ("everything", "Classify every page (today)", "today", "what the parse does with a scan now"),
    (
        "tags",
        "Tag rules on the text",
        "rules",
        "may_have_exercise on PP-OCRv6 tiny text (the layer, where there is one)",
    ),
    ("v3", "PP-DocLayoutV3", "layout", "any image/chart region"),
    (
        "v3-big",
        "PP-DocLayoutV3, ignoring icons",
        "layout",
        f"image/chart regions of {MIN_REGION_SHARE:.0%}+ of the page",
    ),
    ("cdla", "CDLA layout", "layout", "any figure/table/equation region"),
    (
        "v3-big+tags",
        "V3 (no icons) or tag rules",
        "layout + rules",
        "skip only when both see nothing",
    ),
    ("cdla+tags", "CDLA or tag rules", "layout + rules", "skip only when both see nothing"),
]


def _counts(rows: list[dict]) -> dict[str, float]:
    """Calls saved and notation pages missed over some pages, for the by-book chart."""
    flagged = sum(1 for c in rows if c["detail"]["flagged"])
    missed = sum(
        1 for c in rows if c["detail"]["reference_notation"] and not c["detail"]["flagged"]
    )
    return {"skip_rate": round(1 - flagged / len(rows), 4), "missed": missed}


def summarise(run: dict) -> None:
    for subject in run["subjects"]:
        rows = [c for c in run["cases"] if c["subject"] == subject["id"] and not c.get("error")]
        if not rows:
            continue
        flagged = [c for c in rows if c["detail"]["flagged"]]
        notation = [c for c in rows if c["detail"]["reference_notation"]]
        caught = [c for c in notation if c["detail"]["flagged"]]
        subject["breakdown"] = {
            book: _counts([c for c in rows if c["case"].rsplit("/", 1)[0] == book])
            for book in sorted({c["case"].rsplit("/", 1)[0] for c in rows})
        }
        subject["summary"] = {
            "skip_rate": round(1 - len(flagged) / len(rows), 4),
            "recall": round(len(caught) / len(notation), 4) if notation else 1.0,
            "missed": len(notation) - len(caught),
            "precision": round(len(caught) / len(flagged), 4) if flagged else 1.0,
            "seconds_per_page": round(
                sum(c["metrics"]["seconds_per_page"] for c in rows) / len(rows), 3
            ),
        }


async def main() -> int:
    from rapid_layout import ModelType, RapidLayout

    missing = [p for p, _, _ in PAGES if find_pdf(p) is None]
    if missing:
        print(f"not in materials/: {missing}", file=sys.stderr)
        return 2
    ocr = build_ocr("PP-OCRv6", "tiny")
    layouts = {m: RapidLayout(model_type=ModelType(m)) for m in NOTATION_CLASSES}
    graph = ChapterParseGraph(anthropic_provider(AsyncAnthropic()))
    total_pages = sum(last - first + 1 for _, first, last in PAGES)
    run = new_run(
        suite="notation-pages",
        title="Which pages the parse could skip",
        issue=375,
        metrics=METRICS,
        subjects=[
            {"id": i, "label": label, "group": group, "notes": notes}
            for i, label, group, notes in SUBJECTS
        ],
        total=total_pages,
        config={
            "reference": "the parse's classifier (claude-sonnet-5, 100 dpi + text)",
            "pages": total_pages,
        },
    )
    path = RESULTS / f"{run['run_id']}.json"
    write_run(run, path)
    print(f"run {run['run_id']} → {path.relative_to(SERVICE)}  ({total_pages} pages)")
    spent = 0.0

    for name, first, last in PAGES:
        pdf = find_pdf(name)
        assert pdf is not None
        with pymupdf.open(pdf) as doc:
            for index in range(first - 1, last):
                page = doc[index]
                image = page_bgr(page)
                layer_text = page.get_text("text").strip()
                has_layer = len(layer_text) >= MIN_TEXT_LAYER_CHARS
                tick = time.perf_counter()
                text = (
                    layer_text
                    if has_layer
                    else "\n".join(line.text for line in ocr_lines(ocr, image))
                )
                ocr_seconds = time.perf_counter() - tick
                regions, layout_seconds = {}, {}
                h, w = image.shape[:2]
                for model, engine in layouts.items():
                    tick = time.perf_counter()
                    found = engine(image)
                    layout_seconds[model] = time.perf_counter() - tick
                    regions[model] = [
                        (b[2] - b[0]) * (b[3] - b[1]) / (w * h)
                        for b, n in zip(found.boxes or [], found.class_names or [], strict=True)
                        if n in NOTATION_CLASSES[model]
                    ]
                case = f"{pdf.stem[:40]}/p{index + 1:03d}"
                facts = PageFacts(case, has_layer, text, ocr_seconds, regions, layout_seconds)
                ref = await reference(graph, pdf, index, text, has_layer)
                spent += ref.get("cost_usd", 0.0)
                truth = has_notation(ref)
                for subject_id, (flagged, seconds, why) in detectors(facts).items():
                    run["cases"].append(
                        {
                            "subject": subject_id,
                            "case": case,
                            **({"error": "classifier failed"} if ref["kind"] == "error" else {}),
                            "pass": flagged == truth,
                            "metrics": {"seconds_per_page": round(seconds, 3)},
                            "failures": []
                            if flagged == truth
                            else [
                                "skipped a notation page"
                                if truth
                                else "flagged a page without notation"
                            ],
                            "detail": {
                                "flagged": flagged,
                                "reference_notation": truth,
                                "reference_kind": ref["kind"],
                                "reference_regions": ref["regions"],
                                **why,
                            },
                        }
                    )
                run["progress"]["done"] += 1
                summarise(run)
                for s in run["subjects"]:
                    s["status"] = "running"
                write_run(run, path)
                print(
                    f"  {case:46} {ref['kind']:17} v3={len(regions['pp_doc_layoutv3'])}"
                    f" tags={tag_text(text).may_have_exercise}"
                )

    for s in run["subjects"]:
        s["status"] = "done"
    run["config"]["reference_cost_usd"] = round(spent, 4)
    finish(run)
    summarise(run)
    write_run(run, path)
    print(f"\nreference spend this run: ${spent:.3f}")
    print(f"{'detector':34} {'saved':>6} {'kept':>6} {'missed':>6} {'prec':>6} {'s/page':>7}")
    for s in run["subjects"]:
        m = s["summary"]
        print(
            f"{s['label']:34} {m['skip_rate']:6.0%} {m['recall']:6.0%} {m['missed']:6}"
            f" {m['precision']:6.0%} {m['seconds_per_page']:7.2f}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
