"""book_notes, book_exercises, book_chunks; parse state on book_chapters

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-18

The chapter parse (#202) writes these. Per chapter: what it teaches
(`book_notes`, shown as cards), what it asks you to play (`book_exercises`,
drafts that open in an editor), and its text in retrieval-sized pieces
(`book_chunks`, which #203 extends). The parse itself is a state machine on
the chapter, like the scan is on the book, with its cost recorded so a
re-parse can say what it will spend.

Same security shape as 0001: only `book_service` reaches these tables, and
it does so through the chapter → book → user_id chain on every query.
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

TABLES = ("book_notes", "book_exercises", "book_chunks")


def upgrade() -> None:
    op.execute(
        """
        alter table public.book_chapters
          add column if not exists parse_status text not null default 'idle'
            check (parse_status in ('idle', 'parsing', 'ready', 'failed')),
          add column if not exists parse_error text,
          add column if not exists parse_input_tokens integer not null default 0,
          add column if not exists parse_output_tokens integer not null default 0,
          add column if not exists parse_cost_usd numeric(8, 4) not null default 0;

        create table if not exists public.book_notes (
          id          uuid primary key default gen_random_uuid(),
          chapter_id  uuid not null references public.book_chapters (id) on delete cascade,
          index       smallint not null,
          title       text not null check (char_length(title) <= 200),
          body        text not null,
          pages       integer[] not null default '{}',
          draft_ids   uuid[] not null default '{}',
          created_at  timestamptz not null default now(),
          unique (chapter_id, index)
        );

        create table if not exists public.book_exercises (
          id          uuid primary key default gen_random_uuid(),
          chapter_id  uuid not null references public.book_chapters (id) on delete cascade,
          page        integer not null check (page >= 1),
          kind        text not null
                      check (kind in ('strum', 'progression', 'tab', 'chord_diagram')),
          source      text not null check (source in ('literal', 'derived')),
          draft       jsonb not null,
          warnings    jsonb not null default '[]'::jsonb,
          crop_path   text,
          status      text not null default 'proposed'
                      check (status in ('proposed', 'taken', 'dismissed')),
          created_at  timestamptz not null default now()
        );

        create index if not exists book_exercises_chapter_idx
          on public.book_exercises (chapter_id, page);

        create table if not exists public.book_chunks (
          id          uuid primary key default gen_random_uuid(),
          chapter_id  uuid not null references public.book_chapters (id) on delete cascade,
          page        integer not null check (page >= 1),
          index       smallint not null,
          text        text not null,
          unique (chapter_id, page, index)
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
        comment on table public.book_notes is
          'Knowledge points a chapter parse read from the chapter text; shown as cards.';
        comment on table public.book_exercises is
          'Practice drafts from a chapter parse: literal off the page, or derived by the model.';
        comment on table public.book_chunks is
          'Chapter text in retrieval-sized pieces; #203 adds what its retrieval needs.';
        """
    )


def downgrade() -> None:
    for table in reversed(TABLES):
        op.execute(f"drop table if exists public.{table} cascade;")
    op.execute(
        """
        alter table public.book_chapters
          drop column if exists parse_status,
          drop column if exists parse_error,
          drop column if exists parse_input_tokens,
          drop column if exists parse_output_tokens,
          drop column if exists parse_cost_usd;
        """
    )
