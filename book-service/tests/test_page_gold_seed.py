import json

import pymupdf

from evals.classify.seed import implied_notation, page_id, seed_book


def write_book(root, pages):
    pdf = root / "Demo book.pdf"
    doc = pymupdf.open()
    for _ in range(pages):
        doc.new_page(width=200, height=300)
    doc.save(pdf)
    doc.close()
    return pdf


def write_verdict(ref_root, page, kind, regions=()):
    path = ref_root / "Demo book" / f"{page_id(page)}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"kind": kind, "regions": list(regions), "note": "n", "cost_usd": 0.01})
    )


def test_the_notation_a_verdict_implies():
    assert implied_notation("tab", []) == ["tab"]
    assert implied_notation("mixed", ["prose", "chord_diagrams", "tab"]) == [
        "tab",
        "chord_diagrams",
    ]
    assert implied_notation("fretboard_diagram", []) == ["fretboard"]
    assert implied_notation("other", []) == []


def test_seed_starts_each_page_from_the_models_verdict(tmp_path):
    pdf = write_book(tmp_path, 3)
    refs = tmp_path / "notation-ref"
    write_verdict(refs, 2, "mixed", ["prose", "tab"])
    write_verdict(refs, 3, "error")

    added, kept, skipped = seed_book(pdf, "demo", 1, 3, tmp_path / "page-gold", refs)

    assert (added, kept) == (2, 0)
    assert skipped == ["p1: no cached verdict (run evals.notation.run first)"]
    out = tmp_path / "page-gold" / "demo"
    record = json.loads((out / "p002.json").read_text())
    assert record["status"] == "unchecked"
    assert record["kind"] == "mixed"
    assert record["notation"] == ["tab"]
    # Never counted by the model: the reviewer writes it.
    assert record["exercises"] is None
    assert record["model"]["regions"] == ["prose", "tab"]
    assert (out / "pages" / "p002.png").read_bytes().startswith(b"\x89PNG")
    # A page the classifier failed on starts with no answer to confirm.
    failed = json.loads((out / "p003.json").read_text())
    assert failed["kind"] is None
    assert json.loads((out / "set.json").read_text())["title"] == "Demo book"


def test_seeding_again_keeps_a_review(tmp_path):
    pdf = write_book(tmp_path, 1)
    refs = tmp_path / "notation-ref"
    write_verdict(refs, 1, "tab")
    out_root = tmp_path / "page-gold"
    seed_book(pdf, "demo", 1, 1, out_root, refs)
    path = out_root / "demo" / "p001.json"
    reviewed = {**json.loads(path.read_text()), "status": "confirmed", "exercises": 3}
    path.write_text(json.dumps(reviewed))

    assert seed_book(pdf, "demo", 1, 1, out_root, refs) == (0, 1, [])
    assert json.loads(path.read_text())["exercises"] == 3
