"""
The model calls the whole-book pass makes: reading chapters off a text PDF
that has no bookmarks, and off the front-matter page images of a scan
whose OCR text gave nothing.

Server-only: holds an SDK client. The model is the one the strum assistant
uses (`src/lib/strumAssistant/askModel.ts`), so one key and one bill cover
both. The reader returns [] rather than raising on anything the model does
short of an SDK error — a refusal, a truncated answer, no chapters — because
"no chapters found" is a normal outcome the pipeline already handles.
"""

import base64
import logging
import os
from collections.abc import Sequence
from dataclasses import dataclass

from anthropic import AsyncAnthropic
from anthropic.types import Message
from pydantic import BaseModel, Field

from app.ingest.toc import ChapterStart

log = logging.getLogger("book-service")

MODEL = "claude-opus-5"
# A chapter list is short; a large cap would only widen the blast radius.
MAX_OUTPUT_TOKENS = 4096

# The page classifier is the parse's volume call (one per page, with an
# image). Calibration (docs/calibration.md §5): Sonnet 5 sorted every page
# and every region the same as Opus 5 at 43% of the cost, so it is the
# default; `BOOK_SERVICE_CLASSIFY_MODEL` overrides.
CLASSIFY_MODEL = os.environ.get("BOOK_SERVICE_CLASSIFY_MODEL", "claude-sonnet-5")

# USD per million tokens (input, output), for the cost a parse or an ask
# records. DeepSeek's are its **peak** rates (01:00–04:00 and 06:00–10:00 UTC
# on weekdays); off-peak is half, so a figure here is the worst case, never an
# understatement. Read 2026-09-23 from api-docs.deepseek.com/quick_start/pricing.
PRICE_PER_MTOK: dict[str, tuple[float, float]] = {
    "claude-opus-5": (5.0, 25.0),
    "claude-sonnet-5": (2.0, 10.0),
    "deepseek-flash": (0.30, 1.20),
    "deepseek-v4-pro": (1.32, 3.96),
}

# What a cached prefix costs relative to a fresh read of it, per family.
# Anthropic charges 1.25× to write and 0.1× to read. DeepSeek does not price a
# write at all — a miss is just input — and a hit is $0.006 against $0.30, a
# fiftieth. (Assumed from its cache-hit/cache-miss input prices; if a bill ever
# disagrees, this table is the one place to fix.)
CACHE_FACTORS: dict[str, tuple[float, float]] = {
    "deepseek-flash": (1.0, 0.02),
    "deepseek-v4-pro": (1.0, 0.02),
}


# The Anthropic default, when a model is not in CACHE_FACTORS.
CACHE_WRITE_FACTOR = 1.25
CACHE_READ_FACTOR = 0.1


@dataclass(frozen=True)
class CallUsage:
    input_tokens: int
    output_tokens: int
    model: str = MODEL
    cache_write_tokens: int = 0
    cache_read_tokens: int = 0

    @property
    def cost_usd(self) -> float:
        price_in, price_out = PRICE_PER_MTOK.get(self.model, (0.0, 0.0))
        write_factor, read_factor = CACHE_FACTORS.get(
            self.model, (CACHE_WRITE_FACTOR, CACHE_READ_FACTOR)
        )
        cached = (
            self.cache_write_tokens * write_factor + self.cache_read_tokens * read_factor
        ) * price_in
        return (self.input_tokens * price_in + cached + self.output_tokens * price_out) / 1_000_000


def usage_of(response: Message, model: str = MODEL) -> CallUsage:
    usage = response.usage
    return CallUsage(
        usage.input_tokens,
        usage.output_tokens,
        model,
        cache_write_tokens=getattr(usage, "cache_creation_input_tokens", None) or 0,
        cache_read_tokens=getattr(usage, "cache_read_input_tokens", None) or 0,
    )


SYSTEM_PROMPT = (
    "You are reading a guitar textbook's page digest to find where its chapters begin.\n\n"
    "You will get one line per page (page number, then the first lines of that page's"
    " text) and, when the book has one, the full text of its contents page.\n\n"
    "Return the chapters as a flat list, in page order, each with its title and the page"
    " it starts on (1-based, as numbered in the digest — not the number printed on the"
    " page, which may differ).\n\n"
    "Rules:\n"
    "- Prefer the book's own chapter level. If the contents page lists chapters with"
    " numbered sections under them, return the chapters, not the sections. A book with"
    " no chapter level but a clear section level returns the sections.\n"
    "- A contents page may have no page numbers. Then find each chapter's start from the"
    " page lines: a chapter opener usually shows the chapter number and title near the"
    " top of its page.\n"
    "- Running headers can be wrong (template leftovers); a chapter title on the page"
    " body outranks the header.\n"
    "- Do not invent chapters. Skip cover, copyright, contents, adverts and blank pages"
    " unless the book itself lists them as chapters.\n"
    "- If you cannot tell where any chapter starts, return an empty list."
)


class _ChapterOut(BaseModel):
    title: str = Field(
        description="The chapter's title as printed, without its number prefix if any"
    )
    page_start: int = Field(description="1-based page index in the digest where the chapter begins")


class _TocOut(BaseModel):
    chapters: list[_ChapterOut]


def _chapters(response: Message, what: str) -> list[ChapterStart]:
    log.info(
        "%s: stop=%s in=%d out=%d",
        what,
        response.stop_reason,
        response.usage.input_tokens,
        response.usage.output_tokens,
    )
    parsed = getattr(response, "parsed_output", None)
    if response.stop_reason != "end_turn" or parsed is None:
        return []
    return [ChapterStart(c.title, c.page_start) for c in parsed.chapters]


class AnthropicTextTocReader:
    """`TextTocReader` backed by the Anthropic API."""

    def __init__(self, client: AsyncAnthropic | None = None) -> None:
        self._client = client or AsyncAnthropic()

    async def __call__(self, digest: str) -> list[ChapterStart]:
        response = await self._client.messages.parse(
            model=MODEL,
            max_tokens=MAX_OUTPUT_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": digest}],
            output_format=_TocOut,
            output_config={"effort": "medium"},
        )
        return _chapters(response, "text toc")


VISION_SYSTEM_PROMPT = (
    "You are looking at the first pages of a scanned guitar textbook to find its chapters.\n\n"
    "Each image is one page, labelled with its 1-based page number in the book. Some of"
    " these pages may be a table of contents; some may be chapter openers.\n\n"
    "Return the chapters as a flat list, in page order, each with its title and the page"
    " it starts on. Use the page numbers as labelled here, not the numbers printed on the"
    " pages. When a contents page lists chapters with printed page numbers, convert them"
    " only if the offset to the labelled numbers is clear from a page you can see;"
    " otherwise return only the chapters whose opener pages are among these images.\n\n"
    "Do not invent chapters. If none can be placed, return an empty list."
)


class AnthropicVisionTocReader:
    """`VisionTocReader` backed by the Anthropic API: the front matter as page images."""

    def __init__(self, client: AsyncAnthropic | None = None) -> None:
        self._client = client or AsyncAnthropic()

    async def __call__(self, pages: Sequence[tuple[int, bytes]]) -> list[ChapterStart]:
        content: list[dict[str, object]] = []
        for number, png in pages:
            content.append({"type": "text", "text": f"Page {number}:"})
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": base64.standard_b64encode(png).decode("ascii"),
                    },
                }
            )
        content.append({"type": "text", "text": "Which chapters begin on these pages?"})
        response = await self._client.messages.parse(
            model=MODEL,
            max_tokens=MAX_OUTPUT_TOKENS,
            system=VISION_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
            output_format=_TocOut,
            output_config={"effort": "medium"},
        )
        return _chapters(response, "vision toc")
