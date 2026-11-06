"""
A small structured call, whichever provider is behind it.

Anthropic is sent the schema as `output_config.format` and its reply is
validated here — not by `messages.parse`, which validates inside the call
and raises on a reply cut off at max_tokens (a looping reply did that once,
#385), taking the call's usage and, in the chapter graph, the whole parse
with it. DeepSeek ignores the format and answers in prose, so there the
schema is asked for in the prompt and read back by `json_out`. Both paths
return the model or None, with the call's usage either way — a graph that
cannot read an intent still answers.
"""

import logging
from collections.abc import Sequence

from anthropic import transform_schema
from pydantic import BaseModel, ValidationError

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
        config = {
            **provider.config(effort),
            "format": {"type": "json_schema", "schema": transform_schema(output)},
        }
        response = await provider.client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,  # type: ignore[arg-type]
            output_config=config,  # type: ignore[arg-type]
        )
        text = "".join(getattr(block, "text", "") for block in response.content)
        parsed: M | None = None
        if response.stop_reason == "end_turn":
            try:
                parsed = output.model_validate_json(text)
            except ValidationError:
                pass
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

    # Streamed: a reasoning model can think for minutes before its first word,
    # and a request that sends nothing back that long gets its connection cut.
    async with provider.client.messages.stream(
        model=model,
        max_tokens=max_tokens + provider.thinking_tokens,
        system=system + json_instruction(output),
        messages=messages,  # type: ignore[arg-type]
        output_config=provider.config(effort),  # type: ignore[arg-type]
        **thinking_param(provider),
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


def thinking_param(provider: Provider) -> dict[str, object]:
    """The `thinking` field a streamed call sends: none when the model is left to its default."""
    if provider.thinking is None:
        return {}
    if not provider.thinking:
        return {"thinking": {"type": "disabled"}}
    return {"thinking": {"type": "enabled", "budget_tokens": provider.thinking_tokens}}
