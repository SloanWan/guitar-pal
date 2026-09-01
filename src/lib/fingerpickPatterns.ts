import { FingerpickPattern, StringFret, BeatSlot, Measure } from "./fingerpickTypes";

// ── StringFret factory helpers ──────────────────────────────────────────────
const S = (): StringFret => ({ fret: null, technique: null, tied: false, muted: false });
const N = (fret: number): StringFret => ({ fret, technique: null, tied: false, muted: false });
const NR = (fret: number): StringFret => ({
	fret,
	technique: null,
	tied: false,
	muted: false,
	letRing: true,
});
const HnR = (fret: number): StringFret => ({
	fret,
	technique: "hammer-on",
	tied: false,
	muted: false,
	letRing: true,
});
const Hn = (fret: number): StringFret => ({
	fret,
	technique: "hammer-on",
	tied: false,
	muted: false,
});
const Po = (fret: number): StringFret => ({
	fret,
	technique: "pull-off",
	tied: false,
	muted: false,
});
const Su = (fret: number): StringFret => ({
	fret,
	technique: "slide-up",
	tied: false,
	muted: false,
});
const Ti = (fret: number): StringFret => ({ fret, technique: null, tied: true, muted: false });
const Ng = (fret: number): StringFret => ({
	fret,
	technique: null,
	tied: false,
	muted: false,
	ghostNote: true,
});
const NRA = (fret: number): StringFret => ({
	fret,
	technique: null,
	tied: false,
	muted: false,
	letRing: true,
	accent: true,
});

// ── 斑马斑马 ─────────────────────────────────────────────────────────────────
// Strings index: [e(high), B, G, D, A, E(low)] = [0, 1, 2, 3, 4, 5]
// Fingerstyle arrangement of the ballad — alternating bass with melodic fills;
// the chorus (m5–m12) is wrapped in a repeat.
const ZEBRA_ZEBRA: FingerpickPattern = {
	id: "zebra-zebra",
	name: "斑马斑马",
	description: "A beautiful melody, with a repeated chorus",
	bpm: 66,
	timeSignature: [4, 4],
	measures: [
		// ── m1 ───────────────────────────────────────────────────────────────
		{
			id: "zebra-m1",
			slots: [
				{ id: "zebra-m1-1", duration: "eighth", strings: [N(0), S(), S(), S(), N(3), S()] },
				{ id: "zebra-m1-2", duration: "eighth", strings: [S(), S(), N(0), S(), S(), S()] },
				{
					id: "zebra-m1-3",
					duration: "sixteenth",
					strings: [N(0), S(), S(), S(), S(), S()],
				},
				{
					id: "zebra-m1-4",
					duration: "sixteenth",
					strings: [S(), S(), S(), S(), S(), S()],
				},
				{
					id: "zebra-m1-5",
					duration: "sixteenth",
					strings: [S(), N(3), S(), S(), S(), S()],
				},
				{
					id: "zebra-m1-6",
					duration: "sixteenth",
					strings: [N(0), S(), S(), S(), S(), S()],
				},
				{ id: "zebra-m1-7", duration: "eighth", strings: [S(), N(0), S(), S(), N(5), S()] },
				{ id: "zebra-m1-8", duration: "eighth", strings: [S(), S(), S(), N(4), S(), S()] },
				{ id: "zebra-m1-9", duration: "eighth", strings: [S(), S(), N(0), S(), S(), S()] },
				{ id: "zebra-m1-10", duration: "eighth", strings: [S(), N(0), S(), S(), S(), S()] },
			],
		},

		// ── m2 — pull-off on high-e, hammer-on on G ───────────────────────────
		{
			id: "zebra-m2",
			slots: [
				{ id: "zebra-m2-1", duration: "eighth", strings: [N(2), S(), S(), S(), N(2), S()] },
				{ id: "zebra-m2-2", duration: "eighth", strings: [S(), S(), N(2), S(), S(), S()] },
				{
					id: "zebra-m2-3",
					duration: "sixteenth",
					strings: [N(2), S(), S(), S(), S(), S()],
				},
				{
					id: "zebra-m2-4",
					duration: "sixteenth",
					strings: [Po(0), S(), S(), S(), S(), S()],
				},
				{
					id: "zebra-m2-5",
					duration: "sixteenth",
					strings: [S(), N(0), S(), S(), S(), S()],
				},
				{
					id: "zebra-m2-6",
					duration: "sixteenth",
					strings: [S(), S(), N(0), S(), S(), S()],
				},
				{ id: "zebra-m2-7", duration: "eighth", strings: [N(0), S(), S(), S(), S(), N(0)] },
				{ id: "zebra-m2-8", duration: "eighth", strings: [S(), S(), S(), N(2), S(), S()] },
				{
					id: "zebra-m2-9",
					duration: "sixteenth",
					strings: [S(), S(), N(0), S(), S(), S()],
				},
				{
					id: "zebra-m2-10",
					duration: "sixteenth",
					strings: [S(), S(), Hn(2), S(), S(), S()],
				},
				{
					id: "zebra-m2-11",
					duration: "sixteenth",
					strings: [S(), N(0), S(), S(), S(), S()],
				},
				{
					id: "zebra-m2-12",
					duration: "sixteenth",
					strings: [N(0), S(), S(), S(), S(), S()],
				},
			],
		},

		// ── m3 — 32nd hammer-on/pull-off ornament on B ────────────────────────
		{
			id: "zebra-m3",
			slots: [
				{ id: "zebra-m3-1", duration: "eighth", strings: [S(), N(0), S(), S(), N(3), S()] },
				{ id: "zebra-m3-2", duration: "eighth", strings: [S(), S(), S(), N(2), S(), S()] },
				{ id: "zebra-m3-3", duration: "32nd", strings: [S(), N(0), S(), S(), S(), S()] },
				{ id: "zebra-m3-4", duration: "32nd", strings: [S(), Hn(1), S(), S(), S(), S()] },
				{
					id: "zebra-m3-5",
					duration: "sixteenth",
					strings: [S(), Po(0), S(), S(), S(), S()],
				},
				{
					id: "zebra-m3-6",
					duration: "sixteenth",
					strings: [S(), S(), N(0), S(), S(), S()],
				},
				{
					id: "zebra-m3-7",
					duration: "sixteenth",
					strings: [S(), S(), S(), N(2), S(), S()],
				},
				{ id: "zebra-m3-8", duration: "eighth", strings: [S(), N(0), S(), S(), N(5), S()] },
				{ id: "zebra-m3-9", duration: "eighth", strings: [S(), S(), N(0), S(), S(), S()] },
				{ id: "zebra-m3-10", duration: "32nd", strings: [S(), N(0), S(), S(), S(), S()] },
				{ id: "zebra-m3-11", duration: "32nd", strings: [S(), Hn(3), S(), S(), S(), S()] },
				{
					id: "zebra-m3-12",
					duration: "sixteenth",
					strings: [S(), Po(0), S(), S(), S(), S()],
				},
				{
					id: "zebra-m3-13",
					duration: "sixteenth",
					strings: [S(), S(), N(0), S(), S(), S()],
				},
				{
					id: "zebra-m3-14",
					duration: "sixteenth",
					strings: [S(), S(), S(), N(4), S(), S()],
				},
			],
		},

		// ── m4 — chained slide-ups on D, ends with tied note + quarter rest ───
		{
			id: "zebra-m4",
			slots: [
				{
					id: "zebra-m4-1",
					duration: "sixteenth",
					strings: [S(), S(), S(), S(), S(), N(0)],
				},
				{
					id: "zebra-m4-2",
					duration: "sixteenth",
					strings: [S(), S(), S(), S(), S(), S()],
				},
				{
					id: "zebra-m4-3",
					duration: "sixteenth",
					strings: [S(), S(), S(), N(2), S(), S()],
				},
				{
					id: "zebra-m4-4",
					duration: "sixteenth",
					strings: [S(), S(), S(), Su(5), S(), S()],
				},
				{
					id: "zebra-m4-5",
					duration: "sixteenth",
					strings: [S(), S(), N(0), S(), S(), S()],
				},
				{
					id: "zebra-m4-6",
					duration: "sixteenth",
					strings: [S(), S(), S(), N(5), S(), S()],
				},
				{
					id: "zebra-m4-7",
					duration: "sixteenth",
					strings: [S(), S(), S(), Su(7), S(), S()],
				},
				{
					id: "zebra-m4-8",
					duration: "sixteenth",
					strings: [S(), S(), N(0), S(), S(), S()],
				},
				{
					id: "zebra-m4-9",
					duration: "sixteenth",
					strings: [S(), S(), S(), N(7), S(), S()],
				},
				{
					id: "zebra-m4-10",
					duration: "sixteenth",
					strings: [S(), S(), S(), Su(9), S(), S()],
				},
				{
					id: "zebra-m4-11",
					duration: "eighth",
					strings: [S(), S(), S(), Ti(9), S(), S()],
				},
				{
					id: "zebra-m4-12",
					duration: "quarter",
					isRest: true,
					strings: [S(), S(), S(), S(), S(), S()],
				},
			],
		},

		// ── m5 — chorus start ─────────────────────────────────────────────────
		{
			id: "zebra-m5",
			repeatStart: true,
			slots: [
				{ id: "zebra-m5-1", duration: "eighth", strings: [S(), N(0), S(), S(), N(3), S()] },
				{ id: "zebra-m5-2", duration: "eighth", strings: [S(), S(), S(), N(2), S(), S()] },
				{ id: "zebra-m5-3", duration: "eighth", strings: [S(), S(), S(), S(), N(3), S()] },
				{ id: "zebra-m5-4", duration: "eighth", strings: [S(), N(0), S(), S(), S(), S()] },
				{ id: "zebra-m5-5", duration: "eighth", strings: [S(), S(), N(2), N(0), S(), S()] },
				{ id: "zebra-m5-6", duration: "eighth", strings: [S(), S(), S(), S(), N(0), S()] },
				{ id: "zebra-m5-7", duration: "eighth", strings: [S(), S(), S(), N(0), S(), S()] },
				{ id: "zebra-m5-8", duration: "eighth", strings: [S(), S(), N(0), S(), S(), S()] },
			],
		},

		// ── m6 ───────────────────────────────────────────────────────────────
		{
			id: "zebra-m6",
			slots: [
				{ id: "zebra-m6-1", duration: "eighth", strings: [S(), N(0), S(), S(), N(2), S()] },
				{ id: "zebra-m6-2", duration: "eighth", strings: [S(), N(0), S(), S(), S(), S()] },
				{ id: "zebra-m6-3", duration: "eighth", strings: [S(), S(), S(), N(0), S(), S()] },
				{
					id: "zebra-m6-4",
					duration: "sixteenth",
					strings: [S(), S(), N(0), S(), S(), S()],
				},
				{
					id: "zebra-m6-5",
					duration: "sixteenth",
					strings: [S(), S(), S(), N(4), S(), S()],
				},
				{ id: "zebra-m6-6", duration: "eighth", strings: [S(), S(), N(0), S(), S(), N(0)] },
				{ id: "zebra-m6-7", duration: "eighth", strings: [S(), S(), S(), S(), N(2), S()] },
				{
					id: "zebra-m6-8",
					duration: "sixteenth",
					strings: [S(), S(), N(0), S(), S(), S()],
				},
				{
					id: "zebra-m6-9",
					duration: "sixteenth",
					strings: [S(), S(), S(), S(), S(), S()],
				},
				{ id: "zebra-m6-10", duration: "eighth", strings: [S(), S(), S(), N(2), S(), S()] },
			],
		},

		// ── m7 ───────────────────────────────────────────────────────────────
		{
			id: "zebra-m7",
			slots: [
				{ id: "zebra-m7-1", duration: "eighth", strings: [S(), N(0), S(), S(), N(3), S()] },
				{ id: "zebra-m7-2", duration: "eighth", strings: [S(), S(), S(), N(2), S(), S()] },
				{ id: "zebra-m7-3", duration: "eighth", strings: [S(), N(0), S(), S(), S(), S()] },
				{
					id: "zebra-m7-4",
					duration: "sixteenth",
					strings: [S(), S(), N(2), S(), S(), S()],
				},
				{
					id: "zebra-m7-5",
					duration: "sixteenth",
					strings: [S(), S(), N(2), S(), S(), S()],
				},
				{ id: "zebra-m7-6", duration: "eighth", strings: [S(), S(), S(), N(0), S(), S()] },
				{ id: "zebra-m7-7", duration: "eighth", strings: [S(), S(), N(0), S(), S(), S()] },
				{
					id: "zebra-m7-8",
					duration: "dotted-eighth",
					strings: [S(), N(3), S(), S(), S(), S()],
				},
				{
					id: "zebra-m7-9",
					duration: "sixteenth",
					strings: [S(), S(), N(2), S(), S(), S()],
				},
			],
		},

		// ── m8 ───────────────────────────────────────────────────────────────
		{
			id: "zebra-m8",
			slots: [
				{ id: "zebra-m8-1", duration: "eighth", strings: [S(), S(), N(2), S(), S(), N(3)] },
				{ id: "zebra-m8-2", duration: "eighth", strings: [S(), N(0), S(), S(), S(), S()] },
				{ id: "zebra-m8-3", duration: "eighth", strings: [S(), S(), S(), N(0), S(), S()] },
				{
					id: "zebra-m8-4",
					duration: "sixteenth",
					strings: [S(), S(), N(2), S(), S(), S()],
				},
				{
					id: "zebra-m8-5",
					duration: "sixteenth",
					strings: [S(), N(0), S(), S(), S(), S()],
				},
				{ id: "zebra-m8-6", duration: "eighth", strings: [S(), S(), S(), S(), N(2), S()] },
				{ id: "zebra-m8-7", duration: "eighth", strings: [S(), S(), S(), N(1), S(), S()] },
				{ id: "zebra-m8-8", duration: "eighth", strings: [S(), N(0), S(), S(), S(), S()] },
				{
					id: "zebra-m8-9",
					duration: "sixteenth",
					strings: [S(), S(), N(2), S(), S(), S()],
				},
				{
					id: "zebra-m8-10",
					duration: "sixteenth",
					strings: [S(), S(), S(), S(), N(2), S()],
				},
			],
		},

		// ── m9 ───────────────────────────────────────────────────────────────
		{
			id: "zebra-m9",
			slots: [
				{ id: "zebra-m9-1", duration: "eighth", strings: [S(), N(0), S(), S(), N(3), S()] },
				{ id: "zebra-m9-2", duration: "eighth", strings: [S(), S(), S(), N(2), S(), S()] },
				{ id: "zebra-m9-3", duration: "eighth", strings: [S(), N(0), S(), S(), S(), S()] },
				{
					id: "zebra-m9-4",
					duration: "sixteenth",
					strings: [S(), N(0), S(), S(), S(), S()],
				},
				{
					id: "zebra-m9-5",
					duration: "sixteenth",
					strings: [S(), N(0), S(), S(), S(), S()],
				},
				{ id: "zebra-m9-6", duration: "eighth", strings: [S(), S(), S(), N(0), S(), S()] },
				{ id: "zebra-m9-7", duration: "eighth", strings: [S(), S(), N(2), S(), S(), S()] },
				{ id: "zebra-m9-8", duration: "eighth", strings: [S(), S(), S(), S(), N(0), S()] },
				{ id: "zebra-m9-9", duration: "eighth", strings: [S(), S(), S(), N(0), S(), S()] },
			],
		},

		// ── m10 ──────────────────────────────────────────────────────────────
		{
			id: "zebra-m10",
			slots: [
				{
					id: "zebra-m10-1",
					duration: "eighth",
					strings: [S(), N(0), S(), S(), N(2), S()],
				},
				{ id: "zebra-m10-2", duration: "eighth", strings: [S(), S(), S(), N(0), S(), S()] },
				{ id: "zebra-m10-3", duration: "eighth", strings: [S(), S(), S(), N(4), S(), S()] },
				{ id: "zebra-m10-4", duration: "eighth", strings: [S(), S(), N(0), S(), S(), S()] },
				{
					id: "zebra-m10-5",
					duration: "eighth",
					strings: [S(), S(), N(0), S(), S(), N(0)],
				},
				{ id: "zebra-m10-6", duration: "eighth", strings: [S(), S(), S(), S(), N(2), S()] },
				{ id: "zebra-m10-7", duration: "eighth", strings: [S(), S(), N(0), S(), S(), S()] },
				{ id: "zebra-m10-8", duration: "eighth", strings: [S(), S(), S(), N(2), S(), S()] },
			],
		},

		// ── m11 — slide-up into the turnaround ────────────────────────────────
		{
			id: "zebra-m11",
			slots: [
				{
					id: "zebra-m11-1",
					duration: "eighth",
					strings: [S(), N(0), S(), S(), N(3), S()],
				},
				{ id: "zebra-m11-2", duration: "eighth", strings: [S(), S(), S(), N(2), S(), S()] },
				{ id: "zebra-m11-3", duration: "eighth", strings: [S(), N(0), S(), S(), S(), S()] },
				{
					id: "zebra-m11-4",
					duration: "sixteenth",
					strings: [S(), S(), N(2), S(), S(), S()],
				},
				{
					id: "zebra-m11-5",
					duration: "sixteenth",
					strings: [S(), S(), N(2), S(), S(), S()],
				},
				{
					id: "zebra-m11-6",
					duration: "quarter",
					strings: [S(), S(), S(), N(0), S(), S()],
				},
				{ id: "zebra-m11-7", duration: "eighth", strings: [S(), S(), S(), N(4), S(), S()] },
				{
					id: "zebra-m11-8",
					duration: "eighth",
					strings: [S(), S(), S(), Su(5), S(), S()],
				},
			],
		},

		// ── m12 — chorus end, roll-down chord + slide-up tail ─────────────────
		{
			id: "zebra-m12",
			repeatEnd: true,
			slots: [
				{
					id: "zebra-m12-1",
					duration: "eighth",
					strings: [S(), S(), S(), N(2), S(), N(0)],
				},
				{ id: "zebra-m12-2", duration: "eighth", strings: [S(), S(), S(), S(), N(2), S()] },
				{
					id: "zebra-m12-3",
					duration: "eighth",
					stroke: "roll-down",
					strings: [S(), N(0), N(0), S(), S(), S()],
				},
				{
					id: "zebra-m12-4",
					duration: "sixteenth",
					strings: [S(), S(), S(), N(4), S(), S()],
				},
				{
					id: "zebra-m12-5",
					duration: "sixteenth",
					strings: [S(), S(), S(), Su(5), S(), S()],
				},
				{
					id: "zebra-m12-6",
					duration: "quarter",
					strings: [S(), S(), S(), S(), S(), N(0)],
				},
				{ id: "zebra-m12-7", duration: "quarter", strings: [S(), S(), S(), S(), S(), S()] },
			],
		},
	],
};

// ── Travis Picking ──────────────────────────────────────────────────────────
// Strings index: [e(high), B, G, D, A, E(low)] = [0, 1, 2, 3, 4, 5]
// Phase 1 (m1–4): alternating bass only — E-low on odd slots, A on even slots.
// Phase 2 (m5–8): add melody on B (idx 1) at slots 3/7 and high-e (idx 0) at slot 5.
// Phase 3 (m9–12): pinch on slot 1 (bass E + high-e) and slot 5 (bass E + B).
function makeTravisP1Measure(n: number): Measure {
	const p = `travis-m${n}`;
	const slots: BeatSlot[] = [
		{ id: `${p}-1`, duration: "eighth", strings: [S(), S(), S(), S(), S(), N(0)] },
		{ id: `${p}-2`, duration: "eighth", strings: [S(), S(), S(), S(), N(0), S()] },
		{ id: `${p}-3`, duration: "eighth", strings: [S(), S(), S(), S(), S(), N(0)] },
		{ id: `${p}-4`, duration: "eighth", strings: [S(), S(), S(), S(), N(0), S()] },
		{ id: `${p}-5`, duration: "eighth", strings: [S(), S(), S(), S(), S(), N(0)] },
		{ id: `${p}-6`, duration: "eighth", strings: [S(), S(), S(), S(), N(0), S()] },
		{ id: `${p}-7`, duration: "eighth", strings: [S(), S(), S(), S(), S(), N(0)] },
		{ id: `${p}-8`, duration: "eighth", strings: [S(), S(), S(), S(), N(0), S()] },
	];
	return { id: p, slots };
}

function makeTravisP2Measure(n: number): Measure {
	const p = `travis-m${n}`;
	const slots: BeatSlot[] = [
		{ id: `${p}-1`, duration: "eighth", strings: [S(), S(), S(), S(), S(), N(0)] },
		{ id: `${p}-2`, duration: "eighth", strings: [S(), S(), S(), S(), N(0), S()] },
		{ id: `${p}-3`, duration: "eighth", strings: [S(), HnR(0), S(), S(), S(), N(0)] },
		{ id: `${p}-4`, duration: "eighth", strings: [S(), S(), S(), S(), N(0), S()] },
		{ id: `${p}-5`, duration: "eighth", strings: [NR(0), S(), S(), S(), S(), N(0)] },
		{ id: `${p}-6`, duration: "eighth", strings: [S(), S(), S(), S(), N(0), S()] },
		{ id: `${p}-7`, duration: "eighth", strings: [S(), NR(0), S(), S(), S(), N(0)] },
		{ id: `${p}-8`, duration: "eighth", strings: [S(), S(), S(), S(), N(0), S()] },
	];
	return { id: p, slots };
}

function makeTravisP3Measure(n: number): Measure {
	const p = `travis-m${n}`;
	const slots: BeatSlot[] = [
		{ id: `${p}-1`, duration: "eighth", strings: [NR(0), S(), S(), S(), S(), N(0)] },
		{ id: `${p}-2`, duration: "eighth", strings: [S(), S(), S(), S(), N(0), S()] },
		{ id: `${p}-3`, duration: "eighth", strings: [S(), NR(0), S(), S(), S(), N(0)] },
		{ id: `${p}-4`, duration: "eighth", strings: [S(), S(), S(), S(), N(0), S()] },
		{ id: `${p}-5`, duration: "eighth", strings: [S(), NR(0), S(), S(), S(), N(0)] },
		{ id: `${p}-6`, duration: "eighth", strings: [S(), S(), S(), S(), N(0), S()] },
		{ id: `${p}-7`, duration: "eighth", strings: [NR(0), S(), S(), S(), S(), N(0)] },
		{ id: `${p}-8`, duration: "eighth", strings: [S(), S(), S(), S(), N(0), S()] },
	];
	return { id: p, slots };
}

const TRAVIS_PICKING: FingerpickPattern = {
	id: "travis-picking",
	name: "Travis Picking",
	description: "Alternating bass thumb with melody picks on the off-beats",
	bpm: 100,
	timeSignature: [4, 4],
	measures: [
		...[1, 2, 3, 4].map(makeTravisP1Measure),
		...[5, 6, 7, 8].map(makeTravisP2Measure),
		...[9, 10, 11, 12].map(makeTravisP3Measure),
	],
};

// ── Arpeggio ────────────────────────────────────────────────────────────────
// Strings index: [e(high), B, G, D, A, E(low)] = [0, 1, 2, 3, 4, 5]
// Phase 1 (m1–4): forward p-i-m-a — bass, G, B, high-e (repeat ×2 per measure).
// Phase 2 (m5–8): reverse p-a-m-i — bass, high-e, B, G (repeat ×2 per measure).
// Phase 3 (m9–12): classical p-i-m-i-a-i-m-i — bass then G-B-G-e-G-B-G.
function makeArpeggioP1Measure(n: number): Measure {
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

function makeArpeggioP2Measure(n: number): Measure {
	const p = `arpeggio-m${n}`;
	const slots: BeatSlot[] = [
		{ id: `${p}-1`, duration: "eighth", strings: [S(), S(), S(), S(), S(), NR(0)] },
		{ id: `${p}-2`, duration: "eighth", strings: [NR(0), S(), S(), S(), S(), S()] },
		{ id: `${p}-3`, duration: "eighth", strings: [S(), NR(1), S(), S(), S(), S()] },
		{ id: `${p}-4`, duration: "eighth", strings: [S(), S(), NR(0), S(), S(), S()] },
		{ id: `${p}-5`, duration: "eighth", strings: [S(), S(), S(), S(), S(), NR(0)] },
		{ id: `${p}-6`, duration: "eighth", strings: [NR(0), S(), S(), S(), S(), S()] },
		{ id: `${p}-7`, duration: "eighth", strings: [S(), NR(1), S(), S(), S(), S()] },
		{ id: `${p}-8`, duration: "eighth", strings: [S(), S(), NR(0), S(), S(), S()] },
	];
	return { id: p, slots };
}

function makeArpeggioP3Measure(n: number): Measure {
	const p = `arpeggio-m${n}`;
	const slots: BeatSlot[] = [
		{ id: `${p}-1`, duration: "eighth", strings: [S(), S(), S(), S(), S(), NR(0)] },
		{ id: `${p}-2`, duration: "eighth", strings: [S(), S(), NR(0), S(), S(), S()] },
		{ id: `${p}-3`, duration: "eighth", strings: [S(), NR(1), S(), S(), S(), S()] },
		{ id: `${p}-4`, duration: "eighth", strings: [S(), S(), NR(0), S(), S(), S()] },
		{ id: `${p}-5`, duration: "eighth", strings: [NR(0), S(), S(), S(), S(), S()] },
		{ id: `${p}-6`, duration: "eighth", strings: [S(), S(), NR(0), S(), S(), S()] },
		{ id: `${p}-7`, duration: "eighth", strings: [S(), NR(1), S(), S(), S(), S()] },
		{ id: `${p}-8`, duration: "eighth", strings: [S(), S(), NR(0), S(), S(), S()] },
	];
	return { id: p, slots };
}

const ARPEGGIO: FingerpickPattern = {
	id: "arpeggio",
	name: "Arpeggio",
	description: "Classical p-i-m-a arpeggio — bass followed by treble strings in turn",
	bpm: 80,
	timeSignature: [4, 4],
	measures: [
		...[1, 2, 3, 4].map(makeArpeggioP1Measure),
		...[5, 6, 7, 8].map(makeArpeggioP2Measure),
		...[9, 10, 11, 12].map(makeArpeggioP3Measure),
	],
};

// ── Waltz ───────────────────────────────────────────────────────────────────
// Strings index: [e(high), B, G, D, A, E(low)] = [0, 1, 2, 3, 4, 5]
// Phase 1 (m1–4): basic bass-chord-chord in 3/4.
// Phase 2 (m5–8): add hammer-on (slot 2 B string) and pull-off (slot 3 G string).
// Phase 3 (m9–12): dotted-quarter + eighth subdivision; keep hammer-on; slot 3 high-e letRing.
function makeWaltzP1Measure(n: number): Measure {
	const p = `waltz-m${n}`;
	const slots: BeatSlot[] = [
		{ id: `${p}-1`, duration: "quarter", strings: [S(), S(), S(), S(), S(), N(0)] },
		{ id: `${p}-2`, duration: "quarter", strings: [N(0), N(1), N(0), S(), S(), S()] },
		{ id: `${p}-3`, duration: "quarter", strings: [N(0), N(1), N(0), S(), S(), S()] },
	];
	return { id: p, slots };
}

function makeWaltzP2Measure(n: number): Measure {
	const p = `waltz-m${n}`;
	const slots: BeatSlot[] = [
		{ id: `${p}-1`, duration: "quarter", strings: [S(), S(), S(), S(), S(), N(0)] },
		{ id: `${p}-2`, duration: "quarter", strings: [N(0), Hn(1), N(0), S(), S(), S()] },
		{ id: `${p}-3`, duration: "quarter", strings: [N(0), N(1), Po(0), S(), S(), S()] },
	];
	return { id: p, slots };
}

function makeWaltzP3Measure(n: number): Measure {
	const p = `waltz-m${n}`;
	const slots: BeatSlot[] = [
		{ id: `${p}-1`, duration: "dotted-quarter", strings: [S(), S(), S(), S(), S(), N(0)] },
		{ id: `${p}-2`, duration: "eighth", strings: [N(0), Hn(1), N(0), S(), S(), S()] },
		{ id: `${p}-3`, duration: "quarter", strings: [NR(0), N(1), N(0), S(), S(), S()] },
	];
	return { id: p, slots };
}

const WALTZ: FingerpickPattern = {
	id: "waltz",
	name: "Waltz",
	description: "Bass-chord waltz in 3/4 — thumb on beat 1, chord strum on beats 2 and 3",
	bpm: 120,
	timeSignature: [3, 4],
	measures: [
		...[1, 2, 3, 4].map(makeWaltzP1Measure),
		...[5, 6, 7, 8].map(makeWaltzP2Measure),
		...[9, 10, 11, 12].map(makeWaltzP3Measure),
	],
};

// ── Celtic Fingerstyle ──────────────────────────────────────────────────────
// Strings index: [e(high), B, G, D, A, E(low)] = [0, 1, 2, 3, 4, 5]
// Celtic-flavoured fingerstyle over open Em/Am shapes with ornamental techniques.
// Rhythm per measure: dotted-eighth + sixteenth + eighth + eighth + dotted-eighth + sixteenth + quarter = 4 beats.
function makeCelticBaseMeasure(n: number): Measure {
	const p = `celtic-m${n}`;
	return {
		id: p,
		slots: [
			{ id: `${p}-1`, duration: "dotted-eighth", strings: [S(), S(), S(), S(), S(), N(0)] },
			{ id: `${p}-2`, duration: "sixteenth", strings: [S(), S(), N(2), S(), S(), S()] },
			{ id: `${p}-3`, duration: "eighth", strings: [S(), NR(0), S(), S(), S(), S()] },
			{ id: `${p}-4`, duration: "eighth", strings: [S(), S(), Hn(2), S(), S(), S()] },
			{ id: `${p}-5`, duration: "dotted-eighth", strings: [S(), S(), S(), S(), N(0), S()] },
			{ id: `${p}-6`, duration: "sixteenth", strings: [S(), N(1), S(), S(), S(), S()] },
			{ id: `${p}-7`, duration: "quarter", strings: [NR(0), NR(0), NR(2), S(), S(), S()] },
		],
	};
}

function makeCelticPulloffMeasure(n: number): Measure {
	const p = `celtic-m${n}`;
	return {
		id: p,
		slots: [
			{ id: `${p}-1`, duration: "dotted-eighth", strings: [S(), S(), S(), S(), S(), N(0)] },
			{ id: `${p}-2`, duration: "sixteenth", strings: [S(), S(), N(2), S(), S(), S()] },
			{ id: `${p}-3`, duration: "eighth", strings: [S(), NR(0), S(), S(), S(), S()] },
			{ id: `${p}-4`, duration: "eighth", strings: [S(), S(), Po(0), S(), S(), S()] },
			{ id: `${p}-5`, duration: "dotted-eighth", strings: [S(), S(), S(), S(), N(2), S()] },
			{ id: `${p}-6`, duration: "sixteenth", strings: [S(), Ng(0), S(), S(), S(), S()] },
			{ id: `${p}-7`, duration: "quarter", strings: [NR(0), NR(0), NR(2), S(), S(), S()] },
		],
	};
}

function makeCelticSlideMeasure(n: number): Measure {
	const p = `celtic-m${n}`;
	return {
		id: p,
		slots: [
			{ id: `${p}-1`, duration: "dotted-eighth", strings: [S(), S(), S(), S(), S(), N(0)] },
			{ id: `${p}-2`, duration: "sixteenth", strings: [S(), S(), S(), Su(2), S(), S()] },
			{ id: `${p}-3`, duration: "eighth", strings: [S(), S(), NR(2), S(), S(), S()] },
			{ id: `${p}-4`, duration: "eighth", strings: [S(), N(0), S(), S(), S(), S()] },
			{ id: `${p}-5`, duration: "dotted-eighth", strings: [S(), S(), S(), S(), N(0), S()] },
			{ id: `${p}-6`, duration: "sixteenth", strings: [S(), S(), Hn(0), S(), S(), S()] },
			{ id: `${p}-7`, duration: "quarter", strings: [NRA(0), NRA(1), NRA(2), S(), S(), S()] },
		],
	};
}

function makeCelticClimaxMeasure(n: number): Measure {
	const p = `celtic-m${n}`;
	return {
		id: p,
		slots: [
			{ id: `${p}-1`, duration: "dotted-eighth", strings: [S(), S(), S(), S(), S(), N(0)] },
			{ id: `${p}-2`, duration: "sixteenth", strings: [S(), S(), Hn(2), S(), S(), S()] },
			{ id: `${p}-3`, duration: "eighth", strings: [S(), NR(0), S(), S(), S(), S()] },
			{ id: `${p}-4`, duration: "eighth", strings: [S(), S(), Po(0), S(), S(), S()] },
			{ id: `${p}-5`, duration: "dotted-eighth", strings: [S(), S(), S(), S(), N(2), S()] },
			{ id: `${p}-6`, duration: "sixteenth", strings: [S(), Su(1), S(), S(), S(), S()] },
			{
				id: `${p}-7`,
				duration: "quarter",
				strings: [NRA(0), NRA(0), NRA(2), NRA(2), S(), S()],
			},
		],
	};
}

const CELTIC_FINGERSTYLE: FingerpickPattern = {
	id: "celtic-fingerstyle",
	name: "Celtic Fingerstyle",
	description: "Celtic-flavoured fingerstyle with ornamental techniques over Em/Am shapes",
	bpm: 95,
	timeSignature: [4, 4],
	measures: [
		makeCelticBaseMeasure(1),
		makeCelticBaseMeasure(2),
		makeCelticPulloffMeasure(3),
		makeCelticPulloffMeasure(4),
		makeCelticSlideMeasure(5),
		makeCelticSlideMeasure(6),
		makeCelticClimaxMeasure(7),
		makeCelticClimaxMeasure(8),
	],
};

export const PRESET_FINGERPICK_PATTERNS: FingerpickPattern[] = [
	ZEBRA_ZEBRA,
	TRAVIS_PICKING,
	ARPEGGIO,
	WALTZ,
	CELTIC_FINGERSTYLE,
];
