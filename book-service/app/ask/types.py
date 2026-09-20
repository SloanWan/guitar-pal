"""
What the ask graph passes around: the chapter it is scoped to, what a
strategy retrieved, and the answer with the pages it rests on.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Literal

from app.ingest.model import CallUsage
from app.repo import BookRow, ChapterRow, ChunkRow, ExerciseRow

Intent = Literal["question", "wants_draft"]
Source = Literal["book", "general"]


@dataclass(frozen=True)
class AskTurn:
    role: Literal["user", "assistant"]
    content: str


@dataclass(frozen=True)
class AskContext:
    """The chapter a question is asked of, as the route resolved it."""

    book: BookRow
    chapter: ChapterRow
    # Every chapter of the book, for the decline that names other ones.
    chapters: Sequence[ChapterRow]
    # The player's session token: the long-context strategy reads the PDF with it.
    token: str


@dataclass(frozen=True)
class Retrieval:
    """
    What a strategy found for a question. `usable` is the gate to the
    chapter answer: false sends the question down the general route. The
    chunks are what a chunk strategy hands the answer call; the long-context
    strategy carries the chapter itself and lists none.
    """

    usable: bool
    chunks: Sequence[ChunkRow] = ()
    usage: Sequence[CallUsage] = ()


@dataclass(frozen=True)
class Answer:
    """One answer from the chapter: the prose and the pages its citations named."""

    message: str
    pages: tuple[int, ...]
    usage: Sequence[CallUsage] = ()
    model: str = ""


@dataclass(frozen=True)
class DraftOut:
    exercise: ExerciseRow


@dataclass
class AskResult:
    message: str
    source: Source
    pages: tuple[int, ...] = ()
    draft: ExerciseRow | None = None
    usage: list[CallUsage] = field(default_factory=list)
    model: str = ""
