from pathlib import Path

from app.ingest.pdf import extract_pages, open_pdf
from app.ingest.tag import may_have_exercise, tag_text
from tests.conftest import needs_materials

# --- against the real excerpts -----------------------------------------------


@needs_materials
def test_typeset_excerpt_tags_the_chord_maps_and_not_the_prose(typeset_pdf: Path) -> None:
    with open_pdf(typeset_pdf) as doc:
        pages = extract_pages(doc)
    by_page = {p.page: tag_text(p.text) for p in pages}

    # p1 is the chapter opener, p2 the section's prose introduction: both
    # mention "progressions" (the keyword rule is generous by design) but
    # neither carries a progression the parse could lift.
    assert by_page[1].reasons == ("keyword",)
    assert by_page[2].reasons == ("keyword",)
    # p3-p9 are the key sheets: roman-numeral maps and a `C – G – Am – F` example each.
    for n in range(3, 10):
        assert "chord_progression" in by_page[n].reasons, n
    # Nothing on these pages looks like strum notation or tab.
    assert all(
        "stroke_notation" not in t.reasons and "tab_lines" not in t.reasons
        for t in by_page.values()
    )


@needs_materials
def test_scanned_excerpt_has_nothing_to_tag(scanned_pdf: Path) -> None:
    with open_pdf(scanned_pdf) as doc:
        pages = extract_pages(doc)
    assert all(not p.has_text_layer for p in pages)
    assert not any(may_have_exercise(p.text) for p in pages)


# --- rules the excerpts do not exercise ----------------------------------------
# Neither material has strum notation, a text-layer tab or a lyric sheet. These
# are minimal hand-written cases for the rule shapes; they are not calibration.


def test_stroke_notation_shapes() -> None:
    assert "stroke_notation" in tag_text("D DU UD U").reasons
    assert "stroke_notation" in tag_text("↓ ↓ ↑ ↑ ↓ ↑").reasons
    # A chord map draws its flow as one arrow per line; that is a diagram, not a strum.
    assert "stroke_notation" not in tag_text("I\n↓\nIV\n↓\nV").reasons


def test_tab_line_shape() -> None:
    tab = "e|-----------------|\nB|-----1---3---1---|\nG|---2---2---2---2-|"
    assert "tab_lines" in tag_text(tab).reasons
    # Two lines are not a tab; a rule of dashes has no fret numbers.
    assert "tab_lines" not in tag_text("e|-----1-----|\nB|---3-------|").reasons
    assert (
        "tab_lines" not in tag_text("----------------\n----------------\n----------------").reasons
    )


def test_lyric_sheet_chord_line_is_not_a_progression() -> None:
    lyrics = (
        "C            G            Am\n"
        "Down by the river where the water runs\n"
        "F            C            G"
    )
    assert not may_have_exercise(lyrics)


def test_guitar_prose_is_not_tagged() -> None:
    prose = "I started picking up the guitar at twelve. With practice the barre chord became easy."
    assert not may_have_exercise(prose)
    assert not may_have_exercise("吉他由琴头、琴颈和琴身三部分组成。")
    assert tag_text("本节的练习请配合节拍器完成，扫弦时手腕放松。").reasons == ("keyword",)


def test_empty_text_is_never_tagged() -> None:
    assert tag_text("") == (False, ())
    assert tag_text("   \n  ") == (False, ())
