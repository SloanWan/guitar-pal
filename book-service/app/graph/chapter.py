"""
The chapter parse as a LangGraph:

    START ─┬─▶ classify_page ×N ─▶ route ─┬─▶ extract_tab ×M ─▶ END
           │                              └─▶ END
           └─▶ notes ──────────────────────────────────────────▶ END

Every page is classified in its own branch (a few at a time — the model's
rate limit, not the graph, is the bound); the knowledge points are one call
over the whole chapter's text and run alongside. `route` decides which
extractor a classified page goes to: `tab` pages and the `tab` regions of
`mixed` pages go to the tab extractor (B5); every other kind ends the
branch, so a prose chapter comes out as notes plus zero drafts with only
classification calls in the log. Without a validator no extractor runs.
"""

import asyncio
import base64
import logging
from collections.abc import Sequence
from dataclasses import replace

from anthropic import AsyncAnthropic
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from app.extract.tab import (
    READ_DPI,
    SEGMENT_DPI,
    Segment,
    TabExtractor,
    looks_like_text_tab,
    pad_region,
    within,
)
from app.graph.prompts import (
    CLASSIFY_SYSTEM,
    NOTES_SYSTEM,
    NotesOut,
    PageClassOut,
)
from app.graph.state import (
    ChapterState,
    ExtractState,
    PageClass,
    PageKind,
    PageState,
    Region,
)
from app.ingest.model import CLASSIFY_MODEL, MODEL, CallUsage, usage_of
from app.parse import ChapterResult, ParsePage, ParseTools
from app.repo import BookRow, ChapterRow, ExerciseRecord, NoteRecord, Usage
from app.validate import ValidatorClient

log = logging.getLogger("book-service")

# Page text past this is not what decides a page's kind.
CLASSIFY_TEXT_CHARS = 6_000
# The notes call sees the whole chapter; 40 pages of dense text stay under this.
NOTES_TEXT_CHARS = 160_000
# Classification calls in flight at once.
CLASSIFY_CONCURRENCY = 4

KINDS: frozenset[str] = frozenset(
    {
        "prose",
        "chord_diagrams",
        "strum_notation",
        "tab",
        "progression_map",
        "fretboard_diagram",
        "mixed",
        "other",
    }
)


def _kind(value: str) -> PageKind:
    return value if value in KINDS else "other"  # type: ignore[return-value]


def _image_block(png: bytes) -> dict[str, object]:
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": base64.standard_b64encode(png).decode("ascii"),
        },
    }


class ChapterParseGraph:
    """`ChapterGraph` over the Anthropic API."""

    def __init__(self, client: AsyncAnthropic, validator: ValidatorClient | None = None) -> None:
        self._client = client
        self._classify_slots = asyncio.Semaphore(CLASSIFY_CONCURRENCY)
        self._tab = TabExtractor(client, validator) if validator is not None else None
        self._graph = self._build()

    async def __call__(
        self,
        book: BookRow,
        chapter: ChapterRow,
        pages: Sequence[ParsePage],
        tools: ParseTools | None = None,
    ) -> ChapterResult:
        state: ChapterState = await self._graph.ainvoke(
            {
                "book_title": book.title,
                "chapter_title": chapter.title,
                "pages": list(pages),
                "tools": tools,
                "classified": [],
                "exercises": [],
                "notes": [],
                "usage": [],
                "warnings": [],
            }
        )
        for c in sorted(state.get("classified", []), key=lambda c: c.page):
            regions = "".join(
                f" [{r.kind} {r.bbox[0]:.2f},{r.bbox[1]:.2f}-{r.bbox[2]:.2f},{r.bbox[3]:.2f}]"
                for r in c.regions
            )
            log.info("parse %s p%d: %s%s — %s", chapter.id, c.page, c.kind, regions, c.note)
        calls = state.get("usage", [])
        usage = Usage(
            input_tokens=sum(u.input_tokens for u in calls),
            output_tokens=sum(u.output_tokens for u in calls),
            cost_usd=round(sum(u.cost_usd for u in calls), 4),
        )
        for w in state.get("warnings", []):
            log.info("parse %s: warning %s", chapter.id, w.get("message"))
        return ChapterResult(
            notes=list(state.get("notes", [])),
            exercises=list(state.get("exercises", [])),
            usage=usage,
            warnings=list(state.get("warnings", [])),
        )

    async def notes_only(
        self, book: BookRow, chapter: ChapterRow, pages: Sequence[ParsePage]
    ) -> ChapterResult:
        """The knowledge-points call by itself — what `--notes-only` calibrates (#245)."""
        out = await self.notes(
            {"book_title": book.title, "chapter_title": chapter.title, "pages": list(pages)}
        )
        calls: list[CallUsage] = out.get("usage", [])  # type: ignore[assignment]
        return ChapterResult(
            notes=list(out.get("notes", [])),  # type: ignore[arg-type]
            usage=Usage(
                input_tokens=sum(u.input_tokens for u in calls),
                output_tokens=sum(u.output_tokens for u in calls),
                cost_usd=round(sum(u.cost_usd for u in calls), 4),
            ),
        )

    # --- nodes -------------------------------------------------------------

    async def classify_page(self, state: PageState) -> dict[str, object]:
        page = state["page"]
        content: list[dict[str, object]] = [
            {"type": "text", "text": f"Chapter: {state['chapter_title']}\nPage {page.page}."}
        ]
        if page.text.strip():
            content.append(
                {
                    "type": "text",
                    "text": (
                        "Text on the page"
                        + (" (from OCR)" if not page.has_text_layer else "")
                        + f":\n{page.text[:CLASSIFY_TEXT_CHARS]}"
                    ),
                }
            )
        if page.image is not None:
            content.append(_image_block(page.image))
        elif not page.text.strip():
            # Nothing to judge by: a blank scan page. No call.
            return {"classified": [PageClass(page.page, "other", (), "blank page")], "usage": []}

        async with self._classify_slots:
            response = await self._client.messages.parse(
                model=CLASSIFY_MODEL,
                max_tokens=1024,
                system=CLASSIFY_SYSTEM,
                messages=[{"role": "user", "content": content}],
                output_format=PageClassOut,
                output_config={"effort": "low"},
            )
        out = response.parsed_output if response.stop_reason == "end_turn" else None
        if out is None:
            classified = PageClass(page.page, "other", (), "classification did not finish")
        else:
            regions = tuple(
                Region(_kind(r.kind), _bbox(r.bbox)) for r in out.regions if len(r.bbox) == 4
            )
            classified = PageClass(page.page, _kind(out.kind), regions, out.note.strip())
        return {"classified": [classified], "usage": [usage_of(response, CLASSIFY_MODEL)]}

    async def notes(self, state: ChapterState) -> dict[str, object]:
        text = _chapter_text(state["pages"])
        if not text.strip():
            return {"notes": [], "usage": []}
        response = await self._client.messages.parse(
            model=MODEL,
            max_tokens=8192,
            system=NOTES_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Book: {state['book_title']}\nChapter: {state['chapter_title']}\n\n{text}"
                    ),
                }
            ],
            output_format=NotesOut,
            output_config={"effort": "medium"},
        )
        out = response.parsed_output if response.stop_reason == "end_turn" else None
        page_numbers = {p.page for p in state["pages"]}
        notes: list[NoteRecord] = []
        for n in out.notes if out else []:
            if not (n.title.strip() and n.body.strip()):
                continue
            pages = note_pages(n.pages, page_numbers)
            if not pages and n.pages:
                # The model named pages the chapter does not have — most
                # likely the book's own printed numbering. The note keeps no
                # key rather than a wrong one; the log says what it said.
                log.info("notes: %r cited pages %s, outside the chapter", n.title, n.pages)
            notes.append(NoteRecord(title=n.title.strip()[:200], body=n.body.strip(), pages=pages))
        return {"notes": notes, "usage": [usage_of(response)]}

    async def extract_tab(self, state: ExtractState) -> dict[str, object]:
        """One tab page, or one tab region of a mixed page: segment, then read each exercise."""
        page, region, tools = state["page"], state["region"], state["tools"]
        stem = f"p{page.page:04d}" + (f"-r{state['ordinal']}" if region else "")
        assert self._tab is not None
        if page.has_text_layer and looks_like_text_tab(page.text):
            # Text tab carries no durations, so it is not read here: the card
            # offers it to the player to read by ear instead (#228).
            return _skipped(
                page.page,
                "the tab is in the text layer, which carries no rhythm — read it by ear",
                code="TEXT_TAB_SKIPPED",
            )
        if tools is None:
            return _skipped(page.page, "no page renderer in this run; tab not read")

        # The classifier's image is the segmenter's, unless only a region is wanted.
        if region is None and page.image is not None:
            overview = page.image
        else:
            overview = await tools.renderer.render(page.page, region, SEGMENT_DPI)
        segments, seg_usage = await self._tab.segment(overview, page.page)
        log.info(
            "parse p%d: %d exercise(s) — %s",
            page.page,
            len(segments),
            "; ".join(s.heading for s in segments),
        )
        if not segments:
            return {"usage": [seg_usage]}

        async def one(
            index: int, segment: Segment
        ) -> tuple[list[ExerciseRecord], list[CallUsage], list[dict[str, object]]]:
            box = pad_region(within(region, segment.region) if region else segment.region)
            png = await tools.renderer.render(page.page, box, READ_DPI)
            record, usage, dropped = await self._tab.extract_exercise(png, page.page, segment)
            if record is None:
                return [], usage, dropped
            crop_path = await tools.crops.save(f"{stem}-{index}.png", png)
            record = replace(record, crop_path=crop_path)
            log.info(
                "parse p%d %r: %d bars, %d warning(s)",
                page.page,
                segment.heading,
                len(record.draft.get("measures", [])),  # type: ignore[arg-type]
                len(record.warnings),
            )
            return [record], usage, dropped

        results = await asyncio.gather(*(one(i + 1, s) for i, s in enumerate(segments)))
        return {
            "exercises": [r for records, _, _ in results for r in records],
            "usage": [seg_usage] + [u for _, usage, _ in results for u in usage],
            "warnings": [w for _, _, dropped in results for w in dropped],
        }

    def route(self, state: ChapterState) -> list[Send] | str:
        """Which extractor each classified page goes to; END when none applies."""
        if self._tab is None:
            return END
        by_page = {p.page: p for p in state["pages"]}
        sends: list[Send] = []
        for c in state.get("classified", []):
            page = by_page.get(c.page)
            if page is None:
                continue
            payload: ExtractState = {
                "page": page,
                "region": None,
                "ordinal": 0,
                "tools": state.get("tools"),
            }
            if c.kind == "tab":
                sends.append(Send("extract_tab", payload))
            elif c.kind == "mixed":
                tab_regions = [r for r in c.regions if r.kind == "tab"]
                for i, r in enumerate(tab_regions, start=1):
                    sends.append(Send("extract_tab", {**payload, "region": r.bbox, "ordinal": i}))
        return sends or END

    # --- wiring --------------------------------------------------------------

    def _build(self):  # noqa: ANN202 - LangGraph's compiled type is not worth naming
        graph = StateGraph(ChapterState)
        graph.add_node("classify_page", self.classify_page)
        graph.add_node("notes", self.notes)
        graph.add_node("route", lambda state: {})
        graph.add_node("extract_tab", self.extract_tab)
        graph.add_conditional_edges(START, self._fan_out, ["classify_page", "notes"])
        graph.add_edge("classify_page", "route")
        graph.add_conditional_edges("route", self.route, ["extract_tab", END])
        graph.add_edge("extract_tab", END)
        graph.add_edge("notes", END)
        return graph.compile()

    @staticmethod
    def _fan_out(state: ChapterState) -> list[Send]:
        title = state["chapter_title"]
        sends = [
            Send("classify_page", {"page": page, "chapter_title": title}) for page in state["pages"]
        ]
        sends.append(Send("notes", state))
        return sends


def note_pages(cited: Sequence[int], chapter_pages: set[int]) -> tuple[int, ...]:
    """
    The pages a note keeps (#245): only ones inside the chapter, each once, in
    the order the model gave them — the first is the one the card opens.
    """
    kept: list[int] = []
    for page in cited:
        if page in chapter_pages and page not in kept:
            kept.append(page)
    return tuple(kept)


def _skipped(page: int, why: str, code: str = "PAGE_SKIPPED") -> dict[str, object]:
    return {"warnings": [{"code": code, "path": f"page {page}", "message": f"p{page}: {why}"}]}


def _bbox(values: list[float]) -> tuple[float, float, float, float]:
    x0, y0, x1, y1 = (min(max(float(v), 0.0), 1.0) for v in values)
    return (x0, y0, x1, y1)


def _chapter_text(pages: Sequence[ParsePage]) -> str:
    parts = [f"[Page {p.page}]\n{p.text.strip()}" for p in pages if p.text.strip()]
    return "\n\n".join(parts)[:NOTES_TEXT_CHARS]


__all__ = ["ChapterParseGraph", "CallUsage"]
