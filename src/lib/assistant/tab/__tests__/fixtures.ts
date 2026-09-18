import type { ChordIndexEntry } from "@/lib/chordSearch";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";
import type { ChordRef } from "@/lib/strumPatterns";
import { isBrowsableSuffix } from "@/lib/chordSuffixes";
import { CHORD_ROWS } from "@/lib/__fixtures__/chordData.fixture";

/** The same index the chord palette is given. */
export const INDEX: readonly ChordIndexEntry[] = CHORD_ROWS.filter((r) =>
	isBrowsableSuffix(r.suffix),
).map((r) => ({ root: r.root, suffix: r.suffix }));

const shape = (id: string, frets: string): ChordVoicing => ({
	id,
	label: null,
	start_fret: 1,
	barre_fret: null,
	capo: false,
	frets,
	fingers: "000000",
});

/** Open shapes, in the voicing tables' order: index 0 = low E. */
export const SHAPES: Record<string, ChordVoicing> = {
	"C major": shape("c", "x32010"),
	"A minor": shape("am", "x02210"),
	"G major": shape("g", "320003"),
	"E minor": shape("em", "022000"),
	"D major": shape("d", "xx0232"),
};

export const voicingFor = (ref: ChordRef): ChordVoicing | null =>
	SHAPES[`${ref.root} ${ref.suffix}`] ?? null;
