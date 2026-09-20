"""
How the chapter reaches the model (#203). Three strategies behind one
interface, all kept, one chosen by `BOOK_ASK_STRATEGY`:

- `long_context`: the chapter's pages as one PDF document, citations on,
  prompt-cached — pages from the API's `page_location` citations.
- `lexical`: Postgres full-text search over the chapter's chunks (CJK
  bigrams, `app/ask/lexical.py`), the hits as cited text documents.
- `rag`: pgvector nearest chunks, the same answer step as `lexical`; needs
  an embedding key (`VOYAGE_API_KEY`).

Which one is the default is a measured choice — `evals/ask/` — and the
rule that decides it is written in #203 before the numbers exist.
"""

from collections.abc import Sequence
from typing import Protocol

from app.ask.types import Answer, AskContext, AskTurn, Retrieval

STRATEGY_NAMES = ("long_context", "lexical", "rag")


class AskStrategy(Protocol):
    name: str

    async def retrieve(self, ctx: AskContext, question: str) -> Retrieval: ...

    async def answer(
        self, ctx: AskContext, question: str, history: Sequence[AskTurn], retrieval: Retrieval
    ) -> Answer: ...


__all__ = ["AskStrategy", "STRATEGY_NAMES"]
