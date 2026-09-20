"""
The chapter parse graph (#202): classify pages, extract by kind, write the
knowledge points. `build_chapter_graph(client)` returns a `ChapterGraph`.
"""

from anthropic import AsyncAnthropic

from app.parse import ChapterGraph
from app.validate import ValidatorClient


def build_chapter_graph(
    client: AsyncAnthropic, validator: ValidatorClient | None = None
) -> ChapterGraph:
    from app.graph.chapter import ChapterParseGraph

    return ChapterParseGraph(client, validator)
