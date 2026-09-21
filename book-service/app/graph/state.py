"""
What flows through the chapter graph. Pages in; per-page classifications,
extracted exercises, knowledge points and token usage out. Lists that fan
in from parallel nodes are reducers (`operator.add`) so each branch appends.
"""

import operator
from dataclasses import dataclass
from typing import Annotated, Literal, TypedDict

from app.ingest.model import CallUsage
from app.parse import ParsePage, ParseTools
from app.repo import ExerciseRecord, NoteRecord

PageKind = Literal[
    "prose",
    "chord_diagrams",
    "strum_notation",
    "tab",
    "progression_map",
    "fretboard_diagram",
    "mixed",
    "other",
]


@dataclass(frozen=True)
class Region:
    kind: PageKind
    # Fractions of the page: x0, y0, x1, y1.
    bbox: tuple[float, float, float, float]


@dataclass(frozen=True)
class PageClass:
    page: int
    kind: PageKind
    regions: tuple[Region, ...]
    note: str


class ChapterState(TypedDict, total=False):
    book_title: str
    chapter_title: str
    pages: list[ParsePage]
    # Rendering and crop storage for the extractors; None in a run without them.
    tools: ParseTools | None
    classified: Annotated[list[PageClass], operator.add]
    exercises: Annotated[list[ExerciseRecord], operator.add]
    notes: list[NoteRecord]
    usage: Annotated[list[CallUsage], operator.add]
    # Chapter-level: drafts dropped, pages skipped — what the card shows inline.
    warnings: Annotated[list[dict[str, object]], operator.add]


class PageState(TypedDict):
    """What one classify branch receives."""

    page: ParsePage
    chapter_title: str


class ExtractState(TypedDict):
    """What one extractor branch receives: a page, or one region of a mixed page."""

    page: ParsePage
    region: Region | None
    # Which tab region of the page this is (0 = the whole page): keeps crop names apart.
    ordinal: int
    tools: ParseTools | None
