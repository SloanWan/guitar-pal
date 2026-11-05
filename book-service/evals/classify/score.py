"""
Score the page classifier against the gold set reviewed on `/dev/page-gold` (#422).

What decides a parse is not the kind's name but where a page goes next: a
`tab` page, and each `tab` region of a `mixed` page, is sent to the tab
reader (`ChapterParseGraph.route`); every other verdict ends there. So the
headline is whether the pages with tab printed on them are sent, and how
many of the reviewed exercises sit on the pages that are — the most the
parse can read after this step.

    tab page R / P    pages with tab that are sent; pages sent that have tab
    tab exercise R    reviewed exercises on the pages sent, over all of them
    missed exercises  the ones on pages that are not
    kind              pages given the reviewer's kind (the review started from
                      the stored verdict, so on those it measures anchoring as
                      much as the model)
    marks F1          what the verdict implies is printed (tab, strum, chord
                      diagrams, fretboard maps) against what the reviewer
                      marked, pooled over pages

Staff and jianpu are marked in the review whenever they are printed — often
beside a tab, the same music written a second way — but the classifier has
no kind for either, so they are not scored. A case says when its tab has one
beside it: those are the pages a second reading (#425, #426) could check.

Only `confirmed` and `corrected` records are scored. The run file goes to
`evals/classify/results/` in the shape `/dev/evals` reads — page ids and
scores, never the book's text.

    cd book-service
    .venv/bin/python -m evals.classify.score              # the stored verdicts
    .venv/bin/python -m evals.classify.score --dry-run
"""

import argparse
import json
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from evals.classify.seed import NOTATION_OF_KIND, implied_notation
from evals.runlog import finish, new_run, write_run

SERVICE = Path(__file__).resolve().parents[2]
GOLD_ROOT = SERVICE / "materials" / "page-gold"
RESULTS = Path(__file__).parent / "results"

SCORED = ("confirmed", "corrected")
# What a verdict can say is printed; the rest of the review's marks it cannot.
MARKS = tuple(NOTATION_OF_KIND.values())
COMPANIONS = ("staff", "jianpu")

METRICS = [
    {
        "key": "tab_page_recall",
        "label": "Tab page R",
        "direction": "higher",
        "format": "percent",
        "description": (
            "Pages with tab printed that are sent to the tab reader: "
            "a tab page, or a tab region of a mixed one."
        ),
    },
    {
        "key": "tab_exercise_recall",
        "label": "Tab exercise R",
        "direction": "higher",
        "format": "percent",
        "description": (
            "Reviewed tab exercises on the pages sent, over all of "
            "them: the most the parse can read after this step."
        ),
    },
    {
        "key": "missed_exercises",
        "label": "Missed exercises",
        "direction": "lower",
        "format": "fixed0",
        "description": "Tab exercises on pages that are not sent.",
    },
    {
        "key": "tab_page_precision",
        "label": "Tab page P",
        "direction": "higher",
        "format": "percent",
        "description": (
            "Pages sent to the tab reader that have tab: a wrong one costs a segment call."
        ),
    },
    {
        "key": "kind_accuracy",
        "label": "Kind",
        "direction": "higher",
        "format": "percent",
        "description": "Pages given the reviewer's kind.",
    },
    {
        "key": "marks_f1",
        "label": "Marks F1",
        "direction": "higher",
        "format": "percent",
        "description": (
            "Tab, strum, chord diagrams and fretboard maps the "
            "verdict implies, against the review's marks."
        ),
    },
    {
        "key": "pages",
        "label": "Pages",
        "direction": "higher",
        "format": "fixed0",
    },
]


def sends_tab(kind: str, regions: list[str]) -> bool:
    """Whether `route` would send this verdict to the tab reader."""
    return kind == "tab" or (kind == "mixed" and "tab" in regions)


@dataclass
class PageScore:
    has_tab: bool = False
    sent: bool = False
    exercises: int = 0
    kind_right: bool = False
    gold_marks: int = 0
    verdict_marks: int = 0
    matched_marks: int = 0
    failures: list[str] = field(default_factory=list)


def score_page(record: dict, kind: str, regions: list[str]) -> PageScore:
    """One reviewed page against one verdict (`kind`, the kinds of its regions)."""
    gold = set(record["notation"])
    has_tab = "tab" in gold
    sent = sends_tab(kind, regions)
    exercises = record.get("exercises") or 0
    gold_marks = gold & set(MARKS)
    verdict_marks = set(implied_notation(kind, regions))
    sc = PageScore(
        has_tab=has_tab,
        sent=sent,
        exercises=exercises if has_tab else 0,
        kind_right=kind == record["kind"],
        gold_marks=len(gold_marks),
        verdict_marks=len(verdict_marks),
        matched_marks=len(gold_marks & verdict_marks),
    )
    if has_tab and not sent:
        sc.failures.append(
            f"tab printed ({exercises} exercise{'s' if exercises != 1 else ''}) "
            f"but not sent: {kind}" + (f" [{', '.join(regions)}]" if regions else "")
        )
    if sent and not has_tab:
        sc.failures.append("sent to the tab reader with no tab printed")
    if not sc.kind_right:
        sc.failures.append(f"kind {kind}, reviewed {record['kind']}")
    for mark in MARKS:
        if mark == "tab":
            continue  # said above, by where the page goes
        if mark in gold_marks and mark not in verdict_marks:
            sc.failures.append(f"{mark} printed, not in the verdict")
        elif mark in verdict_marks and mark not in gold_marks:
            sc.failures.append(f"{mark} in the verdict, not printed")
    return sc


def ratio(n: int, d: int) -> float:
    return n / d if d else 0.0


def summarise(scores: list[PageScore]) -> dict[str, float]:
    """Pooled over pages: pages and exercises counted, marks pooled."""
    tab = [s for s in scores if s.has_tab]
    sent = [s for s in scores if s.sent]
    exercises = sum(s.exercises for s in tab)
    reached = sum(s.exercises for s in tab if s.sent)
    p = ratio(sum(s.matched_marks for s in scores), sum(s.verdict_marks for s in scores))
    r = ratio(sum(s.matched_marks for s in scores), sum(s.gold_marks for s in scores))
    return {
        "tab_page_recall": ratio(sum(s.sent for s in tab), len(tab)),
        "tab_exercise_recall": ratio(reached, exercises),
        "missed_exercises": exercises - reached,
        "tab_page_precision": ratio(sum(s.has_tab for s in sent), len(sent)),
        "kind_accuracy": ratio(sum(s.kind_right for s in scores), len(scores)),
        "marks_f1": 2 * p * r / (p + r) if p + r else 0.0,
        "pages": len(scores),
    }


def load_records(root: Path, sets: list[str] | None = None) -> list[tuple[str, dict]]:
    """(set name, record) for every page on disk, in set then page order."""
    out = []
    for set_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        if sets and set_dir.name not in sets:
            continue
        for path in sorted(set_dir.glob("p*.json")):
            out.append((set_dir.name, json.loads(path.read_text())))
    return out


def score_stored(records: list[tuple[str, dict]], out: Path | None, gold: Path = GOLD_ROOT) -> dict:
    """The verdicts stored with the records — the parse's classifier — as one subject."""
    scored = [(name, r) for name, r in records if r.get("status") in SCORED]
    skipped = Counter(r.get("status") for _, r in records if r.get("status") not in SCORED)
    sources = sorted({r["model"]["source"] for _, r in scored})
    subject = {"id": "stored", "label": "Stored verdicts", "notes": ", ".join(sources)}
    run = new_run(
        suite="page-classification",
        title="Page classification against the reviewed pages",
        metrics=METRICS,
        subjects=[subject],
        total=len(scored),
        issue=422,
        config={
            "gold": gold.name
            if not gold.is_relative_to(SERVICE)
            else str(gold.relative_to(SERVICE)),
            "skipped": dict(skipped),
            "tab_pages_with_staff_or_jianpu": sum(
                "tab" in r["notation"] and any(c in r["notation"] for c in COMPANIONS)
                for _, r in scored
            ),
        },
    )
    run["subjects"][0]["status"] = "running"
    scores: list[PageScore] = []
    by_set: dict[str, list[PageScore]] = {}
    for name, record in scored:
        model = record["model"]
        sc = score_page(record, model["kind"], list(model["regions"]))
        scores.append(sc)
        by_set.setdefault(name, []).append(sc)
        # A page's own rates are mostly 0 / 0; what it holds and loses reads better.
        metrics = {
            "exercises": sc.exercises,
            "missed_exercises": 0 if sc.sent else sc.exercises,
        }
        run["cases"].append(
            {
                "subject": "stored",
                "case": f"{name}/{record['id']}",
                "pass": not sc.failures,
                "metrics": metrics,
                "failures": sc.failures,
                "detail": {
                    "page": record["page"],
                    "status": record["status"],
                    "kind": record["kind"],
                    "notation": record["notation"],
                    "exercises": record["exercises"],
                },
            }
        )
        run["progress"]["done"] = len(scores)
        run["subjects"][0]["summary"] = summarise(scores)
        if out:
            write_run(run, out)
    run["subjects"][0]["status"] = "done"
    run["subjects"][0]["breakdown"] = {name: summarise(s) for name, s in by_set.items()}
    finish(run)
    if out:
        write_run(run, out)
    return run


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--gold", type=Path, default=GOLD_ROOT)
    parser.add_argument("--set", action="append", dest="sets", help="only this set (repeatable)")
    parser.add_argument(
        "--dry-run", action="store_true", help="print the scores, write no run file"
    )
    args = parser.parse_args(argv)

    if not args.gold.is_dir():
        print(f"no gold set at {args.gold}", file=sys.stderr)
        return 1
    records = load_records(args.gold, args.sets)
    out = None
    if not args.dry_run:
        from datetime import UTC, datetime

        out = RESULTS / f"{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}.json"
    run = score_stored(records, out, args.gold.resolve())

    summary = run["subjects"][0]["summary"]
    for m in METRICS:
        v = summary[m["key"]]
        print(
            f"{m['label']:>17}  {v:.1%}"
            if m["format"] == "percent"
            else f"{m['label']:>17}  {v:.0f}"
        )
    for case in run["cases"]:
        if case["failures"]:
            print(f"\n{case['case']}")
            for line in case["failures"]:
                print(f"  {line}")
    if out:
        print(f"\nwrote {out.relative_to(SERVICE)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
