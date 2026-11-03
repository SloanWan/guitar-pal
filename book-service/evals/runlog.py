"""
The run file every eval writes (#370), in the shape `/dev/evals` reads
(`src/lib/evals/types.ts`): suite, run id, status, metrics with their
direction, subjects with a summary, and one row per graded case. A runner
rewrites the file after every case, so a page following it sees the run
fill in; the write goes through a temp file and a rename, so a reader never
catches it half written.

What a run showed goes in by hand once it is read, a sentence each — the
read-out that also lands in docs/calibration.md:

    .venv/bin/python -m evals.runlog evals/ocr/results/<run>.json "finding" "finding" …
    .venv/bin/python -m evals.runlog --zh evals/ocr/results/<run>.json "结论" …   # Chinese
"""

import json
import os
import platform
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

SERVICE = Path(__file__).parent.parent


def git_sha() -> str | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], cwd=SERVICE, capture_output=True, text=True
        )
        return out.stdout.strip() or None
    except OSError:
        return None


def machine() -> str:
    chip = platform.processor() or platform.machine()
    try:
        brand = subprocess.run(
            ["sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True, text=True
        ).stdout.strip()
        chip = brand or chip
    except OSError:
        pass
    return f"{chip}, {os.cpu_count()} cores, {platform.system()}"


def new_run(
    *,
    suite: str,
    title: str,
    metrics: list[dict],
    subjects: list[dict],
    total: int,
    config: dict | None = None,
    issue: int | None = None,
) -> dict:
    """A run that has just started: nothing graded, every subject queued."""
    started = datetime.now(UTC)
    return {
        "suite": suite,
        "title": title,
        "issue": issue,
        "run_id": started.strftime("%Y%m%d-%H%M%S"),
        "status": "running",
        "started_at": started.isoformat(),
        "finished_at": None,
        "git_sha": git_sha(),
        "machine": machine(),
        "config": config or {},
        "progress": {"done": 0, "total": total},
        "metrics": metrics,
        "subjects": [{"status": "queued", "summary": {}, **s} for s in subjects],
        "cases": [],
    }


def finish(run: dict, status: str = "done") -> None:
    run["status"] = status
    run["finished_at"] = datetime.now(UTC).isoformat()


def write_run(run: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(run, ensure_ascii=False, indent=1) + "\n")
    tmp.replace(path)


def set_findings(path: Path, findings: list[str], zh: bool = False) -> None:
    run = json.loads(path.read_text())
    run["findings_zh" if zh else "findings"] = findings
    write_run(run, path)


if __name__ == "__main__":
    args = sys.argv[1:]
    zh = args[:1] == ["--zh"]
    args = args[1:] if zh else args
    if len(args) < 2:
        sys.exit("usage: python -m evals.runlog [--zh] <run file> <finding> [<finding> …]")
    set_findings(Path(args[0]), args[1:], zh)
