"""book_pages.text_source

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-17

Where a page's text came from: the PDF's own layer, OCR over a scan, or
nowhere. `has_text_layer` stays — it is what the chapter parse (#202) reads
to decide that a page needs vision regardless of what the tag rules said;
`text_source` is what the Q&A side (#203) reads to weigh a chunk, since OCR
text carries character errors the layer does not.
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        alter table public.book_pages
          add column if not exists text_source text not null default 'none'
            check (text_source in ('layer', 'ocr', 'none'));
        update public.book_pages set text_source = 'layer' where has_text_layer;
        """
    )


def downgrade() -> None:
    op.execute("alter table public.book_pages drop column if exists text_source;")
