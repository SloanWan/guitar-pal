"""
Seed the page-classification gold set (#422): one record per page of the
notation eval's sample (`evals.notation.run.PAGES`, 135 pages over nine
books), waiting to be checked on `/dev/page-gold`.

The classifier's verdicts already cached in `materials/notation-ref/` are the
model's answer the review starts from — they are Sonnet's, not a person's, so
scoring a model against them would only say how much it agrees with Sonnet.
The review page is where they become gold.

Each book is a set at `materials/page-gold/<book>/`:

    set.json          the book's file name
    p010.json         the page: the model's verdict, and the review
    pages/p010.png    the page as the reviewer sees it

A record starts `unchecked`, its answer filled in from the model's: the kind,
and the notation the kind and regions imply. `exercises` (how many tab
exercises the page holds) is left blank, as the model never counted them. The
review page writes `status` (`confirmed`: the kind is the model's;
`corrected`: it is not; `unusable`: the page cannot be judged), `kind`,
`notation`, `exercises` and `note`. A record already there is never
rewritten, so seeding again only adds what is new.

    cd book-service
    .venv/bin/python -m evals.classify.seed

No model call: it renders pages from the PDFs in `materials/` and reads the
cached verdicts.
"""

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import pymupdf

from evals.notation.run import PAGES, REF_ROOT, find_pdf

SERVICE = Path(__file__).resolve().parents[2]
MATERIALS = SERVICE / "materials"

RECORD_VERSION = 1
# Sharp enough to read a fret number with the page's zoom.
RENDER_DPI = 120

# Each sample book's set name: ASCII, so it is a safe path and URL segment.
SLUGS = {
    "sample-tab-乐理-编曲-10p.pdf": "sample-arranging",
    "sample-乐理-和声语汇-7p.pdf": "sample-harmony",
    "sample-text-tab-scanned-3p.pdf": "sample-text-tab-3p",
    "sample-text-tab-scanned-6p.pdf": "sample-text-tab-6p",
    "吉他自学三月通.pdf": "syt",
    "吉他自学三月通-和弦部分.pdf": "syt-chords",
    "Heavy_Metal_Rhythm_Guitar*.pdf": "heavy-metal",
    "电吉他手的养成计划*.pdf": "electric-365",
    "SongWritingFromMajorKeys.pdf": "songwriting",
}

# The notation a model kind implies; jianpu and staff the classifier has no
# kind for, so it never implies them.
NOTATION_OF_KIND = {
    "tab": "tab",
    "strum_notation": "strum",
    "chord_diagrams": "chord_diagrams",
}


def page_id(page: int) -> str:
    return f"p{page:03d}"


def implied_notation(kind: str, regions: list[str]) -> list[str]:
    """What the model's verdict says is printed on the page, in a fixed order."""
    kinds = {kind, *regions}
    return [n for k, n in NOTATION_OF_KIND.items() if k in kinds]


def record_for(slug: str, page: int, ref: dict) -> dict:
    kind = ref["kind"]
    usable = kind != "error"
    return {
        "version": RECORD_VERSION,
        "id": page_id(page),
        "set": slug,
        "page": page,
        "image": f"{page_id(page)}.png",
        "model": {
            "source": "the parse's classifier (claude-sonnet-5, 100 dpi + text), materials/notation-ref",
            "kind": kind,
            "regions": ref.get("regions", []),
            "note": ref.get("note", ""),
        },
        "status": "unchecked",
        # The answer starts as the model's; a page the classifier failed on starts blank.
        "kind": kind if usable else None,
        "notation": implied_notation(kind, ref.get("regions", [])) if usable else [],
        "exercises": None,
        "note": "",
        "reviewedAt": None,
    }


def seed_book(
    pdf: Path, slug: str, first: int, last: int, out_root: Path, ref_root: Path = REF_ROOT
) -> tuple[int, int, list[str]]:
    """Write a book's pages as unchecked records; (added, kept, skipped reasons)."""
    out = out_root / slug
    added = kept = 0
    skipped: list[str] = []
    with pymupdf.open(pdf) as doc:
        for page in range(first, last + 1):
            record_path = out / f"{page_id(page)}.json"
            if record_path.exists():
                kept += 1
                continue
            ref_path = ref_root / pdf.stem / f"{page_id(page)}.json"
            if not ref_path.exists():
                skipped.append(f"p{page}: no cached verdict (run evals.notation.run first)")
                continue
            if page > doc.page_count:
                skipped.append(f"p{page}: past the PDF's {doc.page_count} pages")
                continue
            (out / "pages").mkdir(parents=True, exist_ok=True)
            doc[page - 1].get_pixmap(dpi=RENDER_DPI).save(out / "pages" / f"{page_id(page)}.png")
            record = record_for(slug, page, json.loads(ref_path.read_text()))
            record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
            added += 1
    meta_path = out / "set.json"
    if added and not meta_path.exists():
        meta = {
            "title": pdf.stem,
            "source": f"materials/{pdf.name}",
            "seededAt": datetime.now(UTC).isoformat(timespec="seconds"),
        }
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
    return added, kept, skipped


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.parse_args(argv)

    out_root = MATERIALS / "page-gold"
    missing = 0
    for name, first, last in PAGES:
        pdf = find_pdf(name)
        if pdf is None:
            print(f"{name}: not in {MATERIALS}", file=sys.stderr)
            missing += 1
            continue
        added, kept, skipped = seed_book(pdf, SLUGS[name], first, last, out_root)
        print(f"{SLUGS[name]} p{first}–{last}: {added} added, {kept} already there, {len(skipped)} skipped")
        for reason in skipped:
            print(f"  skipped {reason}")
    return 1 if missing == len(PAGES) else 0


if __name__ == "__main__":
    sys.exit(main())
