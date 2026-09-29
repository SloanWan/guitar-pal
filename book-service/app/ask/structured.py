"""
A small structured call, whichever provider is behind it.

Anthropic returns the schema through `messages.parse(output_format=…)`;
DeepSeek ignores that parameter and answers in prose, so there the schema
is asked for in the prompt and read back by `json_out`. Both paths return
the model or None — a graph that cannot read an intent still answers.
"""

import logging
from collections.abc import Sequence

from pydantic import BaseModel

from app.ask.json_out import json_instruction, parse_json_reply
from app.ask.provider import Provider
from app.ingest.model import CallUsage, usage_of

log = logging.getLogger("book-service")


async def structured_call[M: BaseModel](
    provider: Provider,
    *,
    system: str,
    messages: Sequence[dict[str, object]],
    output: type[M],
    max_tokens: int,
    effort: str | None = None,
    small: bool = False,
) -> tuple[M | None, CallUsage]:
    model = provider.small_model if small else provider.model
    if provider.structured_output:
        response = await provider.client.messages.parse(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,  # type: ignore[arg-type]
            output_format=output,
            output_config=provider.config(effort),  # type: ignore[arg-type]
        )
        parsed = response.parsed_output if response.stop_reason == "end_turn" else None
        return parsed, usage_of(response, model)

    # Streamed: a reasoning model can think for minutes before its first word,
    # and a request that sends nothing back that long gets its connection cut.
    async with provider.client.messages.stream(
        model=model,
        max_tokens=max_tokens + provider.thinking_tokens,
        system=system + json_instruction(output),
        messages=messages,  # type: ignore[arg-type]
        output_config=provider.config(effort),  # type: ignore[arg-type]
    ) as stream:
        response = await stream.get_final_message()
    text = "".join(getattr(block, "text", "") for block in response.content)
    parsed = parse_json_reply(text, output)
    if parsed is None:
        log.warning(
            "%s: %s did not answer as %s (stop=%s): %r",
            provider.name,
            model,
            output.__name__,
            response.stop_reason,
            text[:160],
        )
    return parsed, usage_of(response, model)
