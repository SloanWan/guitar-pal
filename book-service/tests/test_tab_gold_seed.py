import json

from evals.tab.seed import exercise_id, seed_sample


def write_sample(root, exercises):
    sample = root / "samples" / "demo"
    (sample / "crops").mkdir(parents=True)
    export = {
        "exported_at": "2026-09-19T00:00:00Z",
        "book": {"title": "Demo book"},
        "chapters": [{"id": "c1", "title": "Chapter one"}],
        "exercises": exercises,
    }
    (sample / "parse.json").write_text(json.dumps(export))
    return sample


def tab_exercise(name, crop, **extra):
    return {
        "id": f"ex-{crop}",
        "page": 2,
        "kind": "tab",
        "draft": {"name": name, "measures": []},
        "warnings": [{"code": "TAB_JIANPU_OCTAVE", "path": "measures", "message": "…"}],
        "crop_path": f"user/crops/c1/{crop}.png",
        **extra,
    }


def test_exercise_id_is_the_crop_name():
    assert exercise_id("u/crops/chapter/p0002-r1-1.png") == "p0002-r1-1"


def test_seed_writes_unchecked_records_with_their_crops(tmp_path):
    sample = write_sample(tmp_path, [tab_exercise("Scale", "p0001-1")])
    (sample / "crops" / "p0001-1.png").write_bytes(b"png")

    added, kept, skipped = seed_sample(sample, tmp_path / "tab-gold")

    assert (added, kept, skipped) == (1, 0, [])
    out = tmp_path / "tab-gold" / "demo"
    record = json.loads((out / "p0001-1.json").read_text())
    assert record["status"] == "unchecked"
    assert record["gold"] is None
    assert record["name"] == "Scale"
    assert record["crop"] == "p0001-1.png"
    assert record["model"]["draft"] == {"name": "Scale", "measures": []}
    assert record["model"]["warnings"][0]["code"] == "TAB_JIANPU_OCTAVE"
    assert (out / "crops" / "p0001-1.png").read_bytes() == b"png"
    assert json.loads((out / "set.json").read_text())["title"] == "Demo book · Chapter one"


def test_seed_never_rewrites_a_reviewed_record(tmp_path):
    sample = write_sample(tmp_path, [tab_exercise("Scale", "p0001-1")])
    (sample / "crops" / "p0001-1.png").write_bytes(b"png")
    seed_sample(sample, tmp_path / "tab-gold")
    path = tmp_path / "tab-gold" / "demo" / "p0001-1.json"
    reviewed = {**json.loads(path.read_text()), "status": "confirmed"}
    path.write_text(json.dumps(reviewed))

    added, kept, _ = seed_sample(sample, tmp_path / "tab-gold")

    assert (added, kept) == (0, 1)
    assert json.loads(path.read_text())["status"] == "confirmed"


def test_seed_skips_what_it_cannot_review(tmp_path):
    sample = write_sample(
        tmp_path,
        [
            tab_exercise("No crop file", "p0001-1"),
            tab_exercise("Not tab", "p0001-2", kind="strum"),
            tab_exercise("No draft", "p0001-3", draft=None),
        ],
    )
    (sample / "crops" / "p0001-2.png").write_bytes(b"png")
    (sample / "crops" / "p0001-3.png").write_bytes(b"png")

    added, _, skipped = seed_sample(sample, tmp_path / "tab-gold")

    assert added == 0
    assert len(skipped) == 3
    assert not (tmp_path / "tab-gold" / "demo").exists()
