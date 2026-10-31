"""
The answer call every strategy shares: the chapter in, prose and the pages
it rests on out.

Where the pages come from depends on what the provider can read. When
`document` blocks with citations work *and* the chapter's PDF carries a
text layer, the API's own citation blocks name the pages and nothing is
asked of the model. Otherwise the chapter goes over as labelled `[Page N]`
blocks and the model ends its reply with a `PAGES:` line — which is not
the model's word for a page either: the app keeps only the numbers it
actually sent, and falls back to all of them when the line is missing.

Calibration (docs/calibration.md §8): a scanned chapter has no text layer,
so its PDF carries no citable text on any provider, and DeepSeek cannot
read `document` blocks at all. An answer that cites nothing therefore says
nothing about whether the chapter covered the question — `NOT_IN_CHAPTER`
does, and only that.
"""

import logging
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any

from app.ask.prompts import ANSWER_SYSTEM, NOT_IN_CHAPTER, PAGES_TAIL
from app.ask.provider import Provider
from app.ask.types import Answer, AskTurn
from app.ingest.model import usage_of

log = logging.getLogger("book-service")

# Long enough for four sentences plus a reasoning model's thinking, which is
# spent before a word of the answer is written (deepseek-flash: ~300 tokens on
# a short question). The prompt is what keeps answers short, not this.
MAX_ANSWER_TOKENS = 2048
# Turns of the thread the answer call is shown, newest last.
MAX_HISTORY_TURNS = 12

PAGES_LINE = re.compile(r"^\s*PAGES\s*:\s*(.*)$", re.IGNORECASE | re.MULTILINE)

# A content block's citation, as the SDK hands it over; pages come out of it.
PagesOf = Callable[[Any], Sequence[int]]


@dataclass
class AnswerRequest:
    """What to put in front of the model, and how to read pages back off it."""

    blocks: list[dict[str, object]]
    # The pages those blocks carry, when they are labelled ones.
    pages_sent: tuple[int, ...] = ()
    # Citation → pages, when the provider cites what it read.
    pages_of: PagesOf | None = None
    extra_system: str = ""
    usage: list = field(default_factory=list)


async def answer_call(
    provider: Provider,
    request: AnswerRequest,
    question: str,
    history: Sequence[AskTurn],
) -> Answer:
    """One call: the chapter as the opening turn, then the thread, then the question."""
    note = {"type": "text", "text": "This is the chapter."}
    messages: list[dict[str, object]] = [
        {"role": "user", "content": [*request.blocks, note]},
        {"role": "assistant", "content": "Ready — ask me about it."},
    ]
    for turn in list(history)[-MAX_HISTORY_TURNS:]:
        if turn.content.strip():
            messages.append({"role": turn.role, "content": turn.content})
    messages.append({"role": "user", "content": question})

    response = await provider.client.messages.create(
        model=provider.model,
        max_tokens=MAX_ANSWER_TOKENS,
        system=ANSWER_SYSTEM + request.extra_system,
        messages=messages,  # type: ignore[arg-type]
        output_config=provider.config(),  # type: ignore[arg-type]
    )
    text_parts: list[str] = []
    cited: list[int] = []
    for block in response.content:
        if getattr(block, "type", None) != "text":
            continue
        text_parts.append(block.text)
        for citation in getattr(block, "citations", None) or []:
            for page in request.pages_of(citation) if request.pages_of else ():
                if page not in cited:
                    cited.append(page)
    message = "".join(text_parts).strip()
    covered = NOT_IN_CHAPTER not in message
    message, named = strip_pages_line(message)
    pages = tuple(cited) if cited else _kept(named, request.pages_sent)
    log.info(
        "ask answer [%s/%s]: stop=%s covered=%s cited=%s named=%s → pages %s,"
        " %d/%d tokens (cache %d written, %d read)",
        provider.name,
        provider.model,
        response.stop_reason,
        covered,
        cited,
        named,
        list(pages),
        response.usage.input_tokens,
        response.usage.output_tokens,
        getattr(response.usage, "cache_creation_input_tokens", 0) or 0,
        getattr(response.usage, "cache_read_input_tokens", 0) or 0,
    )
    return Answer(
        message=message,
        pages=pages if covered else (),
        covered=covered,
        usage=[*request.usage, usage_of(response, provider.model)],
        model=provider.model,
    )


def strip_pages_line(message: str) -> tuple[str, tuple[int, ...] | None]:
    """The reply without its `PAGES:` line, and the numbers that line named."""
    match = PAGES_LINE.search(message)
    if match is None:
        return message, None
    named = tuple(int(n) for n in re.findall(r"\d+", match.group(1)))
    return (message[: match.start()] + message[match.end() :]).strip(), named


def _kept(named: tuple[int, ...] | None, sent: Sequence[int]) -> tuple[int, ...]:
    """
    The pages the answer rests on: the ones it named, kept only where they are
    pages we put in front of it. A reply that named none rests on all of them —
    it read the chapter it was given.
    """
    if not sent:
        return ()
    if named is None:
        return tuple(sent)
    kept = tuple(p for p in named if p in set(sent))
    return kept or tuple(sent)


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


def page_block(page: int, text: str, cached: bool = False) -> dict[str, object]:
    """One page as a labelled text block, for a provider that cannot cite documents."""
    block: dict[str, object] = {"type": "text", "text": f"[Page {page}]\n{text}"}
    if cached:
        block["cache_control"] = {"type": "ephemeral"}
    return block


def labelled_pages(
    pages: Sequence[tuple[int, str]],
) -> AnswerRequest:
    """The chapter as `[Page N]` blocks; the last one carries the cache mark."""
    last = len(pages) - 1
    blocks = [page_block(n, text, cached=(i == last)) for i, (n, text) in enumerate(pages)]
    return AnswerRequest(
        blocks=blocks,
        pages_sent=tuple(n for n, _ in pages),
        extra_system=PAGES_TAIL,
    )
