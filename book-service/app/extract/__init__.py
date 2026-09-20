"""
The type-specific extractors of the chapter parse (#202): each turns one
classified page (or region of a page) into practice drafts the site can
play. `tab.py` (B5) reads tablature; strum (B4) and chord diagrams (B7)
follow. The model reads; the app decides what is playable, through the
one validator on the Next.js side (`app/validate.py`).
"""
