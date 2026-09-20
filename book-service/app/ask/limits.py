"""
A sliding-window limit per player on the ask endpoint — the same numbers
as the Next.js assistant route (40 an hour), and the same caveat: it is
in-process, so the real ceiling is this times the instance count. Fine
behind a verified session; not a substitute for one.
"""

import time
from collections import defaultdict
from dataclasses import dataclass, field

ASK_LIMIT = 40
ASK_WINDOW_SECONDS = 3600.0


@dataclass
class SlidingWindowLimiter:
    limit: int = ASK_LIMIT
    window: float = ASK_WINDOW_SECONDS
    _hits: dict[str, list[float]] = field(default_factory=lambda: defaultdict(list))

    def check(self, key: str, now: float | None = None) -> tuple[bool, int]:
        """(allowed, seconds until the next one would be) — records the attempt when allowed."""
        now = time.monotonic() if now is None else now
        cutoff = now - self.window
        recent = [t for t in self._hits[key] if t > cutoff]
        if len(recent) >= self.limit:
            self._hits[key] = recent
            return False, int(recent[0] - cutoff) + 1
        recent.append(now)
        self._hits[key] = recent
        return True, 0
