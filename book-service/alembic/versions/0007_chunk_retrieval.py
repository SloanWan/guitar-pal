"""retrieval columns on book_chunks: tsv for lexical search, embedding for rag

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-21

Chapter Q&A (#203) reads the chunks the parse wrote. The `lexical` strategy
searches `tsv`, a tsvector the service fills from its own tokenisation (CJK
bigrams — Postgres's `simple` config cannot split Chinese; see
app/ask/lexical.py), so it is a plain column, not a generated one: the
generated form would tokenise the raw text and find nothing. The `rag`
strategy searches `embedding`, a pgvector column sized for the model in
`BOOK_EMBEDDING_DIMENSION` (1024, Voyage's default); it stays null until an
embedding key is configured.

`finish_parse` writes `tsv` for every chunk it inserts, so this revision is
required before any parse runs against a database that has 0004. Chunks
written before it get their column from `scripts/backfill_chunks.py`.
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

EMBEDDING_DIMENSION = 1024


def upgrade() -> None:
    op.execute("create extension if not exists vector;")
    op.execute(
        f"""
        alter table public.book_chunks
          add column if not exists tsv tsvector,
          add column if not exists embedding vector({EMBEDDING_DIMENSION});

        create index if not exists book_chunks_tsv_idx
          on public.book_chunks using gin (tsv);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        drop index if exists public.book_chunks_tsv_idx;
        alter table public.book_chunks
          drop column if exists tsv,
          drop column if exists embedding;
        """
    )
