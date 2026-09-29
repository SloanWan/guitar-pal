"""
The chapter parse graph (#202): classify pages, extract by kind, write the
knowledge points. `build_chapter_graph(provider)` returns a `ChapterGraph`.
"""

from app.ask.provider import Provider
from app.parse import ChapterGraph
from app.validate import ValidatorClient


def build_chapter_graph(
    provider: Provider, validator: ValidatorClient | None = None
) -> ChapterGraph:
    from app.graph.chapter import ChapterParseGraph

    return ChapterParseGraph(provider, validator)
