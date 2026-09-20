"""
The answer call every strategy shares: documents in, prose and the pages
it cites out. The model writes text with citation blocks on it; the pages
are read off those blocks by the app — a `page_location` on a PDF is a
page of the chapter, a `char_location` on a text document is that
document's page — never off the prose.
"""

import logging
from collections.abc import Callable, Sequence
from typing import Any

from anthropic import AsyncAnthropic

from app.ask.prompts import ANSWER_SYSTEM
from app.ask.types import Answer, AskTurn
from app.ingest.model import MODEL, usage_of

log = logging.getLogger("book-service")

MAX_ANSWER_TOKENS = 1024
# Turns of the thread the answer call is shown, newest last.
MAX_HISTORY_TURNS = 12

# A content block's citation, as the SDK hands it over; pages come out of it.
PagesOf = Callable[[Any], Sequence[int]]


async def answer_with_documents(
    client: AsyncAnthropic,
    documents: Sequence[dict[str, object]],
    pages_of: PagesOf,
    question: str,
    history: Sequence[AskTurn],
    model: str = MODEL,
) -> Answer:
    """
    One call: the documents (with `citations` enabled, the first one carrying
    the cache mark) as the thread's opening turn, then the thread, then the
    question. The pages are the union of what every citation named, in the
    order first cited.
    """
    note = {"type": "text", "text": "This is the chapter."}
    opening: list[dict[str, object]] = [*documents, note]
    messages: list[dict[str, object]] = [
        {"role": "user", "content": opening},
        {"role": "assistant", "content": "Ready — ask me about it."},
    ]
    for turn in list(history)[-MAX_HISTORY_TURNS:]:
        if turn.content.strip():
            messages.append({"role": turn.role, "content": turn.content})
    messages.append({"role": "user", "content": question})

    response = await client.messages.create(
        model=model,
        max_tokens=MAX_ANSWER_TOKENS,
        system=ANSWER_SYSTEM,
        messages=messages,  # type: ignore[arg-type]
    )
    text_parts: list[str] = []
    pages: list[int] = []
    for block in response.content:
        if getattr(block, "type", None) != "text":
            continue
        text_parts.append(block.text)
        for citation in getattr(block, "citations", None) or []:
            for page in pages_of(citation):
                if page not in pages:
                    pages.append(page)
    message = "".join(text_parts).strip()
    log.info(
        "ask answer: stop=%s cited pages %s, %d/%d tokens (cache %d written, %d read)",
        response.stop_reason,
        pages,
        response.usage.input_tokens,
        response.usage.output_tokens,
        getattr(response.usage, "cache_creation_input_tokens", 0) or 0,
        getattr(response.usage, "cache_read_input_tokens", 0) or 0,
    )
    return Answer(
        message=message, pages=tuple(pages), usage=[usage_of(response, model)], model=model
    )


def text_document(title: str, text: str, cached: bool = False) -> dict[str, object]:
    """A plain-text document block with citations on; `cached` marks the prefix."""
    block: dict[str, object] = {
        "type": "document",
        "source": {"type": "text", "media_type": "text/plain", "data": text},
        "title": title,
        "citations": {"enabled": True},
    }
    if cached:
        block["cache_control"] = {"type": "ephemeral"}
    return block
