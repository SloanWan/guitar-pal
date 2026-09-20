"""
Ask the open chapter (#203), as a LangGraph:

    START ─▶ intent ─▶ retrieve ─▶ route ─┬─▶ answer ─▶ cite ─┬─▶ END
                                          │                   └─▶ general ─▶ END
                                          ├─▶ general ─▶ END
                                          └─▶ find_draft ─▶ END

The intent node is a small structured call of its own (citations and
structured output cannot share a request). The strategy's `retrieve` finds
what it can inside the chapter; a question goes on to `answer` only when
that is usable — the model is never asked whether the book covers
something, retrieval says. `cite` reads the pages off the answer's
citations; an answer that cited nothing is not the book's and falls
through to `general`, which answers from the question alone (the chapter
is not in that prompt), labelled, or declines and names other chapters. A
request for an exercise never reaches a model beyond the intent call: it
is a lookup over what the parse already extracted, nearest to what
retrieval pointed at.
"""

import logging
import operator
from collections.abc import Sequence
from typing import Annotated, Protocol, TypedDict

from anthropic import AsyncAnthropic
from langgraph.graph import END, START, StateGraph

from app.ask.prompts import GENERAL_SYSTEM, INTENT_SYSTEM, GeneralOut, IntentOut
from app.ask.strategies import AskStrategy
from app.ask.types import Answer, AskContext, AskResult, AskTurn, Retrieval
from app.ingest.model import CLASSIFY_MODEL, MODEL, CallUsage, usage_of
from app.repo import ExerciseRow

log = logging.getLogger("book-service")

# Turns of the thread the intent and general calls are shown.
MAX_HISTORY_TURNS = 8
MAX_GENERAL_TOKENS = 1024

NO_DRAFT = (
    "This chapter's parse found no exercise like that. The drafts it did find are on"
    " the chapter card."
)
NOT_COVERED = "This chapter does not cover that"


class AskState(TypedDict, total=False):
    ctx: AskContext
    question: str
    history: list[AskTurn]
    intent: IntentOut
    retrieval: Retrieval
    answer: Answer
    result: AskResult
    usage: Annotated[list[CallUsage], operator.add]


class DraftStore(Protocol):
    """The slice of `BookRepo` the draft lookup reads."""

    async def list_exercises(self, chapter_id: str) -> list[ExerciseRow]: ...


def _history_messages(history: Sequence[AskTurn], question: str) -> list[dict[str, str]]:
    messages = [
        {"role": t.role, "content": t.content}
        for t in list(history)[-MAX_HISTORY_TURNS:]
        if t.content.strip()
    ]
    messages.append({"role": "user", "content": question})
    return messages


def pick_draft(
    exercises: Sequence[ExerciseRow],
    kind: str,
    topic: str,
    near_pages: Sequence[int],
) -> ExerciseRow | None:
    """
    The exercise a request most likely means: of the kind asked for (any
    kind when unsaid), the one whose name shares a word with the topic, else
    the one nearest the pages retrieval pointed at, else the first. No model
    writes a draft here — these are the parse's, as extracted.
    """
    pool = [e for e in exercises if kind == "any" or e.kind == kind]
    if not pool:
        return None
    words = [w for w in topic.lower().split() if len(w) > 1]

    def named(e: ExerciseRow) -> bool:
        name = str(e.draft.get("name", "")).lower()
        return any(w in name for w in words) if words else False

    def distance(e: ExerciseRow) -> int:
        return min((abs(e.page - p) for p in near_pages), default=0)

    by_name = [e for e in pool if named(e)]
    if by_name:
        return by_name[0]
    return min(pool, key=lambda e: (distance(e), e.page))


class AskGraph:
    def __init__(self, client: AsyncAnthropic, strategy: AskStrategy, drafts: DraftStore) -> None:
        self._client = client
        self._strategy = strategy
        self._drafts = drafts
        self._graph = self._build()

    @property
    def strategy_name(self) -> str:
        return self._strategy.name

    async def __call__(
        self, ctx: AskContext, question: str, history: Sequence[AskTurn] = ()
    ) -> AskResult:
        state: AskState = await self._graph.ainvoke(
            {"ctx": ctx, "question": question, "history": list(history), "usage": []}
        )
        result = state["result"]
        result.usage = list(state.get("usage", []))
        log.info(
            "ask %s [%s]: intent=%s source=%s pages=%s draft=%s $%.4f",
            ctx.chapter.id,
            self._strategy.name,
            state["intent"].intent,
            result.source,
            list(result.pages),
            result.draft.id if result.draft else None,
            sum(u.cost_usd for u in result.usage),
        )
        return result

    # --- nodes -------------------------------------------------------------

    async def intent(self, state: AskState) -> dict[str, object]:
        response = await self._client.messages.parse(
            model=CLASSIFY_MODEL,
            max_tokens=256,
            system=INTENT_SYSTEM,
            messages=_history_messages(state["history"], state["question"]),  # type: ignore[arg-type]
            output_format=IntentOut,
            output_config={"effort": "low"},
        )
        out = response.parsed_output if response.stop_reason == "end_turn" else None
        intent = out or IntentOut(intent="question", kind="any", topic="")
        return {"intent": intent, "usage": [usage_of(response, CLASSIFY_MODEL)]}

    async def retrieve(self, state: AskState) -> dict[str, object]:
        retrieval = await self._strategy.retrieve(state["ctx"], state["question"])
        return {"retrieval": retrieval, "usage": list(retrieval.usage)}

    async def answer(self, state: AskState) -> dict[str, object]:
        answer = await self._strategy.answer(
            state["ctx"], state["question"], state["history"], state["retrieval"]
        )
        return {"answer": answer, "usage": list(answer.usage)}

    async def cite(self, state: AskState) -> dict[str, object]:
        answer = state["answer"]
        if not answer.pages or not answer.message:
            return {}
        return {
            "result": AskResult(
                message=answer.message, source="book", pages=answer.pages, model=answer.model
            )
        }

    async def general(self, state: AskState) -> dict[str, object]:
        ctx = state["ctx"]
        others = [c for c in ctx.chapters if c.id != ctx.chapter.id]
        titles = "\n".join(f"{i + 1}. {c.title}" for i, c in enumerate(others)) or "(none)"
        messages = _history_messages(state["history"], state["question"])
        messages[-1] = {
            "role": "user",
            "content": (
                f"The book's other chapters:\n{titles}\n\nThe question:\n{state['question']}"
            ),
        }
        response = await self._client.messages.parse(
            model=MODEL,
            max_tokens=MAX_GENERAL_TOKENS,
            system=GENERAL_SYSTEM,
            messages=messages,  # type: ignore[arg-type]
            output_format=GeneralOut,
            output_config={"effort": "medium"},
        )
        out = response.parsed_output if response.stop_reason == "end_turn" else None
        usage = [usage_of(response)]
        if out is None:
            return {
                "result": AskResult(message=f"{NOT_COVERED}.", source="general", model=MODEL),
                "usage": usage,
            }
        if out.answered:
            return {
                "result": AskResult(message=out.message.strip(), source="general", model=MODEL),
                "usage": usage,
            }
        named = [others[n - 1].title for n in out.chapters if 1 <= n <= len(others)]
        message = out.message.strip() or f"{NOT_COVERED}."
        if named:
            message += " Chapters that look relevant: " + "; ".join(f"“{t}”" for t in named) + "."
        return {"result": AskResult(message=message, source="general", model=MODEL), "usage": usage}

    async def find_draft(self, state: AskState) -> dict[str, object]:
        ctx, intent = state["ctx"], state["intent"]
        exercises = await self._drafts.list_exercises(ctx.chapter.id)
        near = [c.page for c in state["retrieval"].chunks]
        draft = pick_draft(exercises, intent.kind, intent.topic, near)
        if draft is None:
            return {"result": AskResult(message=NO_DRAFT, source="book")}
        name = str(draft.draft.get("name") or "the exercise")
        message = f"From page {draft.page}: “{name}” — {draft.kind}, {draft.source}."
        return {
            "result": AskResult(message=message, source="book", pages=(draft.page,), draft=draft)
        }

    # --- wiring --------------------------------------------------------------

    @staticmethod
    def _route(state: AskState) -> str:
        if state["intent"].intent == "wants_draft":
            return "find_draft"
        return "answer" if state["retrieval"].usable else "general"

    @staticmethod
    def _after_cite(state: AskState) -> str:
        return END if "result" in state else "general"

    def _build(self):  # noqa: ANN202 - LangGraph's compiled type is not worth naming
        graph = StateGraph(AskState)
        graph.add_node("intent", self.intent)
        graph.add_node("retrieve", self.retrieve)
        graph.add_node("answer", self.answer)
        graph.add_node("cite", self.cite)
        graph.add_node("general", self.general)
        graph.add_node("find_draft", self.find_draft)
        graph.add_edge(START, "intent")
        graph.add_edge("intent", "retrieve")
        graph.add_conditional_edges("retrieve", self._route, ["answer", "general", "find_draft"])
        graph.add_edge("answer", "cite")
        graph.add_conditional_edges("cite", self._after_cite, ["general", END])
        graph.add_edge("general", END)
        graph.add_edge("find_draft", END)
        return graph.compile()
