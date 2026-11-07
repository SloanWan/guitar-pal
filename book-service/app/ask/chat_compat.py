"""
Bailian's OpenAI-compatible endpoint behind the slice of the Messages API that
`structured_call`'s streamed path uses (#424).

The third-party models Bailian hosts under a vendor prefix
(`ZHIPU/GLM-5.3-FlashX`, `MiniMax/MiniMax-M3.1-Flash`) are served only at
/compatible-mode/v1, not at the Anthropic endpoint. `ChatCompletionsClient`
answers `messages.stream(...)` with a reply shaped like a Message — text
blocks, a stop reason, usage — so a provider built on it goes through the same
read, the same lenient JSON parse and the same usage accounting as the others.
Only what that path sends is translated: the system prompt, text and base64
image blocks, plain-text turns, the cap and `thinking`; `output_config` (the
effort) has no counterpart there and is dropped.
"""

import json
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

import httpx

STOP_REASONS = {"stop": "end_turn", "length": "max_tokens"}
# A thinking model that writes its reasoning into the reply instead of
# `reasoning_content`; braces in there would be taken for the JSON.
THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL)
# Between two chunks: a model that does not stream its reasoning can be
# silent for minutes before the first word.
READ_TIMEOUT_S = 600.0


class ChatCompletionsError(Exception):
    """The endpoint refused the request: its status and the start of its body."""


@dataclass(frozen=True)
class ChatText:
    text: str
    type: str = "text"


@dataclass(frozen=True)
class ChatUsage:
    input_tokens: int
    output_tokens: int


@dataclass(frozen=True)
class ChatReply:
    """The fields of a Message the streamed path reads."""

    content: list[ChatText]
    stop_reason: str | None
    usage: ChatUsage


def chat_content(content: object) -> object:
    """One turn's content: a string as it is, Messages blocks as chat parts."""
    if isinstance(content, str):
        return content
    parts: list[dict[str, object]] = []
    for block in content if isinstance(content, Sequence) else []:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text":
            parts.append({"type": "text", "text": block["text"]})
        elif block.get("type") == "image":
            source = block["source"]
            url = f"data:{source['media_type']};base64,{source['data']}"
            parts.append({"type": "image_url", "image_url": {"url": url}})
        else:
            raise ValueError(f"no chat counterpart for a {block.get('type')!r} block")
    return parts


def chat_body(
    *,
    model: str,
    max_tokens: int,
    system: str,
    messages: Sequence[dict[str, object]],
    thinking: dict[str, object] | None = None,
    **_dropped: object,
) -> dict[str, object]:
    """The chat completions request for a `messages.stream(...)` call."""
    body: dict[str, object] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            *({"role": m["role"], "content": chat_content(m["content"])} for m in messages),
        ],
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    if thinking is not None:
        enabled = thinking.get("type") == "enabled"
        body["enable_thinking"] = enabled
        if enabled and "budget_tokens" in thinking:
            body["thinking_budget"] = thinking["budget_tokens"]
    return body


def reply_of(chunks: Iterable[dict]) -> ChatReply:
    """The streamed chunks as one reply; the reasoning deltas are not part of it."""
    text: list[str] = []
    finish: str | None = None
    usage = ChatUsage(0, 0)
    for chunk in chunks:
        for choice in chunk.get("choices") or []:
            text.append((choice.get("delta") or {}).get("content") or "")
            finish = choice.get("finish_reason") or finish
        if chunk.get("usage"):
            u = chunk["usage"]
            usage = ChatUsage(u.get("prompt_tokens", 0), u.get("completion_tokens", 0))
    answer = THINK_BLOCK.sub("", "".join(text)).strip()
    return ChatReply([ChatText(answer)], STOP_REASONS.get(finish or "", finish), usage)


def chunks_of(lines: Iterable[str]) -> list[dict]:
    """The JSON chunks of a server-sent event stream, up to `[DONE]`."""
    out: list[dict] = []
    for line in lines:
        if not line.startswith("data:"):
            continue
        data = line[len("data:") :].strip()
        if data == "[DONE]":
            break
        out.append(json.loads(data))
    return out


class ChatStream:
    """One streamed request, used as `async with … as stream`."""

    def __init__(self, http: httpx.AsyncClient, body: dict[str, object]) -> None:
        self._http = http
        self._body = body

    async def __aenter__(self) -> "ChatStream":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def get_final_message(self) -> ChatReply:
        async with self._http.stream("POST", "/chat/completions", json=self._body) as response:
            if response.status_code >= 400:
                body = (await response.aread()).decode(errors="replace")
                raise ChatCompletionsError(f"{response.status_code}: {body[:300]}")
            lines = [line async for line in response.aiter_lines()]
        return reply_of(chunks_of(lines))


class ChatMessages:
    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http

    def stream(self, **kwargs: object) -> ChatStream:
        return ChatStream(self._http, chat_body(**kwargs))  # type: ignore[arg-type]


class ChatCompletionsClient:
    """Stands in for `AsyncAnthropic` on the streamed structured path only."""

    def __init__(
        self, api_key: str, base_url: str, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._http = httpx.AsyncClient(
            base_url=base_url,
            transport=transport,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=httpx.Timeout(READ_TIMEOUT_S, connect=10.0),
        )
        self.messages = ChatMessages(self._http)

    async def close(self) -> None:
        await self._http.aclose()
