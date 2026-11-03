"""
Seed the tab extractor's gold set from parsed chapters (#202): one record per
exercise the parse segmented, waiting to be checked on `/dev/tab-gold`. An
exercise whose draft was dropped (`DRAFT_DROPPED`, which names its crop since
#420) is seeded with no draft, so its gold is written by hand and the scorer
counts it as missed rather than leaving it out.

Every export under `materials/samples/<name>/` (a `parse.json` and the
`crops/` the extractor read) becomes a set at `materials/tab-gold/<name>/`:

    set.json             where the set came from
    <exercise>.json      the crop's name, the model's draft and warnings, the review
    crops/<exercise>.png the crop, copied so the set stands on its own

A record starts `unchecked` with no gold. The review page writes `status`
(`confirmed`: the model's reading is right; `corrected`: the gold is the
reviewer's edit; `unusable`: not an exercise, or the crop lost part of it),
`gold` (a FingerpickPattern), `jianpu` and `note`. A record that is already
there is never rewritten, so seeding again only adds what is new.

    cd book-service
    python -m evals.tab.seed                      # every sample with crops
    python -m evals.tab.seed --samples syt-ch2    # one

No model call, no database: it reads files the parse already wrote.
"""

import argparse
import json
import shutil
import sys
from datetime import UTC, datetime
from pathlib import Path

SERVICE = Path(__file__).resolve().parents[2]
MATERIALS = SERVICE / "materials"

RECORD_VERSION = 1


def exercise_id(crop_path: str) -> str:
    """`…/crops/<chapter>/p0002-r1-1.png` → `p0002-r1-1`: the crop's name, unique in a chapter."""
    return Path(crop_path).stem


def seed_sample(sample: Path, out_root: Path) -> tuple[int, int, list[str]]:
    """Write a sample's exercises as unchecked records; (added, kept, skipped reasons)."""
    export = json.loads((sample / "parse.json").read_text())
    crops = sample / "crops"
    out = out_root / sample.name
    added = kept = 0
    skipped: list[str] = []

    chapters = {c["id"]: c for c in export.get("chapters", [])}
    # (crop path, name, page, draft, warnings): the drafts the parse made, then
    # the exercises it segmented and lost (#420), which have a crop and no draft.
    found: list[tuple[str, str | None, int | None, dict | None, list[dict]]] = []
    for exercise in export.get("exercises", []):
        crop_path = exercise.get("crop_path")
        if exercise.get("kind") != "tab" or not exercise.get("draft") or not crop_path:
            skipped.append(f"{exercise.get('id')}: not a tab draft with a crop")
            continue
        draft = exercise["draft"]
        warnings = exercise.get("warnings", [])
        found.append((crop_path, draft.get("name"), exercise.get("page"), draft, warnings))
    for warning in export.get("warnings", []):
        if warning.get("code") != "DRAFT_DROPPED":
            continue
        if not warning.get("crop_path"):
            skipped.append(f"{warning.get('path')}: dropped before crops were kept (#420)")
            continue
        found.append(
            (warning["crop_path"], warning.get("heading"), warning.get("page"), None, [warning])
        )

    for crop_path, name, page, draft, warnings in found:
        ident = exercise_id(crop_path)
        crop = crops / f"{ident}.png"
        if not crop.exists():
            skipped.append(f"{ident}: crop missing from {crops}")
            continue
        record_path = out / f"{ident}.json"
        if record_path.exists():
            kept += 1
            continue

        (out / "crops").mkdir(parents=True, exist_ok=True)
        shutil.copyfile(crop, out / "crops" / crop.name)
        record = {
            "version": RECORD_VERSION,
            "id": ident,
            "set": sample.name,
            "name": name or ident,
            "page": page,
            "crop": crop.name,
            "jianpu": None,
            "model": {
                "source": f"materials/samples/{sample.name}/parse.json",
                "exportedAt": export.get("exported_at"),
                # None: the parse lost this exercise, so its gold is written by hand.
                "draft": draft,
                "warnings": warnings,
            },
            "status": "unchecked",
            "gold": None,
            "note": "",
            "reviewedAt": None,
        }
        record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
        added += 1

    if added:
        book = export.get("book", {})
        titles = [chapters[c]["title"] for c in chapters]
        meta = {
            "title": " · ".join([book.get("title", sample.name), *titles]),
            "source": f"materials/samples/{sample.name}/parse.json",
            "seededAt": datetime.now(UTC).isoformat(timespec="seconds"),
        }
        meta_path = out / "set.json"
        if not meta_path.exists():
            meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
    return added, kept, skipped


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--materials", type=Path, default=MATERIALS, help="the materials folder")
    parser.add_argument("--samples", help="comma-separated sample names (default: all with crops)")
    args = parser.parse_args(argv)

    samples_root = args.materials / "samples"
    names = args.samples.split(",") if args.samples else None
    samples = sorted(
        p
        for p in samples_root.iterdir()
        if (p / "parse.json").exists()
        and (p / "crops").is_dir()
        and (names is None or p.name in names)
    )
    if not samples:
        print(f"No sample with a parse.json and crops/ under {samples_root}", file=sys.stderr)
        return 1

    out_root = args.materials / "tab-gold"
    for sample in samples:
        added, kept, skipped = seed_sample(sample, out_root)
        print(f"{sample.name}: {added} added, {kept} already there, {len(skipped)} skipped")
        for reason in skipped:
            print(f"  skipped {reason}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
