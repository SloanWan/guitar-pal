"""
Check the OCR references by hand (#369): a local page that shows each scanned
page beside its reference text, with what the second transcription and the
engines read marked against it, and saves corrections back.

    cd book-service
    .venv/bin/python -m evals.ocr.review                 # http://127.0.0.1:8765
    .venv/bin/python -m evals.ocr.review --engines tesseract-fast,ppocrv6-tiny

Pages are listed most-disputed first (the two transcriptions disagree most).
Saving writes `materials/ocr-gold/<pdf>/pNN.txt` and, when ticked, adds the
page to `"checked"` in that folder's `meta.json`; then

    .venv/bin/python -m evals.ocr.run --rescore <run id>

re-scores the runs against the corrected text. Everything shown is book
text, so the server listens on 127.0.0.1 only and nothing is written
outside `materials/`.
"""

import argparse
import difflib
import json
import os
import sys
from functools import cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

import pymupdf

from evals.ocr.gold import GOLD_ROOT
from evals.ocr.run import READS_ROOT, RESULTS

SERVICE = Path(__file__).parent.parent.parent
MATERIALS = SERVICE / "materials"
REVIEW_DPI = 130
DEFAULT_ENGINES = "tesseract-fast,ppocrv6-tiny"


def diff_segments(reference: str, other: str) -> list[list[str]]:
    """
    `other` against `reference` as [op, text] runs: "=" shared, "-" in the
    reference only (the other missed it), "+" in the other only (it added it).
    """
    out: list[list[str]] = []
    matcher = difflib.SequenceMatcher(None, reference, other, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            out.append(["=", reference[i1:i2]])
            continue
        if tag in ("delete", "replace"):
            out.append(["-", reference[i1:i2]])
        if tag in ("insert", "replace"):
            out.append(["+", other[j1:j2]])
    return out


def mark_checked(meta: dict, page_id: str, checked: bool) -> dict:
    """The meta with `page_id` in or out of its sorted `checked` list."""
    pages = set(meta.get("checked", []))
    (pages.add if checked else pages.discard)(page_id)
    return {**meta, "checked": sorted(pages)}


def latest_reads() -> dict[str, Path]:
    """Engine id → the reads folder of the newest run that has that engine."""
    found: dict[str, Path] = {}
    runs = sorted(RESULTS.glob("*.json"), reverse=True)
    for path in runs:
        run_id = path.stem
        for engine_dir in sorted((READS_ROOT / run_id).glob("*")):
            found.setdefault(engine_dir.name, engine_dir)
    return found


def pdf_for(stem: str) -> Path:
    matches = [p for p in MATERIALS.glob("*.pdf") if p.stem == stem]
    if not matches:
        raise FileNotFoundError(stem)
    return matches[0]


@cache
def page_png(stem: str, index: int) -> bytes:
    with pymupdf.open(pdf_for(stem)) as doc:
        return doc[index].get_pixmap(dpi=REVIEW_DPI).tobytes("png")


def pages() -> list[dict]:
    """Every page with a reference, most-disputed first."""
    out = []
    for folder in sorted(GOLD_ROOT.iterdir()):
        meta_path = folder / "meta.json"
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text())
        for page_id, row in meta.get("pages", {}).items():
            out.append(
                {
                    "stem": folder.name,
                    "page_id": page_id,
                    "disputed": row.get("disagreement_chars", 0.0),
                    "checked": page_id in meta.get("checked", []),
                    "note": row.get("reference_from"),
                }
            )
    return sorted(out, key=lambda p: -p["disputed"])


def under(root: Path, *parts: str) -> Path:
    """
    `root/parts…`, refused unless it stays inside `root`. The handler only
    passes names it found in the gold folder; this keeps a request's path
    from climbing out even if that check is ever loosened.
    """
    base = os.path.normpath(root)
    path = os.path.normpath(os.path.join(base, *parts))
    if not path.startswith(base + os.sep):
        raise ValueError(f"outside {root}: {'/'.join(parts)}")
    return Path(path)


def page_detail(stem: str, page_id: str, engines: list[str]) -> dict:
    reference = under(GOLD_ROOT, stem, f"{page_id}.txt").read_text()
    second = under(GOLD_ROOT, stem, f"{page_id}.second.txt").read_text()
    first = under(GOLD_ROOT, stem, f"{page_id}.opus.txt").read_text()
    reads = latest_reads()
    readings = [{"label": "Opus (first transcription)", "diff": diff_segments(reference, first)}]
    readings.append(
        {"label": "Sonnet (second transcription)", "diff": diff_segments(reference, second)}
    )
    for engine in engines:
        root = reads.get(engine)
        if root is None:
            continue
        path = under(root, stem, f"{page_id}.txt")
        if path.exists():
            readings.append({"label": engine, "diff": diff_segments(reference, path.read_text())})
    return {"stem": stem, "page_id": page_id, "reference": reference, "readings": readings}


def save(stem: str, page_id: str, text: str, checked: bool) -> None:
    under(GOLD_ROOT, stem, f"{page_id}.txt").write_text(
        text if text.endswith("\n") else text + "\n"
    )
    meta_path = under(GOLD_ROOT, stem, "meta.json")
    meta = mark_checked(json.loads(meta_path.read_text()), page_id, checked)
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")


class Handler(BaseHTTPRequestHandler):
    engines: list[str] = []

    def log_message(self, format: str, *args: object) -> None:  # quiet
        return

    def _known(self, stem: str, page_id: str) -> bool:
        return any(p["stem"] == stem and p["page_id"] == page_id for p in pages())

    def _send(self, status: int, body: bytes, kind: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, value: object, status: int = 200) -> None:
        self._send(status, json.dumps(value, ensure_ascii=False).encode(), "application/json")

    def do_GET(self) -> None:
        parts = [unquote(p) for p in urlparse(self.path).path.strip("/").split("/") if p]
        if not parts:
            self._send(200, PAGE.encode(), "text/html; charset=utf-8")
        elif parts == ["api", "pages"]:
            self._json({"pages": pages(), "engines": self.engines})
        elif len(parts) == 4 and parts[:2] == ["api", "page"] and self._known(parts[2], parts[3]):
            self._json(page_detail(parts[2], parts[3], self.engines))
        elif len(parts) == 3 and parts[0] == "img" and self._known(parts[1], parts[2]):
            self._send(200, page_png(parts[1], int(parts[2][1:]) - 1), "image/png")
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/save":
            self._json({"error": "not found"}, 404)
            return
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        stem, page_id = str(body.get("stem")), str(body.get("page_id"))
        if not self._known(stem, page_id) or not isinstance(body.get("text"), str):
            self._json({"error": "unknown page"}, 400)
            return
        save(stem, page_id, body["text"], bool(body.get("checked")))
        self._json(page_detail(stem, page_id, self.engines))


# The review page itself; plain HTML, served as is.
PAGE = (Path(__file__).parent / "review.html").read_text()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--engines", default=DEFAULT_ENGINES, help="readings to show, comma-separated"
    )
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if not GOLD_ROOT.exists():
        print("no references yet: run `python -m evals.ocr.gold` first", file=sys.stderr)
        return 2
    Handler.engines = [e for e in args.engines.split(",") if e]
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"reviewing {len(pages())} pages at http://127.0.0.1:{args.port}  (Ctrl-C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
