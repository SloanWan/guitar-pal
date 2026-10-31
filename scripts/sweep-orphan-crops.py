"""
One-off sweep of the `books` bucket for folders nothing points at (#246).

Before the rescan/re-parse sweeps landed, a rescan left the old chapters'
crop folders behind and a re-parse left the crops of exercises it no longer
found. This lists `<user>/crops/*` and `<user>/pages/*` for one player and
removes the folders whose chapter or book is not in the database any more.

Dry-run by default: it prints what it would remove. `--delete` removes.

    cd book-service && set -a && . ../.env.local && set +a
    .venv/bin/python ../scripts/sweep-orphan-crops.py --token <session jwt>
    .venv/bin/python ../scripts/sweep-orphan-crops.py --token <session jwt> --delete

The token is the player's own Supabase session (the bucket's policies only
let a player list and delete under their own folder); the user id is read
from it. Needs `BOOK_SERVICE_DATABASE_URL` for the chapter and book ids,
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for Storage.
Run from `book-service/` with its venv, so `app` imports.
"""

import argparse
import asyncio
import posixpath
import sys

import asyncpg
import jwt

from app.config import get_settings
from app.storage import StorageClient


async def orphan_folders(
    storage: StorageClient, pool: asyncpg.Pool, user_id: str, token: str
) -> list[str]:
    chapter_ids = {
        str(r["id"])
        for r in await pool.fetch(
            """
            select c.id from book_chapters c
              join user_books b on b.id = c.book_id
             where b.user_id = $1
            """,
            user_id,
        )
    }
    book_ids = {
        str(r["id"])
        for r in await pool.fetch("select id from user_books where user_id = $1", user_id)
    }
    orphans: list[str] = []
    for folder in await storage.list_folders(f"{user_id}/crops", token):
        if posixpath.basename(folder) not in chapter_ids:
            orphans.append(folder)
    for folder in await storage.list_folders(f"{user_id}/pages", token):
        if posixpath.basename(folder) not in book_ids:
            orphans.append(folder)
    return orphans


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--token", required=True, help="the player's Supabase session JWT")
    parser.add_argument("--delete", action="store_true", help="remove the orphans (default: list)")
    args = parser.parse_args()

    settings = get_settings()
    if settings.database_url is None or settings.supabase_anon_key is None:
        print("BOOK_SERVICE_DATABASE_URL and the Supabase anon key are needed", file=sys.stderr)
        return 2
    user_id = str(jwt.decode(args.token, options={"verify_signature": False})["sub"])
    storage = StorageClient(settings.storage_url, settings.supabase_anon_key)
    pool = await asyncpg.create_pool(settings.database_url, statement_cache_size=0)
    try:
        orphans = await orphan_folders(storage, pool, user_id, args.token)
        if not orphans:
            print("nothing to sweep")
            return 0
        for folder in orphans:
            objects = await storage.list_objects(folder, args.token)
            if args.delete:
                removed = await storage.remove_tree(folder, args.token)
                print(f"removed {removed:4d}  {folder}")
            else:
                print(f"would remove {len(objects):4d}  {folder}")
        if not args.delete:
            print(f"\n{len(orphans)} folder(s); run again with --delete to remove them")
    finally:
        await pool.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
