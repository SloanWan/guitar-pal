"""
Run page classifiers over the reviewed pages and score them (#422).

Each model is asked exactly what the parse asks (`ChapterParseGraph.
classify_page`: the page at 100 dpi, its text layer or OCR, the classifier's
prompt) of every page reviewed on `/dev/page-gold`, and scored by
`evals.classify.score` beside the verdicts stored with the records (Sonnet 5,
the parse's own). A page the model fails to answer twice is filed as the
parse files it — `other`, so not sent — and counted.

The page text is the notation eval's (the text layer when the page has one,
else PP-OCRv6 tiny lines), cached in `<set>/inputs/`; each model's verdicts
are cached in `<set>/verdicts/<vendor>-<model>/<prompt>/`, the prompt's
id being the start of its hash, so a rerun only pays for what is new and an
edited prompt is asked afresh. The models run side by side, each a few pages at a time; one
stops when its new spending reaches `--max-usd`.

    cd book-service && set -a && . ../.env.local && set +a
    .venv/bin/python -m evals.classify.run --model bailian:qwen3-vl-plus --limit 3   # a probe
    .venv/bin/python -m evals.classify.run --model bailian:qwen3-vl-plus \
        --model deepseek:deepseek-flash
    .venv/bin/python -m evals.classify.run --model bailian:qwen3.7-plus --page syt/p109

Vendors: `anthropic` (ANTHROPIC_API_KEY), `deepseek` (DEEPSEEK_API_KEY),
`bailian` (DASHSCOPE_API_KEY). Writes `evals/classify/results/<run>.json`.
"""

import argparse
import asyncio
import hashlib
import json
import os
import sys
import time
from dataclasses import dataclass, replace
from pathlib import Path

import pymupdf
from anthropic import AsyncAnthropic

from app.ask.provider import Provider, anthropic_provider, bailian_provider, deepseek_provider
from app.graph.chapter import ChapterParseGraph
from app.graph.prompts import CLASSIFY_SYSTEM
from app.ingest.model import CallUsage
from app.ingest.pdf import CLASSIFY_RENDER_DPI, MIN_TEXT_LAYER_CHARS
from app.parse import ParsePage
from evals.classify.score import (
    GOLD_ROOT,
    METRICS,
    RESULTS,
    SCORED,
    SERVICE,
    PageScore,
    load_records,
    score_page,
    summarise,
)
from evals.classify.seed import SLUGS
from evals.notation.run import find_pdf
from evals.runlog import finish, new_run, write_run

# Bailian's list prices, CNY per million tokens (input, output), for the
# first tier (≤ 32K input, which every page is), read 2026-11-03 from
# help.aliyun.com/zh/model-studio/model-pricing. Discounts are not assumed,
# so a figure is never an understatement. Thinking is billed as output.
BAILIAN_CNY_PER_MTOK: dict[str, tuple[float, float]] = {
    "qwen3-vl-plus": (1.0, 10.0),
    "qwen3.7-plus": (2.0, 8.0),
    "qwen3.7-flash": (0.2, 0.8),
    "qwen3.8-flash": (0.8, 2.7),
    "kimi-k2.5": (4.0, 21.0),
    # Not on the price page yet: developer.aliyun.com/article/1763163, 2026-11-04.
    "kimi-k2.6": (6.5, 27.0),
    # Busy-hour rates; off-peak is half.
    "deepseek-v4.1-flash": (2.0, 8.0),
    "qwen3.6-flash": (1.2, 7.2),
}
CNY_PER_USD = 7.1
# Pages in flight at once, per model.
BATCH = 4
# Which prompt a cached verdict answered.
PROMPT_ID = hashlib.sha256(CLASSIFY_SYSTEM.encode()).hexdigest()[:8]

RUN_METRICS = [
    *METRICS,
    {
        "key": "unanswered",
        "label": "Unanswered",
        "direction": "lower",
        "format": "fixed0",
        "description": "Pages the model did not answer twice; the parse files them as other.",
    },
    {"key": "cost_per_page_usd", "label": "$ / page", "direction": "lower", "format": "usd"},
    {"key": "seconds_per_page", "label": "s / page", "direction": "lower", "format": "fixed2"},
]


def provider_for(spec: str) -> Provider:
    vendor, _, model = spec.partition(":")
    if not model:
        raise SystemExit(f"{spec!r}: name a model as vendor:model")
    if vendor == "bailian":
        # `+nothink` asks a Qwen 3.x model to answer without reasoning first, `+think`
        # to reason first; without either the model does as it does by default.
        model, _, flag = model.partition("+")
        if flag not in ("", "think", "nothink"):
            raise SystemExit(f"{spec!r}: +think or +nothink")
        thinking = {"think": True, "nothink": False}.get(flag)
        return bailian_provider(_key("DASHSCOPE_API_KEY"), model, thinking=thinking)
    if vendor == "deepseek":
        return replace(deepseek_provider(_key("DEEPSEEK_API_KEY")), small_model=model)
    if vendor == "anthropic":
        return replace(anthropic_provider(AsyncAnthropic()), small_model=model)
    raise SystemExit(f"{vendor!r} is not a vendor: anthropic, deepseek or bailian")


def _key(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"{name} is not set (load ../.env.local first)")
    return value


def cost_usd(provider: Provider, usage: list[CallUsage]) -> float:
    """What the calls cost, at the eval's own Bailian prices or the service's table."""
    if provider.name != "bailian":
        return sum(u.cost_usd for u in usage)
    if provider.small_model not in BAILIAN_CNY_PER_MTOK:
        raise SystemExit(f"no price for {provider.small_model} in BAILIAN_CNY_PER_MTOK")
    price_in, price_out = BAILIAN_CNY_PER_MTOK[provider.small_model]
    cny = sum(u.input_tokens * price_in + u.output_tokens * price_out for u in usage) / 1e6
    return cny / CNY_PER_USD


@dataclass
class Page:
    set: str
    record: dict
    pdf: Path

    @property
    def stem(self) -> str:
        return self.record["id"]


def pdf_for_set(gold: Path) -> dict[str, Path]:
    """Each set's PDF in `materials/`, by the seed's slugs."""
    out = {}
    for name, slug in SLUGS.items():
        pdf = find_pdf(name)
        if pdf is not None and (gold / slug).is_dir():
            out[slug] = pdf
    return out


class Inputs:
    """The page's text and image as the parse would send them; the text cached."""

    def __init__(self, gold: Path) -> None:
        self.gold = gold
        self._ocr = None

    def text(self, page: Page, doc: pymupdf.Document) -> tuple[str, bool]:
        path = self.gold / page.set / "inputs" / f"{page.stem}.json"
        if path.exists():
            cached = json.loads(path.read_text())
            return cached["text"], cached["layer"]
        index = page.record["page"] - 1
        layer_text = doc[index].get_text("text").strip()
        layer = len(layer_text) >= MIN_TEXT_LAYER_CHARS
        if layer:
            text = layer_text
        else:
            from app.ingest.ocr import build_ocr, ocr_lines, page_bgr

            if self._ocr is None:
                self._ocr = build_ocr("PP-OCRv6", "tiny")
            text = "\n".join(line.text for line in ocr_lines(self._ocr, page_bgr(doc[index])))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"text": text, "layer": layer}, ensure_ascii=False) + "\n")
        return text, layer

    def parse_page(self, page: Page, doc: pymupdf.Document) -> ParsePage:
        text, layer = self.text(page, doc)
        png = doc[page.record["page"] - 1].get_pixmap(dpi=CLASSIFY_RENDER_DPI).tobytes("png")
        # Every page goes with its image, as the stored verdicts were made.
        return ParsePage(page.record["page"], text, layer, False, png)


async def classify(
    graph: ChapterParseGraph, provider: Provider, page: Page, parse_page: ParsePage
) -> dict:
    """One verdict: kind, region kinds, what it cost; `error` when the call itself broke."""
    tick = time.perf_counter()
    try:
        out = await graph.classify_page({"page": parse_page, "chapter_title": page.pdf.stem})
    except Exception as e:  # a refused field, a rate limit: said, and not cached
        return {"error": f"{type(e).__name__}: {str(e)[:300]}"}
    usage: list[CallUsage] = out["usage"]  # type: ignore[assignment]
    c = out["classified"][0]  # type: ignore[index]
    return {
        "kind": c.kind,
        "regions": [r.kind for r in c.regions],
        "note": c.note,
        "unanswered": bool(out.get("warnings")),
        "calls": len(usage),
        "input_tokens": sum(u.input_tokens for u in usage),
        "output_tokens": sum(u.output_tokens for u in usage),
        "cost_usd": round(cost_usd(provider, usage), 6),
        "seconds": round(time.perf_counter() - tick, 2),
    }


def subject_summary(scores: list[PageScore], verdicts: list[dict]) -> dict[str, float]:
    out: dict[str, float] = summarise(scores)
    answered = [v for v in verdicts if "cost_usd" in v]
    out["unanswered"] = sum(bool(v.get("unanswered")) for v in verdicts)
    if answered:
        out["cost_per_page_usd"] = sum(v["cost_usd"] for v in answered) / len(answered)
        timed = [v["seconds"] for v in answered if "seconds" in v]
        if timed:
            out["seconds_per_page"] = sum(timed) / len(timed)
    return out


def add_case(run: dict, subject: str, page: Page, verdict: dict) -> PageScore | None:
    case = f"{page.set}/{page.stem}"
    if "error" in verdict:
        run["cases"].append(
            {"subject": subject, "case": case, "error": verdict["error"], "metrics": {}}
        )
        return None
    sc = score_page(page.record, verdict["kind"], verdict["regions"])
    failures = list(sc.failures)
    if verdict.get("unanswered"):
        failures.insert(0, "no answer after two tries: filed as other")
    run["cases"].append(
        {
            "subject": subject,
            "case": case,
            "pass": not failures,
            "metrics": {
                "exercises": sc.exercises,
                "missed_exercises": 0 if sc.sent else sc.exercises,
                **{k: verdict[k] for k in ("cost_usd", "seconds") if k in verdict},
            },
            "failures": failures,
            "detail": {
                "page": page.record["page"],
                "verdict": verdict["kind"],
                "regions": verdict["regions"],
                "note": verdict.get("note", ""),
                "reviewed_kind": page.record["kind"],
                "notation": page.record["notation"],
            },
        }
    )
    return sc


async def run_model(
    spec: str,
    pages: list[Page],
    inputs: Inputs,
    run: dict,
    out: Path,
    max_usd: float,
) -> None:
    provider = provider_for(spec)
    graph = ChapterParseGraph(provider)
    folder = spec.replace(":", "-").replace("/", "-")
    subject = next(s for s in run["subjects"] if s["id"] == spec)
    subject["status"] = "running"
    scores: list[PageScore] = []
    verdicts: list[dict] = []
    spent = 0.0
    docs: dict[Path, pymupdf.Document] = {}

    def cache_path(page: Page) -> Path:
        return inputs.gold / page.set / "verdicts" / folder / PROMPT_ID / f"{page.stem}.json"

    try:
        for start in range(0, len(pages), BATCH):
            if spent >= max_usd:
                subject["notes"] = f"stopped at ${spent:.3f}: --max-usd {max_usd}"
                print(f"  {spec}: stopped, ${spent:.3f} spent")
                break
            batch = pages[start : start + BATCH]
            todo = []
            results: dict[int, dict] = {}
            for i, page in enumerate(batch):
                path = cache_path(page)
                if path.exists():
                    results[i] = {**json.loads(path.read_text()), "cached": True}
                    continue
                doc = docs.setdefault(page.pdf, pymupdf.open(page.pdf))
                todo.append((i, page, inputs.parse_page(page, doc)))
            answers = await asyncio.gather(
                *(classify(graph, provider, page, pp) for _, page, pp in todo)
            )
            for (i, page, _), verdict in zip(todo, answers, strict=True):
                results[i] = verdict
                if "error" not in verdict:
                    spent += verdict["cost_usd"]
                    cache_path(page).parent.mkdir(parents=True, exist_ok=True)
                    cache_path(page).write_text(json.dumps(verdict, ensure_ascii=False) + "\n")
            for i, page in enumerate(batch):
                verdict = results[i]
                verdicts.append(verdict)
                sc = add_case(run, spec, page, verdict)
                if sc is not None:
                    scores.append(sc)
                mark = verdict.get("error", verdict.get("kind"))
                print(f"  {spec} {page.set}/{page.stem}: {mark}")
            run["progress"]["done"] += len(batch)
            subject["summary"] = subject_summary(scores, verdicts)
            write_run(run, out)
            errors = [v for v in verdicts[-len(batch) :] if "error" in v]
            if len(errors) == len(batch):
                subject["notes"] = f"stopped: every call in a batch failed ({errors[0]['error']})"
                print(f"  {spec}: {subject['notes']}")
                break
    finally:
        for doc in docs.values():
            doc.close()
        # Inside the loop that used it, or its connections are closed after the loop is.
        await provider.client.close()
    subject["status"] = "done"
    subject["summary"] = subject_summary(scores, verdicts)
    by_set: dict[str, list[PageScore]] = {}
    for page, verdict in zip(pages, verdicts, strict=False):
        if "error" not in verdict:
            by_set.setdefault(page.set, []).append(
                score_page(page.record, verdict["kind"], verdict["regions"])
            )
    subject["breakdown"] = {name: summarise(s) for name, s in by_set.items()}
    subject["spent_usd"] = round(spent, 4)
    write_run(run, out)


async def run_models(
    specs: list[str], pages: list[Page], inputs: Inputs, run: dict, out: Path, max_usd: float
) -> None:
    """Every model at once: the time is spent waiting on the vendors, each its own."""
    await asyncio.gather(*(run_model(spec, pages, inputs, run, out, max_usd) for spec in specs))


def stored_subject(run: dict, pages: list[Page]) -> None:
    """The verdicts the records were seeded from, with what they cost when they were made."""
    scores, verdicts = [], []
    for page in pages:
        model = page.record["model"]
        ref = SERVICE / "materials" / "notation-ref" / page.pdf.stem / f"{page.stem}.json"
        cost = json.loads(ref.read_text()).get("cost_usd") if ref.exists() else None
        verdict = {
            "kind": model["kind"],
            "regions": list(model["regions"]),
            "note": model.get("note", ""),
            **({"cost_usd": cost} if cost is not None else {}),
        }
        verdicts.append(verdict)
        sc = add_case(run, "stored", page, verdict)
        if sc is not None:
            scores.append(sc)
    subject = run["subjects"][0]
    subject["status"] = "done"
    subject["summary"] = subject_summary(scores, verdicts)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--model", action="append", dest="models", required=True, help="vendor:model"
    )
    parser.add_argument("--gold", type=Path, default=GOLD_ROOT)
    parser.add_argument("--limit", type=int, help="only the first N pages (a probe)")
    parser.add_argument(
        "--page", action="append", dest="pages", help="only this page, set/pNNN (repeatable)"
    )
    parser.add_argument(
        "--max-usd", type=float, default=0.5, help="stop a model at this new spend (default 0.5)"
    )
    args = parser.parse_args(argv)

    pdfs = pdf_for_set(args.gold)
    pages = [
        Page(name, record, pdfs[name])
        for name, record in load_records(args.gold)
        if record.get("status") in SCORED and name in pdfs
    ]
    if args.pages:
        wanted = set(args.pages)
        pages = [p for p in pages if f"{p.set}/{p.stem}" in wanted]
        if missing := wanted - {f"{p.set}/{p.stem}" for p in pages}:
            parser.error(f"no reviewed page {', '.join(sorted(missing))}")
    if args.limit:
        # Spread over the books, so a probe sees scans and the text-layer book alike.
        by_set: dict[str, list[Page]] = {}
        for p in pages:
            by_set.setdefault(p.set, []).append(p)
        rounds = [[ps[i] for ps in by_set.values() if i < len(ps)] for i in range(args.limit)]
        pages = [p for r in rounds for p in r][: args.limit]
    for spec in args.models:
        provider_for(spec)  # every key and price checked before anything is spent

    run = new_run(
        suite="page-classification",
        title="Page classifiers against the reviewed pages",
        issue=422,
        metrics=RUN_METRICS,
        subjects=[
            {
                "id": "stored",
                "label": "claude-sonnet-5 (stored)",
                "notes": "the verdicts the review started from",
            },
            *(
                {"id": spec, "label": spec.partition(":")[2], "group": spec.partition(":")[0]}
                for spec in args.models
            ),
        ],
        total=len(pages) * (len(args.models) + 1),
        config={
            "pages": len(pages),
            "image_dpi": CLASSIFY_RENDER_DPI,
            "text": "text layer, else PP-OCRv6 tiny",
            "max_usd_per_model": args.max_usd,
            "cny_per_usd": CNY_PER_USD,
            "prompt": PROMPT_ID,
        },
    )
    out = RESULTS / f"{run['run_id']}{'-probe' if args.limit or args.pages else ''}.json"
    stored_subject(run, pages)
    run["progress"]["done"] = len(pages)
    write_run(run, out)
    print(f"run {run['run_id']} → {out.relative_to(SERVICE)}  ({len(pages)} pages)")

    inputs = Inputs(args.gold)
    asyncio.run(run_models(args.models, pages, inputs, run, out, args.max_usd))

    finish(run)
    write_run(run, out)
    keys = ("tab_exercise_recall", "tab_page_recall", "marks_f1", "unanswered", "cost_per_page_usd")
    print(f"\n{'subject':<28}" + "".join(f"{k[:16]:>18}" for k in keys))
    for s in run["subjects"]:
        row = s.get("summary", {})
        print(
            f"{s['label'][:28]:<28}" + "".join(f"{row.get(k, float('nan')):>18.4f}" for k in keys)
        )
    print(f"\nwrote {out.relative_to(SERVICE)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
