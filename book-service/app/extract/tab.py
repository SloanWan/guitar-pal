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

from pydantic import BaseModel, Field

from app.ask.provider import Provider
from app.ask.structured import structured_call
from app.ingest.model import CallUsage
from app.ingest.pdf import CLASSIFY_RENDER_DPI, PARSE_RENDER_DPI
from app.repo import ExerciseRecord
from app.validate import ValidatorClient, Verdict

log = logging.getLogger("book-service")

# The segmenter runs on the provider's small model, the reader on its large one.
SEGMENT_DPI = CLASSIFY_RENDER_DPI
READ_DPI = PARSE_RENDER_DPI
# Segment boxes sit right on the heading and drift ±2% between runs.
PAD_ABOVE = 0.04
PAD_BELOW = 0.01
# Read calls in flight at once, across the chapter's pages. Each is ~30–50 s.
READ_CONCURRENCY = 3
# Caps for the answer; a reasoning provider adds its thinking room on top.
SEGMENT_MAX_TOKENS = 2048
# A dense page written with its marks runs past 8k (books-batch1, 6p p005, #441).
READ_MAX_TOKENS = 16384
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
DURATIONS = {
    "w": "whole",
    "h.": "dotted-half",
    "h": "half",
    "q.": "dotted-quarter",
    "q": "quarter",
    "e.": "dotted-eighth",
    "e": "eighth",
    "s.": "dotted-sixteenth",
    "s": "sixteenth",
}
# The marks a tab token may carry (#441). A link goes before the fret of the
# note it reaches; `^` is an arc printed with no letter, settled by the frets.
LINK_MARKS = {"h": "hammer", "p": "pull", "s": "slide", "^": "arc"}
# After the fret: vibrato, `~~` a wide one.
VIBRATO_MARKS = {"~": False, "~~": True}
# After the duration, the slot's: a pick stroke, an accent, a palm mute.
SLOT_TAGS = {"D": "pick down", "U": "pick up", ">": "accent", "PM": "palmMute"}
# A × in place of the fret (#439). `*` a rhythm pattern's: the frets left for
# the chord of the bar, which the validate route fills in (the open string
# under no chord). `x` a dead note: struck, pitchless.
CROSS_MARKS = {"*": "chordTone", "x": "dead"}

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
    "- tab: `string:fret/dur`, e.g. `1:0/q 1:3/h 6:?/e`. dur is w h. h q. q e. e s. s —"
    " a dotted note is its dotted value, never a note tied to a shorter one.\n"
    "- jianpu: `[#|b]degree[+|-]/dur`, e.g. `3+/q #1+/q 5-/e ?/q` — `+` one dot above,"
    " `-` one dot below.\n\n"
    "Playing marks: write each mark the page prints, and none it does not.\n"
    "- Before a note's fret, how it is reached from the note before it on that string —"
    " always on the second note, the one the arc or line ends on: `h` hammer-on (an arc"
    " with H), `p` pull-off (an arc with P), `s` slide (a slanted line between the two"
    " notes, or an arc with S), `^` an arc with no letter — between two notes of the same"
    " fret it is a tie, and a tie often crosses a barline. E.g. `3:5/e 3:h7/e 3:p5/e`.\n"
    "- After a note's fret: `~` vibrato (a wavy line over the note), `~~` a wide one.\n"
    "- After the duration, for the whole slot: `@D` a down-pick mark over it (⊓, or ∧ or ↓"
    " in some books), `@U` an up-pick mark (V or ↑), `@>` an accent, `@PM` the slot lies"
    " under a P.M. (palm mute) bracket — write it on every slot the bracket covers.\n"
    "E.g. `6:0/q@D 5:7/e@D 6:h7/e 5:5+4:7/e@PM@>`.\n"
    "A mark never costs a note: read every bar and every note, however dense; where the"
    " marks are too small or crowded to be sure of, leave the marks out, never the bars.\n\n"
    "A × on a tab line, in place of a digit, is one of two things; tell them apart by"
    " what is around it.\n"
    "- Many × together — most of the notes in the bar or the exercise, perhaps with a few"
    " digits among them — are a rhythm pattern: the page marks where the right hand plucks"
    " and leaves the frets to the chord of the bar (often under a 节奏型 heading, or under"
    " chord names). Write each such × as `*` in place of the fret, e.g. `5:*+3:*/e`, and"
    " every digit as printed. Do not work out the fret and never write it as a dead note:"
    " the app takes the fret from the chord.\n"
    "- A single × standing among digits is a dead note (muted or slapped): write `x` in"
    " place of the fret, e.g. `6:x/q`.\n\n"
    "Transcribe every bar of the exercise, on every system of the crop. A passage that is"
    " hard to read is still written, as your best reading with `?` for the digits you"
    " cannot make out, and named in `unclear`: a bar left out is worse than a bar read"
    " imperfectly, because the player corrects a wrong digit but cannot see a missing bar."
    " When two guitar parts are printed to be played together (Gtr. 1 and Gtr. 2 staves"
    " under one another), read Gtr. 1 only and say so in `unclear`.\n\n"
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

# `string:fret`, the link before the fret and anything after it read apart, so
# a mark that cannot be read costs the mark and not the note.
NOTE_TOKEN = re.compile(r"^([1-6]):([hps^]?)(\d{1,2}|\?|\*|x)(.*)$")
JIANPU_TOKEN = re.compile(r"^([#b]?)([1-7]|\?)([+-]?)/(w|h\.|h|q\.|q|e\.|e|s\.|s)$")
CHORD_TOKEN = re.compile(r"^(\d+)\.(\d+):(\S+)$")
TIME_SIGNATURE = re.compile(r"^(\d{1,2})/(\d{1,2})$")
# A tab that lives in the text layer: string letter, bar, then dashes and frets.
TEXT_TAB_LINE = re.compile(r"(?m)^\s*[eEBGDAa]?\s*\|[-0-9hpsx/\\~|]{6,}")


@dataclass(frozen=True)
class Struck:
    """One string struck in a slot, as the tab printed it."""

    string: int  # 1 = high e … 6 = low E
    fret: int | None  # None = the digit could not be read, or a CROSS_MARKS ×
    link: str | None = None  # a LINK_MARKS kind, "arc" until the frets settle it
    vibrato: bool | None = None  # True a wide one; None none
    cross: str | None = None  # a CROSS_MARKS kind when the line holds a ×


@dataclass(frozen=True)
class Note:
    """One slot: the tab's strings and the jianpu's pitch, both as read."""

    struck: tuple[Struck, ...]
    duration: str
    degree: int | None
    octave: int
    accidental: str
    chord: str | None
    tags: frozenset[str] = frozenset()  # SLOT_TAGS kinds printed over the slot


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
    placed: set[tuple[int, int]] = set()
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
        # A chord over a token that is dropped waits for the bar's next note.
        waiting: tuple[int, int] | None = None
        for ni, token in enumerate(tab_tokens, start=1):
            struck, duration, tags, unread = _parse_tab_token(token)
            if duration is not None and unread:
                warnings.append(
                    _issue(
                        "TAB_MARK",
                        f"measures[{bi - 1}].slots[{len(notes)}]",
                        f"bar {bi} note {ni}: could not read {' '.join(unread)!r} in"
                        f" {token!r}; the mark dropped, the note kept",
                    )
                )
            if duration is None:
                warnings.append(
                    _issue(
                        "TAB_TOKEN",
                        f"measures[{bi - 1}].slots[{ni - 1}]",
                        f"bar {bi} note {ni}: could not read {token!r}; dropped",
                    )
                )
                if (bi, ni) in chords:
                    waiting = (bi, ni)
                continue
            at = (bi, ni) if (bi, ni) in chords else waiting
            if at is not None and at != (bi, ni) and (bi, ni) not in chords:
                warnings.append(
                    _issue(
                        "TAB_CHORD_MOVED",
                        f"measures[{bi - 1}].slots[{len(notes)}]",
                        f"bar {bi}: {chords[at]} was over note {at[1]}, which could not be"
                        f" read; it starts on note {ni}",
                    )
                )
            if at is not None:
                placed.add(at)
            waiting = None
            degree, octave, accidental = None, 0, ""
            if jianpu_tokens:
                m = JIANPU_TOKEN.match(jianpu_tokens[ni - 1])
                if m:
                    accidental = m.group(1)
                    degree = None if m.group(2) == "?" else int(m.group(2))
                    octave = {"+": 1, "-": -1, "": 0}[m.group(3)]
            chord = chords[at] if at is not None else None
            notes.append(Note(struck, duration, degree, octave, accidental, chord, tags))
        bars.append(notes)
    for at, name in chords.items():
        if at not in placed:
            # Kept for the description, so the player still sees the name.
            lost = _issue(
                "TAB_CHORD_LOST",
                f"measures[{at[0] - 1}]",
                f"bar {at[0]}: {name} was over note {at[1]}, and no note after it in the"
                " bar could be read; it is not placed",
            )
            warnings.append({**lost, "original": name})
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
            strings: list[dict[str, object]] = [{"fret": None, "muted": False} for _ in range(6)]
            expected = midi_from_jianpu(note, out.key)
            for struck in note.struck:
                if not 1 <= struck.string <= 6:
                    continue
                if struck.cross:
                    # No fret yet, so nothing for the jianpu to vouch for or fill.
                    _write_cross(strings[struck.string - 1], struck, path, where, warnings)
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
                if fret is None:
                    if struck.link:
                        warnings.append(
                            _issue(
                                "TAB_LINK",
                                path,
                                f"{where}: string {struck.string} has a {struck.link} mark but"
                                " no fret; the mark dropped",
                            )
                        )
                    continue
                cell = strings[struck.string - 1]
                cell["fret"] = fret
                if struck.link:
                    cell["link"] = {"kind": struck.link}
                if struck.vibrato is not None:
                    cell["effects"] = {"vibrato": {"wide": True} if struck.vibrato else {}}
            rest = not any(_sounds(s) for s in strings)
            if rest:
                warnings.append(
                    _issue(
                        "TAB_NOTE_UNREAD", path, f"{where}: no fret could be read; left as a rest"
                    )
                )
            if not rest:
                _tag_slot(strings, note.tags)
            elif note.tags:
                warnings.append(
                    _issue(
                        "TAB_MARK",
                        path,
                        f"{where}: {', '.join(sorted(note.tags))} over a slot with no"
                        " readable note; dropped",
                    )
                )
            slot: dict[str, object] = {"duration": note.duration, "strings": strings}
            if rest:
                slot["isRest"] = True
            # The page's name; the validate route resolves it to a chord (#427).
            if note.chord:
                slot["chordName"] = note.chord
            slots.append(slot)
        if slots:
            measures.append({"slots": slots})
    warnings.extend(_settle_links(measures))
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


# The warnings that carry a printed chord name no slot ended up with.
UNPLACED_CHORD_CODES = ("TAB_CHORD_LOST", "UNKNOWN_CHORD")


def unplaced_chords(warnings: Sequence[dict[str, object]]) -> str:
    """The printed chord names the draft could not put on a note, for its
    description: one over no readable note, or one the chord library lacks."""
    return " ".join(
        str(w["original"])
        for w in warnings
        if w.get("code") in UNPLACED_CHORD_CODES and isinstance(w.get("original"), str)
    )


def _parse_tab_token(
    token: str,
) -> tuple[tuple[Struck, ...], str | None, frozenset[str], list[str]]:
    """
    `1:0/q`, a stack `1:0+2:1/q`, with marks: `3:h7~/e@D@PM`. The duration
    rides on the last string, the slot's tags after it. No duration, or a
    string and fret that cannot be read, drops the token (duration None); a
    mark that cannot be read is listed and only it is dropped.
    """
    head, _, tail = token.rpartition("/")
    dur = next((d for d in DURATIONS if tail.startswith(d)), None)
    if not head or dur is None:
        return (), None, frozenset(), []
    unread: list[str] = []
    tags: set[str] = set()
    rest = tail[len(dur) :]
    if rest and not rest.startswith("@"):
        unread.append(rest)
    else:
        for tag in rest.split("@")[1:]:
            if tag.upper() in SLOT_TAGS:
                tags.add(SLOT_TAGS[tag.upper()])
            else:
                unread.append("@" + tag)
    struck: list[Struck] = []
    for part in head.split("+"):
        m = NOTE_TOKEN.match(part)
        if not m:
            return (), None, frozenset(), []
        after = m.group(4)
        if after and after not in VIBRATO_MARKS:
            unread.append(after)
        fret = m.group(3)
        struck.append(
            Struck(
                int(m.group(1)),
                int(fret) if fret.isdigit() else None,
                LINK_MARKS.get(m.group(2)),
                VIBRATO_MARKS.get(after),
                CROSS_MARKS.get(fret),
            )
        )
    return tuple(struck), DURATIONS[dur], frozenset(tags), unread


def _tag_slot(strings: list[dict[str, object]], tags: frozenset[str]) -> None:
    """A slot's printed marks onto its sounding notes: a pick stroke and an
    accent are the column's (the stave draws them once over it), a palm mute
    a per-note flag the validator folds into a span."""
    for cell in strings:
        if not _sounds(cell):
            continue
        effects = dict(cell.get("effects") or {})
        if "pick down" in tags or "pick up" in tags:
            effects["pick"] = {"direction": "down" if "pick down" in tags else "up"}
        if "accent" in tags:
            effects["accent"] = True
        if effects:
            cell["effects"] = effects
        if "palmMute" in tags:
            cell["palmMute"] = True


def _sounds(cell: dict[str, object]) -> bool:
    """Whether a draft string is struck: a fret, a dead note or a chord's ×."""
    return cell["fret"] is not None or bool(cell.get("muted")) or bool(cell.get("chordTone"))


def _write_cross(
    cell: dict[str, object],
    struck: Struck,
    path: str,
    where: str,
    warnings: list[dict[str, object]],
) -> None:
    """A × onto its draft string. A link cannot be told from frets not yet
    known, so it is dropped and said; a chord's × keeps a vibrato."""
    if struck.cross == "dead":
        cell["muted"] = True
    else:
        cell["chordTone"] = True
        if struck.vibrato is not None:
            cell["effects"] = {"vibrato": {"wide": True} if struck.vibrato else {}}
    if struck.link:
        warnings.append(
            _issue(
                "TAB_LINK",
                path,
                f"{where}: string {struck.string} has a {struck.link} mark on a ×;"
                " the mark dropped",
            )
        )


def _settle_links(measures: list[dict[str, object]]) -> list[dict[str, object]]:
    """
    Each link against the note before it on its string, across slots and
    barlines (how v2 reads a link): an unlettered arc becomes a tie, hammer or
    pull by the frets; a hammer that falls is a pull and a pull that rises a
    hammer; a link with no earlier note, or between equal frets other than a
    tie, cannot hold and is dropped. Each change is said.
    """
    warnings: list[dict[str, object]] = []
    last: list[int | None] = [None] * 6
    for mi, measure in enumerate(measures):
        for si, slot in enumerate(measure["slots"]):  # type: ignore[index]
            for string, cell in enumerate(slot["strings"]):
                fret = cell["fret"]
                if fret is None:
                    if _sounds(cell):
                        # A × is the string's note, but its fret is not known here.
                        last[string] = None
                    continue
                link = cell.pop("link", None)
                before, last[string] = last[string], fret
                if link is None:
                    continue
                kind = link["kind"]
                where = f"bar {mi + 1}, string {string + 1}, fret {fret}"
                path = f"measures[{mi}].slots[{si}].strings[{string}]"
                if before is None:
                    settled, why = None, "no note before it on the string"
                elif kind == "arc":
                    settled = "tie" if fret == before else "hammer" if fret > before else "pull"
                    why = ""
                elif fret == before:
                    settled, why = None, f"the note before it is the same fret {before}"
                elif kind == "hammer" and fret < before or kind == "pull" and fret > before:
                    settled = "pull" if kind == "hammer" else "hammer"
                    why = f"from fret {before} it {'falls' if fret < before else 'rises'}"
                else:
                    settled, why = kind, ""
                if settled is not None:
                    cell["link"] = {"kind": settled}
                if why:
                    said = f"read as {settled}" if settled else "dropped"
                    warnings.append(_issue("TAB_LINK", path, f"{where}: {kind} {said} — {why}"))
    return warnings


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

    def __init__(self, provider: Provider, validator: ValidatorClient) -> None:
        self._provider = provider
        self._validator = validator
        self._read_slots = asyncio.Semaphore(READ_CONCURRENCY)

    async def segment(self, png: bytes, page: int) -> tuple[list[Segment], CallUsage]:
        out, usage = await structured_call(
            self._provider,
            system=SEGMENT_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": [{"type": "text", "text": f"Page {page}."}, _image_block(png)],
                }
            ],
            output=SegmentsOut,
            max_tokens=SEGMENT_MAX_TOKENS,
            effort="low",
            small=True,
        )
        segments = [
            Segment(s.heading.strip(), max(1, s.staves), _region(s.bbox))
            for s in (out.exercises if out else [])
            if len(s.bbox) == 4
        ]
        return segments, usage

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
            out, usage = await structured_call(
                self._provider,
                system=READ_SYSTEM,
                messages=messages,
                output=TabReadingOut,
                max_tokens=READ_MAX_TOKENS,
                effort="medium",
            )
        if out is None:
            log.warning("tab read did not finish")
        return out, usage

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
                if chords := unplaced_chords(warnings):
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
