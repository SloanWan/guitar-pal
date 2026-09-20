"""user_books.scanned_pages

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-18

A scan OCRs a page every couple of seconds, so a 300-page scan runs for
minutes; this is what the status poll shows moving.
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        alter table public.user_books
          add column if not exists scanned_pages integer not null default 0
            check (scanned_pages >= 0);
        """
    )


def downgrade() -> None:
    op.execute("alter table public.user_books drop column if exists scanned_pages;")
