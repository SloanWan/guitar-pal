"""The prompts and output schemas of the chapter graph, in one place to read side by side."""

from pydantic import BaseModel, Field

CLASSIFY_SYSTEM = (
    "You are sorting one page of a guitar textbook by what is on it, so the right reader"
    " can be sent to it next. You get the page's text (when the PDF carries text) and,"
    " for pages that may hold notation, its image.\n\n"
    "Kinds:\n"
    "- prose: explanation, lyrics, headings, tables of words; nothing to play.\n"
    "- chord_diagrams: fretboard grids with dots (chord shapes), possibly many per page.\n"
    "- strum_notation: strumming patterns written as down/up strokes (D, U, arrows,"
    " ↓↑, X for a mute) over beats, with or without chord names.\n"
    "- tab: guitar tablature — six horizontal lines with fret numbers on them,"
    " or the same as monospaced text (e|--0--3--|).\n"
    "- progression_map: chord progressions given as sequences of chord names or roman"
    " numerals (C – G – Am – F, I – V – vi – IV), key charts, songwriting maps.\n"
    "- fretboard_diagram: a fretboard or neck chart showing note names or scale"
    " positions across many frets — a map of where notes are, not a sequence to play."
    " Not tab: tab has numbers placed in time along string lines.\n"
    "- mixed: two or more of the above kinds, each in its own area of the page.\n"
    "- other: standard music notation without tab, photos, adverts, blank pages.\n\n"
    "Rules:\n"
    "- Judge by what is actually on the page, not by the chapter's topic.\n"
    "- A page that explains a strum in words but shows no stroke notation is prose.\n"
    "- For mixed, list each region with its kind and its box as fractions of the page"
    " (x0, y0, x1, y1 from the top-left), so it can be cropped.\n"
    "- One short sentence of note, in English: what the page is. It is for the log."
)


class RegionOut(BaseModel):
    kind: str = Field(description="One of the kinds above, never mixed")
    bbox: list[float] = Field(
        description="[x0, y0, x1, y1] as fractions of page width and height, top-left origin"
    )


class PageClassOut(BaseModel):
    kind: str = Field(description="One of the kinds above")
    regions: list[RegionOut] = Field(default_factory=list, description="Only for mixed")
    note: str


NOTES_SYSTEM = (
    "You are reading one chapter of a guitar textbook and writing down what it teaches,"
    " as short knowledge points a learner can review without the book.\n\n"
    "Return 3 to 12 points, in the order the chapter introduces them. Each has:\n"
    "- title: a few words naming the concept, in the book's language.\n"
    "- body: one to four sentences in the book's own terms — what it is, how it is"
    " used, any rule or tip the book gives. Do not add facts the chapter does not"
    " state.\n"
    "- pages: the page numbers (as labelled in the text) the point comes from.\n\n"
    "Skip advertising, contact details and copyright text. If the text is OCR output,"
    " it may contain wrong characters; read through them and do not repeat them. If"
    " the chapter teaches nothing (a bare exercise list, a cover), return an empty list."
)


class NoteOut(BaseModel):
    title: str
    body: str
    pages: list[int] = Field(default_factory=list)


class NotesOut(BaseModel):
    notes: list[NoteOut]
