"""
Structured replies without the API's structured output.

`messages.parse(output_format=…)` is an Anthropic feature; DeepSeek (which
otherwise speaks the same Messages shape) ignores it and answers in prose,
so the SDK's parse raises. The ask graph's two small structured calls —
intent and general — therefore ask for JSON in the prompt and read it back
here: the schema is rendered into the system prompt, and the reply is
parsed leniently (code fences stripped, the first balanced object taken),
because a model that was asked for JSON still sometimes wraps it.

Anything unreadable comes back as None and the caller falls back to its
own default; a graph that cannot read an intent still answers.
"""

import json
from typing import get_args, get_origin

from pydantic import BaseModel, ValidationError


def json_instruction(model: type[BaseModel]) -> str:
    """The lines appended to a system prompt so the reply can be read back."""
    return (
        "\n\nReply with one JSON object and nothing else — no prose around it, no"
        f" code fence:\n{_object(model, 0)}"
    )


def _object(model: type[BaseModel], depth: int) -> str:
    """A model as a JSON skeleton, nested models written out in place."""
    pad = "  " * (depth + 1)
    fields = []
    for name, field in model.model_fields.items():
        described = field.description or ""
        shape = _type_name(field.annotation, depth + 1)
        fields.append(f'{pad}"{name}": {shape}{f"  // {described}" if described else ""}')
    body = "\n".join(fields)
    return f"{{\n{body}\n{'  ' * depth}}}"


def _type_name(annotation: object, depth: int = 0) -> str:
    """A hint the model can act on: the literal's options, a nested object, or the plain type."""
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return _object(annotation, depth)
    args = get_args(annotation)
    if get_origin(annotation) is list and args:
        item = args[0]
        if isinstance(item, type) and issubclass(item, BaseModel):
            return f"[{_object(item, depth)}, …]"
        return f"[{_type_name(item, depth)}, …]"
    text = str(annotation)
    if "Literal" in text:
        options = text[text.index("[") + 1 : text.rindex("]")]
        return f"one of {options}"
    optional = "None" in text
    if "bool" in text:
        shape = "true or false"
    elif "int" in text or "float" in text:
        shape = "number"
    else:
        shape = '"…"'
    return f"{shape} or null" if optional else shape


def parse_json_reply[M: BaseModel](text: str, model: type[M]) -> M | None:
    """The model's JSON, however it wrapped it; None when nothing valid is in there."""
    block = _first_object(text)
    if block is None:
        return None
    try:
        return model.model_validate(json.loads(block))
    except (json.JSONDecodeError, ValidationError):
        return None


def _first_object(text: str) -> str | None:
    """The first balanced {...} in the text, ignoring braces inside strings."""
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    in_string = False
    escaped = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None
