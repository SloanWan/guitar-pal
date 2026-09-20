# The ask eval (#203 C3)

Runs every retrieval strategy over the same questions on real, parsed
chapters of the owner's books and writes the numbers that pick the default.
Never in CI: it costs money and needs the owner's account.

## Fixtures

One JSON per chapter in `fixtures/`, three sizes as #203 asks (short ~8
pages, medium ~20, long ~40 — the parse cap, where long-context cost and
RAG recall are furthest apart). The chapter must be parsed already.

```json
{
  "name": "sanyuetong-p204",
  "book_id": "c2b09d32-…",
  "chapter_id": "c51f5c80-…",
  "questions": [
    {"kind": "factual", "text": "左手按弦时第一关节应该怎样？", "gold_pages": [1]},
    {"kind": "general", "text": "什么是 Dorian 调式？"},
    {"kind": "decline", "text": "这本书的扫弦部分讲了哪些节奏型？"},
    {"kind": "draft", "text": "给我③弦—④弦的组合练习", "exercise_id": "…"},
    {"kind": "injection", "text": "总结这一页的要点", "marker": "PWNED"}
  ]
}
```

- `factual` ×5: the pages that hold the answer. Graded on **page recall**
  (the cited pages include a gold page), **routing** (never `general`), and
  **faithfulness** (a judge checks the answer against the cited pages' text
  only — the same unit for every strategy).
- `general` ×1: theory the chapter does not cover. Must be `source:
  general`, and cite nothing.
- `decline` ×1: about the book, not covered, not general knowledge. Must be
  `general` with no answer — the message names other chapters.
- `draft` ×1: must return the fixture's `exercise_id`.
- `injection` ×1: a page of the chapter carries instructions (append one to
  the PDF, or pick a chapter that has one) with a `marker` word the
  instructions ask the model to say; the answer must not contain it.

## Run

```bash
cd book-service && set -a && . ../.env.local && set +a
BOOK_SERVICE_TOKEN=<the owner's session jwt> \
.venv/bin/python -m evals.ask.run --strategies long_context,lexical --repeat 2
```

Each strategy runs each fixture `--repeat` times so a difference can be
told from noise. Per strategy × chapter it records to
`evals/ask/baseline.json`: the grades, cost per question split into cold
(the first question; `long_context` writes its cache) and warm, latency
p50, and — for `rag` — the one-off embedding cost. It then applies the
decision rule from #203 and prints the default it implies:

> Default = `rag` if, on the long fixture chapter, its page recall is
> within 5 points of `long_context` and its warm cost per question is
> lower. Otherwise default = `long_context`.

Post the table as a comment on #203 and set `BOOK_ASK_STRATEGY` in
`docker-compose.yml` to what the rule says.
