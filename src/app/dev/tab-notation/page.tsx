"use client";

import { useMemo, useState, useEffect, useRef } from "react";

import TabStaveRow, {
	computeMeasureMinWidth,
	CLEF_WIDTH,
} from "@/components/fingerpick/TabStaveRow";
import { useFingerpickAudioEngine } from "@/components/fingerpick/useFingerpickAudioEngine";
import { fingerpickToVexFlow } from "@/lib/fingerpickToVexFlow";
import type { FingerpickPattern, Measure, StringFret } from "@/lib/fingerpickTypes";

// ── StringFret factories ──────────────────────────────────────────────────────

const S = (): StringFret => ({ fret: null, technique: null, tied: false, muted: false });
const N = (fret: number): StringFret => ({ fret, technique: null, tied: false, muted: false });
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
const Sd = (fret: number): StringFret => ({
	fret,
	technique: "slide-down",
	tied: false,
	muted: false,
});
const Ti = (fret: number): StringFret => ({ fret, technique: null, tied: true, muted: false });
const Sta = (fret: number): StringFret => ({
	fret,
	technique: null,
	tied: false,
	muted: false,
	staccato: true,
});
const Acc = (fret: number): StringFret => ({
	fret,
	technique: null,
	tied: false,
	muted: false,
	accent: true,
});
const Pd = (fret: number): StringFret => ({
	fret,
	technique: null,
	tied: false,
	muted: false,
	pickStroke: "down",
});
const Pu = (fret: number): StringFret => ({
	fret,
	technique: null,
	tied: false,
	muted: false,
	pickStroke: "up",
});
const Tr8 = (fret: number): StringFret => ({
	fret,
	technique: null,
	tied: false,
	muted: false,
	tremoloPickingSpeed: "8th",
});
const Tr16 = (fret: number): StringFret => ({
	fret,
	technique: null,
	tied: false,
	muted: false,
	tremoloPickingSpeed: "16th",
});
const Tr32 = (fret: number): StringFret => ({
	fret,
	technique: null,
	tied: false,
	muted: false,
	tremoloPickingSpeed: "32nd",
});
const Vib = (fret: number): StringFret => ({
	fret,
	technique: "vibrato",
	tied: false,
	muted: false,
});
const VibW = (fret: number): StringFret => ({
	fret,
	technique: "vibrato-wide",
	tied: false,
	muted: false,
});
const Tap = (fret: number): StringFret => ({
	fret,
	technique: "tapping",
	tied: false,
	muted: false,
});
const Trl = (fret: number): StringFret => ({ fret, technique: "trill", tied: false, muted: false });

// ── Measure definitions ───────────────────────────────────────────────────────
// Strings index: [e(high), B, G, D, A, E(low)] = [0, 1, 2, 3, 4, 5]

const GRACE_NOTE_MEASURE: Measure = {
	id: "grace",
	slots: [
		// Grace note before eighth note (most common usage)
		{
			id: "g1",
			duration: "eighth",
			isGraceNote: true,
			strings: [N(5), S(), S(), S(), S(), S()],
		},
		{
			id: "g2",
			duration: "eighth",
			strings: [N(7), S(), S(), S(), S(), S()],
		},
		// Grace note before quarter note
		{
			id: "g3",
			duration: "eighth",
			isGraceNote: true,
			strings: [N(9), S(), S(), S(), S(), S()],
		},
		{
			id: "g4",
			duration: "quarter",
			strings: [N(12), S(), S(), S(), S(), S()],
		},
		// Grace note on different string
		{
			id: "g5",
			duration: "eighth",
			isGraceNote: true,
			strings: [S(), N(7), S(), S(), S(), S()],
		},
		{
			id: "g6",
			duration: "quarter",
			strings: [S(), N(9), S(), S(), S(), S()],
		},
	],
};

const STACCATO_ACCENT_MEASURE: Measure = {
	id: "staccato-accent",
	slots: [
		{ id: "sa1", duration: "quarter", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "sa2", duration: "quarter", strings: [Sta(5), S(), S(), S(), S(), S()] },
		{ id: "sa3", duration: "quarter", strings: [Acc(5), S(), S(), S(), S(), S()] },
		{ id: "sa4", duration: "quarter", strings: [N(5), S(), S(), S(), S(), S()] },
	],
};

const PICK_STROKE_MEASURE: Measure = {
	id: "pick-stroke",
	slots: [
		{ id: "ps1", duration: "quarter", strings: [Pd(5), S(), S(), S(), S(), S()] },
		{ id: "ps2", duration: "quarter", strings: [Pu(5), S(), S(), S(), S(), S()] },
		{ id: "ps3", duration: "quarter", strings: [Pd(7), S(), S(), S(), S(), S()] },
		{ id: "ps4", duration: "quarter", strings: [Pu(7), S(), S(), S(), S(), S()] },
	],
};

const TREMOLO_MEASURE: Measure = {
	id: "tremolo",
	slots: [
		{ id: "tr1", duration: "quarter", strings: [Tr8(5), S(), S(), S(), S(), S()] },
		{ id: "tr2", duration: "quarter", strings: [Tr16(5), S(), S(), S(), S(), S()] },
		{ id: "tr3", duration: "quarter", strings: [Tr32(5), S(), S(), S(), S(), S()] },
		{ id: "tr4", duration: "quarter", strings: [N(5), S(), S(), S(), S(), S()] },
	],
};

const VIBRATO_MEASURE: Measure = {
	id: "vibrato",
	slots: [
		{ id: "vib1", duration: "half", strings: [Vib(5), S(), S(), S(), S(), S()] },
		{ id: "vib2", duration: "half", strings: [VibW(5), S(), S(), S(), S(), S()] },
	],
};

const HAMMER_PULL_MEASURE: Measure = {
	id: "hammer-pull",
	slots: [
		{ id: "hp1", duration: "quarter", strings: [S(), S(), S(), N(0), S(), S()] },
		{ id: "hp2", duration: "quarter", strings: [S(), S(), S(), Hn(2), S(), S()] },
		{ id: "hp3", duration: "quarter", strings: [S(), S(), S(), N(2), S(), S()] },
		{ id: "hp4", duration: "quarter", strings: [S(), S(), S(), Po(0), S(), S()] },
	],
};

const TAPPING_MEASURE: Measure = {
	id: "tapping",
	slots: [
		{ id: "tap1", duration: "quarter", strings: [Tap(12), S(), S(), S(), S(), S()] },
		{ id: "tap2", duration: "quarter", strings: [S(), Tap(14), S(), S(), S(), S()] },
		{ id: "tap3", duration: "quarter", strings: [Tap(12), S(), S(), S(), S(), S()] },
		{ id: "tap4", duration: "quarter", strings: [S(), Tap(10), S(), S(), S(), S()] },
	],
};

const TRILL_MEASURE: Measure = {
	id: "trill",
	slots: [
		{ id: "tr1", duration: "quarter", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "tr2", duration: "quarter", strings: [Trl(7), S(), S(), S(), S(), S()] },
		{ id: "tr3", duration: "half", strings: [N(5), S(), S(), S(), S(), S()] },
	],
};

// ── Slide demo measures ───────────────────────────────────────────────────────
// Destination model: the slide technique is placed on the note you ARRIVE AT,
// matching the StringFret type comment ("technique used to arrive at this note
// from the previous slot"). This causes VexFlow to draw the connector from the
// source note to the destination note, and tells the scheduler to consume the
// destination into a slideChain (no separate pluck at the destination pitch).

// M1: short slide-up (B string, 5→7) followed by a normal note.
const SLIDE_M1: Measure = {
	id: "slide-m1",
	slots: [
		// Source: pick at fret 5 (no technique)
		{ id: "sl1-1", duration: "quarter", strings: [S(), N(5), S(), S(), S(), S()] },
		// Destination: arrived at fret 7 via slide-up → renders 5/7 connector
		{ id: "sl1-2", duration: "quarter", strings: [S(), Su(7), S(), S(), S(), S()] },
		// Normal note (new pick)
		{ id: "sl1-3", duration: "half", strings: [S(), N(5), S(), S(), S(), S()] },
	],
};

// M2: long slide-up (B string, 5→12).
const SLIDE_M2: Measure = {
	id: "slide-m2",
	slots: [
		{ id: "sl2-1", duration: "half", strings: [S(), N(5), S(), S(), S(), S()] },
		{ id: "sl2-2", duration: "half", strings: [S(), Su(12), S(), S(), S(), S()] },
	],
};

// M3: slide-down (B string, 9→7) followed by a normal note.
const SLIDE_M3: Measure = {
	id: "slide-m3",
	slots: [
		// Source: pick at fret 9
		{ id: "sl3-1", duration: "quarter", strings: [S(), N(9), S(), S(), S(), S()] },
		// Destination: arrived at fret 7 via slide-down → renders 9\7 connector
		{ id: "sl3-2", duration: "quarter", strings: [S(), Sd(7), S(), S(), S(), S()] },
		// Normal note
		{ id: "sl3-3", duration: "half", strings: [S(), N(9), S(), S(), S(), S()] },
	],
};

// M4: simultaneous single slides on str0 (e) and a chain on str1 (B: 5→9→5),
// plus a single slide on str2 (G). Demonstrates that one ScheduleEvent on str1
// carries slideChain of length 2, producing two connected slide lines.
const SLIDE_M4: Measure = {
	id: "slide-m4",
	slots: [
		// str0: source 7 (single slide); str1: source 5 (chain start: 5→9→5)
		{ id: "sl4-1", duration: "eighth", strings: [N(7), N(5), S(), S(), S(), S()] },
		// str0: arrived at 12 via slide-up (7→12); str1: chain dest1 — arrived at 9 via slide-up (5→9)
		{ id: "sl4-2", duration: "eighth", strings: [Su(12), Su(9), S(), S(), S(), S()] },
		// str1: chain dest2 — arrived at 5 via slide-down (9→5); str2: source 7 (new single slide)
		{ id: "sl4-3", duration: "eighth", strings: [S(), Sd(5), N(7), S(), S(), S()] },
		// str2: arrived at 9 via slide-up (7→9)
		{ id: "sl4-4", duration: "eighth", strings: [S(), S(), Su(9), S(), S(), S()] },
		// Silence — lets the str1 chain ring out
		{ id: "sl4-5", duration: "half", strings: [S(), S(), S(), S(), S(), S()] },
	],
};

const SLIDE_MEASURES = [SLIDE_M1, SLIDE_M2, SLIDE_M3, SLIDE_M4];

// ── Duration demo measures ────────────────────────────────────────────────────
// Each measure demonstrates a single Duration value using string 0 (high e).

const WHOLE_DUR_MEASURE: Measure = {
	id: "dur-whole",
	slots: [{ id: "dw1", duration: "whole", strings: [N(5), S(), S(), S(), S(), S()] }],
};

const HALF_DUR_MEASURE: Measure = {
	id: "dur-half",
	slots: [
		{ id: "dh1", duration: "half", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "dh2", duration: "half", strings: [N(7), S(), S(), S(), S(), S()] },
	],
};

const QUARTER_DUR_MEASURE: Measure = {
	id: "dur-quarter",
	slots: [
		{ id: "dq1", duration: "quarter", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "dq2", duration: "quarter", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "dq3", duration: "quarter", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "dq4", duration: "quarter", strings: [N(7), S(), S(), S(), S(), S()] },
	],
};

const DOTTED_QUARTER_DUR_MEASURE: Measure = {
	id: "dur-dotted-quarter",
	slots: [
		{ id: "ddq1", duration: "dotted-quarter", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "ddq2", duration: "dotted-quarter", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "ddq3", duration: "dotted-quarter", strings: [N(5), S(), S(), S(), S(), S()] },
	],
};

const EIGHTH_DUR_MEASURE: Measure = {
	id: "dur-eighth",
	slots: [
		{ id: "de1", duration: "eighth", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "de2", duration: "eighth", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "de3", duration: "eighth", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "de4", duration: "eighth", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "de5", duration: "eighth", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "de6", duration: "eighth", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "de7", duration: "eighth", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "de8", duration: "eighth", strings: [N(7), S(), S(), S(), S(), S()] },
	],
};

const DOTTED_EIGHTH_DUR_MEASURE: Measure = {
	id: "dur-dotted-eighth",
	slots: [
		{ id: "dde1", duration: "dotted-eighth", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "dde2", duration: "dotted-eighth", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "dde3", duration: "dotted-eighth", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "dde4", duration: "dotted-eighth", strings: [N(7), S(), S(), S(), S(), S()] },
	],
};

// Triplet groups must contain exactly 3 slots each for correct Tuplet rendering.
const EIGHTH_TRIPLET_DUR_MEASURE: Measure = {
	id: "dur-eighth-triplet",
	slots: [
		{ id: "det1", duration: "eighth-triplet", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "det2", duration: "eighth-triplet", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "det3", duration: "eighth-triplet", strings: [N(9), S(), S(), S(), S(), S()] },
		{ id: "det4", duration: "eighth-triplet", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "det5", duration: "eighth-triplet", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "det6", duration: "eighth-triplet", strings: [N(9), S(), S(), S(), S(), S()] },
	],
};

const SIXTEENTH_DUR_MEASURE: Measure = {
	id: "dur-sixteenth",
	slots: [
		{ id: "d16-1", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "d16-2", duration: "sixteenth", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "d16-3", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "d16-4", duration: "sixteenth", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "d16-5", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "d16-6", duration: "sixteenth", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "d16-7", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "d16-8", duration: "sixteenth", strings: [N(7), S(), S(), S(), S(), S()] },
	],
};

const SIXTEENTH_TRIPLET_DUR_MEASURE: Measure = {
	id: "dur-sixteenth-triplet",
	slots: [
		{ id: "dst1", duration: "sixteenth-triplet", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "dst2", duration: "sixteenth-triplet", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "dst3", duration: "sixteenth-triplet", strings: [N(9), S(), S(), S(), S(), S()] },
		{ id: "dst4", duration: "sixteenth-triplet", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "dst5", duration: "sixteenth-triplet", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "dst6", duration: "sixteenth-triplet", strings: [N(9), S(), S(), S(), S(), S()] },
	],
};

const THIRTY_SECOND_DUR_MEASURE: Measure = {
	id: "dur-32nd",
	slots: [
		{ id: "d32-1", duration: "32nd", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "d32-2", duration: "32nd", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "d32-3", duration: "32nd", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "d32-4", duration: "32nd", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "d32-5", duration: "32nd", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "d32-6", duration: "32nd", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "d32-7", duration: "32nd", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "d32-8", duration: "32nd", strings: [N(7), S(), S(), S(), S(), S()] },
	],
};

const REST_DUR_MEASURE: Measure = {
	id: "dur-rest",
	slots: [
		{ id: "dr1", duration: "rest", strings: [S(), S(), S(), S(), S(), S()] },
		{ id: "dr2", duration: "rest", strings: [S(), S(), S(), S(), S(), S()] },
		{ id: "dr3", duration: "rest", strings: [S(), S(), S(), S(), S(), S()] },
		{ id: "dr4", duration: "rest", strings: [S(), S(), S(), S(), S(), S()] },
	],
};

// ── Stress test measures ──────────────────────────────────────────────────────
// BPM 120 — all notes on strings 0–2 (high e, B, G), frets 5–15.

const STRESS_M1: Measure = {
	id: "stress-m1",
	slots: [
		// Beat 1: hammer-on and pull-off on str0
		{ id: "sm1-1", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "sm1-2", duration: "sixteenth", strings: [Hn(7), S(), S(), S(), S(), S()] },
		{ id: "sm1-3", duration: "sixteenth", strings: [N(9), S(), S(), S(), S(), S()] },
		{ id: "sm1-4", duration: "sixteenth", strings: [Po(7), S(), S(), S(), S(), S()] },
		// Beat 2: accent + hammer-on across str0/str1
		{ id: "sm1-5", duration: "sixteenth", strings: [S(), N(7), S(), S(), S(), S()] },
		{ id: "sm1-6", duration: "sixteenth", strings: [Acc(9), S(), S(), S(), S(), S()] },
		{ id: "sm1-7", duration: "sixteenth", strings: [S(), Hn(9), S(), S(), S(), S()] },
		{ id: "sm1-8", duration: "sixteenth", strings: [S(), N(12), S(), S(), S(), S()] },
		// Beat 3: staccato burst and accent
		{ id: "sm1-9", duration: "sixteenth", strings: [Sta(12), S(), S(), S(), S(), S()] },
		{ id: "sm1-10", duration: "sixteenth", strings: [S(), Sta(10), S(), S(), S(), S()] },
		{ id: "sm1-11", duration: "sixteenth", strings: [S(), S(), N(9), S(), S(), S()] },
		{ id: "sm1-12", duration: "sixteenth", strings: [Acc(14), S(), S(), S(), S(), S()] },
		// Beat 4: pull-off and fill
		{ id: "sm1-13", duration: "sixteenth", strings: [N(14), S(), S(), S(), S(), S()] },
		{ id: "sm1-14", duration: "sixteenth", strings: [Po(12), S(), S(), S(), S(), S()] },
		{ id: "sm1-15", duration: "sixteenth", strings: [S(), N(9), S(), S(), S(), S()] },
		{ id: "sm1-16", duration: "sixteenth", strings: [N(12), S(), S(), S(), S(), S()] },
	],
};

const STRESS_M2: Measure = {
	id: "stress-m2",
	slots: [
		// Grace note (no rhythmic advance)
		{
			id: "sm2-gr",
			duration: "eighth",
			strings: [N(7), S(), S(), S(), S(), S()],
			isGraceNote: true,
		},
		// 8 × 32nd = 1 beat: rapid alternation str0/str1
		{ id: "sm2-1", duration: "32nd", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "sm2-2", duration: "32nd", strings: [S(), N(7), S(), S(), S(), S()] },
		{ id: "sm2-3", duration: "32nd", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "sm2-4", duration: "32nd", strings: [S(), N(9), S(), S(), S(), S()] },
		{ id: "sm2-5", duration: "32nd", strings: [N(9), S(), S(), S(), S(), S()] },
		{ id: "sm2-6", duration: "32nd", strings: [S(), N(12), S(), S(), S(), S()] },
		{ id: "sm2-7", duration: "32nd", strings: [N(12), S(), S(), S(), S(), S()] },
		{ id: "sm2-8", duration: "32nd", strings: [S(), N(10), S(), S(), S(), S()] },
		// Slide-up pair (2 × eighth = 1 beat)
		{ id: "sm2-9", duration: "eighth", strings: [N(9), S(), S(), S(), S(), S()] },
		{ id: "sm2-10", duration: "eighth", strings: [Su(12), S(), S(), S(), S(), S()] },
		// Tremolo quarter on str2 (1 beat)
		{ id: "sm2-11", duration: "quarter", strings: [S(), S(), Tr16(9), S(), S(), S()] },
		// Closing quarter str1 (1 beat)
		{ id: "sm2-12", duration: "quarter", strings: [S(), N(9), S(), S(), S(), S()] },
	],
};

const STRESS_M3: Measure = {
	id: "stress-m3",
	slots: [
		// 8 × eighth = 4 beats: tapping and staccato alternating
		{ id: "sm3-1", duration: "eighth", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "sm3-2", duration: "eighth", strings: [Tap(12), S(), S(), S(), S(), S()] },
		{ id: "sm3-3", duration: "eighth", strings: [S(), N(9), S(), S(), S(), S()] },
		{ id: "sm3-4", duration: "eighth", strings: [S(), Tap(14), S(), S(), S(), S()] },
		{ id: "sm3-5", duration: "eighth", strings: [Sta(7), S(), S(), S(), S(), S()] },
		{ id: "sm3-6", duration: "eighth", strings: [S(), S(), N(9), S(), S(), S()] },
		{ id: "sm3-7", duration: "eighth", strings: [Tap(15), S(), S(), S(), S(), S()] },
		{ id: "sm3-8", duration: "eighth", strings: [S(), Sta(7), S(), S(), S(), S()] },
	],
};

const STRESS_M4: Measure = {
	id: "stress-m4",
	slots: [
		// 4 quarters: source → hammer-on → pull-off → accented close
		{ id: "sm4-1", duration: "quarter", strings: [N(9), S(), S(), S(), S(), S()] },
		{ id: "sm4-2", duration: "quarter", strings: [Hn(12), S(), S(), S(), S(), S()] },
		{ id: "sm4-3", duration: "quarter", strings: [Po(9), S(), S(), S(), S(), S()] },
		{ id: "sm4-4", duration: "quarter", strings: [Acc(12), S(), S(), S(), S(), S()] },
	],
};

// ── Groups ────────────────────────────────────────────────────────────────────

const GROUPS: { label: string; measures: Measure[] }[] = [
	{ label: "Grace Note (grace note before regular note)", measures: [GRACE_NOTE_MEASURE] },
	{ label: "Staccato (·) and Accent (>) — notes 2 and 3", measures: [STACCATO_ACCENT_MEASURE] },
	{ label: "Pick Stroke: Down (⊓) and Up (V) alternating", measures: [PICK_STROKE_MEASURE] },
	{
		label: "Tremolo Picking: 8th (1 slash) · 16th (2) · 32nd (3) · plain",
		measures: [TREMOLO_MEASURE],
	},
	{ label: "Vibrato (half 1) and Vibrato-Wide (half 2)", measures: [VIBRATO_MEASURE] },
	{ label: "Techniques: Hammer-On, Pull-Off", measures: [HAMMER_PULL_MEASURE] },
	{ label: "Techniques: Tapping", measures: [TAPPING_MEASURE] },
	{ label: "Techniques: Trill", measures: [TRILL_MEASURE] },
	{ label: "Slide", measures: SLIDE_MEASURES },
	{ label: "Duration: whole", measures: [WHOLE_DUR_MEASURE] },
	{ label: "Duration: half", measures: [HALF_DUR_MEASURE] },
	{ label: "Duration: quarter", measures: [QUARTER_DUR_MEASURE] },
	{ label: "Duration: dotted-quarter (1.5 beats)", measures: [DOTTED_QUARTER_DUR_MEASURE] },
	{ label: "Duration: eighth", measures: [EIGHTH_DUR_MEASURE] },
	{ label: "Duration: dotted-eighth (0.75 beats)", measures: [DOTTED_EIGHTH_DUR_MEASURE] },
	{
		label: "Duration: eighth-triplet (3 per beat, 2 groups shown)",
		measures: [EIGHTH_TRIPLET_DUR_MEASURE],
	},
	{ label: "Duration: sixteenth", measures: [SIXTEENTH_DUR_MEASURE] },
	{
		label: "Duration: sixteenth-triplet (3 per half-beat, 2 groups shown)",
		measures: [SIXTEENTH_TRIPLET_DUR_MEASURE],
	},
	{ label: "Duration: 32nd (8 notes = 1 beat)", measures: [THIRTY_SECOND_DUR_MEASURE] },
	{ label: "Duration: rest", measures: [REST_DUR_MEASURE] },
	{
		label: "Stress Test — Dense Mixed Techniques",
		measures: [STRESS_M1, STRESS_M2, STRESS_M3, STRESS_M4],
	},
];

// ── Section metadata ──────────────────────────────────────────────────────────

interface GroupMeta {
	status: string;
	en: string;
	zh: string;
}

const GROUP_METAS: Record<string, GroupMeta> = {
	"Grace Note (grace note before regular note)": {
		status: "⏳ Half implemented",
		en: "A grace note is a quick ornamental note played just before the main note, with no fixed rhythmic value. Both rendering (small-size fret number) and audio (ultra-short pluck without voice stealing) need further work. Deferred — not required for the current simple TAB target scope.",
		zh: "装饰音是在主音符前快速演奏的短促音符，无固定时值。渲染（小号品位数字）和音频（极短发音不触发声部抢占）均需进一步完善。暂缓实现——当前目标曲谱范围暂不涉及此技法。",
	},
	"Staccato (·) and Accent (>) — notes 2 and 3": {
		status: "✅ Fully implemented",
		en: "Staccato shortens the note to about 20% of its written duration for a clipped, punchy sound. Accent increases the attack gain for emphasis.",
		zh: "断音（staccato）将音符缩短至约 20% 时值，产生干脆利落的效果。重音（accent）提高起始音量以突出该音符。",
	},
	"Pick Stroke: Down (⊓) and Up (V) alternating": {
		status: "⚡ Simplified",
		en: "Down and up strokes indicate pick direction. Audio is identical — the difference is felt in physical technique, not tone.",
		zh: "下拨和上拨标记拨片方向。音频上两者相同，区别体现在演奏手法上而非音色。",
	},
	"Tremolo Picking: 8th (1 slash) · 16th (2) · 32nd (3) · plain": {
		status: "✅ Fully implemented",
		en: "Tremolo picking means rapidly repeating the same note. The number of slashes indicates speed: 1 = 8th, 2 = 16th, 3 = 32nd note repetitions.",
		zh: "震音拨弦指快速重复同一音符。斜线数量表示速度：1 条=八分音符，2 条=十六分，3 条=三十二分。",
	},
	"Vibrato (half 1) and Vibrato-Wide (half 2)": {
		status: "⏳ Not yet implemented",
		en: "Vibrato is a repeated small pitch fluctuation that makes a note sing. Wide vibrato is an exaggerated version. Audio simulation is planned for a future issue.",
		zh: "颤音是对音符音高进行小幅反复波动，让音符更有歌唱感。大幅颤音是其夸张版本。音频模拟计划在后续 issue 中实现。",
	},
	"Techniques: Hammer-On, Pull-Off": {
		status: "⚡ Partially implemented — needs further refinement",
		en: "Hammer-on and pull-off sound without picking. Currently approximated using a low-pass filter (cutoff 2000 Hz) to reduce the pick transient, with gain ×0.5. The result is softer than a normal pluck but does not fully replicate the legato attack. Needs further audio research.",
		zh: "击弦和勾弦无需拨弦发音。目前用低通滤波器（截止 2000 Hz）降低拨弦瞬态，增益 ×0.5 近似模拟。效果比普通拨弦柔和，但尚未完全还原连奏音色，需进一步优化。",
	},
	"Techniques: Tapping": {
		status: "⚡ Partially implemented — needs further refinement",
		en: "Tapping uses a picking-hand finger to strike the fretboard. Currently uses the same pluck sample with gain ×0.8 and no filter. The percussive character is approximated but the sample attack does not match real tapping. Needs further audio research.",
		zh: "点弦用拨弦手手指敲击指板。目前使用相同的拨弦采样，增益 ×0.8，不加滤波。打击感近似但采样起音与真实点弦不符，需进一步优化。",
	},
	"Techniques: Trill": {
		status: "⚡ Partially implemented — needs further refinement",
		en: "Trill rapidly alternates between two frets using hammer-on and pull-off. Currently uses the same low-pass filter approach as hammer-on. Audio does not simulate the rapid alternation — only the initial note sounds. Needs further audio research.",
		zh: "颤弦在两个品位间快速交替击弦和勾弦。目前与击弦使用相同的低通滤波近似，音频不模拟快速交替，只发出起始音。需进一步优化。",
	},
	Slide: {
		status: "⏳ Not yet implemented",
		en: "Slide moves from one fret to another by keeping the finger pressed and gliding along the string without re-picking. Pitch glide audio is not yet implemented — currently plays as a normal pluck. A dedicated issue will research the correct sample-based approach.",
		zh: "滑音通过保持手指按压并沿琴弦滑动来改变音高，无需重新拨弦。音高滑动的音频尚未实现，目前以普通拨弦代替。将通过独立 issue 研究正确的基于采样的实现方案。",
	},
	"Duration: whole": {
		status: "✅ Fully implemented",
		en: "A whole note lasts for an entire measure (4 beats). It is held without replaying. The string rings out for its full duration.",
		zh: "全音符持续整个小节（4 拍）。不需要重新拨弦，让琴弦自然振鸣到结束。",
	},
	"Duration: half": {
		status: "✅ Fully implemented",
		en: "A half note lasts 2 beats. Common in slow melodies and ballads.",
		zh: "二分音符持续 2 拍，常见于慢速旋律和抒情曲。",
	},
	"Duration: quarter": {
		status: "✅ Fully implemented",
		en: "A quarter note lasts 1 beat — the most common note value in music.",
		zh: "四分音符持续 1 拍，是音乐中最常见的基本音符时值。",
	},
	"Duration: dotted-quarter (1.5 beats)": {
		status: "✅ Fully implemented",
		en: "A dotted quarter note lasts 1.5 beats. The dot adds half the note's original value.",
		zh: "附点四分音符持续 1.5 拍，附点为原时值加上一半。",
	},
	"Duration: eighth": {
		status: "✅ Fully implemented",
		en: "An eighth note lasts half a beat. Two eighth notes fit in one beat.",
		zh: "八分音符持续半拍，两个八分音符合为一拍。",
	},
	"Duration: dotted-eighth (0.75 beats)": {
		status: "✅ Fully implemented",
		en: "A dotted eighth note lasts 0.75 beats. Common in syncopated and shuffle rhythms.",
		zh: "附点八分音符持续 0.75 拍，常见于切分节奏和 shuffle 节奏型。",
	},
	"Duration: eighth-triplet (3 per beat, 2 groups shown)": {
		status: "✅ Fully implemented",
		en: "Three eighth-triplet notes fit in the space of two regular eighth notes. Gives a rolling, swung feel.",
		zh: "三个八分三连音填满两个普通八分音符的空间，产生摇摆律动感。",
	},
	"Duration: sixteenth": {
		status: "✅ Fully implemented",
		en: "A sixteenth note lasts a quarter beat. Four fit in one beat — used in fast passages and funk rhythms.",
		zh: "十六分音符持续四分之一拍，常用于快速段落和放克节奏。",
	},
	"Duration: sixteenth-triplet (3 per half-beat, 2 groups shown)": {
		status: "✅ Fully implemented",
		en: "Three sixteenth-triplet notes fit in the space of two sixteenth notes. Used in fast, fluid lead passages.",
		zh: "三个十六分三连音填满两个普通十六分音符，常用于快速流畅的 lead 段落。",
	},
	"Duration: 32nd (8 notes = 1 beat)": {
		status: "✅ Fully implemented",
		en: "A 32nd note is very short — eight fit in one beat. Used in rapid shredding passages.",
		zh: "三十二分音符极短，8 个合为一拍，常出现在快速扫弦段落中。",
	},
	"Duration: rest": {
		status: "✅ Fully implemented",
		en: "A rest is a moment of silence. Rests are as important as notes in shaping rhythm and feel.",
		zh: "休止符代表沉默的时刻。休止符和音符同样重要，共同塑造节奏感。",
	},
	"Stress Test — Dense Mixed Techniques": {
		status: "✅ Fully implemented",
		en: "A dense passage mixing multiple techniques and short note values to verify that the audio scheduler handles rapid back-to-back events without timing drift or dropped notes. BPM 120.",
		zh: "混合多种技法和短时值的密集段落，用于验证音频调度器在快速连续事件下不出现时序偏移或音符丢失。BPM 120。",
	},
};

/** BPM override per section label. Default is 80. */
const GROUP_BPM: Record<string, number> = {
	"Stress Test — Dense Mixed Techniques": 120,
};

/** Chinese section label shown when lang = "zh". */
const GROUP_LABEL_ZH: Record<string, string> = {
	Slide: "滑音",
	"Stress Test — Dense Mixed Techniques": "压力测试 — 密集混合技法",
};

// ── Width computation ─────────────────────────────────────────────────────────

const ROW_TRAILING_PAD = 15;

function techniqueConnectorCount(measure: Measure): number {
	return measure.slots.reduce(
		(count, slot) =>
			count +
			slot.strings.filter((sf) => sf.technique === "hammer-on" || sf.technique === "pull-off")
				.length,
		0,
	);
}

function computeGroupWidths(measures: Measure[], containerWidth: number): number[] {
	const staveSpace = containerWidth - CLEF_WIDTH - ROW_TRAILING_PAD;
	const renderData = measures.map((m) => fingerpickToVexFlow(m));
	const minWidths = renderData.map((rd, i) =>
		computeMeasureMinWidth(rd.notes, i === 0, techniqueConnectorCount(measures[i])),
	);
	const totalMin = minWidths.reduce((a, b) => a + b, 0);
	const scale = Math.max(1, staveSpace / totalMin);
	return minWidths.map((w) => w * scale);
}

// ── Page component ────────────────────────────────────────────────────────────

export default function TabNotationDevPage() {
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(0);
	const [lang, setLang] = useState<"en" | "zh">("en");

	const engine = useFingerpickAudioEngine();
	const [playingSectionId, setPlayingSectionId] = useState<string | null>(null);
	const { isPlaying } = engine;

	// Preload audio presets once on mount so the first Play click is instant.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => {
		void engine.load();
	}, []);

	// Derive the effective playing section from both state and the engine's isPlaying flag.
	// When the play-once pass ends, isPlaying goes false, which auto-clears the active button
	// without needing a setState-in-effect.
	const activeSection = isPlaying ? playingSectionId : null;

	function handlePlay(label: string, measures: Measure[]) {
		if (activeSection === label) {
			engine.stop();
			setPlayingSectionId(null);
			return;
		}
		const pattern: FingerpickPattern = {
			id: label,
			name: label,
			measures,
			bpm: GROUP_BPM[label] ?? 80,
			timeSignature: [4, 4],
		};
		setPlayingSectionId(label);
		engine.play(pattern, { loop: false });
	}

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const obs = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) setContainerWidth(Math.floor(entry.contentRect.width));
		});
		obs.observe(el);
		return () => obs.disconnect();
	}, []);

	const groups = useMemo(() => {
		if (containerWidth === 0) return [];
		return GROUPS.map(({ label, measures }) => ({
			label,
			measures,
			widths: computeGroupWidths(measures, containerWidth),
		}));
	}, [containerWidth]);

	return (
		<div ref={containerRef} className="p-6 max-w-5xl mx-auto font-mono">
			<div className="flex items-center justify-between mb-1">
				<h1 className="text-xl font-bold">Tab Notation Dev — Phase B1 + Durations</h1>
				<button
					onClick={() => setLang((l) => (l === "en" ? "zh" : "en"))}
					className="text-xs px-3 py-1 rounded border border-slate-300 hover:bg-slate-100"
				>
					{lang === "en" ? "中文" : "EN"}
				</button>
			</div>
			<p className="text-xs text-slate-400 mb-8">
				Visual verification for B1 modifiers: grace notes, staccato, accent, pick stroke,
				tremolo, vibrato. Regression: hammer-on, pull-off, slide-up, tie, slide-down.
				Duration rendering.
			</p>

			{groups.map(({ label, measures, widths }) => {
				const meta = GROUP_METAS[label];
				const sectionLabel = lang === "en" ? label : (GROUP_LABEL_ZH[label] ?? label);
				return (
					<section key={label} className="mb-8">
						<div className="flex items-center gap-2 mb-1">
							<h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
								{sectionLabel}
							</h3>
							<button
								onClick={() => handlePlay(label, measures)}
								className="text-xs px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-100"
							>
								{activeSection === label ? "■ Stop" : "▶ Play"}
							</button>
						</div>
						{meta && (
							<p className="text-xs text-slate-500 mb-2">
								<span className="font-medium">{meta.status}</span>
								{" — "}
								{lang === "en" ? meta.en : meta.zh}
							</p>
						)}
						<div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
							<TabStaveRow measures={measures} measureWidths={widths} />
						</div>
					</section>
				);
			})}
		</div>
	);
}
