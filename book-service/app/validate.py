"""
The one validator, called: `POST /api/internal/validate` on the Next.js
side runs `parseRhythm` for strum rhythms and the `tabImport` chain for
tabs and answers `{ok, errors, warnings, pattern?}`. This service never
re-implements those rules; an extractor sends its draft here, and on a
failure sends the errors back to the model once (the repair loop).
"""

from dataclasses import dataclass, field
from typing import Literal

import httpx


class ValidatorError(Exception):
    """The validator could not be reached or answered outside its contract."""


@dataclass(frozen=True)
class Verdict:
    ok: bool
    errors: list[dict[str, object]] = field(default_factory=list)
    warnings: list[dict[str, object]] = field(default_factory=list)
    # The tab as the editor holds it, when a tab draft validated.
    pattern: dict[str, object] | None = None


@dataclass(frozen=True)
class ValidatorClient:
    base_url: str
    secret: str
    transport: httpx.AsyncBaseTransport | None = None

    async def strum(self, rhythm: str, beats_per_bar: int | None = None) -> Verdict:
        body: dict[str, object] = {"kind": "strum", "rhythm": rhythm}
        if beats_per_bar is not None:
            body["beatsPerBar"] = beats_per_bar
        return await self._post(body)

    async def tab(
        self, draft: dict[str, object], repeats: list[dict[str, object]] | None = None
    ) -> Verdict:
        body: dict[str, object] = {"kind": "tab", "draft": draft}
        if repeats:
            body["repeats"] = repeats
        return await self._post(body)

    async def _post(self, body: dict[str, object]) -> Verdict:
        url = f"{self.base_url.rstrip('/')}/api/internal/validate"
        try:
            # An internal address on the compose network: never through a system proxy.
            async with httpx.AsyncClient(
                transport=self.transport, timeout=20.0, trust_env=False
            ) as client:
                response = await client.post(
                    url, json=body, headers={"x-internal-secret": self.secret}
                )
        except httpx.HTTPError as e:
            raise ValidatorError(f"validator unreachable: {e}") from e
        if response.status_code != 200:
            raise ValidatorError(
                f"validator answered {response.status_code}: {response.text[:200]}"
            )
        data = response.json()
        if not isinstance(data, dict) or not isinstance(data.get("ok"), bool):
            raise ValidatorError("validator answered outside its contract")
        return Verdict(
            ok=data["ok"],
            errors=list(data.get("errors", [])),
            warnings=list(data.get("warnings", [])),
            pattern=data.get("pattern"),
        )


ValidateKind = Literal["strum", "tab"]
