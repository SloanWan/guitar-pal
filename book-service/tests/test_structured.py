"""
`structured_call` on Anthropic validates the reply itself (#385): a reply
cut off at max_tokens — a looping classifier did this once — comes back as
None with its usage counted, and never raises out of the chapter graph.
"""

from dataclasses import dataclass, field, replace
from types import SimpleNamespace

from app.ask.provider import BAILIAN_THINKING_TOKENS, anthropic_provider, bailian_provider
from app.ask.structured import structured_call
from app.graph.chapter import CLASSIFY_ATTEMPTS, ChapterParseGraph
from app.graph.prompts import PageClassOut
from app.parse import ParsePage

VALID = '{"kind":"tab","regions":[],"note":"six-line tab"}'
LOOPED = '{"kind":"mixed","note":"' + "》" * 400  # cut off at max_tokens


@dataclass
class ScriptedMessages:
    """Answers each create with the next scripted (stop_reason, text)."""

    replies: list[tuple[str, str]]
    requests: list[dict] = field(default_factory=list)

    async def create(self, **kwargs: object) -> object:
        self.requests.append(kwargs)
        stop, text = self.replies.pop(0)
        usage = SimpleNamespace(input_tokens=1200, output_tokens=1024)
        block = SimpleNamespace(type="text", text=text)
        return SimpleNamespace(stop_reason=stop, content=[block], usage=usage)


def provider(*replies: tuple[str, str]):  # noqa: ANN201 - the fake stands in for AsyncAnthropic
    messages = ScriptedMessages(list(replies))
    return anthropic_provider(SimpleNamespace(messages=messages)), messages  # type: ignore[arg-type]


async def call(p) -> tuple[PageClassOut | None, object]:  # noqa: ANN001
    return await structured_call(
        p, system="classify", messages=[], output=PageClassOut, max_tokens=1024, small=True
    )


async def test_a_reply_cut_off_at_max_tokens_is_none_with_its_usage() -> None:
    p, _ = provider(("max_tokens", LOOPED))
    out, usage = await call(p)
    assert out is None
    assert usage.output_tokens == 1024 and usage.cost_usd > 0


async def test_invalid_json_that_ended_normally_is_none_too() -> None:
    p, _ = provider(("end_turn", '{"kind": "tab"'))
    out, _ = await call(p)
    assert out is None


async def test_a_valid_reply_parses_and_the_schema_is_sent_as_the_output_format() -> None:
    p, messages = provider(("end_turn", VALID))
    out, _ = await call(p)
    assert out == PageClassOut(kind="tab", regions=[], note="six-line tab")
    fmt = messages.requests[0]["output_config"]["format"]
    assert fmt["type"] == "json_schema" and "kind" in fmt["schema"]["properties"]


def page() -> ParsePage:
    return ParsePage(
        page=35, text="第三章 乐理知识", has_text_layer=False, may_have_exercise=False, image=b"png"
    )


async def test_the_classifier_tries_a_looping_page_again() -> None:
    p, messages = provider(("max_tokens", LOOPED), ("end_turn", VALID))
    out = await ChapterParseGraph(p).classify_page({"page": page(), "chapter_title": "ch3"})
    assert out["classified"][0].kind == "tab"
    assert len(out["usage"]) == 2  # both calls are paid for
    assert "warnings" not in out
    assert len(messages.requests) == 2


async def test_a_page_that_never_classifies_is_said_on_the_chapter() -> None:
    p, _ = provider(*[("max_tokens", LOOPED)] * CLASSIFY_ATTEMPTS)
    out = await ChapterParseGraph(p).classify_page({"page": page(), "chapter_title": "ch3"})
    assert out["classified"][0].kind == "other"
    assert len(out["usage"]) == CLASSIFY_ATTEMPTS
    [warning] = out["warnings"]
    assert warning["code"] == "PAGE_UNCLASSIFIED" and warning["path"] == "page 35"


@dataclass
class StreamedMessages:
    """Bailian's path: one streamed reply, with JSON asked for in the prompt."""

    text: str
    requests: list[dict] = field(default_factory=list)

    def stream(self, **kwargs: object) -> "StreamedMessages":
        self.requests.append(kwargs)
        return self

    async def __aenter__(self) -> "StreamedMessages":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def get_final_message(self) -> object:
        usage = SimpleNamespace(input_tokens=1200, output_tokens=200)
        block = SimpleNamespace(type="text", text=self.text)
        return SimpleNamespace(stop_reason="end_turn", content=[block], usage=usage)


def bailian(thinking: bool):  # noqa: ANN201 - the fake stands in for AsyncAnthropic
    messages = StreamedMessages(VALID)
    p = replace(
        bailian_provider("key", "qwen3.7-plus", thinking=thinking),
        client=SimpleNamespace(messages=messages),  # type: ignore[arg-type]
    )
    return p, messages


async def test_a_bailian_model_told_not_to_think_gets_no_thinking_room() -> None:
    p, messages = bailian(thinking=False)
    out, _ = await call(p)
    assert out == PageClassOut(kind="tab", regions=[], note="six-line tab")
    [request] = messages.requests
    assert request["thinking"] == {"type": "disabled"}
    assert request["max_tokens"] == 1024


async def test_a_bailian_model_thinks_by_default_inside_a_larger_cap() -> None:
    p, messages = bailian(thinking=True)
    await call(p)
    [request] = messages.requests
    assert "thinking" not in request
    assert request["max_tokens"] == 1024 + BAILIAN_THINKING_TOKENS
