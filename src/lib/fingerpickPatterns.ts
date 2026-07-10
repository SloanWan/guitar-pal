import { FingerpickPattern, StringFret, BeatSlot, Measure } from "./fingerpickTypes";

// ── StringFret factory helpers ──────────────────────────────────────────────
const S = (): StringFret => ({ fret: null, technique: null, tied: false, muted: false });
const N = (fret: number): StringFret => ({ fret, technique: null, tied: false, muted: false });
const NR = (fret: number): StringFret => ({ fret, technique: null, tied: false, muted: false, letRing: true });
const Hn = (fret: number): StringFret => ({ fret, technique: "hammer-on", tied: false, muted: false });
const Po = (fret: number): StringFret => ({ fret, technique: "pull-off", tied: false, muted: false });
const Su = (fret: number): StringFret => ({ fret, technique: "slide-up", tied: false, muted: false });
const Sd = (fret: number): StringFret => ({ fret, technique: "slide-down", tied: false, muted: false });
const Ti = (fret: number): StringFret => ({ fret, technique: null, tied: true, muted: false });
const Mx = (): StringFret => ({ fret: null, technique: null, tied: false, muted: true });

// ── Technique Showcase ─────────────────────────────────────────────────────
// Strings index: [e(high), B, G, D, A, E(low)] = [0, 1, 2, 3, 4, 5]
const TECHNIQUE_SHOWCASE: FingerpickPattern = {
	id: "technique-showcase",
	name: "Technique Showcase",
	description: "A reference pattern covering every notation technique and duration value",
	bpm: 80,
	timeSignature: [4, 4],
	measures: [
		// ── m1: quarter notes — normal frets, muted note ────────────────
		{
			id: "m1",
			slots: [
				{ id: "s01", duration: "quarter", strings: [S(), S(), S(), S(), S(), N(5)] },
				{ id: "s02", duration: "quarter", strings: [S(), S(), S(), S(), S(), Mx()] },
				{ id: "s03", duration: "quarter", strings: [S(), S(), S(), S(), N(0), S()] },
				{ id: "s04", duration: "quarter", strings: [S(), S(), S(), S(), N(2), S()] },
			],
		},

		// ── m2: eighth notes — beams, hammer-on, pull-off on D string ────
		{
			id: "m2",
			slots: [
				{ id: "s05", duration: "eighth", strings: [S(), S(), S(), N(0), S(), S()] },
				{ id: "s06", duration: "eighth", strings: [S(), S(), S(), Hn(2), S(), S()] },
				{ id: "s07", duration: "eighth", strings: [S(), S(), S(), N(2), S(), S()] },
				{ id: "s08", duration: "eighth", strings: [S(), S(), S(), Po(0), S(), S()] },
				{ id: "s09", duration: "eighth", strings: [S(), S(), S(), N(0), S(), S()] },
				{ id: "s10", duration: "eighth", strings: [S(), S(), S(), Hn(2), S(), S()] },
				{ id: "s11", duration: "eighth", strings: [S(), S(), S(), N(2), S(), S()] },
				{ id: "s12", duration: "eighth", strings: [S(), S(), S(), Po(0), S(), S()] },
			],
		},

		// ── m3: quarter notes — slide-up, tied arc, slide-down on A ──────
		{
			id: "m3",
			slots: [
				{ id: "s13", duration: "quarter", strings: [S(), S(), S(), S(), N(0), S()] },
				{ id: "s14", duration: "quarter", strings: [S(), S(), S(), S(), Su(5), S()] },
				{ id: "s15", duration: "quarter", strings: [S(), S(), S(), S(), Ti(5), S()] },
				{ id: "s16", duration: "quarter", strings: [S(), S(), S(), S(), Sd(0), S()] },
			],
		},

		// ── m4: half + rest + 4 sixteenth notes (2 + 1 + 1 = 4 beats) ───
		{
			id: "m4",
			slots: [
				{ id: "s17", duration: "half", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s18", duration: "rest", strings: [S(), S(), S(), S(), S(), S()] },
				{ id: "s19", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s20", duration: "sixteenth", strings: [N(7), S(), S(), S(), S(), S()] },
				{ id: "s21", duration: "sixteenth", strings: [N(8), S(), S(), S(), S(), S()] },
				{ id: "s22", duration: "sixteenth", strings: [N(10), S(), S(), S(), S(), S()] },
			],
		},

		// ── m5: whole note — G string open (4 beats) ─────────────────────
		{
			id: "m5",
			slots: [{ id: "s23", duration: "whole", strings: [S(), S(), N(0), S(), S(), S()] }],
		},

		// ── m6: rest + 4 sixteenths + triplet + 4 sixteenths ─────────────
		{
			id: "m6",
			slots: [
				{ id: "s24", duration: "rest", strings: [S(), S(), S(), S(), S(), S()] },
				{ id: "s25", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s26", duration: "sixteenth", strings: [N(7), S(), S(), S(), S(), S()] },
				{ id: "s27", duration: "sixteenth", strings: [N(8), S(), S(), S(), S(), S()] },
				{ id: "s28", duration: "sixteenth", strings: [N(10), S(), S(), S(), S(), S()] },
				{ id: "s29", duration: "eighth-triplet", strings: [S(), N(0), S(), S(), S(), S()] },
				{ id: "s30", duration: "eighth-triplet", strings: [S(), N(3), S(), S(), S(), S()] },
				{ id: "s31", duration: "eighth-triplet", strings: [S(), N(5), S(), S(), S(), S()] },
				{ id: "s32", duration: "sixteenth", strings: [S(), S(), N(0), S(), S(), S()] },
				{ id: "s33", duration: "sixteenth", strings: [S(), S(), N(2), S(), S(), S()] },
				{ id: "s34", duration: "sixteenth", strings: [S(), S(), N(4), S(), S(), S()] },
				{ id: "s35", duration: "sixteenth", strings: [S(), S(), N(5), S(), S(), S()] },
			],
		},

		// ── m7: eighth-note hammer-on / pull-off drill on G string ───────────
		{
			id: "m7",
			slots: [
				{ id: "s36", duration: "eighth", strings: [S(), S(), N(0), S(), S(), S()] },
				{ id: "s37", duration: "eighth", strings: [S(), S(), Hn(2), S(), S(), S()] },
				{ id: "s38", duration: "eighth", strings: [S(), S(), N(2), S(), S(), S()] },
				{ id: "s39", duration: "eighth", strings: [S(), S(), Po(0), S(), S(), S()] },
				{ id: "s40", duration: "eighth", strings: [S(), S(), N(2), S(), S(), S()] },
				{ id: "s41", duration: "eighth", strings: [S(), S(), Hn(4), S(), S(), S()] },
				{ id: "s42", duration: "eighth", strings: [S(), S(), N(4), S(), S(), S()] },
				{ id: "s43", duration: "eighth", strings: [S(), S(), Po(2), S(), S(), S()] },
			],
		},

		// ── m8: slide-up / tied / slide-down on A string (4 quarters) ────────
		{
			id: "m8",
			slots: [
				{ id: "s44", duration: "quarter", strings: [S(), S(), S(), S(), N(0), S()] },
				{ id: "s45", duration: "quarter", strings: [S(), S(), S(), S(), Su(5), S()] },
				{ id: "s46", duration: "quarter", strings: [S(), S(), S(), S(), Ti(5), S()] },
				{ id: "s47", duration: "quarter", strings: [S(), S(), S(), S(), Sd(2), S()] },
			],
		},

		// ── m9: half on E-low + 4 eighths ascending on high-e ────────────────
		{
			id: "m9",
			slots: [
				{ id: "s48", duration: "half", strings: [S(), S(), S(), S(), S(), N(3)] },
				{ id: "s49", duration: "eighth", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s50", duration: "eighth", strings: [N(7), S(), S(), S(), S(), S()] },
				{ id: "s51", duration: "eighth", strings: [N(8), S(), S(), S(), S(), S()] },
				{ id: "s52", duration: "eighth", strings: [N(10), S(), S(), S(), S(), S()] },
			],
		},

		// ── m10: 16 sixteenth notes — ascending / descending run on high-e ───
		{
			id: "m10",
			slots: [
				{ id: "s53", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s54", duration: "sixteenth", strings: [N(7), S(), S(), S(), S(), S()] },
				{ id: "s55", duration: "sixteenth", strings: [N(8), S(), S(), S(), S(), S()] },
				{ id: "s56", duration: "sixteenth", strings: [N(10), S(), S(), S(), S(), S()] },
				{ id: "s57", duration: "sixteenth", strings: [N(12), S(), S(), S(), S(), S()] },
				{ id: "s58", duration: "sixteenth", strings: [N(10), S(), S(), S(), S(), S()] },
				{ id: "s59", duration: "sixteenth", strings: [N(8), S(), S(), S(), S(), S()] },
				{ id: "s60", duration: "sixteenth", strings: [N(7), S(), S(), S(), S(), S()] },
				{ id: "s61", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s62", duration: "sixteenth", strings: [N(7), S(), S(), S(), S(), S()] },
				{ id: "s63", duration: "sixteenth", strings: [N(8), S(), S(), S(), S(), S()] },
				{ id: "s64", duration: "sixteenth", strings: [N(10), S(), S(), S(), S(), S()] },
				{ id: "s65", duration: "sixteenth", strings: [N(12), S(), S(), S(), S(), S()] },
				{ id: "s66", duration: "sixteenth", strings: [N(10), S(), S(), S(), S(), S()] },
				{ id: "s67", duration: "sixteenth", strings: [N(8), S(), S(), S(), S(), S()] },
				{ id: "s68", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
			],
		},

		// ── m11: triplet groove — 4 beats of eighth-triplets on B string ──────
		{
			id: "m11",
			slots: [
				{ id: "s69", duration: "eighth-triplet", strings: [S(), N(0), S(), S(), S(), S()] },
				{ id: "s70", duration: "eighth-triplet", strings: [S(), N(1), S(), S(), S(), S()] },
				{ id: "s71", duration: "eighth-triplet", strings: [S(), N(3), S(), S(), S(), S()] },
				{ id: "s72", duration: "eighth-triplet", strings: [S(), N(0), S(), S(), S(), S()] },
				{ id: "s73", duration: "eighth-triplet", strings: [S(), N(3), S(), S(), S(), S()] },
				{ id: "s74", duration: "eighth-triplet", strings: [S(), N(5), S(), S(), S(), S()] },
				{ id: "s75", duration: "eighth-triplet", strings: [S(), N(3), S(), S(), S(), S()] },
				{ id: "s76", duration: "eighth-triplet", strings: [S(), N(5), S(), S(), S(), S()] },
				{ id: "s77", duration: "eighth-triplet", strings: [S(), N(7), S(), S(), S(), S()] },
				{ id: "s78", duration: "eighth-triplet", strings: [S(), N(5), S(), S(), S(), S()] },
				{ id: "s79", duration: "eighth-triplet", strings: [S(), N(3), S(), S(), S(), S()] },
				{ id: "s80", duration: "eighth-triplet", strings: [S(), N(1), S(), S(), S(), S()] },
			],
		},

		// ── m12: multi-string chordal quarters ───────────────────────────────
		{
			id: "m12",
			slots: [
				{ id: "s81", duration: "quarter", strings: [N(0), S(), N(0), S(), N(0), S()] },
				{ id: "s82", duration: "quarter", strings: [N(1), S(), N(0), S(), N(2), S()] },
				{ id: "s83", duration: "quarter", strings: [N(0), S(), N(0), S(), N(0), S()] },
				{ id: "s84", duration: "quarter", strings: [S(), N(0), S(), N(2), S(), N(3)] },
			],
		},

		// ── m13: muted riff on E-low — quarter + quarter + eighth + eighth + quarter ──
		{
			id: "m13",
			slots: [
				{ id: "s85", duration: "quarter", strings: [S(), S(), S(), S(), S(), Mx()] },
				{ id: "s86", duration: "quarter", strings: [S(), S(), S(), S(), S(), N(3)] },
				{ id: "s87", duration: "eighth", strings: [S(), S(), S(), S(), S(), Mx()] },
				{ id: "s88", duration: "eighth", strings: [S(), S(), S(), S(), S(), N(5)] },
				{ id: "s89", duration: "quarter", strings: [S(), S(), S(), S(), S(), N(7)] },
			],
		},

		// ── m14: grand finale — quarter + 2 eighths (h/p) + quarter (slide) + triplet ──
		{
			id: "m14",
			slots: [
				{ id: "s90", duration: "quarter", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s91", duration: "eighth", strings: [S(), S(), S(), Hn(2), S(), S()] },
				{ id: "s92", duration: "eighth", strings: [S(), S(), S(), Po(0), S(), S()] },
				{ id: "s93", duration: "quarter", strings: [S(), S(), S(), S(), Su(5), S()] },
				{ id: "s94", duration: "eighth-triplet", strings: [S(), S(), N(0), S(), S(), S()] },
				{ id: "s95", duration: "eighth-triplet", strings: [S(), S(), N(2), S(), S(), S()] },
				{ id: "s96", duration: "eighth-triplet", strings: [S(), S(), N(4), S(), S(), S()] },
			],
		},
	],
};

// ── Travis Picking ──────────────────────────────────────────────────────────
// Strings index: [e(high), B, G, D, A, E(low)] = [0, 1, 2, 3, 4, 5]
// Thumb alternates E-low (index 5) on beats 1/3 and A (index 4) on beats 2/4.
// Melody picks B string (index 1, fret 1) and high-e (index 0, fret 0) on off-beats.
function makeTravisPickingMeasure(n: number): Measure {
	const p = `travis-m${n}`;
	const slots: BeatSlot[] = [
		{ id: `${p}-1`, duration: "eighth", strings: [S(), S(), S(), S(), S(), N(0)] },
		{ id: `${p}-2`, duration: "eighth", strings: [S(), NR(1), S(), S(), S(), S()] },
		{ id: `${p}-3`, duration: "eighth", strings: [S(), S(), S(), S(), N(0), S()] },
		{ id: `${p}-4`, duration: "eighth", strings: [NR(0), S(), S(), S(), S(), S()] },
		{ id: `${p}-5`, duration: "eighth", strings: [S(), S(), S(), S(), S(), N(0)] },
		{ id: `${p}-6`, duration: "eighth", strings: [S(), NR(1), S(), S(), S(), S()] },
		{ id: `${p}-7`, duration: "eighth", strings: [S(), S(), S(), S(), N(0), S()] },
		{ id: `${p}-8`, duration: "eighth", strings: [NR(0), S(), S(), S(), S(), S()] },
	];
	return { id: p, slots };
}

const TRAVIS_PICKING: FingerpickPattern = {
	id: "travis-picking",
	name: "Travis Picking",
	description: "Alternating bass thumb with melody picks on the off-beats",
	bpm: 100,
	timeSignature: [4, 4],
	measures: [1, 2, 3, 4].map(makeTravisPickingMeasure),
};

// ── Arpeggio ────────────────────────────────────────────────────────────────
// p-i-m-a: E-low (index 5), G (index 2), B (index 1, fret 1), high-e (index 0)
// letRing on all notes so they sustain into each other.
function makeArpeggioMeasure(n: number): Measure {
	const p = `arpeggio-m${n}`;
	const slots: BeatSlot[] = [
		{ id: `${p}-1`, duration: "eighth", strings: [S(), S(), S(), S(), S(), NR(0)] },
		{ id: `${p}-2`, duration: "eighth", strings: [S(), S(), NR(0), S(), S(), S()] },
		{ id: `${p}-3`, duration: "eighth", strings: [S(), NR(1), S(), S(), S(), S()] },
		{ id: `${p}-4`, duration: "eighth", strings: [NR(0), S(), S(), S(), S(), S()] },
		{ id: `${p}-5`, duration: "eighth", strings: [S(), S(), S(), S(), S(), NR(0)] },
		{ id: `${p}-6`, duration: "eighth", strings: [S(), S(), NR(0), S(), S(), S()] },
		{ id: `${p}-7`, duration: "eighth", strings: [S(), NR(1), S(), S(), S(), S()] },
		{ id: `${p}-8`, duration: "eighth", strings: [NR(0), S(), S(), S(), S(), S()] },
	];
	return { id: p, slots };
}

const ARPEGGIO: FingerpickPattern = {
	id: "arpeggio",
	name: "Arpeggio",
	description: "Classical p-i-m-a arpeggio — bass followed by treble strings in turn",
	bpm: 80,
	timeSignature: [4, 4],
	measures: [1, 2, 3, 4].map(makeArpeggioMeasure),
};

// ── Waltz ───────────────────────────────────────────────────────────────────
// Beat 1: bass on E-low (index 5, fret 0)
// Beat 2: G+B+e chord (index 2 fret 0, index 1 fret 1 via hammer-on, index 0 fret 0)
// Beat 3: same chord repeated without hammer-on
function makeWaltzMeasure(n: number): Measure {
	const p = `waltz-m${n}`;
	const slots: BeatSlot[] = [
		{ id: `${p}-1`, duration: "quarter", strings: [S(), S(), S(), S(), S(), N(0)] },
		{ id: `${p}-2`, duration: "quarter", strings: [N(0), Hn(1), N(0), S(), S(), S()] },
		{ id: `${p}-3`, duration: "quarter", strings: [N(0), N(1), N(0), S(), S(), S()] },
	];
	return { id: p, slots };
}

const WALTZ: FingerpickPattern = {
	id: "waltz",
	name: "Waltz",
	description: "Bass-chord waltz in 3/4 — thumb on beat 1, chord strum on beats 2 and 3",
	bpm: 120,
	timeSignature: [3, 4],
	measures: [1, 2, 3, 4].map(makeWaltzMeasure),
};

export const PRESET_FINGERPICK_PATTERNS: FingerpickPattern[] = [
	TECHNIQUE_SHOWCASE,
	TRAVIS_PICKING,
	ARPEGGIO,
	WALTZ,
];
