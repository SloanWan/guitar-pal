import type { Notation, PageKind } from "@/lib/pageGold";

/** Each kind as the classifier's prompt defines it (book-service/app/graph/prompts.py). */
export const KIND_LABEL: Record<PageKind, { label: string; help: string }> = {
	prose: { label: "Prose", help: "explanation, lyrics, headings, tables of words; nothing to play" },
	chord_diagrams: { label: "Chord diagrams", help: "fretboard grids with dots (chord shapes), any number" },
	strum_notation: { label: "Strum notation", help: "down / up strokes (D U, arrows, X for a mute) over beats" },
	tab: { label: "Tab", help: "six lines with fret numbers on them, or the same as text (e|--0--3--|)" },
	progression_map: { label: "Progression map", help: "chord names or roman numerals in sequence, key charts" },
	fretboard_diagram: { label: "Fretboard map", help: "note names or scale positions across many frets; not played in time" },
	mixed: { label: "Mixed", help: "two or more of the kinds above, each in its own area" },
	other: { label: "Other", help: "staff notation without tab, photos, adverts, blank pages" },
};

export const NOTATION_LABEL: Record<Notation, string> = {
	tab: "Tab",
	jianpu: "Jianpu (numbers)",
	staff: "Staff (five lines)",
	strum: "Strum strokes",
	chord_diagrams: "Chord diagrams",
};
