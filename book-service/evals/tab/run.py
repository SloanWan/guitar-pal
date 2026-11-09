"""
Read the gold set's crops with one model or several and score them (#424).

Each reviewed exercise's crop — the one stored with its record, cut once from
the box checked on `/dev/crop-gold` — goes through the parse's own reader,
`TabExtractor.extract_exercise` (read → reconcile → validate, one repair),
so the model is the only thing that changes between subjects: no page is
re-cut, no segmenter runs. The readings are scored by `evals.tab.score`
beside the reading each record was seeded from (`stored`, made before the
review, so the gold was corrected from it — it shows how far that start
leans the gold, and is not a fair entrant).

`--runs N` reads every crop N times per model, to tell a model's level from
its luck; the cases carry `repeat`. Each reading is cached in
`<set>/readings/<vendor>-<model>/<prompt>/<exercise>.r<n>.json`, the prompt's
id being the start of the hash of what the reader is told, so a rerun only
pays for what is new and an edited prompt is read afresh. A cached reading
keeps the model's replies, and a rerun plays them back through today's
reconcile and validator instead of trusting the draft stored with them: a
change on the Python or validator side is scored again for nothing. When
today's code asks for a repair the cached replies do not hold (#464), the
reading resumes: the cached replies play back, the repair is read live and
paid for, and its reply joins the cache. `--replay-prompt` never resumes. A
reading cached before the replies were kept is read again. The models run side by
side; one stops starting readings when its new spending reaches `--max-usd`.

The validator is the Next.js side's (`/api/internal/validate`): a dev server
of this checkout, on `--validator` or `BOOK_SERVICE_VALIDATE_URL`.

    cd book-service && set -a && . ../.env.local && set +a
    .venv/bin/python -m evals.tab.run --set books-batch1 --validator http://localhost:3200 \\
        --model bailian:qwen3-vl-plus --runs 1 --limit 2            # a probe
    .venv/bin/python -m evals.tab.run --set books-batch1 --validator http://localhost:3200 \\
        --model anthropic:claude-opus-5 --model bailian:qwen3.7-plus \\
        --model bailian:qwen3-vl-plus --runs 2

Vendors as in `evals.classify.run`: `anthropic`, `deepseek`, `bailian`
(`+nothink` after a Qwen model's name). Writes `evals/tab/results/<run>.json`.
"""

import argparse
import asyncio
import hashlib
import json
import os
import re
import sys
import time
from collections.abc import Sequence
from dataclasses import dataclass, replace
from pathlib import Path

from app.ask.json_out import json_instruction
from app.ask.provider import Provider
from app.extract.tab import READ_CONCURRENCY, READ_SYSTEM, Segment, TabExtractor, TabReadingOut
from app.ingest.model import PRICE_PER_MTOK, CallUsage
from app.validate import ValidatorClient, ValidatorError
from evals.classify.run import BAILIAN_CNY_PER_MTOK, CNY_PER_USD, cost_usd, provider_for
from evals.runlog import finish, new_run, write_run
from evals.tab.score import (
    GOLD_ROOT,
    METRICS,
    RESULTS,
    SCORED,
    SERVICE,
    Score,
    load_records,
    score_reading,
    summarise,
)

# Which prompt a cached reading answered: the reader's system prompt and the
# reply shape a streamed provider is told (the schema, for the others).
PROMPT_ID = hashlib.sha256((READ_SYSTEM + json_instruction(TabReadingOut)).encode()).hexdigest()[:8]
# `syt-p106-1` → `syt`: the book, for the by-group chart.
BOOK = re.compile(r"^(.+)-p\d{3}-\d+$")

RUN_METRICS = [
    *METRICS,
    {
        "key": "repaired",
        "label": "Repaired",
        "direction": "lower",
        "format": "fixed0",
        "description": "Readings the validator sent back once before they passed or were dropped.",
    },
    {
        "key": "truncated",
        "label": "Truncated",
        "direction": "lower",
        "format": "fixed0",
        "description": (
            "Readings a call of which hit the token cap, mostly while still thinking:"
            " the reply was never written, which is not the same as misread."
        ),
    },
    {
        "key": "cost_per_exercise_usd",
        "label": "$ / exercise",
        "direction": "lower",
        "format": "usd",
    },
    {
        "key": "seconds_per_exercise",
        "label": "s / exercise",
        "direction": "lower",
        "format": "fixed2",
    },
]


@dataclass
class Exercise:
    set: str
    record: dict
    crop: Path

    @property
    def id(self) -> str:
        return self.record["id"]

    @property
    def book(self) -> str:
        m = BOOK.match(self.id)
        return m.group(1) if m else self.set


def reader_for(spec: str) -> Provider:
    """The provider `evals.classify.run` builds, with the named model as the reader.

    The reader runs on a provider's large model; the classifier's spec names
    the small one. Anthropic's calls are streamed: the network here cuts a
    request that sends nothing back for 60 s, and Opus reading a long tab
    takes longer than that (Bailian's and DeepSeek's are streamed already).
    """
    provider = provider_for(spec)
    provider = replace(provider, model=provider.small_model)
    if provider.name == "bailian" and provider.model not in BAILIAN_CNY_PER_MTOK:
        raise SystemExit(f"no price for {provider.model} in BAILIAN_CNY_PER_MTOK")
    if provider.name != "bailian" and provider.model not in PRICE_PER_MTOK:
        raise SystemExit(f"no price for {provider.model} in PRICE_PER_MTOK")
    if provider.name == "anthropic":
        messages = provider.client.messages

        async def create_streamed(**kwargs: object) -> object:
            async with messages.stream(**kwargs) as stream:  # type: ignore[arg-type]
                return await stream.get_final_message()

        messages.create = create_streamed  # type: ignore[method-assign]
    return provider


class Recorder(TabExtractor):
    """The parse's reader, keeping each model reply — or, given replies, playing
    them back in order instead of calling the model; with `resume`, calling it
    for what the replies run out before."""

    def __init__(
        self,
        provider: Provider,
        validator: ValidatorClient,
        replay: list | None = None,
        resume: bool = False,
    ) -> None:
        super().__init__(provider, validator)
        self.replies: list[dict | None] = []
        self._replay = None if replay is None else list(replay)
        self._resume = resume
        # Set when today's code asks for a repair the cached reading never made.
        self.short = False
        # The calls a resumed reading made past its cached replies.
        self.paid: list[CallUsage] = []

    async def read(
        self, png: bytes, repair: tuple[TabReadingOut, Sequence[dict[str, object]]] | None = None
    ) -> tuple[TabReadingOut | None, CallUsage]:
        if self._replay:
            reply = self._replay.pop(0)
            self.replies.append(reply)
            out = TabReadingOut.model_validate(reply) if reply else None
            return out, CallUsage(0, 0, self._provider.model)
        if self._replay is not None and not self._resume:
            self.short = True
            return None, CallUsage(0, 0, self._provider.model)
        out, usage = await super().read(png, repair)
        self.replies.append(out.model_dump() if out else None)
        if self._replay is not None:
            self.paid.append(usage)
        return out, usage


async def extract(extractor: TabExtractor, ex: Exercise) -> tuple:
    # The heading only names the draft when the model reads none; the name is not scored.
    return await extractor.extract_exercise(
        ex.crop.read_bytes(), ex.record.get("page") or 0, Segment("", 1, (0.0, 0.0, 1.0, 1.0))
    )


def outcome(record: object, dropped: list[dict]) -> dict:
    return {
        "draft": record.draft if record else None,  # type: ignore[attr-defined]
        "warnings": (record.warnings if record else []) + dropped,  # type: ignore[attr-defined]
        "dropped": record is None,
    }


async def read(provider: Provider, validator: ValidatorClient, ex: Exercise) -> dict:
    """One reading of one crop, with what it cost; `error` when a call itself broke."""
    recorder = Recorder(provider, validator)
    tick = time.perf_counter()
    try:
        record, usage, dropped = await extract(recorder, ex)
    except ValidatorError:
        raise  # the validator is down: every later reading would fail the same way
    except Exception as e:  # a rate limit, a refused field: said, and not cached
        return {"error": f"{type(e).__name__}: {str(e)[:300]}"}
    return {
        **outcome(record, dropped),
        "replies": recorder.replies,
        **usage_fields(provider, usage),
        "seconds": round(time.perf_counter() - tick, 2),
    }


async def replay(
    provider: Provider, validator: ValidatorClient, ex: Exercise, cached: dict, resume: bool = False
) -> dict:
    """A cached reading's replies through today's reconcile and validator, at no cost;
    what the reading cost and how its calls ended stay as they were. With `resume`,
    a repair the replies do not hold is read live, and `resumed` says what it cost."""
    recorder = Recorder(provider, validator, cached["replies"], resume)
    tick = time.perf_counter()
    record, _, dropped = await extract(recorder, ex)
    out = {**cached, **outcome(record, dropped), "cached": True}
    if recorder.paid:
        new = usage_fields(provider, recorder.paid)
        out.update(
            replies=recorder.replies,
            calls=cached.get("calls", 1) + new["calls"],
            stop_reasons=cached.get("stop_reasons", []) + new["stop_reasons"],
            input_tokens=cached.get("input_tokens", 0) + new["input_tokens"],
            output_tokens=cached.get("output_tokens", 0) + new["output_tokens"],
            cost_usd=round(cached.get("cost_usd", 0.0) + new["cost_usd"], 6),
            seconds=round(cached.get("seconds", 0.0) + time.perf_counter() - tick, 2),
            resumed=new["cost_usd"],
        )
    if recorder.short:
        out["warnings"] = out["warnings"] + [
            {"code": "REPLAY_SHORT", "message": "today's code asks for a repair never read"}
        ]
    return out


def usage_fields(provider: Provider, usage: list[CallUsage]) -> dict:
    return {
        "calls": len(usage),
        "stop_reasons": [u.stop_reason for u in usage],
        "input_tokens": sum(u.input_tokens for u in usage),
        "output_tokens": sum(u.output_tokens for u in usage),
        "cost_usd": round(cost_usd(provider, usage), 6),
    }


def subject_summary(scores: list[Score], readings: list[dict]) -> dict[str, float]:
    out: dict[str, float] = summarise(scores)
    done = [r for r in readings if "error" not in r]
    out["repaired"] = sum(r.get("calls", 1) > 1 for r in done)
    # Readings cached before the stop reasons were kept say nothing either way.
    told = [r for r in done if "stop_reasons" in r]
    if told:
        out["truncated"] = sum(truncated(r) for r in told)
    priced = [r for r in done if "cost_usd" in r]
    if priced:
        out["cost_per_exercise_usd"] = sum(r["cost_usd"] for r in priced) / len(priced)
        out["seconds_per_exercise"] = sum(r["seconds"] for r in priced) / len(priced)
    return out


def truncated(reading: dict) -> bool:
    """Whether a call of the reading ran out of tokens: unwritten rather than misread."""
    return "max_tokens" in reading.get("stop_reasons", [])


def add_case(
    run: dict, subject: str, ex: Exercise, repeat: int | None, reading: dict
) -> Score | None:
    case: dict = {"subject": subject, "case": f"{ex.set}/{ex.id}"}
    if repeat is not None:
        case["repeat"] = repeat
    if "error" in reading:
        run["cases"].append({**case, "error": reading["error"], "metrics": {}})
        return None
    sc = score_reading(reading["draft"], ex.record["gold"], reading.get("warnings"))
    metrics = summarise([sc])
    metrics.pop("exercises", None)
    for key in ("cost_usd", "seconds", "calls"):
        if key in reading:
            metrics[key] = reading[key]
    if "stop_reasons" in reading:
        metrics["truncated"] = int(truncated(reading))
    run["cases"].append(
        {
            **case,
            "pass": sc.exact,
            "metrics": metrics,
            "failures": sc.differences[:40],
            "detail": {
                "page": ex.record.get("page"),
                "book": ex.book,
                "status": ex.record["status"],
                "jianpu": ex.record.get("jianpu"),
                "marks": sc.kinds,
            },
        }
    )
    return sc


def finish_subject(
    subject: dict, done: list[tuple[Exercise, int | None, dict, Score | None]]
) -> None:
    """Pooled over every reading, then per book and per repeat."""
    scores = [sc for *_, sc in done if sc is not None]
    subject["summary"] = subject_summary(scores, [r for _, _, r, _ in done])
    by_book: dict[str, list[Score]] = {}
    by_repeat: dict[str, list[Score]] = {}
    for ex, repeat, _, sc in done:
        if sc is not None:
            by_book.setdefault(ex.book, []).append(sc)
            by_repeat.setdefault(str(repeat), []).append(sc)
    subject["breakdown"] = {book: summarise(s) for book, s in sorted(by_book.items())}
    if len(by_repeat) > 1:
        subject["by_repeat"] = {n: summarise(s) for n, s in sorted(by_repeat.items())}


async def run_model(
    spec: str,
    exercises: list[Exercise],
    runs: int,
    validator: ValidatorClient,
    run: dict,
    out: Path,
    max_usd: float,
    prompt: str = PROMPT_ID,
) -> None:
    provider = reader_for(spec)
    folder = spec.replace(":", "-").replace("/", "-")
    subject = next(s for s in run["subjects"] if s["id"] == spec)
    subject["status"] = "running"
    spent = 0.0
    # The extractor holds READ_CONCURRENCY reads in flight; this keeps a job
    # from being started past the budget while others wait for a slot.
    slots = asyncio.Semaphore(READ_CONCURRENCY)
    done: list[tuple[Exercise, int | None, dict, Score | None]] = []

    def cache_path(ex: Exercise, repeat: int) -> Path:
        return GOLD_ROOT / ex.set / "readings" / folder / prompt / f"{ex.id}.r{repeat}.json"

    async def job(ex: Exercise, repeat: int) -> tuple[Exercise, int, dict]:
        nonlocal spent
        path = cache_path(ex, repeat)
        cached = json.loads(path.read_text()) if path.exists() else {}
        if "replies" in cached:
            if spent >= max_usd:
                return ex, repeat, await replay(provider, validator, ex, cached)
            async with slots:
                try:
                    reading = await replay(provider, validator, ex, cached, resume=spent < max_usd)
                except ValidatorError:
                    raise
                except Exception as e:  # the repair call broke: scored as cached, said
                    reading = await replay(provider, validator, ex, cached)
                    reading["warnings"] = reading["warnings"] + [
                        {"code": "RESUME_FAILED", "message": f"{type(e).__name__}: {str(e)[:200]}"}
                    ]
            resumed = reading.pop("resumed", None)
            if resumed is not None:
                spent += resumed
                del reading["cached"]  # partly read today: printed and stored as new
                path.write_text(json.dumps(reading, ensure_ascii=False) + "\n")
            return ex, repeat, reading
        async with slots:
            if spent >= max_usd:
                return ex, repeat, {"error": f"not read: --max-usd {max_usd} reached"}
            reading = await read(provider, validator, ex)
        if "error" not in reading:
            spent += reading["cost_usd"]
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(reading, ensure_ascii=False) + "\n")
        return ex, repeat, reading

    try:
        jobs = [job(ex, n) for n in range(1, runs + 1) for ex in exercises]
        for next_done in asyncio.as_completed(jobs):
            ex, repeat, reading = await next_done
            sc = add_case(run, spec, ex, repeat, reading)
            done.append((ex, repeat, reading, sc))
            if "error" in reading:
                mark = reading["error"][:80]
            else:
                f1 = summarise([sc]).get("note_f1", 0.0) if sc else 0.0
                mark = "dropped" if reading["dropped"] else f"note F1 {f1:.0%}"
                mark += f"  ${reading['cost_usd']:.4f} {reading['seconds']:.0f}s"
                mark += " (cached)" if reading.get("cached") else ""
            print(f"  {spec} r{repeat} {ex.id}: {mark}")
            run["progress"]["done"] += 1
            finish_subject(subject, done)
            write_run(run, out)
    finally:
        # Inside the loop that used it, or its connections are closed after the loop is.
        await provider.client.close()
    subject["status"] = "done"
    subject["spent_usd"] = round(spent, 4)
    if spent >= max_usd:
        subject["notes"] = f"stopped starting readings at ${spent:.3f}: --max-usd {max_usd}"
    finish_subject(subject, done)
    write_run(run, out)


async def run_models(
    specs: list[str],
    exercises: list[Exercise],
    runs: int,
    validator: ValidatorClient,
    run: dict,
    out: Path,
    max_usd: float,
    prompt: str = PROMPT_ID,
) -> None:
    """Every model at once: the time is spent waiting on the vendors, each its own."""
    await asyncio.gather(
        *(run_model(s, exercises, runs, validator, run, out, max_usd, prompt) for s in specs)
    )


def stored_subject(run: dict, exercises: list[Exercise]) -> None:
    """The readings the records were seeded from, the ones the review corrected."""
    done = []
    for ex in exercises:
        model = ex.record["model"]
        reading = {"draft": model["draft"], "warnings": model.get("warnings") or []}
        done.append((ex, None, reading, add_case(run, "stored", ex, None, reading)))
    subject = run["subjects"][0]
    subject["status"] = "done"
    finish_subject(subject, done)


async def check_validator(validator: ValidatorClient) -> None:
    """One empty draft, before anything is spent: the validator answers, or the run stops."""
    try:
        await validator.tab({"measures": []})
    except ValidatorError as e:
        raise SystemExit(f"{e} — start this checkout's dev server, or pass --validator") from e


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--model", action="append", dest="models", required=True, help="vendor:model"
    )
    parser.add_argument("--runs", type=int, default=2, help="readings per crop per model")
    parser.add_argument("--set", action="append", dest="sets", help="only this set (repeatable)")
    parser.add_argument(
        "--exercise", action="append", dest="ids", help="only this exercise id (repeatable)"
    )
    parser.add_argument("--limit", type=int, help="only the first N exercises (a probe)")
    parser.add_argument(
        "--max-usd", type=float, default=3.0, help="stop a model at this new spend (default 3)"
    )
    parser.add_argument(
        "--replay-prompt",
        metavar="ID",
        help="play back the readings cached under an earlier prompt through today's code;"
        " reads nothing new",
    )
    parser.add_argument(
        "--validator",
        default=os.environ.get("BOOK_SERVICE_VALIDATE_URL"),
        help="the Next.js dev server (default BOOK_SERVICE_VALIDATE_URL)",
    )
    args = parser.parse_args(argv)
    # Replies to an earlier prompt, through today's reconcile and validator: what a
    # code change does on its own, before a new prompt is paid for.
    prompt = args.replay_prompt or PROMPT_ID
    if args.replay_prompt:
        args.max_usd = 0.0

    secret = os.environ.get("BOOK_SERVICE_INTERNAL_SECRET")
    if not args.validator or not secret:
        parser.error(
            "need --validator (or BOOK_SERVICE_VALIDATE_URL) and BOOK_SERVICE_INTERNAL_SECRET"
        )
    exercises = [
        Exercise(name, record, GOLD_ROOT / name / "crops" / record["crop"])
        for name, record in load_records(GOLD_ROOT, args.sets)
        if record.get("status") in SCORED and record.get("gold")
    ]
    if args.ids:
        exercises = [ex for ex in exercises if ex.id in set(args.ids)]
        if missing := set(args.ids) - {ex.id for ex in exercises}:
            parser.error(f"no reviewed exercise {', '.join(sorted(missing))}")
    if args.limit:
        exercises = exercises[: args.limit]
    if not exercises:
        parser.error("no reviewed exercises to read")
    if lost := [ex.id for ex in exercises if not ex.crop.exists()]:
        parser.error(f"no crop for {', '.join(lost)}")
    for spec in args.models:
        reader_for(spec)  # every key and price checked before anything is spent
    validator = ValidatorClient(args.validator, secret)
    asyncio.run(check_validator(validator))

    run = new_run(
        suite="tab-extraction",
        title="Tab readers on the reviewed crops",
        issue=424,
        metrics=RUN_METRICS,
        subjects=[
            {
                "id": "stored",
                "label": "seed reading (stored)",
                "notes": "the reading the review corrected; the gold leans its way",
            },
            *(
                {"id": spec, "label": spec.partition(":")[2], "group": spec.partition(":")[0]}
                for spec in args.models
            ),
        ],
        total=len(exercises) * (len(args.models) * args.runs + 1),
        config={
            "sets": sorted({ex.set for ex in exercises}),
            "exercises": len(exercises),
            "runs": args.runs,
            "prompt": prompt,
            "max_usd_per_model": args.max_usd,
            "cny_per_usd": CNY_PER_USD,
        },
    )
    probe = args.limit or args.ids
    out = RESULTS / f"{run['run_id']}{'-probe' if probe else ''}.json"
    stored_subject(run, exercises)
    run["progress"]["done"] = len(exercises)
    write_run(run, out)
    print(f"run {run['run_id']} → {out.relative_to(SERVICE)}  ({len(exercises)} exercises)")

    asyncio.run(
        run_models(args.models, exercises, args.runs, validator, run, out, args.max_usd, prompt)
    )

    finish(run)
    write_run(run, out)
    keys = (
        "note_f1",
        "rhythm",
        "exact",
        "drafted",
        "cost_per_exercise_usd",
        "seconds_per_exercise",
    )
    print(f"\n{'subject':<26}" + "".join(f"{k[:14]:>16}" for k in keys))
    for s in run["subjects"]:
        row = s.get("summary", {})
        print(
            f"{s['label'][:26]:<26}" + "".join(f"{row.get(k, float('nan')):>16.4f}" for k in keys)
        )
        for n, rep in s.get("by_repeat", {}).items():
            print(
                f"{'  run ' + n:<26}"
                + "".join(f"{rep.get(k, float('nan')):>16.4f}" for k in keys[:4])
            )
    print(f"\nwrote {out.relative_to(SERVICE)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
