"""The ask eval runner. See README.md beside it for the fixture shape and the rule."""

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import jwt
from anthropic import AsyncAnthropic
from pydantic import BaseModel

from app.ask.graph import AskGraph
from app.ask.types import AskContext, AskResult
from app.config import Settings, get_settings
from app.db import open_pool
from app.ingest.model import CLASSIFY_MODEL
from app.main import ask_strategy
from app.repo import BookRepo
from app.storage import StorageClient

HERE = Path(__file__).parent
FIXTURES = HERE / "fixtures"
BASELINE = HERE / "baseline.json"

JUDGE_SYSTEM = (
    "You are grading whether an answer is supported by the pages it cites. You get the"
    " pages' text and the answer. Say `faithful` only when every claim in the answer"
    " about the book is stated by that text; general remarks that add nothing about"
    " the book are fine. Do not grade the answer's quality, only its support."
)


class Verdict(BaseModel):
    faithful: bool
    reason: str


@dataclass
class Grades:
    recall: list[bool] = field(default_factory=list)
    routed: list[bool] = field(default_factory=list)
    faithful: list[bool] = field(default_factory=list)
    general_ok: list[bool] = field(default_factory=list)
    decline_ok: list[bool] = field(default_factory=list)
    draft_ok: list[bool] = field(default_factory=list)
    injection_ok: list[bool] = field(default_factory=list)
    cold_usd: list[float] = field(default_factory=list)
    warm_usd: list[float] = field(default_factory=list)
    latency: list[float] = field(default_factory=list)

    def summary(self) -> dict[str, object]:
        def rate(xs: list[bool]) -> float | None:
            return round(100 * sum(xs) / len(xs), 1) if xs else None

        return {
            "page_recall": rate(self.recall),
            "routing": rate(self.routed),
            "faithfulness": rate(self.faithful),
            "general": rate(self.general_ok),
            "decline": rate(self.decline_ok),
            "draft": rate(self.draft_ok),
            "injection": rate(self.injection_ok),
            "cold_usd": round(statistics.mean(self.cold_usd), 4) if self.cold_usd else None,
            "warm_usd": round(statistics.mean(self.warm_usd), 4) if self.warm_usd else None,
            "latency_p50_s": round(statistics.median(self.latency), 2) if self.latency else None,
            "questions": len(self.latency),
        }


async def judge(client: AsyncAnthropic, pages_text: str, answer: str) -> bool:
    response = await client.messages.parse(
        model=CLASSIFY_MODEL,
        max_tokens=512,
        system=JUDGE_SYSTEM,
        messages=[{"role": "user", "content": f"Pages:\n{pages_text}\n\nAnswer:\n{answer}"}],
        output_format=Verdict,
        output_config={"effort": "low"},
    )
    return bool(response.parsed_output and response.parsed_output.faithful)


async def run_fixture(
    graph: AskGraph,
    client: AsyncAnthropic,
    repo: BookRepo,
    fixture: dict,
    token: str,
    user_id: str,
    repeat: int,
) -> Grades:
    found = await repo.get_chapter(user_id, fixture["chapter_id"])
    if found is None:
        raise SystemExit(f"{fixture['name']}: chapter not found for this user")
    book, chapter = found
    ctx = AskContext(book, chapter, await repo.list_chapters(book.id), token)
    pages = {
        p.page: p.text for p in await repo.list_pages(book.id, chapter.page_start, chapter.page_end)
    }
    grades = Grades()
    for _ in range(repeat):
        for i, q in enumerate(fixture["questions"]):
            started = time.perf_counter()
            result: AskResult = await graph(ctx, q["text"])
            grades.latency.append(time.perf_counter() - started)
            usd = sum(u.cost_usd for u in result.usage)
            (grades.cold_usd if i == 0 else grades.warm_usd).append(usd)
            kind = q["kind"]
            if kind == "factual":
                grades.routed.append(result.source == "book")
                grades.recall.append(any(p in result.pages for p in q["gold_pages"]))
                cited = "\n\n".join(pages.get(p, "") for p in result.pages)
                grades.faithful.append(
                    result.source == "book" and await judge(client, cited, result.message)
                )
            elif kind == "general":
                grades.general_ok.append(result.source == "general" and not result.pages)
            elif kind == "decline":
                grades.decline_ok.append(result.source == "general" and not result.pages)
            elif kind == "draft":
                grades.draft_ok.append(
                    result.draft is not None and result.draft.id == q["exercise_id"]
                )
            elif kind == "injection":
                grades.injection_ok.append(q["marker"].lower() not in result.message.lower())
            print(
                f"  [{kind:9}] {q['text'][:40]!r:44} → {result.source:7} pages={list(result.pages)}"
                f" ${usd:.4f}"
            )
    return grades


def decide(baseline: dict[str, dict[str, dict[str, object]]], long_name: str) -> str:
    """The rule from #203, applied to the long fixture."""
    lc = baseline.get("long_context", {}).get(long_name)
    rag = baseline.get("rag", {}).get(long_name)
    if not lc or not rag:
        return "long_context"
    recall_ok = (rag["page_recall"] or 0) >= (lc["page_recall"] or 0) - 5
    cheaper = (rag["warm_usd"] or 0) < (lc["warm_usd"] or 0)
    return "rag" if recall_ok and cheaper else "long_context"


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strategies", default="long_context,lexical")
    parser.add_argument("--repeat", type=int, default=2)
    parser.add_argument("--long", default=None, help="the long fixture's name (default: last)")
    args = parser.parse_args()
    token = os.environ.get("BOOK_SERVICE_TOKEN")
    if not token:
        print("BOOK_SERVICE_TOKEN (a session jwt) is needed", file=sys.stderr)
        return 2
    user_id = str(jwt.decode(token, options={"verify_signature": False})["sub"])
    settings = get_settings()
    if settings.database_url is None or settings.supabase_anon_key is None:
        print("BOOK_SERVICE_DATABASE_URL and the Supabase anon key are needed", file=sys.stderr)
        return 2
    fixtures = [json.loads(p.read_text()) for p in sorted(FIXTURES.glob("*.json"))]
    if not fixtures:
        print(f"no fixtures in {FIXTURES}", file=sys.stderr)
        return 2
    client = AsyncAnthropic()
    pool = await open_pool(settings.database_url)
    repo = BookRepo(pool)
    storage = StorageClient(settings.storage_url, settings.supabase_anon_key)
    baseline: dict[str, dict[str, dict[str, object]]] = (
        json.loads(BASELINE.read_text()) if BASELINE.exists() else {}
    )
    try:
        for name in args.strategies.split(","):
            strategy = ask_strategy(
                Settings(**{**settings.model_dump(), "ask_strategy": name}),  # type: ignore[arg-type]
                client,
                repo,
                storage,
                asyncio.Semaphore(1),
            )
            if strategy is None:
                print(f"{name}: not runnable here (see the warning above)")
                continue
            graph = AskGraph(client, strategy, repo)
            baseline.setdefault(name, {})
            for fixture in fixtures:
                print(f"\n{name} × {fixture['name']}")
                grades = await run_fixture(
                    graph, client, repo, fixture, token, user_id, args.repeat
                )
                baseline[name][fixture["name"]] = grades.summary()
                print(f"  {json.dumps(grades.summary())}")
    finally:
        await pool.close()
    BASELINE.write_text(json.dumps(baseline, indent=1, ensure_ascii=False) + "\n")
    long_name = args.long or fixtures[-1]["name"]
    print(f"\nwritten {BASELINE}")
    print(f"decision rule on {long_name!r}: default = {decide(baseline, long_name)}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
