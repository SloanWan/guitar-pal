"""
The tab extractor (#202 B5): a `tab` page → one literal draft per exercise.

Two calls per page, shaped by the calibration in docs/calibration.md §6:

1. **Segment** (the classifier's model, the classifier's 100 dpi image): where
   the exercises are — heading, staff count, box. A whole page read in one
   call runs past three minutes and gets cut off; one exercise a call is
   bounded, parallel and cheap to retry, and it is what the chapter card
   wants anyway: one draft per heading.
2. **Read** (the parse model, a 150 dpi crop of the exercise): the tab and,
   when the book prints one under the staff, the jianpu (简谱) row, as two
   independent readings of the same notes. The service turns both into MIDI
   and compares. A disagreement is a warning that names both readings; a
   tab digit the model could not read is filled from the jianpu with a
   warning saying so. Calibration: the cross-check flagged exactly the
   notes a weaker reading had wrong, and nothing else.

The reading is then an `ImportedTabDraft` for `POST /api/internal/validate`.
Frets come from the tab — the one place a fret legitimately comes from the
model — and the validator bounds them. A rejected draft goes back to the
model once with the errors (the repair loop of `askModel.ts`); a second
rejection drops the draft and leaves a warning on the chapter.

Tab that sits in a PDF's text layer (`e|--0--3--|`) carries no durations
and is not read here; it is #228's, and the page gets a chapter warning.
"""

import asyncio
import base64
import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass, field

from anthropic import AsyncAnthropic
from pydantic import BaseModel, Field

from app.ingest.model import CLASSIFY_MODEL, MODEL, CallUsage, usage_of
from app.ingest.pdf import CLASSIFY_RENDER_DPI, PARSE_RENDER_DPI
from app.repo import ExerciseRecord
from app.validate import ValidatorClient, Verdict

log = logging.getLogger("book-service")

SEGMENT_MODEL = CLASSIFY_MODEL
SEGMENT_DPI = CLASSIFY_RENDER_DPI
READ_MODEL = MODEL
READ_DPI = PARSE_RENDER_DPI
# Segment boxes sit right on the heading and drift ±2% between runs.
PAD_ABOVE = 0.04
PAD_BELOW = 0.01
# Read calls in flight at once, across the chapter's pages. Each is ~30–50 s.
READ_CONCURRENCY = 3
# One repair round trip, as in askModel.ts.
MAX_REPAIRS = 1
# Index 0 = high e (string ①), as fingerpickScheduler.ts holds it.
OPEN_STRING_MIDI = (64, 59, 55, 50, 45, 40)
DEGREE_SEMITONE = {1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11}
KEY_OFFSET = {
    "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6,
    "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11,
}  # fmt: skip
# Guitar jianpu is written an octave above sounding: a plain "1" in 1=C is
# C3 (MIDI 48); string ⑥ open prints as 3 with a dot below.
JIANPU_BASE_MIDI = 48
# The editor has no dotted half: it is a half tied to a quarter (`TIED`).
TIED = {"dotted-half": ("half", "quarter")}
DURATIONS = {
    "w": "whole",
    "h": "half",
    "h.": "dotted-half",
    "q": "quarter",
    "q.": "dotted-quarter",
    "e": "eighth",
    "e.": "dotted-eighth",
    "s": "sixteenth",
}

Region = tuple[float, float, float, float]

# --- prompts ---------------------------------------------------------------------

SEGMENT_SYSTEM = (
    "You are locating the exercises on one page of a guitar method book so each can be"
    " cropped and read on its own. An exercise is a heading (e.g. ①弦:E–F–G, 组合练习, a"
    " song title, Exercise 3) with the tab staff or staves under it, its tempo mark, chord"
    " names, and any number (jianpu) row printed under each staff. Fretboard maps, scale"
    " charts, chord diagrams and prose are not exercises.\n\n"
    "Return every exercise in page order with a box that includes its heading, tempo mark"
    " and everything under its last staff, as fractions of the image (x0, y0, x1, y1 from"
    " the top-left). Boxes may be generous; they must not cut a staff or the numbers under"
    " it. A staff with no heading of its own belongs to the exercise above it."
)


class SegmentOut(BaseModel):
    heading: str = Field(description="the heading as printed; a short description if none")
    staves: int = Field(description="how many tab staves the exercise spans")
    bbox: list[float] = Field(description="[x0, y0, x1, y1] as fractions of the image")


class SegmentsOut(BaseModel):
    exercises: list[SegmentOut]


READ_SYSTEM = (
    "You are reading one exercise from a guitar method book. The crop shows:\n\n"
    "- A heading, a tempo (♩=120), sometimes a key (1=C) and a time signature.\n"
    "- Chord names (C, G7, Am, Dm…) printed above the staff at the beat where they start.\n"
    "- A six-line TAB staff. Line 1 (top) is string ① (high e), line 6 (bottom) is string ⑥"
    " (low E). A digit on a line is a fret on that string. Stems and beams below the staff"
    ' show durations. A "–" on the staff extends the previous note.\n'
    "- Often a JIANPU (简谱) row under the staff, one symbol per note, in the same order as"
    " the tab: a digit 1–7 is the scale degree in the printed key; a dot above the digit"
    " means one octave up, a dot below one octave down (a small separate mark, under the"
    " underline if there is one — most digits have none; decide per digit); # or b before"
    " it is an accidental;"
    ' one underline means an eighth note, two a sixteenth; a "–" after a digit extends it'
    ' by one beat (so "5 –" is a half note, "5 – – –" a whole); a dot after a digit adds'
    " half its value.\n\n"
    "Read the TAB and the JIANPU independently — they are two readings of the same notes,"
    " and the app compares them. Do not make one agree with the other. If a tab digit is"
    " unreadable write `?` for the fret; if a jianpu symbol is unreadable write `?` for the"
    " degree; if the page prints no jianpu row, give every jianpu token as `?`.\n\n"
    "Duration comes from the jianpu underlines and dashes first, the tab stems second."
    " Bars are separated by barlines; list every bar, every note, in order; a whole-bar note"
    " is one note of duration w. Two or more notes struck together (stacked in the tab) are"
    " separate tokens joined with `+`, e.g. `1:0+2:1/q`.\n\n"
    "Write each bar as two strings, one token per note, the same order and count in both. A"
    ' jianpu "–" is never a token of its own: it lengthens the note before it.\n'
    "- tab: `string:fret/dur`, e.g. `1:0/q 1:3/h 6:?/e`. dur is w h h. q q. e e. s.\n"
    "- jianpu: `[#|b]degree[+|-]/dur`, e.g. `3+/q #1+/q 5-/e ?/q` — `+` one dot above,"
    " `-` one dot below.\n"
    "Chords: one entry per printed chord name, as `bar.note:Name` with 1-based indices,"
    " e.g. `1.1:C 4.3:G7`."
)


class TabReadingOut(BaseModel):
    heading: str
    key: str = Field(description='tonic of "1=X" if printed, else "C"')
    time_signature: str = Field(description='e.g. "4/4"; "4/4" when not printed')
    bpm: int | None
    tab_bars: list[str]
    jianpu_bars: list[str]
    chords: str
    unclear: list[str] = Field(description="anything you could not read, one line each")


# --- the pure part: tokens → notes → draft ---------------------------------------

STRING_FRET = re.compile(r"^([1-6]):(\d{1,2}|\?)$")
JIANPU_TOKEN = re.compile(r"^([#b]?)([1-7]|\?)([+-]?)/(w|h|q\.|q|e\.|e|s)$")
CHORD_TOKEN = re.compile(r"^(\d+)\.(\d+):(\S+)$")
TIME_SIGNATURE = re.compile(r"^(\d{1,2})/(\d{1,2})$")
# A tab that lives in the text layer: string letter, bar, then dashes and frets.
TEXT_TAB_LINE = re.compile(r"(?m)^\s*[eEBGDAa]?\s*\|[-0-9hpsx/\\~|]{6,}")


@dataclass(frozen=True)
class Struck:
    """One string struck in a slot, as the tab printed it."""

    string: int  # 1 = high e … 6 = low E
    fret: int | None  # None = the digit could not be read


@dataclass(frozen=True)
class Note:
    """One slot: the tab's strings and the jianpu's pitch, both as read."""

    struck: tuple[Struck, ...]
    duration: str
    degree: int | None
    octave: int
    accidental: str
    chord: str | None


@dataclass
class Reconciled:
    """The draft to validate, and what the two readings disagreed on."""

    draft: dict[str, object]
    warnings: list[dict[str, object]] = field(default_factory=list)


def looks_like_text_tab(text: str) -> bool:
    """Tab written as monospaced text — #228's case, not this extractor's."""
    return len(TEXT_TAB_LINE.findall(text)) >= 3


def pad_region(region: Region, above: float = PAD_ABOVE, below: float = PAD_BELOW) -> Region:
    x0, y0, x1, y1 = region
    return (x0, max(0.0, y0 - above), x1, min(1.0, y1 + below))


def within(outer: Region, inner: Region) -> Region:
    """A box given as fractions of a crop, as fractions of the page the crop came from."""
    ox0, oy0, ox1, oy1 = outer
    w, h = ox1 - ox0, oy1 - oy0
    x0, y0, x1, y1 = inner
    return (ox0 + x0 * w, oy0 + y0 * h, ox0 + x1 * w, oy0 + y1 * h)


def parse_reading(out: TabReadingOut) -> tuple[list[list[Note]], list[dict[str, object]]]:
    """
    The model's bar strings as notes. A malformed token is dropped with a
    warning; a bar the jianpu row does not cover is read from the tab alone.
    """
    warnings: list[dict[str, object]] = []
    chords: dict[tuple[int, int], str] = {}
    for token in out.chords.split():
        m = CHORD_TOKEN.match(token)
        if m:
            chords[(int(m.group(1)), int(m.group(2)))] = m.group(3)
    if len(out.jianpu_bars) not in (0, len(out.tab_bars)):
        warnings.append(
            _issue(
                "TAB_JIANPU_BARS",
                "measures",
                f"tab has {len(out.tab_bars)} bars, jianpu row {len(out.jianpu_bars)};"
                " jianpu ignored where it does not line up",
            )
        )
    bars: list[list[Note]] = []
    for bi, tab_bar in enumerate(out.tab_bars, start=1):
        tab_tokens = tab_bar.split()
        jianpu_tokens = out.jianpu_bars[bi - 1].split() if bi <= len(out.jianpu_bars) else []
        if jianpu_tokens and len(jianpu_tokens) != len(tab_tokens):
            warnings.append(
                _issue(
                    "TAB_JIANPU_COUNT",
                    f"measures[{bi - 1}]",
                    f"bar {bi}: tab has {len(tab_tokens)} notes, jianpu {len(jianpu_tokens)};"
                    " jianpu ignored for this bar",
                )
            )
            jianpu_tokens = []
        notes: list[Note] = []
        for ni, token in enumerate(tab_tokens, start=1):
            struck, duration = _parse_tab_token(token)
            if duration is None:
                warnings.append(
                    _issue(
                        "TAB_TOKEN",
                        f"measures[{bi - 1}].slots[{ni - 1}]",
                        f"bar {bi} note {ni}: could not read {token!r}; dropped",
                    )
                )
                continue
            degree, octave, accidental = None, 0, ""
            if jianpu_tokens:
                m = JIANPU_TOKEN.match(jianpu_tokens[ni - 1])
                if m:
                    accidental = m.group(1)
                    degree = None if m.group(2) == "?" else int(m.group(2))
                    octave = {"+": 1, "-": -1, "": 0}[m.group(3)]
            notes.append(Note(struck, duration, degree, octave, accidental, chords.get((bi, ni))))
        bars.append(notes)
    return bars, warnings


def midi_from_tab(struck: Struck) -> int | None:
    if struck.fret is None or not 1 <= struck.string <= 6:
        return None
    return OPEN_STRING_MIDI[struck.string - 1] + struck.fret


def midi_from_jianpu(note: Note, key: str) -> int | None:
    if note.degree is None:
        return None
    accidental = {"#": 1, "b": -1}.get(note.accidental, 0)
    return (
        JIANPU_BASE_MIDI
        + KEY_OFFSET.get(key, 0)
        + DEGREE_SEMITONE[note.degree]
        + accidental
        + 12 * note.octave
    )


def reconcile(out: TabReadingOut, bars: Sequence[Sequence[Note]], heading: str = "") -> Reconciled:
    """
    The two readings against each other, and the draft the editor can hold.
    `heading` is the segmenter's, for when the crop lost the printed one.
    Frets are the tab's. Where the tab digit is missing and the jianpu is
    not, the fret is what the jianpu pitch lands on for the tab's string.
    Where both were read and disagree, the tab stands and a warning names
    both — the player checks the page, the draft does not guess.

    A disagreement of exactly an octave is the jianpu's octave dot, not the
    tab: string + fret fix the pitch, and a dot under a digit in a row of
    underlines is what the model misreads (calibration §6, at 150 and 200
    dpi alike). Those are counted into one warning per draft rather than
    one per note, so a correct draft is not buried in alarms.
    """
    warnings: list[dict[str, object]] = []
    octave_slips: list[str] = []
    measures: list[dict[str, object]] = []
    for bi, bar in enumerate(bars):
        slots: list[dict[str, object]] = []
        for ni, note in enumerate(bar):
            path = f"measures[{bi}].slots[{ni}]"
            where = f"bar {bi + 1} note {ni + 1}"
            strings: list[dict[str, object]] = [
                {"fret": None, "technique": None, "tied": False, "muted": False} for _ in range(6)
            ]
            expected = midi_from_jianpu(note, out.key)
            for struck in note.struck:
                if not 1 <= struck.string <= 6:
                    continue
                fret = struck.fret
                read = midi_from_tab(struck)
                # The jianpu can only vouch for a single note, not a stack.
                if len(note.struck) == 1 and expected is not None:
                    if read is None:
                        fret = _fret_for(expected, struck.string)
                        if fret is not None:
                            warnings.append(
                                _issue(
                                    "TAB_FRET_FROM_JIANPU",
                                    path,
                                    f"{where}: tab digit unreadable; fret {fret} on string"
                                    f" {struck.string} filled from the jianpu",
                                )
                            )
                    elif (read - expected) % 12 == 0 and read != expected:
                        octave_slips.append(where)
                    elif read != expected:
                        warnings.append(
                            _issue(
                                "TAB_JIANPU_MISMATCH",
                                path,
                                f"{where}: tab says string {struck.string} fret {struck.fret}"
                                f" (MIDI {read}), jianpu says MIDI {expected}; tab kept",
                            )
                        )
                if fret is not None:
                    strings[struck.string - 1]["fret"] = fret
            rest = all(s["fret"] is None for s in strings)
            if rest:
                warnings.append(
                    _issue(
                        "TAB_NOTE_UNREAD", path, f"{where}: no fret could be read; left as a rest"
                    )
                )
            for i, duration in enumerate(TIED.get(note.duration, (note.duration,))):
                held = [dict(s, tied=i > 0 and s["fret"] is not None) for s in strings]
                slot: dict[str, object] = {"duration": duration, "strings": held}
                if rest:
                    slot["isRest"] = True
                slots.append(slot)
        if slots:
            measures.append({"slots": slots})
    if octave_slips:
        shown = ", ".join(octave_slips[:4]) + (", …" if len(octave_slips) > 4 else "")
        warnings.append(
            _issue(
                "TAB_JIANPU_OCTAVE",
                "measures",
                f"{len(octave_slips)} note(s) where the jianpu's octave dot disagrees with the"
                f" tab ({shown}); the tab's frets are kept",
            )
        )
    draft: dict[str, object] = {
        "name": out.heading.strip() or heading.strip() or "Book exercise",
        "measures": measures,
    }
    if out.bpm and 20 <= out.bpm <= 300:
        draft["bpm"] = out.bpm
    m = TIME_SIGNATURE.match(out.time_signature.strip())
    if m:
        draft["timeSignature"] = [int(m.group(1)), int(m.group(2))]
    return Reconciled(draft, warnings)


def _fret_for(midi: int, string: int) -> int | None:
    """
    The fret that sounds `midi` on `string`, allowing the jianpu an octave
    slip either way: the lowest playable fret among the candidates, none
    when the pitch is not on that string at all.
    """
    open_midi = OPEN_STRING_MIDI[string - 1]
    frets = sorted(f for f in (midi - open_midi + shift for shift in (0, 12, -12)) if 0 <= f <= 15)
    return frets[0] if frets else None


def chord_line(bars: Sequence[Sequence[Note]]) -> str:
    """The printed chord names in order — for the draft's description, not its frets."""
    return " ".join(n.chord for bar in bars for n in bar if n.chord)


def _parse_tab_token(token: str) -> tuple[tuple[Struck, ...], str | None]:
    """`1:0/q`, or a stack `1:0+2:1/q` — the duration rides on the last string."""
    head, _, dur = token.rpartition("/")
    if not head or dur not in DURATIONS:
        return (), None
    struck: list[Struck] = []
    for part in head.split("+"):
        m = STRING_FRET.match(part)
        if not m:
            return (), None
        struck.append(Struck(int(m.group(1)), None if m.group(2) == "?" else int(m.group(2))))
    return tuple(struck), DURATIONS[dur]


def _issue(code: str, path: str, message: str) -> dict[str, object]:
    return {"code": code, "path": path, "message": message}


def _image_block(png: bytes) -> dict[str, object]:
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": base64.standard_b64encode(png).decode("ascii"),
        },
    }


# --- the model part ----------------------------------------------------------------


@dataclass(frozen=True)
class Segment:
    heading: str
    staves: int
    region: Region  # fractions of the image the segmenter saw, unpadded


@dataclass
class PageExtraction:
    exercises: list[ExerciseRecord] = field(default_factory=list)
    usage: list[CallUsage] = field(default_factory=list)
    # Chapter-level: drafts dropped, pages skipped.
    warnings: list[dict[str, object]] = field(default_factory=list)


class TabExtractor:
    """Segment, read, reconcile, validate, repair — for one page at a time."""

    def __init__(self, client: AsyncAnthropic, validator: ValidatorClient) -> None:
        self._client = client
        self._validator = validator
        self._read_slots = asyncio.Semaphore(READ_CONCURRENCY)

    async def segment(self, png: bytes, page: int) -> tuple[list[Segment], CallUsage]:
        response = await self._client.messages.parse(
            model=SEGMENT_MODEL,
            max_tokens=2048,
            system=SEGMENT_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": [{"type": "text", "text": f"Page {page}."}, _image_block(png)],
                }
            ],
            output_format=SegmentsOut,
            output_config={"effort": "low"},
        )
        out = response.parsed_output if response.stop_reason == "end_turn" else None
        segments = [
            Segment(s.heading.strip(), max(1, s.staves), _region(s.bbox))
            for s in (out.exercises if out else [])
            if len(s.bbox) == 4
        ]
        return segments, usage_of(response, SEGMENT_MODEL)

    async def read(
        self, png: bytes, repair: tuple[TabReadingOut, Sequence[dict[str, object]]] | None = None
    ) -> tuple[TabReadingOut | None, CallUsage]:
        """One reading; with `repair`, the previous reading and the validator's errors."""
        messages: list[dict[str, object]] = [
            {
                "role": "user",
                "content": [{"type": "text", "text": "Read this exercise."}, _image_block(png)],
            }
        ]
        if repair is not None:
            previous, errors = repair
            listed = "\n".join(f"- {e.get('path', '')}: {e.get('message', '')}" for e in errors)
            messages.append({"role": "assistant", "content": previous.model_dump_json()})
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "The app rejected this reading:\n"
                        f"{listed}\n\n"
                        "Read the exercise again from the image, fix only what the errors"
                        " name, and return the whole reading."
                    ),
                }
            )
        async with self._read_slots:
            response = await self._client.messages.parse(
                model=READ_MODEL,
                max_tokens=8192,
                system=READ_SYSTEM,
                messages=messages,
                output_format=TabReadingOut,
                output_config={"effort": "medium"},
            )
        out = response.parsed_output if response.stop_reason == "end_turn" else None
        if out is None:
            log.warning("tab read did not finish: stop_reason=%s", response.stop_reason)
        return out, usage_of(response, READ_MODEL)

    async def extract_exercise(
        self, png: bytes, page: int, segment: Segment
    ) -> tuple[ExerciseRecord | None, list[CallUsage], list[dict[str, object]]]:
        """Read → reconcile → validate, with one repair. None when the draft was dropped."""
        usage: list[CallUsage] = []
        repair: tuple[TabReadingOut, Sequence[dict[str, object]]] | None = None
        verdict: Verdict | None = None
        for _attempt in range(MAX_REPAIRS + 1):
            out, used = await self.read(png, repair)
            usage.append(used)
            if out is None:
                break
            bars, parse_warnings = parse_reading(out)
            reconciled = reconcile(out, bars, segment.heading)
            verdict = await self._validator.tab(reconciled.draft)
            if verdict.ok and verdict.pattern is not None:
                warnings = parse_warnings + reconciled.warnings + list(verdict.warnings)
                pattern = dict(verdict.pattern)
                if chords := chord_line(bars):
                    pattern.setdefault("description", chords)
                record = ExerciseRecord(
                    page=page,
                    kind="tab",
                    source="literal",
                    draft=pattern,
                    warnings=warnings,
                    crop_path=None,
                )
                return record, usage, []
            repair = (out, verdict.errors)
        dropped = _issue(
            "DRAFT_DROPPED",
            f"page {page}",
            f"p{page} {segment.heading!r}: the tab could not be read into a valid draft"
            + (f" — {_first_message(verdict)}" if verdict else " — the model gave no reading"),
        )
        return None, usage, [dropped]


def _region(values: list[float]) -> Region:
    x0, y0, x1, y1 = (min(max(float(v), 0.0), 1.0) for v in values)
    return (min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))


def _first_message(verdict: Verdict) -> str:
    return str(verdict.errors[0].get("message", "")) if verdict.errors else "rejected"
