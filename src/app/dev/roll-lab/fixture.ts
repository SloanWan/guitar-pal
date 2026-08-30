import type { BeatSlot, FingerpickPattern, StringFret, Stroke, Duration } from "@/lib/fingerpickTypes";

// ── StringFret factories ─────────────────────────────────────────────────────
// String index order: [e(high), B, G, D, A, E(low)] = [0, 1, 2, 3, 4, 5].
const S = (): StringFret => ({ fret: null, technique: null, tied: false, muted: false });
const N = (fret: number): StringFret => ({ fret, technique: null, tied: false, muted: false });

type Six = [StringFret, StringFret, StringFret, StringFret, StringFret, StringFret];

// Open C-major voicing across all six strings — a "full" chord for the roll cases.
//   e:0  B:1  G:0  D:2  A:3  E:0
const C_MAJOR_FULL = (): Six => [N(0), N(1), N(0), N(2), N(3), N(0)];

// Sparse voicing with holes at G (2) and D (3): active strings 0, 1, 4, 5.
//   e:0  B:1  G:—  D:—  A:3  E:0
const SPARSE_GAPPED = (): Six => [N(0), N(1), S(), S(), N(3), N(0)];

const slot = (id: string, duration: Duration, strings: Six, stroke?: Stroke): BeatSlot =>
	stroke ? { id, duration, strings, stroke } : { id, duration, strings };

// ── Fixture ──────────────────────────────────────────────────────────────────
// Five measures, each a distinct roll case so the click-to-seek cursor can audition
// them one at a time. Authored at 120 BPM so a sixteenth (m4) is 0.125 s — short
// enough that the span cap must engage.
export const ROLL_LAB_FIXTURE: FingerpickPattern = {
	id: "roll-lab-fixture",
	name: "Roll Lab Fixture",
	description: "Roll-down / roll-up / gapped / fast-subdivision / unrolled reference",
	bpm: 120,
	timeSignature: [4, 4],
	measures: [
		// m1 — full six-string chord, roll-down (low → high).
		{ id: "m1", slots: [slot("m1s0", "whole", C_MAJOR_FULL(), "roll-down")] },

		// m2 — the same chord, roll-up (high → low) — direct A/B against m1.
		{ id: "m2", slots: [slot("m2s0", "whole", C_MAJOR_FULL(), "roll-up")] },

		// m3 — sparse/gapped voicing with a roll (exercises gap-handling toggle).
		{ id: "m3", slots: [slot("m3s0", "whole", SPARSE_GAPPED(), "roll-down")] },

		// m4 — fast subdivisions: a rolled full chord as a sixteenth (span cap must
		// hold so it does not bleed into the following note), plus a rolled quarter.
		{
			id: "m4",
			slots: [
				slot("m4s0", "sixteenth", C_MAJOR_FULL(), "roll-down"),
				slot("m4s1", "sixteenth", [N(0), S(), S(), S(), S(), S()]),
				slot("m4s2", "eighth", [S(), N(1), S(), S(), S(), S()]),
				slot("m4s3", "half", [S(), S(), S(), S(), N(3), S()]),
				slot("m4s4", "quarter", C_MAJOR_FULL(), "roll-down"),
			],
		},

		// m5 — the same full chord with NO stroke — the unrolled A/B reference.
		{ id: "m5", slots: [slot("m5s0", "whole", C_MAJOR_FULL())] },
	],
};
