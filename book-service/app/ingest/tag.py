"""
`may_have_exercise`: does this page's text layer look like it holds something
the chapter parse (#202) could turn into a practice draft?

Rules, not a model — this runs over every page of every upload. The rules lean
generous on purpose: a false positive costs one vision call later, a false
negative hides an exercise for good. Each rule names itself so a scan log can
say why a page was tagged.

Calibrated against two real books (a typeset English chord/songwriting book
and a scanned Chinese method book). What that changed from the first draft:

  * "practice" is not a keyword — it is on nearly every prose page of a guitar
    book ("with practice, the barre chord …"), and neither is bare "picking"
    ("picking up the guitar at age 12"). "exercise", 练习 and the named
    picking styles stay.
  * Chord progressions written as `C – G – Am – F` or `I – V – vi – IV` are
    tagged: they become strum progressions in #202. A lyric sheet's chord line
    (`C        G        Am`, spaces only, no separators) is not.
"""

import re
from typing import NamedTuple

# --- stroke notation -------------------------------------------------------
# Three or more stroke tokens in a row: `D DU UD`, `D - D U - U`, `X D X U`.
# A token is D/U with up to three more strokes glued on, or a mute.
_STROKE_TOKEN = r"(?:[DU][DUX]{0,3}|X)"
_STROKE_SEP = r"[ \t|·,\-]+"
STROKE_LINE = re.compile(
    rf"(?<![A-Za-z]){_STROKE_TOKEN}(?:{_STROKE_SEP}{_STROKE_TOKEN}){{2,}}(?![A-Za-z])"
)
# Arrows on one line: a column of ↓ each on its own line is a diagram's flow,
# not a strum.
STROKE_ARROWS = re.compile(r"(?:[↓↑][ \t]*){2,}")

# --- tablature -------------------------------------------------------------
# A tab line: optional string name, then a run of dashes, fret numbers in
# some of them. Three such lines in a row is a tab (a string can sit silent
# through a phrase, so the digits are required of the block, not each line);
# a separator rule is one line and has no digits.
TAB_LINE = re.compile(r"^\s*[eEADGBb]?\s*[|:]?[-–0-9hpbrsx/\\~^()|. ]{10,}[|]?\s*$")
TAB_MIN_LINES = 3
TAB_MIN_DASHES = 6

# --- chord progressions ----------------------------------------------------
_CHORD = (
    r"[A-G](?:#|b|♯|♭)?"
    r"(?:maj|min|dim|aug|sus|add|m|M|\+|°|º|ø)?"
    r"[0-9]{0,2}"
    r"(?:sus[24]|add9|b5|\(b5\))?"
    r"(?:/[A-G](?:#|b)?)?"
)
_PROGRESSION_SEP = r"\s*[–—\-→]\s*"
CHORD_PROGRESSION = re.compile(
    rf"(?<![A-Za-z0-9]){_CHORD}(?:{_PROGRESSION_SEP}{_CHORD}){{2,}}(?![A-Za-z0-9])"
)
_ROMAN = r"(?:vii|VII|vi|VI|iv|IV|iii|III|ii|II|v|V|i|I)[°º]?"
ROMAN_PROGRESSION = re.compile(
    rf"(?<![A-Za-z]){_ROMAN}(?:{_PROGRESSION_SEP}{_ROMAN}){{1,}}(?![A-Za-z])"
)

# --- vocabulary ------------------------------------------------------------
KEYWORDS_LATIN = re.compile(
    r"\b(?:exercises?|drills?|patterns?|strum(?:ming|s)?|riffs?|licks?|"
    r"progressions?|finger ?pick(?:ing)?|fingerstyle|arpeggios?|"
    r"(?:flat|alternate|cross|hybrid|sweep)[ -]?picking)\b",
    re.IGNORECASE,
)
KEYWORDS_CJK = ("练习", "扫弦", "指弹", "节奏型", "分解和弦", "和弦进行", "琶音", "拨弦")


class Tag(NamedTuple):
    may_have_exercise: bool
    reasons: tuple[str, ...]


def _is_tab_line(line: str) -> bool:
    return TAB_LINE.match(line) is not None and line.count("-") + line.count("–") >= TAB_MIN_DASHES


def _has_tab_block(text: str) -> bool:
    run: list[str] = []
    for line in [*text.splitlines(), ""]:
        if _is_tab_line(line):
            run.append(line)
            continue
        if len(run) >= TAB_MIN_LINES and any(ch.isdigit() for ch in "".join(run)):
            return True
        run = []
    return False


def tag_text(text: str) -> Tag:
    """The rules over one page's text layer; empty text is never tagged."""
    reasons: list[str] = []
    if not text.strip():
        return Tag(False, ())

    if STROKE_LINE.search(text) or STROKE_ARROWS.search(text):
        reasons.append("stroke_notation")

    if _has_tab_block(text):
        reasons.append("tab_lines")

    if CHORD_PROGRESSION.search(text) or ROMAN_PROGRESSION.search(text):
        reasons.append("chord_progression")

    if KEYWORDS_LATIN.search(text) or any(word in text for word in KEYWORDS_CJK):
        reasons.append("keyword")

    return Tag(bool(reasons), tuple(reasons))


def may_have_exercise(text: str) -> bool:
    return tag_text(text).may_have_exercise
