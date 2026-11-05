import json

from evals.tab.score import load_records, score_reading, score_stored, summarise


def strings(**frets):
    """`e=0, B=1` → the six strings, high e first; `x` as a fret is a slap."""
    out = [{"fret": None, "muted": False} for _ in range(6)]
    for name, fret in frets.items():
        i = "eBGDAE".index(name)
        out[i] = {"fret": None, "muted": True} if fret == "x" else {"fret": fret, "muted": False}
    return out


def slot(duration="quarter", rest=False, chord=None, **frets):
    s = {"id": "s", "duration": duration, "strings": strings(**frets)}
    if rest:
        s["isRest"] = True
    if chord:
        s["chord"] = {"root": chord[0], "suffix": chord[1]}
    return s


def tab(*measures, description=None):
    p = {"measures": [{"id": f"m{i}", "slots": list(m)} for i, m in enumerate(measures)]}
    if description:
        p["description"] = description
    return p


BAR = [slot(A=0), slot(D=2), slot(G=0), slot(B=1)]


def test_a_reading_equal_to_its_gold_is_exact():
    sc = score_reading(tab(BAR), tab(BAR))
    assert sc.exact
    assert summarise([sc])["note_f1"] == 1.0


def test_a_digit_on_the_wrong_line_costs_the_note_not_the_fret():
    read = tab([slot(A=0), slot(D=2), slot(B=0), slot(B=1)])
    sc = score_reading(read, tab(BAR))
    rates = summarise([sc])
    assert rates["note_precision"] == 0.75
    assert rates["fret_f1"] == 1.0
    assert sc.differences == ["bar 1 @48: read quarter B0, gold quarter G0"]


def test_notes_are_matched_by_onset_so_a_merge_is_wrong_only_where_it_is():
    read = tab([slot("half", A=0), slot(G=0), slot(B=1)])
    sc = score_reading(read, tab(BAR))
    assert sc.matched_notes == 3
    assert summarise([sc])["rhythm"] == 0.5  # A0's value is wrong and D2's onset is gone


def test_an_empty_slot_is_a_rest():
    gold = tab([slot(A=0), slot(rest=True), slot(G=0), slot(B=1)])
    read = tab([slot(A=0), slot(), slot(G=0), slot(B=1)])
    assert score_reading(read, gold).exact


def test_chord_names_come_from_the_description_when_none_are_placed():
    gold = tab(
        [slot(A=0, chord=("C", "major")), slot(D=2), slot(G=0, chord=("A", "minor")), slot(B=1)]
    )
    read = tab(BAR, description="C C Am")
    sc = score_reading(read, gold)
    assert sc.chord_names_match  # the repeated C changes nothing
    assert (sc.gold_chords, sc.placed_chords) == (2, 0)
    assert not sc.exact
    assert summarise([sc])["chords_placed"] == 0.0


def test_placed_chords_count_on_the_same_onset():
    gold = tab(
        [slot(A=0, chord=("C", "major")), slot(D=2), slot(G=0, chord=("A", "minor")), slot(B=1)]
    )
    read = tab(
        [slot(A=0, chord=("C", "major")), slot(D=2, chord=("A", "minor")), slot(G=0), slot(B=1)]
    )
    sc = score_reading(read, gold)
    assert sc.chord_names_match
    assert sc.placed_chords == 1


def test_the_jianpu_flags_are_scored_against_the_wrong_notes():
    read = tab([slot(A=0), slot(D=2), slot(B=0), slot(e=1)])
    warnings = [
        {"code": "TAB_JIANPU_MISMATCH", "path": "measures[0].slots[2]", "message": "…"},
        {"code": "TAB_JIANPU_MISMATCH", "path": "measures[0].slots[0]", "message": "…"},
        {"code": "TAB_JIANPU_OCTAVE", "path": "measures", "message": "…"},
    ]
    rates = summarise([score_reading(read, tab(BAR), warnings)])
    assert rates["flag_precision"] == 0.5  # slot 0 was right
    assert rates["flag_recall"] == 0.5  # slot 3 was wrong and not flagged


def test_summarise_pools_notes_and_counts_exercises():
    right = score_reading(tab(BAR), tab(BAR))
    wrong = score_reading(tab([slot(A=0), slot(D=2), slot(B=0), slot(B=1)]), tab(BAR))
    rates = summarise([right, wrong])
    assert rates["note_recall"] == 7 / 8
    assert rates["exact"] == 0.5
    assert rates["exercises"] == 2


def test_a_dropped_exercise_misses_every_gold_note():
    dropped = score_reading(None, tab(BAR))
    assert not dropped.drafted and not dropped.exact
    assert (dropped.read_notes, dropped.gold_notes, dropped.matched_notes) == (0, 4, 0)
    assert dropped.differences[0] == "no draft: the parse dropped this exercise"
    rates = summarise([score_reading(tab(BAR), tab(BAR)), dropped])
    assert rates["note_recall"] == 0.5
    assert rates["note_precision"] == 1.0
    assert rates["drafted"] == 0.5


def marked(s, **marks):
    """`B={"link": {"kind": "hammer"}}` → the slot with those fields on that string's note."""
    for name, fields in marks.items():
        s["strings"]["eBGDAE".index(name)].update(fields)
    return s


def test_a_mark_counts_on_its_onset_string_and_kind():
    gold = tab(
        [
            slot(A=0),
            marked(slot(A=2), A={"link": {"kind": "hammer"}}),
            marked(slot(G=0), G={"effects": {"vibrato": {}, "pick": {"direction": "down"}}}),
            slot(B=1),
        ]
    )
    read = tab(
        [
            slot(A=0),
            marked(slot(A=2), A={"link": {"kind": "pull"}}),
            marked(slot(G=0), G={"effects": {"vibrato": {}, "pick": {"direction": "up"}}}),
            slot(B=1),
        ]
    )
    sc = score_reading(read, gold)
    assert (sc.gold_links, sc.read_links, sc.matched_links) == (1, 1, 0)
    assert (sc.gold_effects, sc.read_effects, sc.matched_effects) == (2, 2, 1)
    assert sc.kinds["pick down"] == [1, 0, 0] and sc.kinds["vibrato"] == [1, 1, 1]
    assert "bar 1 @24 A: missed hammer" in sc.differences
    assert "bar 1 @48: extra pick up" in sc.differences
    assert not sc.exact  # the notes are all right; the marks are not
    rates = summarise([sc])
    assert rates["note_f1"] == 1.0
    assert rates["link_f1"] == 0.0
    assert rates["effect_f1"] == 0.5


def test_a_pick_stroke_and_an_accent_are_the_column_s_counted_once():
    down = {"effects": {"pick": {"direction": "down"}, "accent": True}}
    gold = tab(
        [marked(slot(A=0, G=0, B=1), A=down, G=down, B=down), slot(D=2), slot(G=0), slot(B=1)]
    )
    read = tab([marked(slot(A=0, G=0, B=1), B=down), slot(D=2), slot(G=0), slot(B=1)])
    sc = score_reading(read, gold)
    assert (sc.gold_effects, sc.read_effects, sc.matched_effects) == (2, 2, 2)
    assert sc.exact


def test_a_reading_with_no_marks_scores_zero_and_a_tab_with_none_scores_nothing():
    gold = tab([slot(A=0), marked(slot(A=2), A={"link": {"kind": "slide"}}), slot(G=0), slot(B=1)])
    assert summarise([score_reading(tab(BAR), gold)])["link_f1"] == 0.0
    rates = summarise([score_reading(tab(BAR), tab(BAR))])
    assert "link_f1" not in rates and "span_f1" not in rates


def test_the_parse_v1_marks_are_read_as_v2():
    gold = tab(
        [
            slot("half", A=0),
            marked(slot(A=0), A={"link": {"kind": "tie"}}),
            marked(
                slot(G=2),
                G={
                    "link": {"kind": "slide"},
                    "effects": {"accent": True, "bend": {"semitones": 1}},
                },
            ),
        ]
    )
    read = tab(
        [
            slot("half", A=0),
            marked(slot(A=0), A={"tied": True, "technique": None}),
            marked(slot(G=2), G={"technique": "slide-up", "accent": True}),
        ]
    )
    sc = score_reading(read, gold)
    assert sc.matched_links == 2
    # v1 cannot hold a slide and a bend on one note
    assert (sc.gold_effects, sc.matched_effects) == (2, 1)
    v1_bend = tab(
        [slot("half", A=0), slot(A=0), marked(slot(G=2), G={"technique": "pre-bend-release"})]
    )
    assert sc.kinds["bend"][0] == 1
    assert score_reading(v1_bend, gold).kinds["bend"] == [1, 1, 1]


def test_a_span_covers_the_sounding_slots_from_its_first_to_its_last_across_bars():
    first = [dict(slot(A=0), id="a"), dict(slot(A=0), id="b"), slot(rest=True), slot(A=3)]
    second = [dict(slot(A=0), id="c"), slot(A=0), slot(A=0), slot(A=0)]
    gold = tab(first, second)
    gold["spans"] = [{"id": "pm", "kind": "palmMute", "from": "b", "to": "c"}]
    read = tab(
        [slot(A=0), marked(slot(A=0), A={"palmMute": True}), slot(rest=True), slot(A=3)],
        second,
    )
    sc = score_reading(read, gold)
    assert sc.gold_spans == 3  # b, the A3 and c: the rest between them is not under the mute
    assert (sc.read_spans, sc.matched_spans) == (1, 1)


def test_a_dotted_half_moves_the_onsets_after_it():
    read = tab([slot("dotted-half", A=0), slot(B=1)])
    gold = tab([slot("dotted-half", A=0), slot(B=1)])
    sc = score_reading(read, gold)
    assert sc.exact
    assert sc.differences == []
    shifted = score_reading(tab([slot("half", A=0), slot(B=1)]), gold)
    assert shifted.matched_notes == 1  # the B1 is read on beat 3, the gold's is on beat 4


def record(rid, status, gold):
    return {
        "version": 1,
        "id": rid,
        "set": "demo",
        "name": "…",
        "page": 3,
        "crop": f"crops/{rid}.png",
        "jianpu": True,
        "model": {"source": "parse.json", "draft": tab(BAR), "warnings": []},
        "status": status,
        "gold": gold,
        "note": "",
        "reviewedAt": None,
    }


def test_only_reviewed_records_are_scored_and_the_run_file_carries_no_names(tmp_path):
    gold_root = tmp_path / "tab-gold" / "demo"
    gold_root.mkdir(parents=True)
    (gold_root / "set.json").write_text("{}")
    for r in (
        record("p1", "confirmed", tab(BAR)),
        record("p2", "corrected", tab([slot(A=0), slot(D=2), slot(G=0), slot(B=3)])),
        record("p3", "unusable", None),
        record("p4", "unchecked", None),
    ):
        (gold_root / f"{r['id']}.json").write_text(json.dumps(r))

    out = tmp_path / "run.json"
    run = score_stored(load_records(tmp_path / "tab-gold"), out)
    assert [c["case"] for c in run["cases"]] == ["demo/p1", "demo/p2"]
    # Graded by numbers, not pass/fail: the case cells show a metric.
    assert all("pass" not in c for c in run["cases"])
    assert [c["metrics"]["exact"] for c in run["cases"]] == [1.0, 0.0]
    assert run["config"]["skipped"] == {"unusable": 1, "unchecked": 1}
    assert run["status"] == "done"
    written = json.loads(out.read_text())
    assert written["subjects"][0]["summary"]["exercises"] == 2
    assert "…" not in out.read_text()
