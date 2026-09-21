"""image_path on book_pages

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-20

Where a page's render lives in Storage once someone asked to see it (#240):
the page beside the book, rendered on the first request and kept, so the
next look — or the next player — costs a signed URL and nothing else.
"""

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        alter table public.book_pages
          add column if not exists image_path text null;
        """
    )


def downgrade() -> None:
    op.execute("alter table public.book_pages drop column if exists image_path;")
