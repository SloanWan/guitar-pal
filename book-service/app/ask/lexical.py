"""
Tokens for the `lexical` strategy's full-text search.

Postgres's `simple` configuration splits on spaces and punctuation, which
is fine for English and useless for Chinese — a run of characters with no
spaces is one token, so nothing short of the whole line ever matches. So
the text is tokenised here before it reaches `to_tsvector`: words as they
are for scripts with spaces, and every overlapping pair of characters for
CJK runs ("左手按弦" → "左手 手按 按弦"), which is how the book's own
phrases turn up in a question about them. The same function tokenises the
question, so the two sides always agree.
"""

import re

# CJK unified ideographs, extensions A, and the compatibility block.
_CJK = r"㐀-䶿一-鿿豈-﫿"
_RUN = re.compile(rf"[{_CJK}]+|[a-z0-9#♭♯]+")


def lexical_tokens(text: str) -> list[str]:
    """Search tokens of a text, in order, lower-cased; CJK as character bigrams."""
    tokens: list[str] = []
    for run in _RUN.findall(text.lower()):
        if re.fullmatch(rf"[{_CJK}]+", run):
            if len(run) == 1:
                tokens.append(run)
            else:
                tokens.extend(run[i : i + 2] for i in range(len(run) - 1))
        else:
            tokens.append(run)
    return tokens


def lexical_text(text: str) -> str:
    """What `to_tsvector('simple', …)` is fed for a chunk: its tokens, space-separated."""
    return " ".join(lexical_tokens(text))


def lexical_query(question: str) -> str:
    """
    What `to_tsquery('simple', …)` is fed for a question: its distinct tokens
    OR'd, so a chunk holding any of them matches and `ts_rank` orders by how
    many. Empty when the question has no tokens at all.
    """
    seen: list[str] = []
    for token in lexical_tokens(question):
        if token not in seen:
            seen.append(token)
    return " | ".join(_quote(t) for t in seen)


def _quote(token: str) -> str:
    return "'" + token.replace("'", "''") + "'"
