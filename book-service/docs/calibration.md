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

## 5. The chapter parse (#202 B1–B3): classification and knowledge points

`python -m app.graph <pdf> --pages a-b [--dpi N] [--ocr]` runs the graph on a
local PDF. Every page here carried an image (all were tagged or scanned), so
these are worst-case-per-page numbers; a prose page with a text layer is a
text-only call. Notes always on `claude-opus-5`, effort medium.

| chapter | classifier | dpi | in / out tokens | cost | kinds | notes |
|---|---|---|---|---|---|---|
| EN-9 p2–9 (8 pages) | opus-5 | 150 | 41254 / 2691 | **$0.274** | p2 prose, p3–9 mixed | 12 |
| EN-9 p2–9 | opus-5 | 100 | 28654 / 2640 | $0.209 | same | 11 |
| EN-9 p2–9 | **sonnet-5** | 100 | 28670 / 2605 | **$0.121** | same, same regions | 12 |
| CN-10 p4–10 (7 scanned pages, OCR text) | sonnet-5 | 100 | 29706 / 4107 | $0.164 | all mixed | 15 |

Read-outs:

- **Classification is the parse's cost.** Roughly 3k tokens a page at 150
  dpi, 1.3k at 100, plus ~450 of prompt; the notes call is a few thousand
  for the whole chapter. Per 40-page chapter with every page imaged: ~$1.0
  on opus at 150 dpi, ~$0.35 with sonnet at 100 dpi.
- **100 dpi sorts as well as 150** on these pages, and the `mixed` regions
  come back the same (map top, chord-diagram row middle, prose bottom — the
  layout the page has). Classifier images are now 100 dpi; an extractor
  re-renders its page at 150.
- **Sonnet 5 classified every page identically to Opus 5**, regions
  included, at 43% of the cost. **Default from here on** (owner's call,
  2026-09-18); `BOOK_SERVICE_CLASSIFY_MODEL` overrides.
- **Knowledge points read well from both a text layer and OCR.** The
  Chinese chapter's 15 notes are correct chord constructions, fingerings,
  functions and the two chord-change methods, with page references, despite
  the OCR's wrong characters (弦 → 玫 etc.) — the prompt tells the model to
  read through them, and it does. Runs are stable in content, not in count
  (11–12 notes across three runs of the same chapter).
- **Taxonomy finding:** the scan's 24-fret scale charts came back as `tab`.
  They are not: nothing to play in sequence. Added `fretboard_diagram` so
  the tab extractor (B5) is never sent a scale chart. Not re-measured yet.
- Classifier notes came back in random languages under "the book's own
  language" (Spanish, French, Portuguese for an English book); they are log
  text, now asked for in English.
- **Live (A3 flow + parse):** EN-9 chapter p2–9 through the real endpoints,
  opus @150: 41308 / 2801, $0.277, 12 notes, `parse_status = ready` — same
  as the CLI run, as it should be.

## 6. Dense tab (#202 B5 gate): 《吉他自学三月通》 p204–207

Four scanned pages (`materials/吉他自学三月通-密集tab.pdf`, no text layer),
the usual Chinese method-book layout: a six-line tab staff with a **jianpu
(简谱) row under it** — degree 1–7, octave dots, underlines for eighths,
`–` for held beats — so every note is printed twice. Per exercise: a
heading (`①弦:E–F–G`), `♩=120`, sometimes `1=C 4/4`, chord names above the
staff. ~20 exercises on the four pages, 1–4 staves each. Hand-read ground
truth for three of them (28, 39 and 35 notes: a quarter-note line, the
q–e–e string-⑥ line with an `e e q h` closing bar, and the 12-bar two-stave
①–③ combination) is what the numbers below are measured against.
Probe scripts lived in the session scratchpad; the prompts they used are
what `extract/tab.py` starts from.

### Classification (the `fretboard_diagram` re-measure)

`python -m app.graph … --pages 1-4 --ocr`, sonnet-5 @ 100 dpi, notes on
opus-5: **16199 / 1559 tokens, $0.0756, 20 s**, 10 notes.

| page | kind | regions |
|---|---|---|
| 204 | mixed | prose 0.10–0.35 · **fretboard_diagram** 0.35–0.55 · tab 0.60–0.95 |
| 205 | mixed | **fretboard_diagram** 0.09–0.22 · tab · prose · tab |
| 206 | tab | — |
| 207 | tab | — |

The 音位图/音阶图 pairs came back `fretboard_diagram`, not `tab` — the split
added in §5 holds, and the extractor is never sent a scale chart. Notes
came back with empty `pages` for this book (the printed folio is 204–207,
the CLI counts 1–4); harmless here, worth a look when the card shows them.

### Reading one exercise: two readings, reconciled

The extractor prompt asks for the tab and the jianpu **as two independent
readings per note** (`tab_string`, `tab_fret` / `jianpu_degree`, octave,
accidental, duration, chord). The service turns both into MIDI —
`open[string] + fret` against `48 + key + degree + 12·octave` (guitar
jianpu is written an octave above sounding: plain `1` in 1=C is C3, and
string ⑥ open prints as 3 with a dot below) — and compares. Crops at 150
dpi, from hand-drawn boxes:

| exercise | model / effort / schema | s | in / out | cost | notes right | chords | tab=jianpu |
|---|---|---|---|---|---|---|---|
| ①弦 E–F–G (8 bars, 28 notes) | opus-5 medium verbose | 23.5 | 2152 / 2302 | $0.068 | **28/28** | OK | 28/28 |
| ⑥弦 E–F–G (8 bars, 39) | opus-5 medium verbose | 31.7 | 2230 / 3410 | $0.096 | **39/39** | OK | 39/39 |
| ①–③ 组合 (12 bars, 35) | opus-5 medium verbose | 51.1 | 2464 / 4154 | $0.116 | **35/35** | OK | 35/35 |
| ①弦 E–F–G | sonnet-5 medium verbose | 46.1 | 2152 / 5584 | $0.060 | 28/28 | **DIFF** (G7 a bar early) | **0/28** — every octave dot missed |
| ⑥弦 E–F–G | sonnet-5 medium verbose | 106.1 | 2230 / 5304 | $0.058 | **29/39** — q–e–e read as six eighths, closing bar wrong | OK | 24/39 — dots below missed |
| ①–③ 组合 | sonnet-5 medium verbose | — | — | — | connection dropped twice at >100 s | | |
| ⑥弦 E–F–G | opus-5 medium **compact** | 44.6 | 1713 / 3456 | $0.095 | 39/39 | OK | 39/39 |
| ①–③ 组合 | opus-5 medium **compact** | 30.2 | 1947 / 2104 | $0.062 | 35/35 | OK | 35/35 |
| ⑥弦 E–F–G | opus-5 **low** compact | 23.3 | 1713 / 1222 | $0.039 | 39/39 | OK | 39/39 |
| ①–③ 组合 | opus-5 **low** compact | 18.4 | 1947 / 1236 | $0.041 | **11/35** — string off by one line in 9 bars | OK | **11/35** |

"Verbose" is one JSON object per note; "compact" is one string per bar
(`1:0/q 1:3/h` and `3+/q #1+/q`), which halves the output tokens at the same
accuracy.

Read-outs:

- **Opus 5 at medium effort read all 102 notes, all durations and all
  chord placements correctly, on every crop, both schemas.** The dense-tab
  gate for B5 is passed on this book. ~$0.06–0.12 an exercise.
- **Sonnet 5 is not good enough for this.** It cannot see the octave dots
  at 150 dpi (every note an octave out on one crop, the low-dot ones on
  another), read the q–e–e figure as straight eighths, and slid a chord a
  bar. It was also slower and produced twice the output tokens, so it
  saved almost nothing. Not a candidate for the extractor.
- **The jianpu cross-check catches what the tab reading gets wrong.** In
  the low-effort run the model put nine bars on the wrong string; the tab
  and jianpu readings disagreed on exactly those 24 notes and agreed on the
  other 11. So a disagreement is a reliable "look here" — the honesty
  warning of #114 has something real to point at — and when the jianpu is
  the trustworthy side (a pitch that fits the tab's neighbouring string)
  it can also repair. Frets stay the tab's; the jianpu arbitrates.
- **Low effort is not enough** on a two-stave crop, and saves only ~$0.02.
  Medium it is.
- **One exercise per call, not one page.** A whole-page call (p206 at 150
  dpi, five exercises, ~150 notes) runs past three minutes on opus and was
  cut off twice in this environment before it finished (the stream ended
  mid-JSON at 170 s, 9.7k chars). Per-exercise crops are bounded (<1 min),
  parallel, and a failed one is cheap to retry. It is also what the card
  needs: one draft per heading (the open question in #202, settled).
- **A cheap call finds the exercises.** Sonnet-5 @ 100 dpi, effort low,
  asked for "every exercise, with a box that includes heading, tempo and
  the jianpu of the last staff": **1946 / 241 tokens, $0.006, 5–6 s**, and
  it found all five on p206 with the right staff counts. Boxes sit right on
  the heading and drift ±2% between runs, so the crop pads 2% above / 1%
  below; one run still clipped the heading text and the model said so in
  `unclear` (it read every note regardless). Pad 4% above.
- Both auto-cropped exercises then went through the real
  `/api/internal/validate` as an `ImportedTabDraft`: **ok, no errors, no
  warnings** — the draft shape (`measures[].slots[].strings[6]`, string ①
  at index 0, `timeSignature [4,4]`, `bpm`) is the editor's.
- Cost shape of a dense chapter: segmentation ≈ $0.006/page, extraction ≈
  $0.08 × exercises. p206 (five exercises) ≈ $0.40; a 40-page chapter of
  nothing but exercises would be ~$15 — well above the classify + notes
  cost, and the number the re-parse button has to show.

### Live, through the graph (`extract/tab.py` as built)

`python -m app.graph … --pages N-N --ocr` with the validator on a dev
server; every draft below passed `POST /api/internal/validate`.

| run | s | in / out | cost | drafts | notes |
|---|---|---|---|---|---|
| p206 alone | 61.5 | 16350 / 8436 | **$0.273** | 5/5 | one `TAB_JIANPU_COUNT` — the model wrote a jianpu `–` as its own token |
| p206, prompt says a `–` is never a token | 55.1 | 16502 / 8243 | $0.269 | 5/5, **74/74 notes** on the two hand-read exercises, 0 warnings | one heading lost to the crop → name from the segmenter |
| p204–207, the whole chapter | 147.6 | 54156 / 28034 | **$0.893** | 15/16 | 1 dropped: read did not finish in 4096 output tokens; 13 + 4 octave-only jianpu mismatches on p207 |
| p205 (mixed, tab regions) | 52.2 | 15272 / 4808 | $0.177 | 5/5 | crops named `p0002-r1-N.png` per region |
| p207, after the fixes below | 120.8 | 14995 / 9427 | $0.291 | 4/4 | `④弦—⑤弦` 33/33 frets, 2/4 read correctly; a `5:3/h.` |

Findings and what changed:

- **Octave-dot misreads are systematic on p207** (2/4 bars, every note an
  eighth with an underline): 13 of 33 notes on `④弦—⑤弦` came back with a
  dot below that a 300 dpi look shows is not printed — and 200 dpi did not
  help (same 20/33 agreement, 33/33 frets, $0.049 vs $0.047). The tab was
  right every time; string + fret fix the pitch, and an exact-octave
  disagreement can only be the dot. So exact-octave disagreements are now
  one `TAB_JIANPU_OCTAVE` warning per draft with a count and the first
  positions, not one alarm per note; other disagreements stay per-note
  (`TAB_JIANPU_MISMATCH`), because those are the ones that mean a wrong
  string or fret.
- Two tab regions on one mixed page ran as two branches and named their
  crops the same; the region's ordinal is now in the name.
- Read calls get 8192 output tokens; the one drop in the chapter run was a
  long two-stave exercise that hit 4096.
- A dotted half (`h.`) turned up; the editor has no such duration, so it is
  a half tied to a quarter.
- The ~$0.90 for a four-page chapter of nothing but exercises (16 of them)
  is the number the re-parse button should be quoting: about $0.06 a draft,
  $0.22 a page, on top of the classification.

### What B5 builds from this

- Route `tab` pages (and `tab` regions of `mixed`) to a **segment** node
  (sonnet-5, 100 dpi, low effort) → one **extract** call per exercise
  (opus-5, medium effort, 150 dpi crop padded 4%/1%, compact schema, both
  readings) → reconcile in Python (pure, unit-tested) → validator → repair
  once → store with `crop_path`.
- Every reconciliation disagreement becomes a draft warning naming both
  readings and the bar/note; a tab digit the model marked unreadable is
  filled from the jianpu with a warning saying so.
- The classifier does not need a `jianpu` flag after all: the extractor
  prompt describes the row and asks for `?` where it is absent, so a page
  without one degrades to a tab-only reading with no cross-check.

Still open: a tab page **without** a jianpu row (Western books), and one
with hammer-ons, slides or chords stacked in a slot — none on hand. The
technique fields of `ImportedTabDraft` stay unexercised until one turns up.

## 7. Knowledge points carry their pages (#245)

Every note of the sample chapter (§6's p204–207, parsed 2026-09-19) came
back with `pages: []`, though the notes call already saw the text with
`[Page N]` markers and the schema had a `pages` field. Two things let the
model skip it: the field had a default, so the SDK's strict schema did not
list it under `required`; and the prompt asked for pages "as labelled in
the text", which on a scan is as likely to mean the book's printed
`204`–`207` — then dropped by the in-chapter filter — as the marker's
`1`–`4`. Fixed by making `pages` required and telling the prompt what a
page reference is (the marker's N, never a printed number).

`python -m app.graph … --pages 1-4 --ocr --notes-only` runs the notes
call alone, 2026-09-21, opus-5 medium:

| run | in / out tokens | cost | notes | with pages | on the page their text sits on |
|---|---|---|---|---|---|
| before (2026-09-19 parse, full) | (part of $0.81) | — | 9 | 0 | — |
| after, notes only | 3860 / 1223 | **$0.0499** | 11 | **11** | **11** (checked by hand against the OCR text) |

Read-outs:

- Page attribution is right on every note: the five method tips and the two
  scales on p1, the tab scale on p2, the grouped string exercises spanning
  p2–3, the three combination exercises and the bass exercise on p3–4, each
  with the page whose OCR text holds its sentences. Two notes span two
  pages and say so, first page first.
- Count moved 9 → 11 (§5 already noted the count varies run to run; the
  content is the same tips with the exercises split finer).
- The out-of-chapter filter in `note_pages` now logs what the model cited
  when it drops everything, so a book that makes the model reach for its
  printed numbering shows up in the parse log rather than silently as `[]`.
- The sample export (`materials/samples/sanyuetong-dense-tab/parse.json`)
  took these notes in place of the empty-paged ones (`notes_rerun` records
  the run); the drafts and chunks are still the 2026-09-19 parse's. The
  fixture was rebuilt with `scripts/build-book-sample.mjs`.

## 8. Chapter Q&A: what each provider can actually read (#203)

The first build of the ask graph answered every question with "I can't see
this chapter". The cause was a rule that looked reasonable and was wrong:
`cite` treated *an answer with no citations* as *not from the book*, and
sent it to a general step that is deliberately never shown the chapter.

Probed by hand, 2026-09-23, same prompt, one variable at a time:

| document sent | provider | citations back | answer |
|---|---|---|---|
| 三月通 p1–4 as PDF (**scan**, no text layer) | claude-opus-5 | **0** | correct and detailed — read by vision |
| SongWriting p3–5 as PDF (typeset, text layer) | claude-opus-5 | **5** × `page_location` | correct, pages map correctly |
| two text `document` blocks | deepseek-flash | **0** | "提供的文档无法读取" — the blocks are not read at all |
| one scanned page as an `image` block | deepseek-flash | n/a | correct and detailed |
| `messages.parse(output_format=…)` | deepseek-flash | n/a | ignores the schema, answers in prose (SDK raises) |

Read-outs:

- **PDF citations come from the PDF's text layer.** A scan has none, so no
  answer about a scanned chapter can ever carry one — on any provider. Since
  scanned method books are the case this whole feature exists for, the
  citation gate failed 100% of the time on the only book on hand.
- **An uncited answer says nothing about coverage.** Coverage is now an
  explicit signal from the answer step (`NOT_IN_CHAPTER`), and an answer
  without citations is still the chapter's.
- **Pages, when the API cannot cite, come from what was sent.** A scanned or
  DeepSeek chapter goes over as `[Page N]` blocks and the reply ends with a
  `PAGES:` line; the app keeps only numbers it actually sent (a reply naming
  p.999 gets none of it) and falls back to every page sent. The model picks
  among identifiers; it never supplies one.
- **deepseek-flash needs `effort: low` and room to think.** At its default
  (`high`) with 300 output tokens it spent the entire budget reasoning and
  returned empty text — which looks exactly like a broken endpoint. Caps are
  now 1024 (intent) and 2048 (answer); a cap is not a charge.

Live, the three questions that had failed, through the real graph on the
scanned chapter (4 pages of OCR, `long_context`):

| question | anthropic (opus-5) | deepseek-flash |
|---|---|---|
| "what does this chapter say about the left hand?" | `book`, p1/3/4, 1201 tok | `book`, p1/4, 3564 tok |
| "这一章哪一部分涉及了音阶练习？" | `book`, p1–4, 1194 tok | `book`, p1/2/4, 711 tok |
| "什么是 Dorian 调式？" | `general`, no pages, 1740 tok | `general`, no pages, 1028 tok |
| total | 4135 tok | 5303 tok |

Both answer the two chapter questions correctly from the OCR text and route
the theory question out of the book. DeepSeek's tokens include its thinking;
its second question is cheap because the chapter prefix was a cache read.
**DeepSeek is not in `PRICE_PER_MTOK`**, so a parse or ask run on it records
tokens with `$0` — the figure is not a claim that it was free.

## 9. Chapter Q&A: Claude vs DeepSeek on the sample chapter (#203 C3)

`python -m evals.ask.sample` — nine questions on the exported 三月通 chapter
(4 scanned pages, OCR text, `long_context`), 2026-09-23, one run each. Gold
pages are §7's hand-checked note attributions; the injection line is the one
hand-made part (no page of the real book addresses the model). The judge is
`claude-sonnet-5` for both sides, so the grade is about the answer and not
the grader.

| | claude-opus-5 | deepseek-flash |
|---|---|---|
| routing (factual→book, theory→general, off-book→decline) | 7/7 | 7/7 |
| page recall | 5/5 | 5/5 |
| faithfulness (judged) | 4/5 | 5/5 |
| draft lookup | 1/1 | 1/1 |
| injection resistance | 1/1 | 1/1 |
| first question (cold) | $0.0291 | $0.0013 |
| later questions (warm, mean) | $0.0095 | $0.0005 |
| nine questions | **$0.1047** | **$0.0055** |
| tokens | 10744 | 9162 |
| latency p50 | 7.2 s | 3.1 s |

Read-outs:

- **DeepSeek is ~19× cheaper and ~2.3× faster here, and lost nothing.** On
  a scanned chapter neither provider can use PDF citations, so both run the
  identical labelled-pages path and the comparison is like for like.
- **The 4/5 is the judge, not the answer.** Re-running that one question
  judged it faithful, with the reason spelling out that it was allowing for
  OCR garbling (`人@@ 弦一人@@弦`, `5 调` for `C调`). One run per question is
  not enough to separate a grade from noise — #203 says two, and this is why.
- **Page precision is loose, recall is not.** Both sometimes name every page
  they were shown (`p[1,2,3,4]` for a question answered on p1). The `PAGES:`
  line is a filter against pages actually sent, not a relevance ranking; a
  four-page chapter has little to rank. Worth revisiting on a 40-page one.
- The dollar figures are the graph's own calls. The judge's calls are extra
  (~$0.01 per provider) and are not part of what a player's question costs.
- DeepSeek prices are its peak rates; off-peak halves them again.
