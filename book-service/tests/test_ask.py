"""
Chapter Q&A (#203) with the model replaced: how a question routes — to the
chapter with cited pages, to general knowledge labelled as such, to a
decline that names other chapters, or to a draft the parse already made —
and how each strategy turns citations into pages. The prompts' quality is
the eval's business (`evals/ask/`).
"""

import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.ask.graph import NO_DRAFT, AskGraph, pick_draft
from app.ask.json_out import json_instruction, parse_json_reply
from app.ask.lexical import lexical_query, lexical_text, lexical_tokens
from app.ask.limits import SlidingWindowLimiter
from app.ask.prompts import (
    ANSWER_SYSTEM,
    GENERAL_SYSTEM,
    INTENT_SYSTEM,
    NOT_IN_CHAPTER,
    GeneralOut,
    IntentOut,
)
from app.ask.provider import Provider
from app.ask.strategies.chunks import LexicalStrategy
from app.ask.strategies.cited import strip_pages_line
from app.ask.strategies.long_context import LongContextStrategy, chapter_pdf, has_text_layer
from app.ask.types import AskContext, AskTurn
from app.ingest.pdf import open_pdf
from app.repo import BookRow, ChapterRow, ChunkRow, ExerciseRow, PageRow
from tests.conftest import needs_materials
from tests.test_scan import FakeStorage

# --- the tokeniser -------------------------------------------------------------


def test_lexical_tokens_split_words_and_cjk_bigrams() -> None:
    assert lexical_tokens("左手按弦要领 F barre chord, C7") == [
        "左手",
        "手按",
        "按弦",
        "弦要",
        "要领",
        "f",
        "barre",
        "chord",
        "c7",
    ]
    assert lexical_tokens("弦") == ["弦"]
    assert lexical_text("按弦 barre") == "按弦 barre"


def test_lexical_query_ors_the_distinct_tokens_quoted() -> None:
    assert lexical_query("按弦按弦") == "'按弦' | '弦按'"
    assert lexical_query("F barre") == "'f' | 'barre'"
    assert lexical_query("?!") == ""


def test_limiter_counts_a_sliding_window() -> None:
    limiter = SlidingWindowLimiter(limit=2, window=60.0)
    assert limiter.check("u", now=0.0) == (True, 0)
    assert limiter.check("u", now=1.0) == (True, 0)
    allowed, retry = limiter.check("u", now=2.0)
    assert not allowed and retry == 59
    assert limiter.check("other", now=2.0) == (True, 0)
    assert limiter.check("u", now=61.0) == (True, 0)


# --- the graph -----------------------------------------------------------------

BOOK = BookRow(
    id="b",
    user_id="u",
    title="三月通",
    page_count=300,
    storage_path="u/b.pdf",
    status="ready",
    toc_source="text",
    error=None,
    scanned_pages=300,
    created_at=None,  # type: ignore[arg-type]
)


def _chapter(chapter_id: str, title: str, start: int, end: int) -> ChapterRow:
    return ChapterRow(
        id=chapter_id,
        index=0,
        title=title,
        page_start=start,
        page_end=end,
        exercise_hint_count=0,
        parsed_at=None,
        parse_status="ready",
        parse_error=None,
        parse_input_tokens=0,
        parse_output_tokens=0,
        parse_cost_usd=0.0,
        parse_warnings=[],
    )


CHAPTER = _chapter("c", "实际操练", 204, 207)
OTHERS = [_chapter("c0", "和弦部分", 100, 150), _chapter("c2", "扫弦节奏", 208, 230)]
# The real chapter behind these tests is a scan: OCR text, no text layer.
SCAN_PAGES = [
    PageRow(
        page=n, text=f"第 {n} 页：左手按弦要准确果断。", text_source="ocr", may_have_exercise=True
    )  # noqa: E501
    for n in range(204, 208)
]
CTX = AskContext(
    book=BOOK,
    chapter=CHAPTER,
    chapters=[OTHERS[0], CHAPTER, OTHERS[1]],
    token="tok",
    pages=SCAN_PAGES,
)

CHUNKS = [
    ChunkRow(id="k1", page=204, index=0, text="左手按弦要准确果断，第一关节弯曲。"),
    ChunkRow(id="k2", page=206, index=0, text="③弦—④弦组合练习，1=C，♩=120。"),
]
EXERCISES = [
    ExerciseRow(
        id="e1",
        page=205,
        kind="tab",
        source="literal",
        draft={"name": "①弦:E-F-G", "measures": []},
        warnings=[],
        crop_path=None,
        status="proposed",
    ),
    ExerciseRow(
        id="e2",
        page=206,
        kind="tab",
        source="literal",
        draft={"name": "③弦—④弦组合练习", "measures": []},
        warnings=[],
        crop_path=None,
        status="proposed",
    ),
]


@dataclass
class FakeModel:
    """Answers each call by its system prompt; the answer call's citations are scripted."""

    intent: IntentOut = field(
        default_factory=lambda: IntentOut(intent="question", kind="any", topic="")
    )
    general: GeneralOut = field(
        default_factory=lambda: GeneralOut(answered=True, message="A barre is…", chapters=[])
    )
    answer_text: str = "按弦要准确果断。"
    citations: list[object] = field(default_factory=list)
    # What a provider without structured output answers a schema call with.
    json_reply: str | None = None
    requests: list[dict] = field(default_factory=list)

    @property
    def messages(self) -> "FakeModel":
        return self

    async def parse(self, **kwargs: object) -> object:
        self.requests.append(kwargs)
        usage = SimpleNamespace(input_tokens=100, output_tokens=10)
        if kwargs["system"] == INTENT_SYSTEM:
            out: object = self.intent
        elif kwargs["system"] == GENERAL_SYSTEM:
            out = self.general
        else:
            raise AssertionError(f"unexpected structured call: {kwargs['system'][:40]}")
        return SimpleNamespace(stop_reason="end_turn", parsed_output=out, usage=usage)

    async def create(self, **kwargs: object) -> object:
        self.requests.append(kwargs)
        system = str(kwargs["system"])
        if system.startswith(ANSWER_SYSTEM):
            text, citations = self.answer_text, self.citations
        else:
            # A schema call on a provider that has no structured output.
            assert self.json_reply is not None, f"unexpected create: {system[:40]}"
            text, citations = self.json_reply, []
        block = SimpleNamespace(type="text", text=text, citations=citations)
        usage = SimpleNamespace(
            input_tokens=2000, output_tokens=50, cache_creation_input_tokens=1800
        )
        return SimpleNamespace(stop_reason="end_turn", content=[block], usage=usage)


@dataclass
class FakeStore:
    chunks: list[ChunkRow] = field(default_factory=list)
    exercises: list[ExerciseRow] = field(default_factory=list)
    queries: list[str] = field(default_factory=list)

    async def search_chunks_lexical(
        self, chapter_id: str, query: str, limit: int
    ) -> list[ChunkRow]:
        self.queries.append(query)
        return self.chunks[:limit]

    async def search_chunks_by_embedding(self, chapter_id, embedding, limit):  # noqa: ANN001, ANN201
        raise AssertionError("not embedded here")

    async def list_exercises(self, chapter_id: str) -> list[ExerciseRow]:
        return self.exercises


def _provider(model: FakeModel, *, documents: bool = True, structured: bool = True) -> Provider:
    return Provider(
        name="fake",
        client=model,  # type: ignore[arg-type]
        model="claude-opus-5",
        small_model="claude-sonnet-5",
        documents=documents,
        structured_output=structured,
    )


def _lexical(model: FakeModel, store: FakeStore, **kwargs: bool) -> AskGraph:
    provider = _provider(model, **kwargs)
    return AskGraph(provider, LexicalStrategy(provider, store), store)


def _systems(model: FakeModel) -> list[str]:
    return [str(r["system"])[:20] for r in model.requests]


@pytest.mark.asyncio
async def test_a_covered_question_is_answered_from_the_chunks_with_their_pages() -> None:
    model = FakeModel(citations=[SimpleNamespace(type="char_location", document_index=1)])
    store = FakeStore(chunks=CHUNKS)
    result = await _lexical(model, store)(CTX, "左手怎么按弦？", [AskTurn("user", "hi")])

    assert result.source == "book"
    assert result.message == "按弦要准确果断。"
    assert result.pages == (206,)  # document 1 is the page-206 chunk
    assert result.draft is None
    assert store.queries == [lexical_query("左手怎么按弦？")]
    # Intent, then the cited answer; no general call.
    assert _systems(model) == [INTENT_SYSTEM[:20], ANSWER_SYSTEM[:20]]
    answer_call = model.requests[1]
    docs = answer_call["messages"][0]["content"]  # type: ignore[index]
    assert [d["title"] for d in docs if d["type"] == "document"] == ["Page 204", "Page 206"]
    assert docs[0]["cache_control"] == {"type": "ephemeral"}
    assert all(d["citations"] == {"enabled": True} for d in docs if d["type"] == "document")
    # The thread rides along, the question last.
    assert answer_call["messages"][-1] == {"role": "user", "content": "左手怎么按弦？"}  # type: ignore[index]
    assert answer_call["messages"][-2] == {"role": "user", "content": "hi"}  # type: ignore[index]
    # Cost counts the cache write.
    assert round(sum(u.cost_usd for u in result.usage), 4) == round(
        (100 * 2.0 + 10 * 10.0 + 2000 * 5.0 + 1800 * 1.25 * 5.0 + 50 * 25.0) / 1e6, 4
    )


@pytest.mark.asyncio
async def test_nothing_retrieved_goes_to_general_knowledge_labelled_and_uncited() -> None:
    model = FakeModel()
    result = await _lexical(model, FakeStore(chunks=[]))(CTX, "什么是 Dorian 调式？")
    assert result.source == "general"
    assert result.message == "A barre is…"
    assert result.pages == ()
    assert _systems(model) == [INTENT_SYSTEM[:20], GENERAL_SYSTEM[:20]]
    # The chapter's text is not in the general prompt: only titles of the others.
    content = model.requests[1]["messages"][-1]["content"]  # type: ignore[index]
    assert "1. 和弦部分" in content and "2. 扫弦节奏" in content and "实际操练" not in content


@pytest.mark.asyncio
async def test_an_uncited_answer_is_still_the_books() -> None:
    """
    The bug this fixes: a scanned chapter's pages carry no citable text, so
    every answer came back uncited and was thrown away for a general reply
    that says it cannot see the chapter. Only NOT_IN_CHAPTER decides now.
    """
    model = FakeModel(citations=[], answer_text="按弦要准确果断。")
    result = await _lexical(model, FakeStore(chunks=CHUNKS))(CTX, "左手怎么按弦？")
    assert result.source == "book"
    assert result.message == "按弦要准确果断。"
    # No citations: the answer rests on the pages retrieval put in front of it.
    assert result.pages == (204, 206)
    assert _systems(model) == [INTENT_SYSTEM[:20], ANSWER_SYSTEM[:20]]


@pytest.mark.asyncio
async def test_only_the_not_in_chapter_signal_sends_a_question_to_general() -> None:
    model = FakeModel(citations=[], answer_text=NOT_IN_CHAPTER)
    result = await _lexical(model, FakeStore(chunks=CHUNKS))(CTX, "How do I hold an F barre?")
    assert result.source == "general"
    assert result.pages == ()
    assert NOT_IN_CHAPTER not in result.message
    assert _systems(model) == [INTENT_SYSTEM[:20], ANSWER_SYSTEM[:20], GENERAL_SYSTEM[:20]]


@pytest.mark.asyncio
async def test_a_provider_that_cannot_cite_gets_labelled_pages_and_reads_the_pages_line() -> None:
    """DeepSeek's path: no document blocks, so the chapter goes over as [Page N]."""
    model = FakeModel(answer_text="按弦要准确果断。\nPAGES: 206, 999")
    result = await _lexical(model, FakeStore(chunks=CHUNKS), documents=False)(CTX, "左手？")
    assert result.source == "book"
    assert result.message == "按弦要准确果断。"
    # 999 was never sent, so it is not a page of this answer.
    assert result.pages == (206,)
    blocks = model.requests[1]["messages"][0]["content"]  # type: ignore[index]
    assert [b["type"] for b in blocks] == ["text", "text", "text"]
    assert blocks[0]["text"].startswith("[Page 204]")
    assert "PAGES:" in str(model.requests[1]["system"])


def test_strip_pages_line_takes_the_numbers_and_leaves_the_prose() -> None:
    assert strip_pages_line("答案。\nPAGES: 204, 206") == ("答案。", (204, 206))
    assert strip_pages_line("答案。") == ("答案。", None)
    assert strip_pages_line("答案。\nPAGES:") == ("答案。", ())


@pytest.mark.asyncio
async def test_a_question_nobody_can_answer_is_declined_naming_relevant_chapters() -> None:
    model = FakeModel(
        general=GeneralOut(
            answered=False, message="This chapter does not cover that.", chapters=[2, 9]
        )
    )
    result = await _lexical(model, FakeStore(chunks=[]))(CTX, "书里扫弦怎么讲的？")
    assert result.source == "general"
    assert (
        result.message
        == "This chapter does not cover that. Chapters that look relevant: “扫弦节奏”."
    )


@pytest.mark.asyncio
async def test_a_request_for_an_exercise_is_a_lookup_not_a_model_call() -> None:
    model = FakeModel(intent=IntentOut(intent="wants_draft", kind="tab", topic="组合练习"))
    store = FakeStore(chunks=CHUNKS, exercises=EXERCISES)
    result = await _lexical(model, store)(CTX, "给我组合练习的谱子")
    assert result.source == "book"
    assert result.draft is not None and result.draft.id == "e2"
    assert result.pages == (206,)
    assert "③弦—④弦组合练习" in result.message
    assert _systems(model) == [INTENT_SYSTEM[:20]]


@pytest.mark.asyncio
async def test_a_chapter_without_that_kind_of_draft_says_so() -> None:
    model = FakeModel(intent=IntentOut(intent="wants_draft", kind="strum", topic=""))
    result = await _lexical(model, FakeStore(exercises=EXERCISES))(CTX, "the strum pattern")
    assert result.draft is None and result.message == NO_DRAFT


def test_pick_draft_prefers_the_named_then_the_nearest() -> None:
    assert pick_draft(EXERCISES, "any", "E-F-G", [206]) is EXERCISES[0]
    assert pick_draft(EXERCISES, "any", "", [206]) is EXERCISES[1]
    assert pick_draft(EXERCISES, "any", "", []) is EXERCISES[0]
    assert pick_draft(EXERCISES, "progression", "", []) is None


# --- long context ----------------------------------------------------------------


@needs_materials
def test_chapter_pdf_cuts_the_range_out_of_the_book(typeset_pdf: Path) -> None:
    sliced = chapter_pdf(typeset_pdf.read_bytes(), 3, 5)
    with open_pdf(sliced) as doc:
        assert len(doc) == 3
        assert "Key of C" in doc[0].get_text()


@needs_materials
@pytest.mark.asyncio
async def test_long_context_sends_the_chapter_as_a_cached_pdf_and_maps_page_citations(
    typeset_pdf: Path,
) -> None:
    typeset = [
        PageRow(page=n, text=f"page {n}", text_source="layer", may_have_exercise=False)
        for n in range(3, 10)
    ]
    ctx = AskContext(
        book=BOOK,
        chapter=_chapter("c", "Key sheets", 3, 9),
        chapters=[],
        token="tok",
        pages=typeset,
    )
    assert has_text_layer(ctx), "a typeset chapter is the PDF-citation path"
    model = FakeModel(
        citations=[
            SimpleNamespace(type="page_location", start_page_number=2, end_page_number=3),
            SimpleNamespace(type="page_location", start_page_number=5, end_page_number=7),
            SimpleNamespace(type="char_location", document_index=0),  # not a page: ignored
        ]
    )
    storage = FakeStorage({"u/b.pdf": typeset_pdf.read_bytes()})
    provider = _provider(model)
    strategy = LongContextStrategy(provider, storage, asyncio.Semaphore(1))
    graph = AskGraph(provider, strategy, FakeStore())

    result = await graph(ctx, "What is the IV chord in D?")

    assert result.source == "book"
    # Document page 2 is chapter page 4; pages 5-6 (end exclusive) are 7-8.
    assert result.pages == (4, 7, 8)
    doc = model.requests[1]["messages"][0]["content"][0]  # type: ignore[index]
    assert doc["type"] == "document" and doc["source"]["media_type"] == "application/pdf"
    assert doc["citations"] == {"enabled": True} and doc["cache_control"] == {"type": "ephemeral"}
    assert doc["title"] == "三月通 — Key sheets"
    # The second question of the thread reads the PDF from the cache, not Storage.
    storage.files.clear()
    again = await graph(ctx, "And in G?")
    assert again.source == "book"


@pytest.mark.asyncio
async def test_long_context_on_a_scan_sends_its_ocr_text_and_never_downloads_the_pdf() -> None:
    """
    A scanned chapter has no text layer, so the PDF carries nothing citable:
    the chapter goes over as its own OCR text, labelled by page.
    """
    model = FakeModel(answer_text="按弦要准确果断。\nPAGES: 204")
    storage = FakeStorage({})  # a download would raise 404
    provider = _provider(model)
    strategy = LongContextStrategy(provider, storage, asyncio.Semaphore(1))
    result = await AskGraph(provider, strategy, FakeStore())(CTX, "左手怎么按弦？")

    assert result.source == "book"
    assert result.pages == (204,)
    blocks = model.requests[1]["messages"][0]["content"]  # type: ignore[index]
    assert [b["text"].split("]")[0] + "]" for b in blocks[:4]] == [
        "[Page 204]",
        "[Page 205]",
        "[Page 206]",
        "[Page 207]",
    ]
    # The last page carries the cache mark, so the chapter is one cached prefix.
    assert blocks[3]["cache_control"] == {"type": "ephemeral"}


# --- structured replies without structured output ---------------------------------


def test_json_instruction_names_every_field_and_its_options() -> None:
    text = json_instruction(IntentOut)
    assert '"intent": one of' in text and "'wants_draft'" in text
    assert '"topic": "…"' in text


def test_parse_json_reply_reads_a_wrapped_object_and_refuses_prose() -> None:
    body = '{"intent": "wants_draft", "kind": "tab", "topic": "组合 {练习}"}'
    wrapped = f"Sure!\n```json\n{body}\n```"
    out = parse_json_reply(wrapped, IntentOut)
    assert out is not None and out.intent == "wants_draft" and out.topic == "组合 {练习}"
    assert parse_json_reply("无法作答。", IntentOut) is None
    assert parse_json_reply('{"intent": "nope"}', IntentOut) is None


@pytest.mark.asyncio
async def test_a_provider_without_structured_output_is_answered_in_json() -> None:
    model = FakeModel(json_reply='{"intent": "question", "kind": "any", "topic": ""}')
    result = await _lexical(model, FakeStore(chunks=CHUNKS), structured=False)(CTX, "左手？")
    assert result.source == "book"
    # Every call went through `create`; nothing asked for output_format.
    assert all("output_format" not in r for r in model.requests)
    assert "Reply with one JSON object" in str(model.requests[0]["system"])


def test_every_column_the_repo_writes_has_a_migration() -> None:
    """
    `finish_parse` writes `tsv` on every chunk, so 0007 must exist and must be
    the head. This is here because nothing else would catch its absence: the
    tests use fakes, so a column that only Postgres would miss never fails.
    """
    import importlib.util
    from pathlib import Path

    versions = Path(__file__).resolve().parent.parent / "alembic" / "versions"
    revisions: dict[str, str | None] = {}
    for path in sorted(versions.glob("[0-9]*.py")):
        spec = importlib.util.spec_from_file_location(path.stem, path)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        revisions[module.revision] = module.down_revision

    # One unbroken chain, no forks, exactly one head.
    parents = [down for down in revisions.values() if down is not None]
    assert len(parents) == len(set(parents)), "two revisions share a parent"
    heads = set(revisions) - set(parents)
    assert len(heads) == 1, f"expected one head, found {sorted(heads)}"
    assert "0007" in revisions, "the chunk retrieval columns have no migration"
