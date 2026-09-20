"""The validator client against a recorded endpoint: what it sends, what it makes of the answers."""

import httpx
import pytest

from app.validate import ValidatorClient, ValidatorError

SECRET = "s3cret"


def _client(handler) -> ValidatorClient:
    return ValidatorClient("http://web:3000/", SECRET, transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_strum_request_and_verdict() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["secret"] = request.headers.get("x-internal-secret")
        seen["body"] = request.read()
        return httpx.Response(
            200,
            json={
                "ok": True,
                "errors": [],
                "warnings": [{"code": "RHYTHM_PADDED", "path": "rhythm"}],
            },
        )

    verdict = await _client(handler).strum("D U", beats_per_bar=4)
    assert seen["url"] == "http://web:3000/api/internal/validate"
    assert seen["secret"] == SECRET
    assert seen["body"] == b'{"kind":"strum","rhythm":"D U","beatsPerBar":4}'
    assert verdict.ok and verdict.warnings[0]["code"] == "RHYTHM_PADDED" and verdict.pattern is None


@pytest.mark.asyncio
async def test_tab_verdict_carries_the_pattern() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert b'"kind":"tab"' in request.read()
        return httpx.Response(
            200, json={"ok": True, "errors": [], "warnings": [], "pattern": {"measures": []}}
        )

    verdict = await _client(handler).tab({"measures": []})
    assert verdict.ok and verdict.pattern == {"measures": []}


@pytest.mark.asyncio
async def test_failures_are_errors_not_verdicts() -> None:
    async def run(status: int, body: object) -> None:
        with pytest.raises(ValidatorError):
            await _client(lambda r: httpx.Response(status, json=body)).strum("D")

    await run(401, {"error": "Not authorized."})
    await run(200, {"nope": True})

    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    with pytest.raises(ValidatorError, match="unreachable"):
        await _client(down).strum("D")
