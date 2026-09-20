"""
Chapters for an uploaded book, from the cheapest source that yields any:

  1. the PDF outline (bookmarks) — free
  2. the text, read by one model call — cents; the text layer, or OCR on a
     scan (calibration: OCR keeps body prose but loses decorative chapter
     banners, so on a scan this step may well find nothing)
  3. page images of the front matter, read by vision — scans only
  4. nothing: the whole book as one chapter, marked `manual`, for the player
     to open as is or split by hand

Each step runs only when the one before found nothing. The last one exists
because an upload is often an excerpt — a chapter someone cut out of a book,
with no contents page and maybe no chapter opener — and what its owner wants
is to parse all of it, not to draw a range around all of it first. This module is pure:
the two model-backed steps are injected as callables so the tests hand in
fakes and the calibration script hands in the real one (`model.py`).

Chapters are flat (#201, decision 6): sections become chapters, and the
parse unit is the page range either way.
"""

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

from app.ingest.pdf import OutlineEntry, PageText

TocSource = Literal["outline", "text", "vision", "manual"]

# Mirrors the `book_chapters.title` check constraint.
MAX_TITLE_CHARS = 200

# How much of the book the text-TOC digest may carry to the model. Five lines
# per page: a chapter opener's title can sit under a running header, a page
# number and a section name (calibration: three lines cut "Chapter 2" off and
# every chapter came back one page late). Past the cap — roughly a 300-page
# book, ~20k tokens — the digest thins itself to one line per page.
DIGEST_LINES_PER_PAGE = 5
DIGEST_LINE_CHARS = 80
DIGEST_MAX_CHARS = 80_000
# A contents page is quoted in full, up to this, so page numbers survive.
CONTENTS_PAGE_MAX_CHARS = 4_000
# Contents pages live at the front; a scan has no text to say which, so the
# vision step reads the front matter blind.
CONTENTS_SEARCH_PAGES = 30
VISION_TOC_PAGES = 8
# Below this share of pages with a text layer the book counts as scanned;
# below this share of pages with any text (layer or OCR) there is nothing
# for the text step to read.
SCANNED_TEXT_SHARE = 0.5
# The one chapter a book gets when no source finds any.
WHOLE_BOOK_TITLE = "Whole book"


def leading_pages_title(page_end: int) -> str:
    """The chapter made of the pages before the first one any source found."""
    return "Page 1" if page_end == 1 else f"Pages 1–{page_end}"


CONTENTS_HEADING = re.compile(r"^\s*(?:table\s+of\s+)?contents\s*$|^\s*目\s*录\s*$", re.I | re.M)
# A line that ends in a page number: `1.2  Chord charts ........ 14`. Some
# words, then the number. On a contents page the numbers run upward; on an
# OCR'd diagram page (fret numbers, notation) they do not — which is what
# tells the two apart, since both have plenty of lines ending in digits.
CONTENTS_LINE = re.compile(r"^\s*\S.*?[^\W\d_]{2,}.*?(?:\.{3,}|\s)\s*(\d{1,4})\s*$", re.M)
CONTENTS_MIN_LINES = 6


@dataclass(frozen=True)
class ChapterStart:
    """What a reader returns: a title and where it begins. Ends are derived."""

    title: str
    page_start: int


@dataclass(frozen=True)
class Chapter:
    title: str
    page_start: int
    page_end: int


@dataclass(frozen=True)
class TocResult:
    source: TocSource
    chapters: tuple[Chapter, ...]


class TextTocReader(Protocol):
    """One structured-output call over the digest. Returns [] when it finds none."""

    async def __call__(self, digest: str) -> Sequence[ChapterStart]: ...


class VisionTocReader(Protocol):
    """One call over the page images of a scanned front matter."""

    async def __call__(self, pages: Sequence[tuple[int, bytes]]) -> Sequence[ChapterStart]: ...


PageRenderer = Callable[[int], bytes]


# --- shared ----------------------------------------------------------------


def _clean_title(title: str) -> str:
    return " ".join(title.split())[:MAX_TITLE_CHARS]


def finish_chapters(starts: Sequence[ChapterStart], page_count: int) -> tuple[Chapter, ...]:
    """
    Validate and order what a source produced, then derive each chapter's end
    from the next one's start. Entries outside the book or without a title
    are dropped; two starts on one page keep the first. The last chapter runs
    to the end of the book, and pages before the first start become a chapter
    of their own: every page belongs to some chapter, so a scan whose first
    banner OCR could not read (calibration: exactly that happened) still
    offers those pages for parsing rather than losing them.
    """
    seen: set[int] = set()
    kept: list[ChapterStart] = []
    for start in sorted(starts, key=lambda s: s.page_start):
        title = _clean_title(start.title)
        if not title or not 1 <= start.page_start <= page_count or start.page_start in seen:
            continue
        seen.add(start.page_start)
        kept.append(ChapterStart(title, start.page_start))

    if kept and kept[0].page_start > 1:
        kept.insert(0, ChapterStart(leading_pages_title(kept[0].page_start - 1), 1))

    return tuple(
        Chapter(
            title=start.title,
            page_start=start.page_start,
            page_end=(kept[i + 1].page_start - 1) if i + 1 < len(kept) else page_count,
        )
        for i, start in enumerate(kept)
    )


# --- 1. outline ------------------------------------------------------------


def chapters_from_outline(outline: Sequence[OutlineEntry], page_count: int) -> tuple[Chapter, ...]:
    """
    Flatten the bookmark tree to one level. The shallowest level with at least
    two entries is the chapter level — a book whose only top-level bookmark is
    its own title has its chapters one level down. Bookmarks without a
    destination (page -1) are skipped.
    """
    usable = [entry for entry in outline if entry.page >= 1]
    if not usable:
        return ()
    levels = sorted({entry.level for entry in usable})
    chosen = next(
        (level for level in levels if sum(1 for e in usable if e.level == level) >= 2),
        levels[0],
    )
    return finish_chapters(
        [ChapterStart(e.title, e.page) for e in usable if e.level == chosen],
        page_count,
    )


# --- 2. text layer ---------------------------------------------------------


def is_scanned(pages: Sequence[PageText]) -> bool:
    if not pages:
        return True
    with_layer = sum(1 for p in pages if p.has_text_layer)
    return with_layer / len(pages) < SCANNED_TEXT_SHARE


def has_readable_text(pages: Sequence[PageText]) -> bool:
    if not pages:
        return False
    with_text = sum(1 for p in pages if p.has_text)
    return with_text / len(pages) >= SCANNED_TEXT_SHARE


def looks_like_contents(text: str) -> bool:
    if CONTENTS_HEADING.search(text) is not None:
        return True
    numbers = [int(n) for n in CONTENTS_LINE.findall(text)]
    return len(numbers) >= CONTENTS_MIN_LINES and numbers == sorted(numbers)


def contents_pages(pages: Sequence[PageText]) -> list[int]:
    """Pages in the front matter whose text reads like a table of contents."""
    return [
        p.page for p in pages[:CONTENTS_SEARCH_PAGES] if p.has_text and looks_like_contents(p.text)
    ]


# A line with fewer word characters than this is a page number, a sidebar
# glyph or OCR noise off a banner — not a line that names a chapter.
HEAD_MIN_WORD_CHARS = 3
_WORD_CHARS = re.compile(r"[^\W\d_]")


def _page_head(page: PageText, lines: int) -> str:
    heads = [
        ln.strip()
        for ln in page.text.splitlines()
        if len(_WORD_CHARS.findall(ln)) >= HEAD_MIN_WORD_CHARS
    ][:lines]
    return " / ".join(h[:DIGEST_LINE_CHARS] for h in heads)


def toc_digest(pages: Sequence[PageText]) -> str:
    """
    What the text-TOC call reads: the first lines of every page, so chapter
    openers anywhere in the book are visible, plus the full text of any
    contents page, so page numbers are too. Calibration note: a real contents
    page can have no page numbers at all, and running headers can be wrong
    (template leftovers) — the model sees both and weighs them.
    """
    page_count = len(pages)
    contents = contents_pages(pages)

    def build(lines_per_page: int) -> str:
        out = [
            f"The book has {page_count} pages. One line per page below: the page number,"
            f" then the first {lines_per_page} line(s) of its text"
            " (pages without any text are marked [no text]).",
            "",
        ]
        for p in pages:
            head = _page_head(p, lines_per_page) if p.has_text else "[no text]"
            out.append(f"p{p.page}: {head}")
        for n in contents:
            out += ["", f"--- Full text of page {n}, which looks like a contents page ---"]
            out.append(pages[n - 1].text[:CONTENTS_PAGE_MAX_CHARS])
        return "\n".join(out)

    digest = build(DIGEST_LINES_PER_PAGE)
    if len(digest) > DIGEST_MAX_CHARS:
        digest = build(1)
    return digest[:DIGEST_MAX_CHARS]


# --- 3. vision -------------------------------------------------------------


def vision_toc_pages(pages: Sequence[PageText]) -> list[int]:
    """Which pages to render for a scanned book: the front matter, blind."""
    return [p.page for p in pages[:VISION_TOC_PAGES]]


# --- the pipeline ----------------------------------------------------------


async def find_chapters(
    *,
    outline: Sequence[OutlineEntry],
    pages: Sequence[PageText],
    read_text_toc: TextTocReader | None,
    read_vision_toc: VisionTocReader | None,
    render_page: PageRenderer | None,
) -> TocResult:
    """
    The four steps in order. A reader left as `None` (no API key on this
    deployment) skips its step. When no step yields a chapter the result is
    `manual` with one chapter spanning the book, never an empty list.
    """
    page_count = len(pages)
    whole_book = TocResult(
        "manual", finish_chapters([ChapterStart(WHOLE_BOOK_TITLE, 1)], page_count)
    )

    chapters = chapters_from_outline(outline, page_count)
    if chapters:
        return TocResult("outline", chapters)

    if has_readable_text(pages) and read_text_toc is not None:
        chapters = finish_chapters(await read_text_toc(toc_digest(pages)), page_count)
        if chapters:
            return TocResult("text", chapters)

    if is_scanned(pages) and read_vision_toc is not None and render_page is not None:
        images = [(n, render_page(n)) for n in vision_toc_pages(pages)]
        chapters = finish_chapters(await read_vision_toc(images), page_count)
        if chapters:
            return TocResult("vision", chapters)

    return whole_book
