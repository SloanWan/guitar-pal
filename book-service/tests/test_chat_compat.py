"""
Bailian's vendor-prefixed models answer at the OpenAI-compatible endpoint
(#424): `ChatCompletionsClient` translates the streamed structured call there
and hands back a reply the Messages path reads unchanged.
"""

import json
from dataclasses import replace

import httpx

from app.ask.chat_compat import (
    ChatCompletionsClient,
    chat_body,
    chunks_of,
    reply_of,
)
from app.ask.provider import BAILIAN_CHAT_URL, bailian_provider
from app.ask.structured import structured_call
from app.graph.prompts import PageClassOut

IMAGE = {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "QUJD"}}
VALID = '{"kind":"tab","regions":[],"note":"six-line tab"}'


def test_blocks_become_chat_parts_and_the_image_a_data_url() -> None:
    body = chat_body(
        model="ZHIPU/GLM-5.3-FlashX",
        max_tokens=100,
        system="read",
        messages=[
            {"role": "user", "content": [{"type": "text", "text": "Read this."}, IMAGE]},
            {"role": "assistant", "content": "{}"},
        ],
        output_config={"effort": "medium"},
    )
    system, user, assistant = body["messages"]  # type: ignore[misc]
    assert system == {"role": "system", "content": "read"}
    assert user["content"] == [
        {"type": "text", "text": "Read this."},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,QUJD"}},
    ]
    assert assistant == {"role": "assistant", "content": "{}"}
    assert "output_config" not in body and "enable_thinking" not in body
    assert body["stream"] is True and body["stream_options"] == {"include_usage": True}


def test_thinking_becomes_enable_thinking_with_its_budget() -> None:
    args = {"model": "m", "max_tokens": 1, "system": "", "messages": []}
    on = chat_body(**args, thinking={"type": "enabled", "budget_tokens": 8192})
    off = chat_body(**args, thinking={"type": "disabled"})
    assert (on["enable_thinking"], on["thinking_budget"]) == (True, 8192)
    assert off["enable_thinking"] is False and "thinking_budget" not in off


def stream(*chunks: dict) -> list[str]:
    return [": keep-alive", *(f"data: {json.dumps(c)}" for c in chunks), "data: [DONE]"]


def delta(content: str | None, finish: str | None = None, reasoning: str = "") -> dict:
    d = {"content": content, "reasoning_content": reasoning}
    return {"choices": [{"delta": d, "finish_reason": finish}]}


USAGE = {"choices": [], "usage": {"prompt_tokens": 1500, "completion_tokens": 300}}


def test_the_reply_joins_the_text_without_the_reasoning_and_maps_the_stop() -> None:
    lines = stream(delta(None, reasoning="{maybe}"), delta('{"a":'), delta("1}", "stop"), USAGE)
    reply = reply_of(chunks_of(lines))
    assert reply.content[0].text == '{"a":1}'
    assert reply.stop_reason == "end_turn"
    assert (reply.usage.input_tokens, reply.usage.output_tokens) == (1500, 300)


def test_a_think_block_in_the_text_is_left_out_and_a_cut_reply_says_so() -> None:
    reply = reply_of(chunks_of(stream(delta("<think>{x}</think>\n{}"), delta("", "length"))))
    assert reply.content[0].text == "{}"
    assert reply.stop_reason == "max_tokens"


def test_a_prefixed_bailian_model_goes_to_the_chat_endpoint() -> None:
    assert isinstance(bailian_provider("k", "ZHIPU/GLM-5.3-FlashX").client, ChatCompletionsClient)
    assert not isinstance(bailian_provider("k", "qwen3.7-plus").client, ChatCompletionsClient)


async def test_a_structured_call_through_the_chat_endpoint_reads_the_reply() -> None:
    seen: list[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        body = "\n".join(stream(delta(VALID, "stop"), USAGE))
        return httpx.Response(200, text=body, headers={"content-type": "text/event-stream"})

    model = "MiniMax/MiniMax-M3.1-Flash"
    client = ChatCompletionsClient("key", BAILIAN_CHAT_URL, httpx.MockTransport(answer))
    p = replace(bailian_provider("key", model), client=client)
    out, usage = await structured_call(
        p, system="classify", messages=[], output=PageClassOut, max_tokens=1024
    )
    await client.close()
    assert out == PageClassOut(kind="tab", regions=[], note="six-line tab")
    assert (usage.input_tokens, usage.output_tokens, usage.model) == (1500, 300, model)
    [request] = seen
    assert str(request.url) == f"{BAILIAN_CHAT_URL}/chat/completions"
    assert request.headers["authorization"] == "Bearer key"
    assert json.loads(request.content)["model"] == model


async def test_a_refused_request_raises_with_the_endpoint_s_reason() -> None:
    client = ChatCompletionsClient(
        "key", BAILIAN_CHAT_URL, httpx.MockTransport(lambda _: httpx.Response(400, text="no"))
    )
    p = replace(bailian_provider("key", "ZHIPU/GLM-5.3-FlashX"), client=client)
    try:
        await structured_call(p, system="", messages=[], output=PageClassOut, max_tokens=1)
    except Exception as e:
        assert "400: no" in str(e)
    else:
        raise AssertionError("expected the refusal to raise")
    finally:
        await client.close()
