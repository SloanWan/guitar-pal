"""user_books, book_chapters, book_pages

Revision ID: 0001
Revises:
Create Date: 2026-09-17

The whole-book pass (#201) writes these; the chapter parse (#202) and chapter
Q&A (#203) read them. Shape:

  * `user_books` is one uploaded PDF. `status` is the scan's state machine,
    `toc_source` records which of the chapter-finding steps produced the
    chapters (so the UI can say "found from bookmarks" vs "you drew these").
  * `book_chapters` is a flat list per book: sections are chapters. The
    parse unit is the page range.
  * `book_pages` holds the text layer per page plus the `may_have_exercise`
    tag the rules set; the text is what #203 chunks.

Security shape (reviewed against the CLAUDE.md constraints):

  * Only the `book_service` role touches these tables, over a direct
    connection, and it filters by `user_id` from the verified JWT on every
    query — that is the ownership check, not RLS.
  * RLS is still enabled with a single policy for `book_service`, and the
    default grants Supabase gives `anon` / `authenticated` on new public
    tables are revoked, so the browser's PostgREST path sees nothing at all.
    A future policy mistake on the API side therefore exposes nothing here.
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

TABLES = ("user_books", "book_chapters", "book_pages")


def upgrade() -> None:
    op.execute(
        """
        create table if not exists public.user_books (
          id                  uuid primary key default gen_random_uuid(),
          user_id             uuid not null references auth.users (id) on delete cascade,
          title               text not null check (char_length(title) <= 200),
          page_count          integer,
          storage_path        text not null,
          status              text not null default 'uploaded'
                              check (status in ('uploaded', 'scanning', 'ready', 'failed')),
          toc_source          text
                              check (toc_source in ('outline', 'text', 'vision', 'manual')),
          error               text,
          created_at          timestamptz not null default now()
        );

        create index if not exists user_books_owner_idx
          on public.user_books (user_id, created_at desc);

        create table if not exists public.book_chapters (
          id                  uuid primary key default gen_random_uuid(),
          book_id             uuid not null references public.user_books (id) on delete cascade,
          index               smallint not null,
          title               text not null check (char_length(title) <= 200),
          page_start          integer not null check (page_start >= 1),
          page_end            integer not null check (page_end >= page_start),
          exercise_hint_count integer not null default 0,
          parsed_at           timestamptz,
          unique (book_id, index)
        );

        create table if not exists public.book_pages (
          book_id             uuid not null references public.user_books (id) on delete cascade,
          page                integer not null check (page >= 1),
          has_text_layer      boolean not null,
          may_have_exercise   boolean not null default false,
          text                text not null default '',
          primary key (book_id, page)
        );
        """
    )

    for table in TABLES:
        op.execute(
            f"""
            revoke all on table public.{table} from anon, authenticated;
            grant select, insert, update, delete on table public.{table} to book_service;
            alter table public.{table} enable row level security;
            drop policy if exists "book_service owns the rows" on public.{table};
            create policy "book_service owns the rows"
              on public.{table}
              to book_service
              using (true)
              with check (true);
            """
        )

    op.execute(
        """
        comment on table public.user_books is
          'One uploaded textbook PDF per row; private to user_id, served only by book-service.';
        comment on table public.book_chapters is
          'Flat chapter list per book: a title and a page range, the unit the parse runs on.';
        comment on table public.book_pages is
          'Per-page text layer and the may_have_exercise tag from the whole-book pass.';
        """
    )


def downgrade() -> None:
    for table in reversed(TABLES):
        op.execute(f"drop table if exists public.{table} cascade;")
