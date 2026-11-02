"""
How close an OCR read is to the page's reference text (#369).

Two numbers, because they fail differently:

- **CER**: edit distance over the reference length, whitespace removed. The
  usual OCR measure, and the one OmniDocBench reports. It also charges for
  reading order, so a two-column page read across the columns scores worse
  than one read down them, with the same characters right.
- **Character recall / precision / F1**: the characters as a multiset,
  order ignored. Recall is "how much of the page's text did the engine
  find" — what the TOC digest, the classifier and Q&A actually depend on.
  Precision drops when the engine reads tab digits or notation the
  reference leaves out (it marks those regions instead of transcribing
  them).

Both compare NFKC-normalised text, so a full-width `，` and a half-width `,`
are the same character, and lines the reference marks as `[notation]` are
dropped before scoring.
"""

import re
import unicodedata
from collections import Counter
from dataclasses import dataclass

from rapidfuzz.distance import Levenshtein

# A line the reference transcriber wrote in place of notation it did not
# transcribe: tab, staff, numbered notation, a chord or fretboard diagram.
NOTATION_LINE = re.compile(r"^\s*\[notation[^\]]*\]\s*$", re.IGNORECASE | re.MULTILINE)
WHITESPACE = re.compile(r"\s+")


def normalize(text: str) -> str:
    """The characters that are scored: NFKC, notation markers and whitespace removed."""
    text = NOTATION_LINE.sub("", text)
    text = unicodedata.normalize("NFKC", text)
    return WHITESPACE.sub("", text)


def cer(reference: str, read: str) -> float:
    """Edit distance over the reference's length, on normalised text. 0 is perfect."""
    ref, hyp = normalize(reference), normalize(read)
    if not ref:
        return 0.0 if not hyp else 1.0
    return Levenshtein.distance(ref, hyp) / len(ref)


@dataclass(frozen=True)
class CharScores:
    recall: float
    precision: float
    f1: float


def char_scores(reference: str, read: str) -> CharScores:
    """Order-free overlap of the two texts' characters, counted with multiplicity."""
    ref, hyp = Counter(normalize(reference)), Counter(normalize(read))
    overlap = sum((ref & hyp).values())
    ref_n, hyp_n = sum(ref.values()), sum(hyp.values())
    recall = overlap / ref_n if ref_n else (1.0 if not hyp_n else 0.0)
    precision = overlap / hyp_n if hyp_n else (1.0 if not ref_n else 0.0)
    f1 = 2 * recall * precision / (recall + precision) if recall + precision else 0.0
    return CharScores(recall=recall, precision=precision, f1=f1)
