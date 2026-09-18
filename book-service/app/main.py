"""
The book-import service: textbook PDF → chapters → practice drafts → chapter Q&A.

One thin FastAPI process beside the Next.js app. Next.js proxies `/api/books/*`
here with the player's Supabase session token; this service verifies it, reads
and writes its own tables directly, and never touches anything else in the
database. See the epic (#200) for why it is a separate runtime at all.
"""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from anthropic import AsyncAnthropic
from fastapi import FastAPI

from app.auth import CurrentUser, build_verifier
from app.books import router as books_router
from app.config import Settings, get_settings
from app.db import close_pool, fail_stale_scans, open_pool
from app.ingest.model import AnthropicTextTocReader
from app.ingest.pdf import OcrConfig
from app.ingest.toc import TextTocReader
from app.repo import BookRepo
from app.scan import Scanner
from app.storage import StorageClient

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
        app.state.storage = None
        app.state.scanner = None
        if settings.database_url is not None:
            try:
                app.state.pool = await open_pool(settings.database_url)
                await fail_stale_scans(app.state.pool)
            except Exception:
                # Boot anyway: /health still answers, and the book routes report
                # the missing database as a 503 rather than the container flapping.
                log.exception("database unavailable at startup")
                app.state.pool = None
        if settings.supabase_anon_key is not None:
            app.state.storage = StorageClient(settings.storage_url, settings.supabase_anon_key)
        if app.state.pool is not None and app.state.storage is not None:
            app.state.scanner = Scanner(
                storage=app.state.storage,
                store=BookRepo(app.state.pool),
                ocr=ocr_config(settings),
                read_text_toc=text_toc_reader(settings),
                read_vision_toc=None,  # lands with the page rendering work in #202
                worker=asyncio.Semaphore(1),
            )
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

    app.include_router(books_router)
    return app


def ocr_config(settings: Settings) -> OcrConfig | None:
    """OCR only when every configured language file is present; else say so once."""
    if settings.tessdata_prefix is None:
        log.warning("TESSDATA_PREFIX unset: scanned uploads will not be OCR'd")
        return None
    config = OcrConfig(Path(settings.tessdata_prefix), languages=settings.ocr_languages)
    if missing := config.missing_languages():
        log.warning("OCR disabled: missing %s under %s", ", ".join(missing), config.tessdata)
        return None
    return config


def text_toc_reader(settings: Settings) -> TextTocReader | None:
    """The one model call, when there is a key for it."""
    if settings.anthropic_api_key is None:
        log.warning("ANTHROPIC_API_KEY unset: unbookmarked books will get manual chapters")
        return None
    return AnthropicTextTocReader(AsyncAnthropic(api_key=settings.anthropic_api_key))
