"""
The one model call the whole-book pass makes: reading chapters off a text
PDF that has no bookmarks. Text only — a scanned book's contents page goes
through the `VisionTocReader` protocol, whose implementation lands with the
page-rendering work in #202 (until then a scan falls through to `manual`).

Server-only: holds an SDK client. The model is the one the strum assistant
uses (`src/lib/strumAssistant/askModel.ts`), so one key and one bill cover
both. The reader returns [] rather than raising on anything the model does
short of an SDK error — a refusal, a truncated answer, no chapters — because
"no chapters found" is a normal outcome the pipeline already handles.
"""

import logging

from anthropic import AsyncAnthropic
from pydantic import BaseModel, Field

from app.ingest.toc import ChapterStart

log = logging.getLogger("book-service")

MODEL = "claude-opus-5"
# A chapter list is short; a large cap would only widen the blast radius.
MAX_OUTPUT_TOKENS = 4096

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
        log.info(
            "text toc: stop=%s in=%d out=%d",
            response.stop_reason,
            response.usage.input_tokens,
            response.usage.output_tokens,
        )
        if response.stop_reason != "end_turn" or response.parsed_output is None:
            return []
        return [ChapterStart(c.title, c.page_start) for c in response.parsed_output.chapters]
