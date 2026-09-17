"""
The one asyncpg pool, and the housekeeping that runs against it at startup.

Plain SQL throughout: a handful of tables, no ORM. The pool is created on first
use rather than at import, so the tests and a `/health` probe never need a
database, and closed by the app's lifespan.
"""

import logging

import asyncpg
from fastapi import FastAPI, HTTPException, Request

log = logging.getLogger("book-service")

STALE_SCAN_MESSAGE = "The service restarted while this book was being scanned. Upload it again."


async def open_pool(database_url: str) -> asyncpg.Pool:
    return await asyncpg.create_pool(
        database_url,
        min_size=1,
        max_size=5,
        # Supabase's pooler runs in transaction mode, where server-side prepared
        # statements outlive the transaction they were made in and collide.
        statement_cache_size=0,
    )


async def get_pool(request: Request) -> asyncpg.Pool:
    """FastAPI dependency. 503 when the deployment has no database wired."""
    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(
            status_code=503,
            detail="Book import is not configured on this deployment (no database).",
        )
    return pool


async def fail_stale_scans(pool: asyncpg.Pool) -> int:
    """
    A scan runs as a background task inside this process, so a restart in the
    middle of one leaves its book in `scanning` with nothing left to finish it.
    Every such row is failed here, with a message the player can act on, rather
    than left spinning until someone notices.
    """
    result = await pool.execute(
        """
        update user_books
           set status = 'failed', error = $1
         where status = 'scanning'
        """,
        STALE_SCAN_MESSAGE,
    )
    # asyncpg reports the command tag, e.g. "UPDATE 2".
    count = int(result.rsplit(" ", 1)[-1])
    if count:
        log.warning("failed %d scan(s) left over from a previous process", count)
    return count


async def close_pool(app: FastAPI) -> None:
    pool = getattr(app.state, "pool", None)
    if pool is not None:
        await pool.close()
        app.state.pool = None
