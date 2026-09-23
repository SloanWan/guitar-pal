"""
Which model answers a chapter question, and what that model can do.

Two providers, one SDK: DeepSeek speaks the Anthropic Messages shape at
`https://api.deepseek.com/anthropic`, so the same `AsyncAnthropic` client
talks to both and only the base URL, the model names and the capabilities
differ. Measured on 2026-09-23 (numbers in docs/calibration.md §8):

|                        | Anthropic        | deepseek-flash |
|------------------------|------------------|----------------|
| `document` + citations | yes (text layer) | no — unreadable |
| structured output      | yes              | no — answers in prose |
| images                 | yes              | yes, reads a scan well |

`documents` is what the answer step branches on: with it, a chapter whose
PDF carries a text layer goes over as one cited PDF and the pages come off
the API's citations; without it — every DeepSeek call, and every scanned
chapter on either provider — the chapter goes over as labelled pages and
the pages come from what was sent.
"""

import logging
from dataclasses import dataclass

from anthropic import AsyncAnthropic

from app.ingest.model import CLASSIFY_MODEL, MODEL

log = logging.getLogger("book-service")

DEEPSEEK_BASE_URL = "https://api.deepseek.com/anthropic"
DEEPSEEK_MODEL = "deepseek-flash"
# Its default effort is `high`, which spends the whole budget thinking before
# it writes anything; `low` answers and still reasons first.
DEEPSEEK_EFFORT = "low"


@dataclass(frozen=True)
class Provider:
    """One model family, and what the ask graph may ask of it."""

    name: str
    client: AsyncAnthropic
    # The chapter answer and the general answer.
    model: str
    # The intent call: cheap and frequent.
    small_model: str
    # Whether `document` blocks with `citations` are read at all.
    documents: bool
    # Whether `messages.parse(output_format=…)` returns the schema.
    structured_output: bool
    effort: str = "medium"

    def config(self, effort: str | None = None) -> dict[str, object]:
        return {"effort": effort or self.effort}


def anthropic_provider(client: AsyncAnthropic) -> Provider:
    return Provider(
        name="anthropic",
        client=client,
        model=MODEL,
        small_model=CLASSIFY_MODEL,
        documents=True,
        structured_output=True,
        effort="medium",
    )


def deepseek_provider(api_key: str) -> Provider:
    return Provider(
        name="deepseek",
        client=AsyncAnthropic(api_key=api_key, base_url=DEEPSEEK_BASE_URL),
        model=DEEPSEEK_MODEL,
        small_model=DEEPSEEK_MODEL,
        documents=False,
        structured_output=False,
        effort=DEEPSEEK_EFFORT,
    )


def build_provider(
    name: str, anthropic_client: AsyncAnthropic | None, deepseek_key: str | None
) -> Provider | None:
    """The provider `BOOK_ASK_PROVIDER` names, or None when its key is missing."""
    if name == "deepseek":
        if deepseek_key is None:
            log.warning("BOOK_ASK_PROVIDER=deepseek needs DEEPSEEK_API_KEY: chapter Q&A off")
            return None
        return deepseek_provider(deepseek_key)
    if name != "anthropic":
        log.warning("BOOK_ASK_PROVIDER=%r is not a provider; using anthropic", name)
    if anthropic_client is None:
        return None
    return anthropic_provider(anthropic_client)
