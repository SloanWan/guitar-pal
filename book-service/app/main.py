"""
The book-import service: textbook PDF → chapters → practice drafts → chapter Q&A.

One thin FastAPI process beside the Next.js app. Next.js proxies `/api/books/*`
here with the player's Supabase session token; this service verifies it, reads
and writes its own tables directly, and never touches anything else in the
database. See the epic (#200) for why it is a separate runtime at all.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.auth import CurrentUser, build_verifier
from app.config import Settings, get_settings
from app.db import close_pool, fail_stale_scans, open_pool

log = logging.getLogger("book-service")


def create_app(settings: Settings | None = None) -> FastAPI:
    """
    App factory: `uvicorn app.main:create_app --factory`. A test builds one
    against its own settings, and importing this module reads no environment.
    """
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.verifier = build_verifier(settings)
        app.state.pool = None
        if settings.database_url is not None:
            try:
                app.state.pool = await open_pool(settings.database_url)
                await fail_stale_scans(app.state.pool)
            except Exception:
                # Boot anyway: /health still answers, and the book routes report
                # the missing database as a 503 rather than the container flapping.
                log.exception("database unavailable at startup")
                app.state.pool = None
        try:
            yield
        finally:
            await close_pool(app)

    app = FastAPI(title="guitar-pal book service", lifespan=lifespan)

    @app.get("/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/me")
    async def me(user_id: CurrentUser) -> dict[str, str]:
        """Echoes the verified user id; what the proxy wiring is checked against."""
        return {"user_id": user_id}

    return app
