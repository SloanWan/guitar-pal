/**
 * The eval's cases: what a player types, and what the stored snapshot must
 * show. Checks are scored in run.ts.
 */

export type Task = "tab" | "strum" | "read";

export interface ComposeCase {
	id: string;
	task: "tab" | "strum";
	prompt: string;
	/** The meter asked for, `[n, d]`; null when the player named none (4/4 is then fine). */
	meter: [number, number] | null;
	/** An exact tempo, a range, or null when none was asked for. */
	bpm: number | { min: number; max: number } | null;
	/** Chord names in the order asked for; empty when none were. */
	chords: string[];
	/** strict: the bars follow the order (repeats allowed); set: every chord appears, the first first. */
	chordOrder: "strict" | "set";
	capo?: number;
	/** tab: link kinds and span kinds the pattern must contain. */
	techniques?: { links?: string[]; spans?: string[] };
	/** tab: how the thumb must move — travis: a bass note on every beat, on two strings or more; rootFifth: bass on beats 1 and 3, two different notes. */
	bass?: "travis" | "rootFifth";
	/** The number of bars the form needs, when it has one. */
	bars?: number;
	/** Chords required at given bars (0-based), for a form like a 12-bar blues. */
	barChords?: Record<number, string>;
	/** strum: the bars must carry exactly these chords, one per bar, unfolded. */
	exactBars?: string[];
	/** strum: a meter the tool cannot write; the reply must say what it did instead (mentions 4/4). */
	meterUnsupported?: boolean;
	/** strum: a check on the one-bar rhythm string ("D DU UDU "). */
	rhythm?: { label: string; test: (r: string) => boolean };
}

export interface ReadCase {
	id: string;
	task: "read";
	prompt: string;
	set: string;
	exercise: string;
}

const cellsOnBeats = (r: string, step: number) => [...r].filter((_, i) => i % step === 0);

export const TAB_CASES: ComposeCase[] = [
	{
		id: "tab-68-am-f-c-g",
		task: "tab",
		prompt: "A slow 6/8 fingerpicking pattern over Am–F–C–G, thumb on the bass.",
		meter: [6, 8],
		bpm: { min: 1, max: 80 },
		chords: ["Am", "F", "C", "G"],
		chordOrder: "strict",
	},
	{
		id: "tab-travis-g-c-d",
		task: "tab",
		prompt: "Travis picking in G, C, D, 100 bpm.",
		meter: [4, 4],
		bpm: 100,
		chords: ["G", "C", "D"],
		chordOrder: "set",
		bass: "travis",
	},
	{
		id: "tab-techniques-em",
		task: "tab",
		prompt:
			"Write me a short fingerstyle riff in E minor, 4/4 at 90 bpm, with a hammer-on, a slide, and a few palm-muted bass notes.",
		meter: [4, 4],
		bpm: 90,
		chords: [],
		chordOrder: "set",
		techniques: { links: ["hammer", "slide"], spans: ["palmMute"] },
	},
	{
		id: "tab-zh-34-c-am-dm-g",
		task: "tab",
		prompt: "给我写一段 C–Am–Dm–G 的分解和弦指弹，3/4 拍，每分钟 72 拍。",
		meter: [3, 4],
		bpm: 72,
		chords: ["C", "Am", "Dm", "G"],
		chordOrder: "strict",
	},
	{
		id: "tab-capo2-em-c-g-d",
		task: "tab",
		prompt: "Ballad-style fingerpicking for Em–C–G–D with a capo on 2, 4/4, around 85 bpm.",
		meter: [4, 4],
		bpm: { min: 80, max: 90 },
		chords: ["Em", "C", "G", "D"],
		chordOrder: "strict",
		capo: 2,
	},
	{
		id: "tab-12bar-blues-128",
		task: "tab",
		prompt: "A fingerpicked 12-bar blues in A with a 12/8 shuffle feel, A7 D7 E7, 70 bpm.",
		meter: [12, 8],
		bpm: 70,
		chords: ["A7", "D7", "E7"],
		chordOrder: "set",
		bars: 12,
		barChords: { 0: "A7", 4: "D7", 8: "E7" },
	},
	{
		id: "tab-bossa-16th",
		task: "tab",
		prompt: "Bossa-style fingerpicking over Cmaj7–Am7–Dm7–G7 at 120 bpm on a sixteenth-note grid, thumb alternating root and fifth.",
		meter: [4, 4],
		bpm: 120,
		chords: ["Cmaj7", "Am7", "Dm7", "G7"],
		chordOrder: "strict",
		bass: "rootFifth",
	},
];

export const STRUM_CASES: ComposeCase[] = [
	{
		id: "strum-campfire-c-g-am-f",
		task: "strum",
		prompt: "Strum pattern for a campfire song, C G Am F, 90 bpm.",
		meter: [4, 4],
		bpm: 90,
		chords: ["C", "G", "Am", "F"],
		chordOrder: "strict",
		rhythm: { label: "down on beat 1", test: (r) => r[0] === "D" },
	},
	{
		id: "strum-zh-folk-c-g-am-f",
		task: "strum",
		prompt: "给我一个 C G Am F 的民谣扫弦，90 拍",
		meter: [4, 4],
		bpm: 90,
		chords: ["C", "G", "Am", "F"],
		chordOrder: "strict",
		rhythm: { label: "down on beat 1 and has upstrokes", test: (r) => r[0] === "D" && r.includes("U") },
	},
	{
		id: "strum-capo3-16th",
		task: "strum",
		prompt: "Capo 3, G–Em–C–D, a driving sixteenth-note strum at 110 bpm.",
		meter: [4, 4],
		bpm: 110,
		chords: ["G", "Em", "C", "D"],
		chordOrder: "strict",
		capo: 3,
		rhythm: { label: "16 cells, down on beat 1", test: (r) => r.length === 16 && r[0] === "D" },
	},
	{
		id: "strum-chucks-am-dm-e",
		task: "strum",
		prompt: "A strum with muted chucks on beats 2 and 4 over Am, Dm, E, 75 bpm.",
		meter: [4, 4],
		bpm: 75,
		chords: ["Am", "Dm", "E"],
		chordOrder: "strict",
		rhythm: {
			label: "X on beats 2 and 4",
			test: (r) => {
				const step = r.length / 4;
				return Number.isInteger(step) && r[step] === "X" && r[3 * step] === "X";
			},
		},
	},
	{
		id: "strum-beginner-downs",
		task: "strum",
		prompt: "Simplest beginner strum for Em C G D — just one downstroke on each beat.",
		meter: [4, 4],
		bpm: null,
		chords: ["Em", "C", "G", "D"],
		chordOrder: "strict",
		rhythm: {
			label: "D on every beat, nothing else",
			test: (r) => {
				const step = r.length / 4;
				if (!Number.isInteger(step)) return false;
				return cellsOnBeats(r, step).every((c) => c === "D") && [...r].filter((c) => c !== " ").length === 4;
			},
		},
	},
	{
		id: "strum-verse-chorus-form",
		task: "strum",
		prompt: "Verse: G, D, Em, C, two bars each. Chorus: C, D, G, G, one bar each. Same pattern all the way, D DU UDU, 100 bpm.",
		meter: [4, 4],
		bpm: 100,
		chords: ["G", "D", "Em", "C"],
		chordOrder: "set",
		exactBars: ["G", "G", "D", "D", "Em", "Em", "C", "C", "C", "D", "G", "G"],
		rhythm: { label: "exactly D DU UDU", test: (r) => r === "D DU UDU" },
	},
	{
		id: "strum-68-unsupported",
		task: "strum",
		prompt: "A slow 6/8 strum for a ballad over D, A, Bm, G, 60 bpm.",
		meter: null,
		bpm: null,
		chords: ["D", "A", "Bm", "G"],
		chordOrder: "strict",
		meterUnsupported: true,
	},
];

export const READ_CASES: ReadCase[] = [
	{
		id: "read-e-blues",
		task: "read",
		prompt: "Bring this tab into Guitar Pal",
		set: "books-batch1",
		exercise: "sample-text-tab-6p-p002-1",
	},
	{
		// Secondary, added because the budget allowed: double stops, palm-mute brackets, A5 / N.C. chord names.
		id: "read-a-blues",
		task: "read",
		prompt: "Bring this tab into Guitar Pal",
		set: "books-batch1",
		exercise: "sample-text-tab-6p-p002-2",
	},
];
