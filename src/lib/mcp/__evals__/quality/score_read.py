"""
Score import_tab readings against the reviewed gold with the book eval's own
scorer (book-service/evals/tab/score.py: score_reading + summarise), unchanged.

stdin: {"gold": "<path to gold record json>", "readings": [{"key": str, "pattern": dict | null}]}
stdout: {"<key>": {"metrics": {...}, "differences": [...]}}
"""

import json
import sys
from pathlib import Path

SERVICE = Path(__file__).resolve().parents[5] / "book-service"
sys.path.insert(0, str(SERVICE))

from evals.tab.score import score_reading, summarise  # noqa: E402


def main() -> None:
    job = json.load(sys.stdin)
    record = json.loads(Path(job["gold"]).read_text())
    gold = record["gold"]
    out = {}
    for r in job["readings"]:
        sc = score_reading(r["pattern"], gold, [])
        metrics = summarise([sc])
        metrics.pop("exercises", None)
        out[r["key"]] = {"metrics": metrics, "differences": sc.differences[:40], "kinds": sc.kinds}
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
