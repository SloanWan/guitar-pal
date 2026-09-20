"""
The whole-book pass (#201): what runs at upload, once, without vision.

  pdf.py   the PyMuPDF boundary — outline, text layer, page rendering
  tag.py   the `may_have_exercise` rules over a page's text
  toc.py   chapters: outline → text TOC → vision TOC → manual, pure logic
  model.py the one model call the text-TOC step makes

Everything except `model.py` is pure and runs in the tests without a network.
"""
