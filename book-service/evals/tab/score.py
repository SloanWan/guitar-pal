"""
Score tab readings against the gold set reviewed on `/dev/tab-gold`.

A reading and its gold are both FingerpickPatterns. They are compared by
where each note starts, never by slot index: a reading that splits or merges
one slot is wrong there and still right after it. A note is (bar, onset in
ticks of 96 per whole note, string, fret or x). Grace notes take no time, so they
are told apart by their place in the run of grace notes before an onset.

    note P / R / F1   notes that match exactly, over the reading's / the gold's
    fret F1           the same with the string left out: the gap to note F1 is
                      the notes whose digit was read right on the wrong line
    rhythm            gold slots whose onset, value and rest-ness the reading has
                      (a slot with no note sounds nothing, so it counts as a rest)
    bars              exercises read with the gold's number of bars
    exact             exercises read without a single difference
    drafted           exercises the parse made a draft for; one it dropped (#420)
                      is scored as an empty reading, every gold note missed
    chord names       printed chord names in order (repeats folded), against
                      the reading's placed chords or, when it places none, the
                      names the extractor kept in the draft's description
    chords placed     gold chord changes the reading puts on the same onset
    links F1          ties, hammers, pulls and slides, by (onset, string, kind)
    effects F1        bends, vibrato and the rest of a note's effects, by (onset,
                      string, kind); a pick stroke and an accent are the column's,
                      by (onset, kind), the pick by its direction too (#440)
    spans F1          the notes a palm mute, let ring or slur covers, by
                      (onset, kind)
    flag P / R        TAB_JIANPU_MISMATCH: flagged notes that are wrong, and
                      wrong notes that were flagged

A mark goes with its note: one on a note read at the wrong onset or string is
missed there and extra where it was read. Both shapes are read — v2's `link`,
`effects` and `spans`, and the parse's v1 `tied`, `technique` and per-note flags.

Only `confirmed` and `corrected` records are scored; `unusable` and
`unchecked` ones are counted and left out. The run file goes to
`evals/tab/results/` in the shape `/dev/evals` reads — exercise ids, page
numbers and scores, never the book's text.

    cd book-service
    .venv/bin/python -m evals.tab.score                 # the stored readings
    .venv/bin/python -m evals.tab.score --set sanyuetong-dense-tab --dry-run
"""

import argparse
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from evals.runlog import finish, new_run, write_run

SERVICE = Path(__file__).resolve().parents[2]
GOLD_ROOT = SERVICE / "materials" / "tab-gold"
RESULTS = Path(__file__).parent / "results"

SCORED = ("confirmed", "corrected")

TICKS = {
    "whole": 96,
    "dotted-half": 72,
    "half": 48,
    "quarter": 24,
    "dotted-quarter": 36,
    "eighth": 12,
    "dotted-eighth": 18,
    "eighth-triplet": 8,
    "dotted-sixteenth": 9,
    "sixteenth": 6,
    "sixteenth-triplet": 4,
    "32nd": 3,
}
STRING_NAMES = "eBGDAE"
CHORD_SUFFIX = {"major": "", "minor": "m"}
# v1's `technique` as v2's link or effect kind (`migratePattern.ts`, `legacyNoteMarks`).
LEGACY_LINKS = {
    "hammer-on": "hammer",
    "pull-off": "pull",
    "slide-up": "slide",
    "slide-down": "slide",
}
LEGACY_EFFECTS = (
    ("pre-bend", "bend"),
    ("bend", "bend"),
    ("vibrato", "vibrato"),
    ("tapping", "tap"),
    ("trill", "trill"),
    ("harmonic", "harmonic"),
    ("whammy", "whammy"),
    ("pick-scrape", "scrape"),
)
LEGACY_FLAGS = {"staccato": "staccato", "accent": "accent", "ghostNote": "ghost"}
LEGACY_SPANS = ("palmMute", "letRing")
# Marks printed over a column: one per slot, whichever of its notes carries them (#440).
COLUMN_MARKS = ("pick down", "pick up", "accent")
SLOT_PATH = re.compile(r"^measures\[(\d+)\]\.slots\[(\d+)\]")

METRICS = [
    {
        "key": "note_f1",
        "label": "Note F1",
        "direction": "higher",
        "format": "percent",
        "description": "Bar, onset, string and fret all right.",
    },
    {
        "key": "note_precision",
        "label": "Note P",
        "direction": "higher",
        "format": "percent",
        "description": "Notes the reading wrote that are in the gold.",
    },
    {
        "key": "note_recall",
        "label": "Note R",
        "direction": "higher",
        "format": "percent",
        "description": "Gold notes the reading has.",
    },
    {
        "key": "fret_f1",
        "label": "Fret F1",
        "direction": "higher",
        "format": "percent",
        "description": "Note F1 with the string left out: the gap is digits on the wrong line.",
    },
    {
        "key": "rhythm",
        "label": "Rhythm",
        "direction": "higher",
        "format": "percent",
        "description": "Gold slots whose onset, value and rest the reading has.",
    },
    {
        "key": "bars",
        "label": "Bars",
        "direction": "higher",
        "format": "percent",
        "description": "Exercises read with the gold's number of bars.",
    },
    {
        "key": "exact",
        "label": "Exact",
        "direction": "higher",
        "format": "percent",
        "description": "Exercises read without a single difference.",
    },
    {
        "key": "drafted",
        "label": "Drafted",
        "direction": "higher",
        "format": "percent",
        "description": "Exercises the parse made a draft for; a dropped one misses every note.",
    },
    {
        "key": "chord_names",
        "label": "Chord names",
        "direction": "higher",
        "format": "percent",
        "description": "Chord exercises whose printed names the reading has in order.",
    },
    {
        "key": "chords_placed",
        "label": "Chords placed",
        "direction": "higher",
        "format": "percent",
        "description": "Gold chord changes the reading puts on the same note.",
    },
    {
        "key": "flag_precision",
        "label": "Flag P",
        "direction": "higher",
        "format": "percent",
        "description": "Notes the jianpu cross-check flagged that are wrong.",
    },
    {
        "key": "flag_recall",
        "label": "Flag R",
        "direction": "higher",
        "format": "percent",
        "description": "Wrong notes the jianpu cross-check flagged.",
    },
    {
        "key": "link_f1",
        "label": "Links F1",
        "direction": "higher",
        "format": "percent",
        "description": "Ties, hammers, pulls and slides on the right note.",
    },
    {
        "key": "effect_f1",
        "label": "Effects F1",
        "direction": "higher",
        "format": "percent",
        "description": "Bends, vibrato, accents, pick direction and the rest, on the right note.",
    },
    {
        "key": "span_f1",
        "label": "Spans F1",
        "direction": "higher",
        "format": "percent",
        "description": "Notes under a palm mute, let ring or slur.",
    },
    {"key": "exercises", "label": "Exercises", "direction": "higher", "format": "fixed0"},
]


# ─── One reading against its gold ─────────────────────────────────────────────

Onset = tuple[int, int, int]  # bar, tick, grace index (0 for a timed slot)
Mark = tuple[int, str]  # string index, kind


@dataclass(frozen=True)
class Slot:
    onset: Onset
    duration: str
    rest: bool
    notes: frozenset[tuple[int, int | None]]  # (string index 0 = high e, fret or None for an x)
    chord: str | None
    id: str | None = None
    links: frozenset[Mark] = frozenset()
    effects: frozenset[Mark] = frozenset()
    flags: frozenset[str] = frozenset()  # v1's per-note span flags, any string


def effect_key(kind: str, value: object) -> str:
    """A pick mark is told by its direction; every other effect by its kind."""
    if kind == "pick" and isinstance(value, dict) and value.get("direction"):
        return f"pick {value['direction']}"
    return kind


def note_marks(note: dict) -> tuple[str | None, list[str]]:
    """A note's link kind and effect keys, from v2's fields or else v1's."""
    if "link" in note or "effects" in note:
        link = note.get("link")
        effects = note.get("effects") or {}
        return (link.get("kind") if isinstance(link, dict) else None), [
            effect_key(k, v) for k, v in effects.items() if v not in (None, False)
        ]
    technique = note.get("technique") if isinstance(note.get("technique"), str) else ""
    link = "tie" if note.get("tied") is True else LEGACY_LINKS.get(technique)
    named = [kind for prefix, kind in LEGACY_EFFECTS if technique.startswith(prefix)]
    effects = [] if link else named[:1]
    effects += [kind for flag, kind in LEGACY_FLAGS.items() if note.get(flag) is True]
    if note.get("tremoloPickingSpeed"):
        effects.append("tremolo")
    if note.get("pickStroke") in ("down", "up"):
        effects.append(f"pick {note['pickStroke']}")
    return link, effects


def chord_name(chord: object) -> str | None:
    if not isinstance(chord, dict) or not chord.get("root"):
        return None
    suffix = str(chord.get("suffix", ""))
    return f"{chord['root']}{CHORD_SUFFIX.get(suffix, suffix)}"


def slots_of(pattern: dict) -> list[Slot]:
    """Every slot with the onset it starts on, measure by measure."""
    out: list[Slot] = []
    for bi, measure in enumerate(pattern.get("measures", [])):
        tick = 0
        grace = 0
        for slot in measure.get("slots", []):
            is_grace = bool(slot.get("isGraceNote"))
            grace = grace + 1 if is_grace else 0
            notes = frozenset(
                (si, None if s.get("muted") else s.get("fret"))
                for si, s in enumerate(slot.get("strings", []))
                if s.get("muted") or s.get("fret") is not None
            )
            # A slot with nothing struck sounds nothing: a rest, drawn or not.
            rest = bool(slot.get("isRest")) or not notes
            links: set[Mark] = set()
            effects: set[Mark] = set()
            flags: set[str] = set()
            for si, s in enumerate(slot.get("strings", [])):
                if rest or not (s.get("muted") or s.get("fret") is not None):
                    continue
                link, keys = note_marks(s)
                if link:
                    links.add((si, link))
                effects.update((si, k) for k in keys)
                flags.update(f for f in LEGACY_SPANS if s.get(f) is True)
            out.append(
                Slot(
                    onset=(bi, tick, grace),
                    duration=slot.get("duration", ""),
                    rest=rest,
                    notes=frozenset() if rest else notes,
                    chord=chord_name(slot.get("chord")),
                    id=slot.get("id"),
                    links=frozenset(links),
                    effects=frozenset(effects),
                    flags=frozenset(flags),
                )
            )
            if not is_grace:
                tick += TICKS.get(slot.get("duration", ""), 0)
    return out


def note_set(slots: list[Slot]) -> set[tuple[Onset, int, int | None]]:
    return {(s.onset, *n) for s in slots for n in s.notes}


def link_set(slots: list[Slot]) -> set[tuple[Onset, int, str]]:
    return {(s.onset, *m) for s in slots for m in s.links}


def effect_set(slots: list[Slot]) -> set[tuple]:
    """A note's effects by (onset, string, kind); a column's marks by (onset, kind)."""
    return {
        (s.onset, k) if k in COLUMN_MARKS else (s.onset, si, k)
        for s in slots
        for si, k in s.effects
    }


def span_set(pattern: dict, slots: list[Slot]) -> set[tuple[Onset, str]]:
    """(onset, kind) for every sounding slot a span covers, from `from` to `to` in
    the pattern's order, plus v1's per-note flags."""
    out = {(s.onset, f) for s in slots for f in s.flags}
    where = {s.id: i for i, s in enumerate(slots) if s.id}
    for span in pattern.get("spans") or []:
        a, b = where.get(span.get("from")), where.get(span.get("to"))
        if a is None or b is None or not span.get("kind"):
            continue
        out.update((s.onset, span["kind"]) for s in slots[min(a, b) : max(a, b) + 1] if not s.rest)
    return out


def fret_set(slots: list[Slot]) -> Counter:
    """Frets by onset, whatever string they were read on."""
    return Counter((s.onset, fret) for s in slots for _, fret in s.notes)


def fold_repeats(names: list[str]) -> list[str]:
    """A chord marked again where it is already in effect changes nothing."""
    return [n for i, n in enumerate(names) if i == 0 or names[i - 1] != n]


def described_chords(draft: dict) -> list[str]:
    description = draft.get("description")
    return description.split() if isinstance(description, str) else []


@dataclass
class Score:
    """Counts for one exercise; `summarise` turns a list of them into rates."""

    gold_notes: int = 0
    read_notes: int = 0
    matched_notes: int = 0
    gold_frets: int = 0
    read_frets: int = 0
    matched_frets: int = 0
    gold_slots: int = 0
    matched_slots: int = 0
    bars_match: bool = False
    exact: bool = False
    drafted: bool = True
    has_chords: bool = False
    chord_names_match: bool = False
    gold_chords: int = 0
    placed_chords: int = 0
    flagged: int = 0
    flagged_wrong: int = 0
    wrong: int = 0
    wrong_flagged: int = 0
    gold_links: int = 0
    read_links: int = 0
    matched_links: int = 0
    gold_effects: int = 0
    read_effects: int = 0
    matched_effects: int = 0
    gold_spans: int = 0
    read_spans: int = 0
    matched_spans: int = 0
    # kind → [gold, read, matched], over links, effects and spans together
    kinds: dict[str, list[int]] = field(default_factory=dict)
    differences: list[str] = field(default_factory=list)


def describe(slot: Slot | None) -> str:
    if slot is None:
        return "—"
    if slot.rest:
        return f"{slot.duration} rest"
    notes = " ".join(f"{STRING_NAMES[s]}{'x' if f is None else f}" for s, f in sorted(slot.notes))
    return f"{slot.duration} {notes or 'empty'}"


def at(onset: Onset) -> str:
    bar, tick, grace = onset
    return f"bar {bar + 1} @{tick}" + (f" grace {grace}" if grace else "")


def compare_marks(sc: Score, family: str, read: set[tuple], gold: set[tuple]) -> None:
    """Count one family of marks into the score and write each difference."""
    setattr(sc, f"read_{family}", len(read))
    setattr(sc, f"gold_{family}", len(gold))
    setattr(sc, f"matched_{family}", len(read & gold))
    for which, marks in ((0, gold), (1, read), (2, read & gold)):
        for m in marks:
            sc.kinds.setdefault(m[-1], [0, 0, 0])[which] += 1
    for m in sorted(read ^ gold, key=str):
        onset, *rest = m
        where = f" {STRING_NAMES[rest[0]]}" if len(rest) == 2 else ""
        side = "missed" if m in gold else "extra"
        sc.differences.append(f"{at(onset)}{where}: {side} {rest[-1]}")


def flagged_onsets(read: dict, warnings: list[dict]) -> set[Onset]:
    """The onsets of the notes the jianpu cross-check flagged in this reading."""
    onsets = iter(s.onset for s in slots_of(read))
    index = {
        (bi, si): next(onsets)
        for bi, measure in enumerate(read.get("measures", []))
        for si, _ in enumerate(measure.get("slots", []))
    }
    out: set[Onset] = set()
    for w in warnings:
        if w.get("code") != "TAB_JIANPU_MISMATCH":
            continue
        m = SLOT_PATH.match(str(w.get("path", "")))
        if m and (int(m.group(1)), int(m.group(2))) in index:
            out.add(index[(int(m.group(1)), int(m.group(2)))])
    return out


def score_reading(read: dict | None, gold: dict, warnings: list[dict] | None = None) -> Score:
    """One reading against its gold; None when the parse dropped the exercise."""
    sc = Score(drafted=read is not None)
    if read is None:
        read = {"measures": []}
        sc.differences.append("no draft: the parse dropped this exercise")
    r_slots, g_slots = slots_of(read), slots_of(gold)

    r_notes, g_notes = note_set(r_slots), note_set(g_slots)
    sc.read_notes, sc.gold_notes = len(r_notes), len(g_notes)
    sc.matched_notes = len(r_notes & g_notes)

    r_fret, g_fret = fret_set(r_slots), fret_set(g_slots)
    sc.read_frets, sc.gold_frets = sum(r_fret.values()), sum(g_fret.values())
    sc.matched_frets = sum((r_fret & g_fret).values())

    r_by_onset = {s.onset: s for s in r_slots}
    g_by_onset = {s.onset: s for s in g_slots}
    sc.gold_slots = len(g_slots)
    sc.matched_slots = sum(
        1
        for s in g_slots
        if (r := r_by_onset.get(s.onset)) and r.duration == s.duration and r.rest == s.rest
    )
    sc.bars_match = len(read.get("measures", [])) == len(gold.get("measures", []))

    for onset in sorted(set(r_by_onset) | set(g_by_onset)):
        r, g = r_by_onset.get(onset), g_by_onset.get(onset)
        if describe(r) != describe(g):
            sc.differences.append(f"{at(onset)}: read {describe(r)}, gold {describe(g)}")

    compare_marks(sc, "links", link_set(r_slots), link_set(g_slots))
    compare_marks(sc, "effects", effect_set(r_slots), effect_set(g_slots))
    compare_marks(sc, "spans", span_set(read, r_slots), span_set(gold, g_slots))

    g_names = fold_repeats([s.chord for s in g_slots if s.chord])
    r_placed = [s.chord for s in r_slots if s.chord]
    r_names = fold_repeats(r_placed or described_chords(read))
    sc.has_chords = bool(g_names or r_names)
    sc.chord_names_match = g_names == r_names
    gold_changes = {(s.onset, s.chord) for s in g_slots if s.chord}
    sc.gold_chords = len(gold_changes)
    sc.placed_chords = len(gold_changes & {(s.onset, s.chord) for s in r_slots if s.chord})
    if sc.has_chords and not sc.chord_names_match:
        sc.differences.append(f"chords: read {' '.join(r_names) or '—'}, gold {' '.join(g_names)}")
    if sc.placed_chords < sc.gold_chords:
        sc.differences.append(f"chords: {sc.placed_chords} of {sc.gold_chords} changes placed")

    sc.exact = not sc.differences and sc.bars_match

    # The cross-check: a flagged onset is wrong when its notes differ from the gold's.
    flags = flagged_onsets(read, warnings or [])
    wrong_onsets = {
        s.onset
        for s in r_slots
        if s.notes and (g := g_by_onset.get(s.onset)) is not None and s.notes != g.notes
    } | {s.onset for s in r_slots if s.notes and s.onset not in g_by_onset}
    sc.flagged = len(flags)
    sc.flagged_wrong = len(flags & wrong_onsets)
    sc.wrong = len(wrong_onsets)
    sc.wrong_flagged = len(wrong_onsets & flags)
    return sc


def ratio(num: int, den: int) -> float | None:
    return num / den if den else None


def dice(matched: int, read: int, gold: int) -> float | None:
    """F1 from counts: 0 when the reading wrote none of the gold's marks, None when
    neither has any."""
    return 2 * matched / (read + gold) if read + gold else None


def f1(p: float | None, r: float | None) -> float | None:
    if p is None or r is None:
        return None
    return 2 * p * r / (p + r) if p + r else 0.0


def summarise(scores: list[Score]) -> dict[str, float]:
    """Rates over a list of exercises: notes pooled, exercises counted."""
    total = Score()
    for s in scores:
        for key in (
            "gold_notes",
            "read_notes",
            "matched_notes",
            "gold_frets",
            "read_frets",
            "matched_frets",
            "gold_slots",
            "matched_slots",
            "gold_chords",
            "placed_chords",
            "flagged",
            "flagged_wrong",
            "wrong",
            "wrong_flagged",
            *(
                f"{side}_{family}"
                for family in ("links", "effects", "spans")
                for side in ("gold", "read", "matched")
            ),
        ):
            setattr(total, key, getattr(total, key) + getattr(s, key))
    p = ratio(total.matched_notes, total.read_notes)
    r = ratio(total.matched_notes, total.gold_notes)
    fp = ratio(total.matched_frets, total.read_frets)
    fr = ratio(total.matched_frets, total.gold_frets)
    chordful = [s for s in scores if s.has_chords]
    out = {
        "note_precision": p,
        "note_recall": r,
        "note_f1": f1(p, r),
        "fret_f1": f1(fp, fr),
        "rhythm": ratio(total.matched_slots, total.gold_slots),
        "bars": ratio(sum(s.bars_match for s in scores), len(scores)),
        "exact": ratio(sum(s.exact for s in scores), len(scores)),
        "drafted": ratio(sum(s.drafted for s in scores), len(scores)),
        "chord_names": ratio(sum(s.chord_names_match for s in chordful), len(chordful)),
        "chords_placed": ratio(total.placed_chords, total.gold_chords),
        "flag_precision": ratio(total.flagged_wrong, total.flagged),
        "flag_recall": ratio(total.wrong_flagged, total.wrong),
        "link_f1": dice(total.matched_links, total.read_links, total.gold_links),
        "effect_f1": dice(total.matched_effects, total.read_effects, total.gold_effects),
        "span_f1": dice(total.matched_spans, total.read_spans, total.gold_spans),
        "exercises": float(len(scores)),
    }
    return {k: v for k, v in out.items() if v is not None}


# ─── The gold set ─────────────────────────────────────────────────────────────


def load_records(root: Path, sets: list[str] | None = None) -> list[tuple[str, dict]]:
    """(set name, record) for every record on disk, in set then id order."""
    out = []
    for set_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        if sets and set_dir.name not in sets:
            continue
        for path in sorted(set_dir.glob("*.json")):
            if path.name == "set.json":
                continue
            out.append((set_dir.name, json.loads(path.read_text())))
    return out


def score_stored(records: list[tuple[str, dict]], out: Path | None, gold: Path = GOLD_ROOT) -> dict:
    """The readings stored with the records — what the parse wrote — as one subject."""
    scored = [(name, r) for name, r in records if r.get("status") in SCORED and r.get("gold")]
    skipped = Counter(r.get("status") for _, r in records if r.get("status") not in SCORED)
    sources = sorted({r["model"]["source"] for _, r in scored})
    subject = {"id": "stored", "label": "Stored readings", "notes": ", ".join(sources)}
    run = new_run(
        suite="tab-extraction",
        title="Tab extraction against the reviewed gold",
        metrics=METRICS,
        subjects=[subject],
        total=len(scored),
        # Where the gold was read, as a repo path: another checkout's is named by its folder alone.
        config={
            "gold": gold.name
            if not gold.is_relative_to(SERVICE)
            else str(gold.relative_to(SERVICE)),
            "skipped": dict(skipped),
        },
    )
    run["subjects"][0]["status"] = "running"
    scores: list[Score] = []
    by_set: dict[str, list[Score]] = {}
    for name, record in scored:
        sc = score_reading(
            record["model"]["draft"], record["gold"], record["model"].get("warnings")
        )
        scores.append(sc)
        by_set.setdefault(name, []).append(sc)
        metrics = summarise([sc])
        metrics.pop("exercises", None)
        run["cases"].append(
            {
                "subject": "stored",
                "case": f"{name}/{record['id']}",
                "metrics": metrics,
                "failures": sc.differences[:40],
                "detail": {
                    "page": record.get("page"),
                    "status": record["status"],
                    "jianpu": record.get("jianpu"),
                    "marks": sc.kinds,
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
        if m["key"] in summary:
            v = summary[m["key"]]
            print(
                f"{m['label']:>14}  {v:.1%}"
                if m["format"] == "percent"
                else f"{m['label']:>14}  {v:.0f}"
            )
    kinds: dict[str, list[int]] = {}
    for case in run["cases"]:
        for kind, counts in case["detail"]["marks"].items():
            kinds[kind] = [a + b for a, b in zip(kinds.get(kind, [0, 0, 0]), counts, strict=True)]
    if kinds:
        print(f"\n{'mark':>14}  gold  read  right")
        for kind, (g, r, m) in sorted(kinds.items(), key=lambda kv: -kv[1][0]):
            print(f"{kind:>14}  {g:>4}  {r:>4}  {m:>5}")
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
