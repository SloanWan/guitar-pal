"""parse_warnings on book_chapters

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-19

What a parse could not turn into a draft (#202, decision 5): a draft the
validator rejected twice, a page the extractor does not read. The card
shows these inline next to the drafts it did get, so a chapter with two
drafts and one dropped says so.
"""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        alter table public.book_chapters
          add column if not exists parse_warnings jsonb not null default '[]'::jsonb;
        """
    )


def downgrade() -> None:
    op.execute("alter table public.book_chapters drop column if exists parse_warnings;")
