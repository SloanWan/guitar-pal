import type { BeatSlot, FingerpickPattern, StringFret, Duration } from "@/lib/fingerpickTypes";

// ── StringFret factories ─────────────────────────────────────────────────────
// String index order: [e(high), B, G, D, A, E(low)] = [0, 1, 2, 3, 4, 5].
const S = (): StringFret => ({ fret: null, technique: null, tied: false, muted: false });
const N = (fret: number, extra: Partial<StringFret> = {}): StringFret => ({
	fret,
	technique: null,
	tied: false,
	muted: false,
	...extra,
});

type Six = [StringFret, StringFret, StringFret, StringFret, StringFret, StringFret];

// String indices used by the fixture.
const B_STRING = 1; // B
const G_STRING = 2; // G — the "mid-range string" for the slide cases
const D_STRING = 3; // D — reserved for the first-note-on-string fallback case

// Place a single StringFret on one string; all other strings silent.
function only(idx: number, sf: StringFret): Six {
	const row: Six = [S(), S(), S(), S(), S(), S()];
	row[idx] = sf;
	return row;
}

const slot = (
	id: string,
	duration: Duration,
	strings: Six,
	opts: { isGraceNote?: boolean } = {},
): BeatSlot => (opts.isGraceNote ? { id, duration, strings, isGraceNote: true } : { id, duration, strings });

// letRing origins keep the string ringing long enough for the slide to bend it in place
// (a slide is only feasible against a still-sounding voice).
const RING = { letRing: true } as const;

// ── Fixture ──────────────────────────────────────────────────────────────────
// Six measures, one slide/A-B case each, so click-to-seek can audition them one at a time.
// Authored at 90 BPM (a beat = 0.667 s) — slow enough to hear the pitch motion of a slide,
// and slow enough that a "32nd" note (m3) is 0.083 s < the 0.1 s voice-map threshold.
export const SLIDE_LAB_FIXTURE: FingerpickPattern = {
	id: "slide-lab-fixture",
	name: "Slide Lab Fixture",
	description:
		"2-fret up/down · wide (7-fret) · short origin (voice-map exclusion) · first-note fallback · hammer/pull A/B · plain reference",
	bpm: 90,
	timeSignature: [4, 4],
	measures: [
		// m1 — 2-fret slide UP then 2-fret slide DOWN on G (5→7→5). letRing origins so the
		// handoff is reliable. Both required 2-fret cases live here.
		{
			id: "m1",
			slots: [
				slot("m1s0", "quarter", only(G_STRING, N(5, RING))),
				slot("m1s1", "quarter", only(G_STRING, N(7, { ...RING, technique: "slide-up" }))),
				slot("m1s2", "quarter", only(G_STRING, N(5, { ...RING, technique: "slide-down" }))),
				slot("m1s3", "quarter", only(G_STRING, S())),
			],
		},

		// m2 — WIDE slide (7 frets, 3→10) on G to expose buffer-resampling artefacts at a
		// large interval. Slides only while maxIntervalSemitones ≥ 7.
		{
			id: "m2",
			slots: [
				slot("m2s0", "half", only(G_STRING, N(3, RING))),
				slot("m2s1", "half", only(G_STRING, N(10, { ...RING, technique: "slide-up" }))),
			],
		},

		// m3 — SHORT origin note (a "32nd" = 0.083 s at 90 BPM, below the 0.1 s registration
		// threshold and NOT letRing) → excluded from the voice map, so the following slide
		// finds no origin voice and falls back to a normal pluck (voice-map exclusion path).
		{
			id: "m3",
			slots: [
				slot("m3s0", "32nd", only(G_STRING, N(5))),
				slot("m3s1", "quarter", only(G_STRING, N(8, { technique: "slide-up" }))),
				slot("m3s2", "half", only(G_STRING, S())),
			],
		},

		// m4 — slide as the FIRST note on its string (D, never played earlier) → no origin
		// voice at all → fallback to a normal pluck (first-note fallback path).
		{
			id: "m4",
			slots: [
				slot("m4s0", "quarter", only(D_STRING, N(5, { technique: "slide-up" }))),
				slot("m4s1", "half", only(D_STRING, S())),
			],
		},

		// m5 — hammer-on / pull-off pair on B (5→7 hammer, 7→5 pull) for the 3-way
		// legato-treatment A/B (current / gain-only / dry). Slides are not involved here.
		{
			id: "m5",
			slots: [
				slot("m5s0", "quarter", only(B_STRING, N(5))),
				slot("m5s1", "quarter", only(B_STRING, N(7, { technique: "hammer-on" }))),
				slot("m5s2", "quarter", only(B_STRING, N(5, { technique: "pull-off" }))),
				slot("m5s3", "quarter", only(B_STRING, S())),
			],
		},

		// m6 — an ordinary plucked note (no technique, no letRing) as the reference tone.
		{
			id: "m6",
			slots: [slot("m6s0", "whole", only(G_STRING, N(5)))],
		},
	],
};
