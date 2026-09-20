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
from app.ingest.model import AnthropicTextTocReader, AnthropicVisionTocReader
from app.ingest.pdf import OcrConfig
from app.pages import PageImages
from app.parse import ChapterGraph, Parser, text_only_graph
from app.repo import BookRepo
from app.scan import Scanner
from app.storage import StorageClient
from app.validate import ValidatorClient

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
        app.state.parser = None
        app.state.pages = None
        app.state.validator = validator_client(settings)
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
            client = model_client(settings)
            repo = BookRepo(app.state.pool)
            # One core's worth of PyMuPDF/Tesseract work at a time, scans and parses alike.
            worker = asyncio.Semaphore(1)
            app.state.scanner = Scanner(
                storage=app.state.storage,
                store=repo,
                ocr=ocr_config(settings),
                read_text_toc=AnthropicTextTocReader(client) if client else None,
                read_vision_toc=AnthropicVisionTocReader(client) if client else None,
                worker=worker,
            )
            app.state.parser = Parser(
                storage=app.state.storage,
                store=repo,
                graph=chapter_graph(client, app.state.validator),
                worker=worker,
            )
            app.state.pages = PageImages(storage=app.state.storage, repo=repo, worker=worker)
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


def model_client(settings: Settings) -> AsyncAnthropic | None:
    """One SDK client for every model call, when there is a key for it."""
    if settings.anthropic_api_key is None:
        log.warning(
            "ANTHROPIC_API_KEY unset: unbookmarked books get manual chapters,"
            " chapter parses produce text chunks only"
        )
        return None
    return AsyncAnthropic(api_key=settings.anthropic_api_key)


def validator_client(settings: Settings) -> ValidatorClient | None:
    """Where drafts are validated; without it the extractors (B4/B5) cannot run."""
    if settings.validate_url is None or settings.internal_secret is None:
        log.warning(
            "BOOK_SERVICE_VALIDATE_URL / BOOK_SERVICE_INTERNAL_SECRET unset:"
            " chapter parses will produce notes but no drafts"
        )
        return None
    return ValidatorClient(settings.validate_url, settings.internal_secret)


def chapter_graph(client: AsyncAnthropic | None, validator: ValidatorClient | None) -> ChapterGraph:
    """The parse graph when there is a model to run it with; the text-only pass otherwise."""
    if client is None:
        return text_only_graph
    from app.graph import build_chapter_graph

    return build_chapter_graph(client, validator)
