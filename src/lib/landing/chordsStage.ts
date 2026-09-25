import type { ChordVoicing } from "@/lib/chordVoicing";
import { decodeVoicingStrings } from "@/lib/chordVoicing";
import { seg } from "./progress";

/**
 * The chord chapter's story: the root walks up the piano keys C → A while
 * the diagram redraws for each, then one voicing is played back string by
 * string.
 */

export interface DemoVoicing {
	root: string;
	suffix: string;
	/** Name as the library prints it. */
	name: string;
	voicing: ChordVoicing;
	/** Chord tones spelled for this chord, root first. */
	tones: readonly string[];
}

const open = (id: string, frets: string, fingers: string): ChordVoicing => ({
	id,
	label: null,
	start_fret: 1,
	barre_fret: null,
	capo: false,
	frets,
	fingers,
});

export const CHORD_DEMO_VOICINGS: readonly DemoVoicing[] = [
	{ root: "C", suffix: "major", name: "C", voicing: open("c", "x32010", "032010"), tones: ["C", "E", "G"] },
	{ root: "D", suffix: "major", name: "D", voicing: open("d", "xx0232", "000132"), tones: ["D", "F#", "A"] },
	{ root: "E", suffix: "major", name: "E", voicing: open("e", "022100", "023100"), tones: ["E", "G#", "B"] },
	{
		root: "F",
		suffix: "major",
		name: "F",
		voicing: { ...open("f", "133211", "134211"), barre_fret: 1, capo: true },
		tones: ["F", "A", "C"],
	},
	{ root: "G", suffix: "major", name: "G", voicing: open("g", "320003", "210003"), tones: ["G", "B", "D"] },
	{ root: "A", suffix: "major", name: "A", voicing: open("a", "x02220", "002340"), tones: ["A", "C#", "E"] },
];

/** Standard tuning, string 6 (low E) first, as MIDI. */
const TUNING = [40, 45, 50, 55, 59, 64] as const;

const NATURAL_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function pitchClassOfName(name: string): number {
	const base = NATURAL_PC[name[0]];
	if (base === undefined) throw new Error(`Not a note name: ${name}`);
	const acc = name.slice(1);
	const shift = acc === "#" ? 1 : acc === "b" ? -1 : 0;
	return (base + shift + 12) % 12;
}

/**
 * The chord tone each string sounds, string 6 first; null for a muted
 * string. Spelled with the chord's own tone names, so E major's third reads
 * G#, never Ab.
 */
export function stringTones(v: DemoVoicing): (string | null)[] {
	const byPc = new Map(v.tones.map((t) => [pitchClassOfName(t), t] as const));
	return decodeVoicingStrings(v.voicing).map((s, i) => {
		if (s.absoluteFret === "x") return null;
		return byPc.get((TUNING[i] + s.absoluteFret) % 12) ?? null;
	});
}

const PHASE = { roots: [0, 0.58], ring: [0.62, 0.88] } as const;

export interface ChordsStage {
	voicingIndex: number;
	/** The string being sounded during playback, 6 (low E) to 1 (high e); null when not playing. */
	ringingString: number | null;
}

export function chordsStage(p: number): ChordsStage {
	const n = CHORD_DEMO_VOICINGS.length;
	const voicingIndex = Math.min(n - 1, Math.floor(seg(p, ...PHASE.roots) * n));
	const playing = p > PHASE.ring[0] && p < PHASE.ring[1] + 0.02;
	const ringIdx = Math.min(5, Math.floor(seg(p, ...PHASE.ring) * 6));
	return { voicingIndex, ringingString: playing ? 6 - ringIdx : null };
}
