import type { ActiveCell, ChordView } from "@/components/strum/StepGrid";
import { PRESET_STRUM_PATTERNS, type Bar, type Beat, type ChordRef } from "@/lib/strumPatterns";
import { seg } from "./progress";

/**
 * The strum chapter's story as a function of scroll progress: the rhythm is
 * tapped in cell by cell, the playhead sweeps two bars while the tempo counts
 * up, a progression is typed as words, and finally a capo goes on and the
 * chord names flip to shapes.
 */

const OLD_FAITHFUL_ID = "4-4 old faithful";

export const STRUM_DEMO_BEATS: readonly Beat[] =
	PRESET_STRUM_PATTERNS.find((p) => p.id === OLD_FAITHFUL_ID)?.beats ?? [];
export const STRUM_DEMO_CHORDS: readonly ChordRef[] = [
	{ root: "C", suffix: "major" },
	{ root: "G", suffix: "major" },
];
export const STRUM_DEMO_PROGRESSION = "C G Am F";
export const STRUM_DEMO_BPM_FROM = 80;
export const STRUM_DEMO_BPM_TO = 92;
export const STRUM_DEMO_CAPO = 2;

const PHASE = {
	reveal: [0, 0.12],
	sweep: [0.12, 0.56],
	tempo: [0.14, 0.3],
	progression: [0.58, 0.78],
	chip: [0.8, 1],
	capoAt: 0.82,
	diagramAt: 0.86,
} as const;

export interface StrumStage {
	bars: Bar[];
	activeCell: ActiveCell | null;
	bpm: number;
	/** The progression line as typed so far; null before the line appears. */
	progressionText: string | null;
	/** How many of the progression's chord chips have landed. */
	chipsShown: number;
	/** The chip the playhead would be on, once the progression exists. */
	currentChip: number | null;
	capo: number | null;
	chordView: ChordView;
	/** The toolbar's position readout. */
	position: string;
}

const cellsPerBar = (beats: readonly Beat[]): number => beats.reduce((n, b) => n + b.length, 0);

/** The (beat, cell) a flat index into one bar lands on. */
export function cellAt(beats: readonly Beat[], flatIndex: number): { beatIdx: number; cellIdx: number } {
	let i = flatIndex;
	for (let beatIdx = 0; beatIdx < beats.length; beatIdx++) {
		if (i < beats[beatIdx].length) return { beatIdx, cellIdx: i };
		i -= beats[beatIdx].length;
	}
	const last = beats.length - 1;
	return { beatIdx: last, cellIdx: beats[last].length - 1 };
}

/** The demo's bars with only the first `revealed` cells struck; the rest still blank. */
function revealedBars(revealed: number): Bar[] {
	let seen = 0;
	return STRUM_DEMO_CHORDS.map((chord) => ({
		chord,
		beats: STRUM_DEMO_BEATS.map((beat) =>
			beat.map((v) => {
				const keep = seen < revealed;
				seen++;
				return keep ? v : "";
			}),
		),
	}));
}

export function strumStage(p: number): StrumStage {
	const perBar = cellsPerBar(STRUM_DEMO_BEATS);
	const total = perBar * STRUM_DEMO_CHORDS.length;

	const revealed = Math.round(seg(p, ...PHASE.reveal) * total);
	const bars = revealedBars(revealed);

	const sweeping = p > PHASE.sweep[0] && p < PHASE.sweep[1] + 0.02;
	const flat = Math.min(total - 1, Math.floor(seg(p, ...PHASE.sweep) * total));
	const barIdx = Math.floor(flat / perBar);
	const { beatIdx, cellIdx } = cellAt(STRUM_DEMO_BEATS, flat % perBar);
	const activeCell = sweeping ? { barIdx, beatIdx, cellIdx } : null;

	const bpm = Math.round(
		STRUM_DEMO_BPM_FROM + (STRUM_DEMO_BPM_TO - STRUM_DEMO_BPM_FROM) * seg(p, ...PHASE.tempo),
	);

	const typing = seg(p, ...PHASE.progression);
	const lineVisible = p > PHASE.progression[0] - 0.02;
	const progressionText = lineVisible
		? STRUM_DEMO_PROGRESSION.slice(0, Math.round(typing * STRUM_DEMO_PROGRESSION.length))
		: null;
	const words = STRUM_DEMO_PROGRESSION.split(" ").length;
	const chipsShown = Math.floor(typing * words + 1e-9);
	const currentChip =
		p >= PHASE.chip[0] ? Math.min(words - 1, Math.floor(seg(p, ...PHASE.chip) * words + 1e-9)) : null;

	const bar = sweeping ? barIdx + 1 : 1;
	const beat = sweeping ? beatIdx + 1 : 1;
	return {
		bars,
		activeCell,
		bpm,
		progressionText,
		chipsShown,
		currentChip,
		capo: p >= PHASE.capoAt ? STRUM_DEMO_CAPO : null,
		chordView: p >= PHASE.diagramAt ? "diagram" : "name",
		position: `BAR ${String(bar).padStart(2, "0")} · BEAT ${beat}`,
	};
}
