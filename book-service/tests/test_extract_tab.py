"""
The tab extractor (#202 B5) with the model and the validator replaced: the
token grammar, the tab/jianpu reconciliation, the draft shape, the repair
loop, and the graph's routing of tab pages and regions. The readings here
are the ones calibration §6 recorded, so the numbers are a real page's.
"""

import asyncio
from dataclasses import dataclass, field
from types import SimpleNamespace

import pytest

from app.extract.tab import (
    READ_SYSTEM,
    SEGMENT_SYSTEM,
    Note,
    Struck,
    TabReadingOut,
    chord_line,
    looks_like_text_tab,
    midi_from_jianpu,
    midi_from_tab,
    pad_region,
    parse_reading,
    reconcile,
    within,
)
from app.graph.chapter import ChapterParseGraph
from app.graph.prompts import CLASSIFY_SYSTEM, NOTES_SYSTEM, NotesOut, PageClassOut, RegionOut
from app.parse import ParsePage, ParseTools
from app.validate import Verdict
from tests.test_graph import BOOK, CHAPTER

# ⑥弦:E–F–G from 《吉他自学三月通》 p206, as Opus 5 read it (39/39 against the page).
STRING_SIX = TabReadingOut(
    heading="⑥弦:E–F–G",
    key="C",
    time_signature="4/4",
    bpm=100,
    tab_bars=[
        "6:0/q 6:0/e 6:0/e 6:0/q 6:0/e 6:0/e",
        "6:3/q 6:3/q 6:1/q 6:3/q",
        "6:0/q 6:0/e 6:0/e 6:0/q 6:0/e 6:0/e",
        "6:1/h 6:3/q 6:1/q",
    ],
    jianpu_bars=[
        "3-/q 3-/e 3-/e 3-/q 3-/e 3-/e",
        "5-/q 5-/q 4-/q 5-/q",
        "3-/q 3-/e 3-/e 3-/q 3-/e 3-/e",
        "4-/h 5-/q 4-/q",
    ],
    chords="1.1:C 2.1:G7 3.1:C 4.1:F 4.2:G7",
    unclear=[],
)


# --- the pure part ------------------------------------------------------------


def test_reading_parses_into_notes_with_chords() -> None:
    bars, warnings = parse_reading(STRING_SIX)
    assert warnings == []
    assert [len(b) for b in bars] == [6, 4, 6, 3]
    first = bars[0][0]
    assert first == Note((Struck(6, 0),), "quarter", 3, -1, "", "C")
    assert bars[3][0].duration == "half" and bars[3][1].chord == "G7"
    assert chord_line(bars) == "C G7 C F G7"


def test_jianpu_and_tab_land_on_the_same_midi() -> None:
    # String ⑥ open is E2 = 40; the book prints it as 3 with a dot below in 1=C.
    note = Note((Struck(6, 0),), "quarter", 3, -1, "", None)
    assert midi_from_tab(note.struck[0]) == 40 == midi_from_jianpu(note, "C")
    # #1 with a dot above = C#4 = 61 = string ② fret 2.
    sharp = Note((Struck(2, 2),), "quarter", 1, 1, "#", None)
    assert midi_from_tab(sharp.struck[0]) == 61 == midi_from_jianpu(sharp, "C")
    # The key moves the jianpu, not the tab: 1=G, degree 1 plain = G3 = 55.
    assert midi_from_jianpu(Note((Struck(3, 0),), "quarter", 1, 0, "", None), "G") == 55
    assert midi_from_jianpu(Note((), "quarter", None, 0, "", None), "C") is None


def test_agreeing_readings_make_a_clean_draft() -> None:
    bars, _ = parse_reading(STRING_SIX)
    result = reconcile(STRING_SIX, bars)
    assert result.warnings == []
    draft = result.draft
    assert draft["name"] == "⑥弦:E–F–G"
    assert draft["bpm"] == 100 and draft["timeSignature"] == [4, 4]
    measures = draft["measures"]
    assert isinstance(measures, list) and len(measures) == 4
    slot = measures[1]["slots"][2]
    assert slot["duration"] == "quarter"
    # String ⑥ is index 5; the other five strings are silent.
    assert [s["fret"] for s in slot["strings"]] == [None, None, None, None, None, 1]
    assert "isRest" not in slot


def test_disagreement_keeps_the_tab_and_warns_with_both_readings() -> None:
    # The low-effort calibration run: the model put the note a string too high.
    out = STRING_SIX.model_copy(update={"tab_bars": ["6:3/q"], "jianpu_bars": ["4-/q"]})
    bars, _ = parse_reading(out)
    result = reconcile(out, bars)
    assert [s["fret"] for s in result.draft["measures"][0]["slots"][0]["strings"]][5] == 3
    assert len(result.warnings) == 1
    w = result.warnings[0]
    assert w["code"] == "TAB_JIANPU_MISMATCH"
    assert w["path"] == "measures[0].slots[0]"
    assert "fret 3" in w["message"] and "MIDI 43" in w["message"] and "MIDI 41" in w["message"]


def test_octave_only_disagreements_are_one_warning_per_draft() -> None:
    # p207 ④弦—⑤弦: the model saw octave dots that are not printed, on 13 of 33 notes.
    out = STRING_SIX.model_copy(
        update={
            "tab_bars": ["5:0/e 5:0/e 4:2/e 5:0/e", "4:0/e 5:3/e"],
            "jianpu_bars": ["6-/e 6-/e 3-/e 6-/e", "2-/e 1-/e"],
        }
    )
    bars, _ = parse_reading(out)
    result = reconcile(out, bars)
    assert [w["code"] for w in result.warnings] == ["TAB_JIANPU_OCTAVE"]
    assert result.warnings[0]["message"].startswith("3 note(s)")
    assert "bar 1 note 3, bar 2 note 1, bar 2 note 2" in result.warnings[0]["message"]
    # The tab's frets stand.
    assert result.draft["measures"][0]["slots"][2]["strings"][3]["fret"] == 2


def test_unreadable_tab_digit_is_filled_from_the_jianpu_with_a_warning() -> None:
    out = STRING_SIX.model_copy(update={"tab_bars": ["6:?/q 6:?/q"], "jianpu_bars": ["4-/q ?/q"]})
    bars, _ = parse_reading(out)
    result = reconcile(out, bars)
    slots = result.draft["measures"][0]["slots"]
    # F2 on string ⑥ is fret 1; the second note had neither reading and is a rest.
    assert slots[0]["strings"][5]["fret"] == 1
    assert slots[1].get("isRest") is True
    assert [w["code"] for w in result.warnings] == ["TAB_FRET_FROM_JIANPU", "TAB_NOTE_UNREAD"]
    # A jianpu read an octave high still lands on the playable fret; one off the string is a rest.
    high = STRING_SIX.model_copy(update={"tab_bars": ["6:?/q 1:?/q"], "jianpu_bars": ["4/q 6-/q"]})
    bars, _ = parse_reading(high)
    slots = reconcile(high, bars).draft["measures"][0]["slots"]
    assert slots[0]["strings"][5]["fret"] == 1
    assert slots[1].get("isRest") is True


def test_a_stack_is_not_checked_against_the_jianpu() -> None:
    out = STRING_SIX.model_copy(update={"tab_bars": ["1:0+2:1/h"], "jianpu_bars": ["3+/h"]})
    bars, _ = parse_reading(out)
    result = reconcile(out, bars)
    strings = result.draft["measures"][0]["slots"][0]["strings"]
    assert [s["fret"] for s in strings] == [0, 1, None, None, None, None]
    assert result.warnings == []


def test_misaligned_jianpu_is_dropped_per_bar_and_bad_tokens_are_dropped() -> None:
    out = STRING_SIX.model_copy(
        update={"tab_bars": ["6:0/q 6:x/q 6:1/q", "6:3/w"], "jianpu_bars": ["3-/q 4-/q"]}
    )
    bars, warnings = parse_reading(out)
    assert [len(b) for b in bars] == [2, 1]
    codes = sorted(w["code"] for w in warnings)
    assert codes == ["TAB_JIANPU_BARS", "TAB_JIANPU_COUNT", "TAB_TOKEN"]
    # No jianpu survived for bar 1, so nothing to reconcile there.
    assert all(n.degree is None for n in bars[0])


def test_a_lost_heading_falls_back_to_the_segmenters() -> None:
    out = STRING_SIX.model_copy(update={"heading": " "})
    bars, _ = parse_reading(out)
    assert reconcile(out, bars, "②弦—③弦组合练习").draft["name"] == "②弦—③弦组合练习"
    assert reconcile(out, bars).draft["name"] == "Book exercise"


def test_a_dotted_half_is_a_half_tied_to_a_quarter() -> None:
    out = STRING_SIX.model_copy(update={"tab_bars": ["5:3/h. 5:0/q"], "jianpu_bars": []})
    bars, _ = parse_reading(out)
    slots = reconcile(out, bars).draft["measures"][0]["slots"]
    assert [s["duration"] for s in slots] == ["half", "quarter", "quarter"]
    assert [s["strings"][4]["tied"] for s in slots] == [False, True, False]
    assert [s["strings"][4]["fret"] for s in slots] == [3, 3, 0]
    assert slots[1]["strings"][0]["tied"] is False  # only the sounding string ties


def test_odd_tempo_and_meter_are_left_to_the_validator() -> None:
    out = STRING_SIX.model_copy(update={"bpm": 999, "time_signature": "common"})
    bars, _ = parse_reading(out)
    draft = reconcile(out, bars).draft
    assert "bpm" not in draft and "timeSignature" not in draft


def test_regions_pad_and_nest() -> None:
    assert pad_region((0.1, 0.02, 0.9, 0.995)) == (0.1, 0.0, 0.9, 1.0)
    # A box in the lower half of the page, given as fractions of that crop.
    assert within((0.0, 0.5, 1.0, 1.0), (0.1, 0.2, 0.9, 0.6)) == (0.1, 0.6, 0.9, 0.8)


def test_text_layer_tab_is_recognised() -> None:
    text = (
        "Exercise 1\ne|--0--3--|\nB|--1--1--|\nG|--0--0--|\nD|--2--2--|\nA|--3-----|\nE|--------|"
    )
    assert looks_like_text_tab(text)
    assert not looks_like_text_tab("The C chord | is played with | three fingers")


# --- the graph with a fake model and validator ---------------------------------


@dataclass
class FakeModel:
    """Classifies pages by `kinds`, segments every image into `segments`, reads `reading`."""

    kinds: dict[int, str]
    segments: int = 1
    reading: TabReadingOut = field(default_factory=lambda: STRING_SIX)
    requests: list[dict] = field(default_factory=list)

    async def parse(self, **kwargs: object) -> object:
        self.requests.append(kwargs)
        usage = SimpleNamespace(input_tokens=100, output_tokens=10)
        system = kwargs["system"]
        if system == CLASSIFY_SYSTEM:
            first = kwargs["messages"][0]["content"][0]["text"]  # type: ignore[index]
            page = int(first.rsplit("Page ", 1)[1].rstrip("."))
            kind = self.kinds.get(page, "prose")
            regions = (
                [
                    RegionOut(kind="prose", bbox=[0, 0, 1, 0.5]),
                    RegionOut(kind="tab", bbox=[0, 0.5, 1, 1]),
                ]
                if kind == "mixed"
                else []
            )
            out: object = PageClassOut(kind=kind, regions=regions, note="")
        elif system == NOTES_SYSTEM:
            out = NotesOut(notes=[])
        elif system == SEGMENT_SYSTEM:
            from app.extract.tab import SegmentOut, SegmentsOut

            out = SegmentsOut(
                exercises=[
                    SegmentOut(
                        heading=f"ex{i + 1}", staves=1, bbox=[0.1, 0.2 * i, 0.9, 0.2 * i + 0.2]
                    )
                    for i in range(self.segments)
                ]
            )
        elif system == READ_SYSTEM:
            out = self.reading
        else:
            raise AssertionError("unexpected system prompt")
        return SimpleNamespace(stop_reason="end_turn", parsed_output=out, usage=usage)


@dataclass
class FakeValidator:
    """Rejects the first `reject` drafts, then accepts, echoing the draft as the pattern."""

    reject: int = 0
    drafts: list[dict] = field(default_factory=list)

    async def tab(self, draft: dict, repeats: list | None = None) -> Verdict:
        self.drafts.append(draft)
        if len(self.drafts) <= self.reject:
            return Verdict(
                ok=False, errors=[{"code": "BAD", "path": "measures[0]", "message": "no"}]
            )
        return Verdict(
            ok=True,
            warnings=[{"code": "CAPPED", "path": "measures", "message": "cut"}],
            pattern=draft,
        )


@dataclass
class FakeRenderer:
    calls: list[tuple[int, tuple | None, int]] = field(default_factory=list)

    async def render(self, page: int, region: tuple | None, dpi: int) -> bytes:
        self.calls.append((page, region, dpi))
        return b"png"


@dataclass
class FakeCrops:
    saved: list[str] = field(default_factory=list)

    async def save(self, name: str, png: bytes) -> str | None:
        self.saved.append(name)
        return f"u/crops/c/{name}"


def _page(n: int, text: str = "", layer: bool = False, image: bytes | None = b"png") -> ParsePage:
    return ParsePage(page=n, text=text, has_text_layer=layer, may_have_exercise=True, image=image)


def _graph(model: FakeModel, validator: FakeValidator | None) -> ChapterParseGraph:
    return ChapterParseGraph(SimpleNamespace(messages=model), validator)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_tab_page_yields_one_literal_draft_per_exercise() -> None:
    model, validator = FakeModel({1: "tab"}, segments=2), FakeValidator()
    renderer, crops = FakeRenderer(), FakeCrops()
    result = await _graph(model, validator)(BOOK, CHAPTER, [_page(1)], ParseTools(renderer, crops))

    assert [(e.page, e.kind, e.source) for e in result.exercises] == [(1, "tab", "literal")] * 2
    first = result.exercises[0]
    assert first.draft["name"] == "⑥弦:E–F–G" and first.draft["description"] == "C G7 C F G7"
    assert first.warnings == [{"code": "CAPPED", "path": "measures", "message": "cut"}]
    assert sorted(e.crop_path for e in result.exercises) == [
        "u/crops/c/p0001-1.png",
        "u/crops/c/p0001-2.png",
    ]
    # The classifier's image served the segmenter; each exercise was cropped at reading size.
    assert [(p, d) for p, _, d in renderer.calls] == [(1, 150), (1, 150)]
    assert renderer.calls[0][1] == pytest.approx((0.1, 0.0, 0.9, 0.21))
    assert renderer.calls[1][1] == pytest.approx((0.1, 0.16, 0.9, 0.41))
    assert result.warnings == []
    # One classify, one segment, two reads; no notes call for a page without text.
    assert len(model.requests) == 4


@pytest.mark.asyncio
async def test_rejected_draft_is_repaired_once_then_dropped() -> None:
    model, validator = FakeModel({1: "tab"}), FakeValidator(reject=1)
    result = await _graph(model, validator)(
        BOOK, CHAPTER, [_page(1)], ParseTools(FakeRenderer(), FakeCrops())
    )
    assert len(result.exercises) == 1 and len(validator.drafts) == 2
    repair = [r for r in model.requests if r["system"] == READ_SYSTEM][1]
    assert (
        "rejected" in repair["messages"][2]["content"]
        and "measures[0]: no" in repair["messages"][2]["content"]
    )

    model, validator = FakeModel({1: "tab"}), FakeValidator(reject=2)
    result = await _graph(model, validator)(
        BOOK, CHAPTER, [_page(1)], ParseTools(FakeRenderer(), FakeCrops())
    )
    assert result.exercises == []
    assert [w["code"] for w in result.warnings] == ["DRAFT_DROPPED"]
    assert "'ex1'" in result.warnings[0]["message"]
    assert len([r for r in model.requests if r["system"] == READ_SYSTEM]) == 2


@pytest.mark.asyncio
async def test_tab_region_of_a_mixed_page_is_cropped_within_the_region() -> None:
    model, validator = FakeModel({2: "mixed"}), FakeValidator()
    renderer = FakeRenderer()
    result = await _graph(model, validator)(
        BOOK, CHAPTER, [_page(2)], ParseTools(renderer, FakeCrops())
    )
    assert len(result.exercises) == 1
    # The segmenter saw the lower half at classifier dpi; the exercise box is nested in it.
    assert renderer.calls[0] == (2, (0.0, 0.5, 1.0, 1.0), 100)
    page, box, dpi = renderer.calls[1]
    assert (page, dpi) == (2, 150)
    assert box == pytest.approx((0.1, 0.5 - 0.04, 0.9, 0.61))
    # Region crops carry the region's ordinal, so two tab regions on a page never collide.
    assert result.exercises[0].crop_path == "u/crops/c/p0002-r1-1.png"


@pytest.mark.asyncio
async def test_text_layer_tab_and_prose_pages_are_not_read() -> None:
    text = "e|--0--3--|\nB|--1--1--|\nG|--0--0--|\nD|--2--2--|"
    model, validator = FakeModel({1: "tab", 2: "prose"}), FakeValidator()
    pages = [_page(1, text, layer=True), _page(2, "words", layer=True, image=None)]
    result = await _graph(model, validator)(
        BOOK, CHAPTER, pages, ParseTools(FakeRenderer(), FakeCrops())
    )
    assert result.exercises == []
    assert [w["code"] for w in result.warnings] == ["TEXT_TAB_SKIPPED"]
    assert result.warnings[0]["path"] == "page 1"
    assert "read it by ear" in result.warnings[0]["message"]
    assert not any(r["system"] in (SEGMENT_SYSTEM, READ_SYSTEM) for r in model.requests)


@pytest.mark.asyncio
async def test_without_a_validator_tab_pages_end_at_classification() -> None:
    model = FakeModel({1: "tab"})
    result = await _graph(model, None)(
        BOOK, CHAPTER, [_page(1)], ParseTools(FakeRenderer(), FakeCrops())
    )
    assert result.exercises == [] and result.warnings == []
    assert [r["system"] for r in model.requests].count(SEGMENT_SYSTEM) == 0


@pytest.mark.asyncio
async def test_reads_run_concurrently_but_bounded() -> None:
    from app.extract import tab as tab_module

    in_flight = 0
    peak = 0

    class SlowModel(FakeModel):
        async def parse(self, **kwargs: object) -> object:
            nonlocal in_flight, peak
            if kwargs["system"] == READ_SYSTEM:
                in_flight += 1
                peak = max(peak, in_flight)
                await asyncio.sleep(0.01)
                in_flight -= 1
            return await super().parse(**kwargs)

    model = SlowModel({1: "tab"}, segments=6)
    result = await _graph(model, FakeValidator())(
        BOOK, CHAPTER, [_page(1)], ParseTools(FakeRenderer(), FakeCrops())
    )
    assert len(result.exercises) == 6
    assert 1 < peak <= tab_module.READ_CONCURRENCY
