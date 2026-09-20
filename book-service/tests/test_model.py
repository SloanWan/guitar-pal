from dataclasses import dataclass, field
from types import SimpleNamespace

import pytest

from app.ingest.model import MODEL, AnthropicTextTocReader, _ChapterOut, _TocOut
from app.ingest.toc import ChapterStart


@dataclass
class FakeMessages:
    """Stands in for `client.messages`: returns one canned response and records the request."""

    response: object
    requests: list[dict] = field(default_factory=list)

    async def parse(self, **kwargs: object) -> object:
        self.requests.append(kwargs)
        return self.response


def _client(response: object) -> SimpleNamespace:
    return SimpleNamespace(messages=FakeMessages(response))


def _response(stop_reason: str, parsed: _TocOut | None) -> SimpleNamespace:
    return SimpleNamespace(
        stop_reason=stop_reason,
        parsed_output=parsed,
        usage=SimpleNamespace(input_tokens=10, output_tokens=5),
    )


@pytest.mark.asyncio
async def test_reader_maps_the_parsed_chapters() -> None:
    parsed = _TocOut(
        chapters=[_ChapterOut(title="One", page_start=2), _ChapterOut(title="Two", page_start=7)]
    )
    client = _client(_response("end_turn", parsed))
    reader = AnthropicTextTocReader(client)  # type: ignore[arg-type]

    assert await reader("digest") == [ChapterStart("One", 2), ChapterStart("Two", 7)]
    (request,) = client.messages.requests
    assert request["model"] == MODEL
    assert request["messages"] == [{"role": "user", "content": "digest"}]
    assert request["output_format"] is _TocOut


@pytest.mark.asyncio
@pytest.mark.parametrize("stop_reason", ["refusal", "max_tokens"])
async def test_anything_but_a_finished_answer_is_no_chapters(stop_reason: str) -> None:
    parsed = _TocOut(chapters=[_ChapterOut(title="Half", page_start=1)])
    reader = AnthropicTextTocReader(_client(_response(stop_reason, parsed)))  # type: ignore[arg-type]
    assert await reader("digest") == []


@pytest.mark.asyncio
async def test_unparsable_answer_is_no_chapters() -> None:
    reader = AnthropicTextTocReader(_client(_response("end_turn", None)))  # type: ignore[arg-type]
    assert await reader("digest") == []
