"""
Backfill the retrieval columns on `book_chunks` (#203, migration 0007).

Chunks written before 0007 have no `tsv`; this fills it from the service's
own tokenisation (`app/ask/lexical.py`) so the `lexical` strategy can find
them. With `--embed` and a `VOYAGE_API_KEY`, chunks without an `embedding`
are embedded too, for `rag`. Idempotent: only null columns are written.

    cd book-service && set -a && . ../.env.local && set +a
    .venv/bin/python scripts/backfill_chunks.py            # tsv only
    .venv/bin/python scripts/backfill_chunks.py --embed    # and embeddings

Needs `BOOK_SERVICE_DATABASE_URL`. A one-off for existing rows; new parses
write tsv themselves, and embeddings once the service embeds on parse.
"""

import argparse
import asyncio
import sys

import asyncpg

from app.ask.lexical import lexical_text
from app.ask.strategies.embeddings import VoyageEmbedder
from app.config import get_settings


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--embed", action="store_true", help="also embed chunks lacking a vector")
    args = parser.parse_args()
    settings = get_settings()
    if settings.database_url is None:
        print("BOOK_SERVICE_DATABASE_URL is needed", file=sys.stderr)
        return 2
    pool = await asyncpg.create_pool(settings.database_url, statement_cache_size=0)
    try:
        rows = await pool.fetch("select id, text from book_chunks where tsv is null")
        await pool.executemany(
            "update book_chunks set tsv = to_tsvector('simple', $2) where id = $1",
            [(r["id"], lexical_text(r["text"])) for r in rows],
        )
        print(f"tsv: {len(rows)} chunk(s) filled")
        if not args.embed:
            return 0
        if settings.voyage_api_key is None:
            print("--embed needs VOYAGE_API_KEY", file=sys.stderr)
            return 2
        embedder = VoyageEmbedder(
            settings.voyage_api_key, settings.embedding_model, settings.embedding_dimension
        )
        rows = await pool.fetch("select id, text from book_chunks where embedding is null")
        vectors = await embedder.embed_documents([r["text"] for r in rows])
        await pool.executemany(
            "update book_chunks set embedding = $2::vector where id = $1",
            [
                (r["id"], "[" + ",".join(repr(x) for x in v) + "]")
                for r, v in zip(rows, vectors, strict=True)
            ],
        )
        print(f"embedding: {len(rows)} chunk(s) embedded with {embedder.model}")
    finally:
        await pool.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
