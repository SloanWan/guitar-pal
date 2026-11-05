from evals.classify.score import score_page, sends_tab, summarise


def page(kind, notation, exercises=0):
    return {"kind": kind, "notation": notation, "exercises": exercises}


def test_only_tab_and_the_tab_regions_of_mixed_are_sent():
    assert sends_tab("tab", [])
    assert sends_tab("mixed", ["prose", "tab"])
    assert not sends_tab("mixed", ["prose", "strum_notation"])
    # A region is never mixed, and a region's kind on a non-mixed page is not read.
    assert not sends_tab("prose", ["tab"])


def test_a_tab_page_not_sent_loses_its_exercises():
    sc = score_page(page("mixed", ["tab"], 4), "mixed", ["prose", "strum_notation"])
    assert sc.has_tab and not sc.sent and sc.exercises == 4
    assert sc.failures[0] == "tab printed (4 exercises) but not sent: mixed [prose, strum_notation]"
    assert "strum in the verdict, not printed" in sc.failures


def test_staff_and_jianpu_beside_a_tab_are_not_scored():
    sc = score_page(page("tab", ["tab", "staff", "jianpu"], 2), "tab", [])
    assert sc.failures == []
    assert (sc.gold_marks, sc.verdict_marks, sc.matched_marks) == (1, 1, 1)


def test_the_summary_pools_pages_and_exercises():
    scores = [
        score_page(page("tab", ["tab"], 3), "tab", []),
        score_page(page("mixed", ["tab"], 1), "mixed", ["prose"]),
        score_page(page("prose", []), "mixed", ["prose", "tab"]),
        score_page(page("prose", []), "prose", []),
    ]
    s = summarise(scores)
    assert s["tab_page_recall"] == 0.5
    assert s["tab_exercise_recall"] == 0.75
    assert s["missed_exercises"] == 1
    assert s["tab_page_precision"] == 0.5
    assert s["kind_accuracy"] == 0.75
    assert s["pages"] == 4
