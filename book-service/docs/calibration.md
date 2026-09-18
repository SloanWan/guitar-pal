# Calibration log — the whole-book pass (#201)

Numbers from running the ingest code on real books, kept so the next decision
starts from data rather than memory. No book text here: the books are
copyrighted and live outside git (`materials/`, and the full copies on the
developer's machine). Reproduce any row with `python -m app.ingest <pdf> …`.

Books used:

| id | what | pages | text layer | bookmarks | contents page |
|---|---|---|---|---|---|
| **EN-full** | typeset English chord & songwriting book | 43 | yes | none | yes, **no page numbers** |
| **EN-9** | its chapter 3 opener + seven key sheets (`materials/`) | 9 | yes | none | no |
| **CN-10** | scanned Chinese method book, chord chapters (`materials/`) | 10 | none | none | no |

Model for every call: `claude-opus-5`, effort `medium`, structured output.
Prices used for estimates: $5 / $25 per MTok in / out.

## 1. Chapter finding on a text PDF

Ground truth for EN-full (chapter opener pages): 4, 11, 24, 41.

| digest | tokens in / out | chapters found | verdict |
|---|---|---|---|
| first 3 lines per page | 6108 / 154 | 4, **12, 25, 42** | every chapter one page late: the opener's title sat under a running header + page number and was cut off |
| first 5 lines per page | 6108 / 154 | 4, 11, 24, 41 | correct |
| first 5 lines, page-number / glyph lines filtered out | **4167 / 87** | 4, 11, 24, 41 | correct, a third cheaper — **current** |

Also observed on EN-full: the running header is a template leftover on four
pages (says chapter 1 inside chapters 2–4). The prompt tells the model the
page body outranks the header; it did.

EN-9 (no contents page, no chapter level in the excerpt): 1525 / 153 tokens,
one chapter p1–9 titled from the opener. Correct. Three later runs of the
same digest through the live A3 flow answered once with that and twice with
"Introduction p1" + "Songwriting Cheat Sheets p2–9" — the model is not
deterministic on where an opener page belongs; both readings are usable.

The issue's original design read the first ~20 pages only. Dropped: with a
contents page that has no page numbers, the starts of chapters 3 and 4 (p24,
p41) are only visible in the page heads.

Cost rule of thumb: ~100 tokens per page of digest, once per upload. A
300-page book is ~30k input tokens ≈ $0.15 on Opus. `claude-sonnet-5` would
be ~2.5x cheaper; not tried — the user decides the model.

## 2. Page tagging (`may_have_exercise`)

EN-full, 23/43 pages tagged. Rules that fired: `keyword` 23, `chord_progression`
14 (all seven major and seven minor key sheets: `C – G – Am – F` and roman
numeral maps). Nine of the keyword-only pages are prose mentioning
"progression(s)", "strumming", "riffs", "fingerpicking" — the generous side
the issue asks for. Rules retired during calibration:

- "practice" — on nearly every prose page ("with practice, the barre …").
- bare "picking" — "picking up the guitar at age 12".
- arrows stacked in a column (`↓` one per line) — a chord map's flow diagram,
  not a strum. Arrows now have to share a line.

**Not calibrated:** stroke notation (`D DU UD`), text-layer tab lines and a
lyric-with-chords page. Neither book has them; the tests carry hand-written
shapes only. A book with a strum-notation page or text-layer tab would settle
these — run `--tags` on it.

## 3. OCR on a scanned book (CN-10)

Tesseract through PyMuPDF's bundled library; language data files only.
Machine: Apple Silicon laptop, single page at a time. Quality proxy: how many
of 27 hand-picked terms from three pages (theory prose, a scale-diagram page,
the chord-change section) appear in the output, and how many of 8 chapter /
section headings.

| data | dpi | s/page | terms found | headings found |
|---|---|---|---|---|
| tessdata_fast `chi_sim+eng` | 120 | 2.1 | 17/27 | 2/8 |
| tessdata_fast `chi_sim+eng` | **150** | **2.5** | **20/27** | **4/8** |
| tessdata_fast `chi_sim+eng` | 170 | 2.7 | 19/27 | 3/8 |
| tessdata_fast `chi_sim+eng` | 200 | 2.5 | 18/27 | 1/8 |
| tessdata_fast `chi_sim+eng` | 300 | 2.6 | 16/27 | 3/8 |
| tessdata_fast `chi_sim` only | 150 | 1.7 | 20/27 | 5/8 |
| tessdata_best `chi_sim+eng` | 150 | 26.0 | 18/27 | 2/8 |
| tessdata_best `chi_sim+eng` | 200 | 28.4 | 19/27 | 2/8 |
| tessdata_best `chi_sim+eng` | 300 | 28.1 | 19/27 | 3/8 |

Read-outs:

- **`best` is 10x slower and no better.** `fast` it is.
- **Higher dpi does not help**; 150 is the sweet spot on this scan.
- `chi_sim` alone is ~30% faster and reads this Chinese book slightly better,
  but a scanned English book needs `eng`. Default stays `chi_sim+eng`;
  `BOOK_SERVICE_OCR_LANGUAGES` overrides per deployment.
- Body prose comes through at roughly 85–90% of characters; wrong characters
  are mostly look-alikes (弦 → 玫 / 玉 / 芒). Good enough for keyword tagging,
  knowledge extraction and Q&A retrieval.
- **Decorative chapter banners and grey section bars are mostly lost.** The
  chapter 7 banner never read; chapter 8 read at 150 dpi only. Diagrams,
  fretboards and numbered notation come out as fragments.
- Whole excerpt: 2.4 s/page → **a 300-page scan is ~12 minutes of CPU** in
  the background scan. Acceptable once per upload; not interactive.

### OCR text → chapter finding

| digest | tokens in / out | result |
|---|---|---|
| 5 raw lines per page, plus five pages wrongly quoted in full as "contents pages" (lines ending in fret numbers) | 6271 / 462 | both chapters, correct pages — but by accident of the quoted text |
| 5 raw lines per page, contents detection fixed (numbers must run upward) | 1501 / 28 | nothing found → whole book |
| 5 lines per page with OCR noise lines filtered out | **2094 / 128** | chapter 8 at p4 (correct); chapter 7 missed (banner unreadable); p1–3 become their own chapter — **current** |

Rule added from this: pages before the first found chapter are a chapter of
their own, so an unreadable first banner loses nothing.

### OCR vs vision, per page

| path | cost per page | what it can read |
|---|---|---|
| Tesseract | $0, ~2.5 s CPU | prose, vocabulary; not banners, diagrams, tab, notation |
| Opus 5 vision (A4 @ 110 dpi ≈ 1500 tokens) | ≈ $0.008 + output | everything, including diagrams and tab |
| Sonnet 5 vision | ≈ $0.003 + output | same |
| cloud OCR (Google Document Text, for reference) | ≈ $0.0015 | prose and most headings; not tried |

So: OCR the whole scan once (free, gives Q&A and knowledge points their
text); vision only where a playable thing has to be read, and only in an
opened chapter. On CN-10 the OCR digest plus one text call ($0.014) found
the chapter boundary the vision-TOC step would have cost ~$0.06 to look for.

## Open questions this log does not settle

- Scanned pages tag only by OCR vocabulary; notation on a scan never fires
  the notation rules. #202 should treat `has_text_layer = false` as "look",
  and could use OCR garble rate (short fragment lines) as a diagram signal.
- Sample size is one book per class. A second scanned book, a strum-notation
  page and a text-layer tab page are the next things to run.

## 4. The live flow (A3)

`tests/test_live_books.py` against the real project, typeset excerpt:
create → upload as the player → scan (text layer, one model call) → chapters
→ manual ranges → delete, 46 s end to end, of which the model call is a few
seconds and the rest is Storage round-trips.

One thing the flow taught: Storage sits behind a CDN that keeps serving an
object after it was deleted (`cf-cache-status: HIT` seconds after a 200 on
the delete, list already empty). The service's download therefore carries
a unique query string, so a rescan after a re-upload to the same path reads
the new file, and the test checks deletion through the list endpoint.
