from evals.notation.run import PageFacts, detectors, has_notation


def facts(text: str, v3: list[float], cdla: list[float], layer: bool = False) -> PageFacts:
    return PageFacts(
        "x/p001",
        layer,
        text,
        0.5,
        {"pp_doc_layoutv3": v3, "pp_layout_cdla": cdla},
        {"pp_doc_layoutv3": 0.7, "pp_layout_cdla": 0.06},
    )


def test_a_page_has_notation_when_the_classifier_says_so():
    assert has_notation({"kind": "tab", "regions": []})
    assert has_notation({"kind": "mixed", "regions": ["tab"]})
    assert not has_notation({"kind": "prose", "regions": []})
    assert not has_notation({"kind": "other", "regions": []})


def test_icons_do_not_count_and_combined_detectors_skip_only_when_both_see_nothing():
    got = detectors(facts("第一章 认识吉他", v3=[0.01], cdla=[]))
    assert got["v3"][0] is True  # the headstock icon
    assert got["v3-big"][0] is False
    assert got["v3-big+tags"][0] is False
    assert got["everything"][0] is True
    tagged = detectors(facts("扫弦练习 D DU UDU", v3=[], cdla=[]))
    assert tagged["tags"][0] is True and tagged["cdla+tags"][0] is True


def test_a_text_layer_page_costs_no_ocr_time():
    assert detectors(facts("prose", v3=[], cdla=[], layer=True))["tags"][1] == 0.0
