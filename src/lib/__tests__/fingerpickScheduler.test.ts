import { describe, it, expect, vi, beforeEach } from "vitest";

import {
	fingerpickPatternToScheduleEvents,
	getTotalPatternDuration,
	secondsPerQuarter,
	computeLoopOffset,
	getProgressAtTime,
	findSlotStartTime,
	stealVoice,
	_shutdownEngine,
	computeRollOffsets,
	BRUSH_STAGGER_SECONDS,
	computeMeasureBoundaries,
	computeSlotStarts,
	slotAtTime,
	resolveSlide,
	isGlide,
	tremoloStrokes,
	trillStrokes,
	TAP_SKIP_S,
	DEFAULT_SLAP_PARAMS,
	SLIDE_IN_OUT_SEMITONES,
	noiseBufferFor,
	noteGain,
	PERCUSSION_STRINGS,
	applySlideToVoice,
	promoteSlideOriginsToLetRing,
	scheduleFingerpickNote,
	OPEN_STRING_MIDI,
	VOICE_STEAL_FADE_TAU,
	VOICE_STEAL_STOP_BUFFER,
	DEFAULT_ROLL_PARAMS,
	DEFAULT_SLIDE_PARAMS,
	ROLL_HARD_SPAN_CEILING,
	type RollParams,
	type SlideParams,
	type SlapParams,
	type SlidePlan,
	type SlideActiveVoice,
	type NoteGains,
	type NoteEnvelope,
	type LegatoTreatment,
	type NoteDataResolver,
	type FingerpickNoteSchedulerDeps,
	type ScheduleEvent,
} from "@/lib/fingerpickScheduler";
import {
	bendTimeline,
	curveLength,
	expressionForEffects,
	DEFAULT_VIBRATO_PARAMS,
	EXPRESSION_RELEASE_MIN_GAIN_RATIO,
} from "@/lib/fingerpickExpression";
import type { FingerpickPattern, BeatSlot, StringFret, Duration, Stroke } from "@/lib/fingerpickTypes";
import { makeDefaultPattern } from "@/lib/fingerpickEdit";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function strings6(
	overrides: Record<number, Partial<StringFret>> = {},
): [StringFret, StringFret, StringFret, StringFret, StringFret, StringFret] {
	const make = (i: number): StringFret => ({
		fret: null,
		muted: false,
		...(overrides[i] ?? {}),
	});
	return [make(0), make(1), make(2), make(3), make(4), make(5)];
}

function slot(
	id: string,
	duration: Duration,
	strOverrides: Record<number, Partial<StringFret>> = {},
): BeatSlot {
	return { id, duration, strings: strings6(strOverrides) };
}

// A silent slot: keeps a real rhythmic duration (quarter by default) but produces
// no sound. Mirrors the isRest-flag model.
function restSlot(id: string, duration: Duration = "quarter"): BeatSlot {
	return { ...slot(id, duration), isRest: true };
}

function pattern(bpm: number, slots: BeatSlot[]): FingerpickPattern {
	return {
		id: "p",
		name: "test",
		bpm,
		timeSignature: [4, 4],
		measures: [{ id: "m1", slots }],
	};
}

function multiMeasurePattern(bpm: number, slotsPerMeasure: BeatSlot[][]): FingerpickPattern {
	return {
		id: "p",
		name: "test",
		bpm,
		timeSignature: [4, 4],
		measures: slotsPerMeasure.map((slots, i) => ({ id: `m${i}`, slots })),
	};
}

// ─── fingerpickPatternToScheduleEvents ───────────────────────────────────────

describe("fingerpickPatternToScheduleEvents — BPM / timing math", () => {
	it("quarter note at 120 BPM = 0.5 s duration", () => {
		const p = pattern(120, [slot("s1", "quarter", { 5: { fret: 0 } })]);
		const [ev] = fingerpickPatternToScheduleEvents(p, 120);
		expect(ev.time).toBeCloseTo(0);
		expect(ev.duration).toBeCloseTo(0.5);
	});

	it("eighth note at 120 BPM = 0.25 s duration", () => {
		const p = pattern(120, [slot("s1", "eighth", { 5: { fret: 0 } })]);
		const [ev] = fingerpickPatternToScheduleEvents(p, 120);
		expect(ev.duration).toBeCloseTo(0.25);
	});

	it("whole note at 60 BPM = 4 s duration", () => {
		const p = pattern(60, [slot("s1", "whole", { 5: { fret: 0 } })]);
		const [ev] = fingerpickPatternToScheduleEvents(p, 60);
		expect(ev.duration).toBeCloseTo(4);
	});

	it("sixteenth note at 240 BPM = 0.0625 s duration", () => {
		const p = pattern(240, [slot("s1", "sixteenth", { 5: { fret: 0 } })]);
		const [ev] = fingerpickPatternToScheduleEvents(p, 240);
		expect(ev.duration).toBeCloseTo(0.0625);
	});

	it("eighth-triplet at 120 BPM = 1/6 s duration (3 notes in the time of 2 eighths)", () => {
		const p = pattern(120, [slot("s1", "eighth-triplet", { 5: { fret: 0 } })]);
		const [ev] = fingerpickPatternToScheduleEvents(p, 120);
		// 1 beat = 0.5 s at 120 BPM; triplet eighth = 1/3 beat = 0.5/3 ≈ 0.1667 s
		expect(ev.duration).toBeCloseTo(1 / 6);
	});

	it("three eighth-triplets sum to exactly 1 beat", () => {
		const p = pattern(60, [
			slot("s1", "eighth-triplet", { 0: { fret: 0 } }),
			slot("s2", "eighth-triplet", { 0: { fret: 2 } }),
			slot("s3", "eighth-triplet", { 0: { fret: 3 } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 60);
		// At 60 BPM: each triplet eighth = 1/3 s; three = 1 s = 1 beat
		expect(events[0].time).toBeCloseTo(0);
		expect(events[1].time).toBeCloseTo(1 / 3);
		expect(events[2].time).toBeCloseTo(2 / 3);
		expect(getTotalPatternDuration(p, 60)).toBeCloseTo(1);
	});

	it("BPM counts the meter's beat: six eighths in 6/8 at ♩. = 60 take two seconds", () => {
		const eighths = Array.from({ length: 6 }, (_, i) => slot(`e${i}`, "eighth", { 0: { fret: 0 } }));
		const jig: FingerpickPattern = { ...pattern(60, eighths), timeSignature: [6, 8] };
		expect(secondsPerQuarter(60, [6, 8])).toBeCloseTo(2 / 3, 9);
		expect(getTotalPatternDuration(jig, 60)).toBeCloseTo(2, 9);
		const events = fingerpickPatternToScheduleEvents(jig, 60);
		events.forEach((ev, i) => expect(ev.time).toBeCloseTo(i / 3, 9));
		expect(computeMeasureBoundaries({ ...jig, measures: [jig.measures[0], jig.measures[0]] }, 60)[1].startTime).toBeCloseTo(2, 9);
		// The same six eighths read as 3/4 at ♩ = 60 take three seconds.
		expect(getTotalPatternDuration({ ...jig, timeSignature: [3, 4] }, 60)).toBeCloseTo(3, 9);
	});

	it("simple meters are untouched: a quarter at 120 is still half a second", () => {
		for (const ts of [[4, 4], [3, 4], [2, 4]] as [number, number][]) {
			expect(secondsPerQuarter(120, ts)).toBe(0.5);
		}
	});

	it("a 4/4 bar of twelve eighth-triplets schedules twelve evenly spaced events over four beats", () => {
		const p = pattern(
			60,
			Array.from({ length: 12 }, (_, i) => slot(`t${i}`, "eighth-triplet", { 0: { fret: i } })),
		);
		const events = fingerpickPatternToScheduleEvents(p, 60);
		expect(events).toHaveLength(12);
		events.forEach((ev, i) => expect(ev.time).toBeCloseTo(i / 3, 9));
		expect(getTotalPatternDuration(p, 60)).toBeCloseTo(4, 9);
	});

	it("second slot starts after first slot's duration elapses", () => {
		const p = pattern(120, [
			slot("s1", "quarter", { 5: { fret: 0 } }),
			slot("s2", "eighth", { 5: { fret: 2 } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		// s1 at 0.0, s2 at 0.5 (one quarter = 0.5 s at 120 BPM)
		expect(events[0].time).toBeCloseTo(0);
		expect(events[1].time).toBeCloseTo(0.5);
	});

	it("events accumulate correctly across three different durations", () => {
		// quarter(0) → eighth(0.5) → sixteenth(0.75) at 120 BPM
		const p = pattern(120, [
			slot("s1", "quarter", { 0: { fret: 0 } }),
			slot("s2", "eighth", { 0: { fret: 0 } }),
			slot("s3", "sixteenth", { 0: { fret: 0 } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events[0].time).toBeCloseTo(0);
		expect(events[1].time).toBeCloseTo(0.5);
		expect(events[2].time).toBeCloseTo(0.75);
	});

	it("rest slot advances time but produces no event", () => {
		// quarter(0) → rest → quarter (appears at 0.5 + rest duration)
		const p = pattern(120, [
			slot("s1", "quarter", { 5: { fret: 0 } }),
			restSlot("s2"), // silent, keeps quarter duration = 0.5 s
			slot("s3", "quarter", { 5: { fret: 2 } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(2);
		expect(events[0].time).toBeCloseTo(0);
		expect(events[1].time).toBeCloseTo(1.0); // 0.5 + 0.5
	});

	it("time offset continues correctly across multiple measures", () => {
		// Two measures of [quarter, quarter] at 120 BPM
		const p = multiMeasurePattern(120, [
			[slot("s1", "quarter", { 0: { fret: 0 } }), slot("s2", "quarter", { 0: { fret: 2 } })],
			[slot("s3", "quarter", { 0: { fret: 3 } }), slot("s4", "quarter", { 0: { fret: 5 } })],
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events[0].time).toBeCloseTo(0);
		expect(events[1].time).toBeCloseTo(0.5);
		expect(events[2].time).toBeCloseTo(1.0); // second measure starts at 1.0 s
		expect(events[3].time).toBeCloseTo(1.5);
	});

	it("measureIndex and slotIndex are correctly stamped on each event", () => {
		const p = multiMeasurePattern(120, [
			[slot("s1", "quarter", { 0: { fret: 0 } })],
			[slot("s2", "quarter", { 0: { fret: 0 } })],
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events[0]).toMatchObject({ measureIndex: 0, slotIndex: 0 });
		expect(events[1]).toMatchObject({ measureIndex: 1, slotIndex: 0 });
	});
});

describe("fingerpickPatternToScheduleEvents — MIDI resolution", () => {
	it("string 5 open (low E) resolves to MIDI 40", () => {
		const p = pattern(120, [slot("s1", "quarter", { 5: { fret: 0 } })]);
		const [ev] = fingerpickPatternToScheduleEvents(p, 120);
		expect(ev.midi).toBe(OPEN_STRING_MIDI[5]); // 40
		expect(ev.midi).toBe(40);
	});

	it("string 0 fret 7 (high e) resolves to MIDI 64 + 7 = 71", () => {
		const p = pattern(120, [slot("s1", "quarter", { 0: { fret: 7 } })]);
		const [ev] = fingerpickPatternToScheduleEvents(p, 120);
		expect(ev.midi).toBe(64 + 7);
	});

	it("string 4 (A) fret 2 resolves to MIDI 45 + 2 = 47", () => {
		const p = pattern(120, [slot("s1", "quarter", { 4: { fret: 2 } })]);
		const [ev] = fingerpickPatternToScheduleEvents(p, 120);
		expect(ev.midi).toBe(47);
	});

	it("muted open string (fret null) resolves to open-string MIDI", () => {
		// fret === null, muted === true → pitch = open-string MIDI (dead open note)
		const p = pattern(120, [slot("s1", "quarter", { 3: { muted: true } })]);
		const [ev] = fingerpickPatternToScheduleEvents(p, 120);
		expect(ev.midi).toBe(OPEN_STRING_MIDI[3]); // D3 = 50
		expect(ev.muted).toBe(true);
	});

	it("muted fretted string resolves to that fret's MIDI pitch, not open-string", () => {
		// fret === 5, muted === true → pitch = open + 5, NOT open-string
		// (palm-muted note at fret 5 has the same pitch as unmuted fret 5)
		const p = pattern(120, [slot("s1", "quarter", { 3: { fret: 5, muted: true } })]);
		const [ev] = fingerpickPatternToScheduleEvents(p, 120);
		expect(ev.midi).toBe(OPEN_STRING_MIDI[3] + 5); // 50 + 5 = 55
		expect(ev.muted).toBe(true);
	});
});

describe("fingerpickPatternToScheduleEvents — capo", () => {
	const slots = [
		slot("s1", "quarter", { 0: { fret: 3 }, 5: { fret: 0 } }),
		slot("s2", "quarter", { 3: { muted: true }, 2: { fret: 5, link: { kind: "slide" } } }),
	];

	it("raises every event by the capo, written frets and open x's alike", () => {
		const plain = fingerpickPatternToScheduleEvents(pattern(120, slots), 120);
		const behind = fingerpickPatternToScheduleEvents({ ...pattern(120, slots), capo: 3 }, 120);
		expect(behind).toHaveLength(plain.length);
		behind.forEach((ev, i) => {
			expect(ev.midi).toBe(plain[i].midi + 3);
			expect({ ...ev, midi: 0 }).toEqual({ ...plain[i], midi: 0 });
		});
	});

	it("capo 0 or absent leaves the events untouched", () => {
		const plain = fingerpickPatternToScheduleEvents(pattern(120, slots), 120);
		expect(fingerpickPatternToScheduleEvents({ ...pattern(120, slots), capo: 0 }, 120)).toEqual(
			plain,
		);
	});

	it("clamps a junk capo to the supported range", () => {
		const [ev] = fingerpickPatternToScheduleEvents({ ...pattern(120, slots), capo: 40 }, 120);
		const [plain] = fingerpickPatternToScheduleEvents(pattern(120, slots), 120);
		expect(ev.midi).toBe(plain.midi + 12);
	});
});

describe("fingerpickPatternToScheduleEvents — tied / silent strings", () => {
	it("tied string produces no event (sustain — no re-attack)", () => {
		const p = pattern(120, [
			slot("s1", "quarter", { 0: { fret: 5 } }),
			slot("s2", "quarter", { 0: { fret: 5, link: { kind: "tie" } } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		// Only one event: the initial pluck; the tied slot produces nothing.
		expect(events).toHaveLength(1);
		expect(events[0].time).toBeCloseTo(0);
	});

	it("a tied slot lengthens the note it carries on, so the decay runs the written length", () => {
		const p = pattern(120, [
			slot("s1", "quarter", { 0: { fret: 5 }, 2: { fret: 0 } }),
			slot("s2", "quarter", { 0: { fret: 5, link: { kind: "tie" } }, 2: { fret: 2 } }),
			slot("s3", "eighth", { 0: { fret: 5, link: { kind: "tie" } } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		const quarter = 60 / 120;
		const highE = events.filter((e) => e.stringIndex === 0);
		expect(highE).toHaveLength(1);
		expect(highE[0].duration).toBeCloseTo(quarter * 2.5);
		// The other string is untouched: two separate strikes, each its own slot long.
		expect(events.filter((e) => e.stringIndex === 2).map((e) => e.duration)).toEqual([quarter, quarter]);
	});

	it("slot with all strings silent produces no events", () => {
		const p = pattern(120, [slot("s1", "quarter")]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(0);
	});

	it("multiple active strings in one slot produce one event per active string", () => {
		const p = pattern(120, [
			slot("s1", "quarter", { 0: { fret: 0 }, 2: { fret: 2 }, 4: { fret: 0 } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(3);
		expect(events.map((e) => e.stringIndex).sort()).toEqual([0, 2, 4]);
	});
});

describe("fingerpickPatternToScheduleEvents — technique events", () => {
	it("hammer-on technique is carried on the event", () => {
		const p = pattern(120, [
			slot("s1", "quarter", { 0: { fret: 0 } }),
			slot("s2", "quarter", { 0: { fret: 2, link: { kind: "hammer" } } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events[1].link).toEqual({ kind: "hammer" });
	});

	it("slide-down destination emits its own event with technique='slide-down'", () => {
		// Destination model: technique on the note you arrive at (s2), not the source (s1).
		// Both source and destination emit separate events; audio plays as normal pluck.
		const p = pattern(120, [
			slot("s1", "quarter", { 3: { fret: 7 } }),
			slot("s2", "quarter", { 3: { fret: 5, link: { kind: "slide" } } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(2);
		expect(events[0].stringIndex).toBe(3);
		expect(events[0].midi).toBe(OPEN_STRING_MIDI[3] + 7); // source pitch
		expect(events[0].link).toBeUndefined();
		expect(events[1].midi).toBe(OPEN_STRING_MIDI[3] + 5); // destination pitch
		expect(events[1].link).toEqual({ kind: "slide" });
	});
});

describe("fingerpickPatternToScheduleEvents — slide destinations", () => {
	it("slide-up destination emits its own event with technique='slide-up'", () => {
		const p = pattern(120, [
			slot("s1", "quarter", { 0: { fret: 5 } }),
			slot("s2", "quarter", { 0: { fret: 7, link: { kind: "slide" } } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(2);
		expect(events[0].midi).toBe(OPEN_STRING_MIDI[0] + 5);
		expect(events[0].link).toBeUndefined();
		expect(events[1].midi).toBe(OPEN_STRING_MIDI[0] + 7);
		expect(events[1].link).toEqual({ kind: "slide" });
	});

	it("chained slides (5→9→5): all three slots emit separate events", () => {
		const p = pattern(120, [
			slot("s1", "eighth", { 1: { fret: 5 } }),
			slot("s2", "eighth", { 1: { fret: 9, link: { kind: "slide" } } }),
			slot("s3", "half",   { 1: { fret: 5, link: { kind: "slide" } } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(3);
		expect(events[0].midi).toBe(OPEN_STRING_MIDI[1] + 5);
		expect(events[1].midi).toBe(OPEN_STRING_MIDI[1] + 9);
		expect(events[1].link).toEqual({ kind: "slide" });
		expect(events[2].midi).toBe(OPEN_STRING_MIDI[1] + 5);
		expect(events[2].link).toEqual({ kind: "slide" });
	});

	it("slide destination followed by a normal note: all three slots emit events", () => {
		const p = pattern(120, [
			slot("s1", "quarter", { 2: { fret: 3 } }),
			slot("s2", "quarter", { 2: { fret: 7, link: { kind: "slide" } } }),
			slot("s3", "quarter", { 2: { fret: 5 } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(3);
		expect(events[0].midi).toBe(OPEN_STRING_MIDI[2] + 3);
		expect(events[1].midi).toBe(OPEN_STRING_MIDI[2] + 7);
		expect(events[1].link).toEqual({ kind: "slide" });
		expect(events[2].midi).toBe(OPEN_STRING_MIDI[2] + 5);
		expect(events[2].link).toBeUndefined();
	});

	it("slide destination on str0 does not suppress str3 events in the same slot", () => {
		const p = pattern(120, [
			slot("s1", "quarter", { 0: { fret: 5 }, 3: { fret: 2 } }),
			slot("s2", "quarter", { 0: { fret: 9, link: { kind: "slide" } }, 3: { fret: 4 } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		// str0 s1, str3 s1, str0 s2, str3 s2 = 4 events
		expect(events).toHaveLength(4);
		const str0Events = events.filter((e) => e.stringIndex === 0);
		const str3Events = events.filter((e) => e.stringIndex === 3);
		expect(str0Events).toHaveLength(2);
		expect(str0Events[1].link).toEqual({ kind: "slide" });
		expect(str3Events).toHaveLength(2);
	});

	it("slide destination across a measure boundary emits its own event in the correct measure", () => {
		const p = multiMeasurePattern(120, [
			[slot("s1", "quarter", { 4: { fret: 0 } })],
			[slot("s2", "quarter", { 4: { fret: 5, link: { kind: "slide" } } })],
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(2);
		expect(events[0].measureIndex).toBe(0);
		expect(events[1].measureIndex).toBe(1);
		expect(events[1].midi).toBe(OPEN_STRING_MIDI[4] + 5);
		expect(events[1].link).toEqual({ kind: "slide" });
	});

	it("a note without slide technique emits normally with no slideChain field", () => {
		const p = pattern(120, [slot("s1", "quarter", { 0: { fret: 5 } })]);
		const [ev] = fingerpickPatternToScheduleEvents(p, 120);
		expect(ev.link).toBeUndefined();
		expect((ev as Record<string, unknown>)["slideChain"]).toBeUndefined();
	});

	it("each slide destination event has the correct duration at 120 BPM", () => {
		// eighth(0.25s) → quarter(0.5s) → half(1.0s)
		const p = pattern(120, [
			slot("s1", "eighth",  { 0: { fret: 5 } }),
			slot("s2", "quarter", { 0: { fret: 7, link: { kind: "slide" } } }),
			slot("s3", "half",    { 0: { fret: 9, link: { kind: "slide" } } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(3);
		expect(events[0].duration).toBeCloseTo(0.25); // eighth at 120 BPM
		expect(events[1].duration).toBeCloseTo(0.5);  // quarter at 120 BPM
		expect(events[2].duration).toBeCloseTo(1.0);  // half at 120 BPM
	});

	it("auto-promotes a short slide origin to letRing so it registers and the slide glides", () => {
		// A "32nd" origin (below the 0.1 s registration threshold) followed by a same-string
		// slide would otherwise fall back to a re-pluck (two attacks). See promoteSlideOrigins.
		const p = pattern(120, [
			slot("s1", "32nd",    { 2: { fret: 5 } }),
			slot("s2", "quarter", { 2: { fret: 8, link: { kind: "slide" } } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events[0].letRing).toBe(true); // origin promoted
		expect(events[1].letRing).toBeUndefined(); // the slide itself is untouched
	});
});

describe("promoteSlideOriginsToLetRing", () => {
	function ev(overrides: Partial<ScheduleEvent>): ScheduleEvent {
		return {
			time: 0,
			duration: 0.5,
			stringIndex: 0,
			midi: 60,
			muted: false,
			measureIndex: 0,
			slotIndex: 0,
			...overrides,
		};
	}

	it("marks the immediate same-string predecessor of a slide as letRing", () => {
		const origin = ev({ time: 0 });
		const slide = ev({ time: 0.5, link: { kind: "slide" } });
		promoteSlideOriginsToLetRing([origin, slide]);
		expect(origin.letRing).toBe(true);
		expect(slide.letRing).toBeUndefined();
	});

	it("promotes across intervening time order even if the array is not pre-sorted", () => {
		const slide = ev({ time: 0.5, link: { kind: "slide" } });
		const origin = ev({ time: 0 });
		promoteSlideOriginsToLetRing([slide, origin]); // slide listed first
		expect(origin.letRing).toBe(true);
	});

	it("only promotes the SAME string's predecessor, not another string's", () => {
		const otherString = ev({ time: 0, stringIndex: 3 });
		const origin = ev({ time: 0.1, stringIndex: 2 });
		const slide = ev({ time: 0.5, stringIndex: 2, link: { kind: "slide" } });
		promoteSlideOriginsToLetRing([otherString, origin, slide]);
		expect(origin.letRing).toBe(true);
		expect(otherString.letRing).toBeUndefined();
	});

	it("leaves a first-note slide (no predecessor on its string) to fall back", () => {
		const slide = ev({ time: 0, stringIndex: 4, link: { kind: "slide" } });
		promoteSlideOriginsToLetRing([slide]);
		expect(slide.letRing).toBeUndefined();
	});

	it("chained slides promote each hop's origin (the intermediate slide too)", () => {
		const a = ev({ time: 0 });
		const b = ev({ time: 0.25, link: { kind: "slide" } });
		const c = ev({ time: 0.5, link: { kind: "slide" } });
		promoteSlideOriginsToLetRing([a, b, c]);
		expect(a.letRing).toBe(true); // origin of the first slide
		expect(b.letRing).toBe(true); // b is the origin of the second slide
		expect(c.letRing).toBeUndefined();
	});

	it("leaves a slide-free array untouched (no letRing added anywhere)", () => {
		const events = [ev({ time: 0 }), ev({ time: 0.5 }), ev({ time: 1 })];
		promoteSlideOriginsToLetRing(events);
		expect(events.every((e) => e.letRing === undefined)).toBe(true);
	});
});

// ─── getTotalPatternDuration ─────────────────────────────────────────────────

describe("getTotalPatternDuration", () => {
	it("four quarter notes at 120 BPM = 2.0 s", () => {
		const p = pattern(120, [
			slot("s1", "quarter", { 0: { fret: 0 } }),
			slot("s2", "quarter", { 0: { fret: 0 } }),
			slot("s3", "quarter", { 0: { fret: 0 } }),
			slot("s4", "quarter", { 0: { fret: 0 } }),
		]);
		expect(getTotalPatternDuration(p, 120)).toBeCloseTo(2.0);
	});

	it("one whole note at 60 BPM = 4.0 s", () => {
		const p = pattern(60, [slot("s1", "whole", { 5: { fret: 0 } })]);
		expect(getTotalPatternDuration(p, 60)).toBeCloseTo(4.0);
	});

	it("mixed durations sum correctly", () => {
		// half(2) + quarter(1) + eighth(0.5) at 120 BPM = (2+1+0.5) × 0.5 = 1.75 s
		const p = pattern(120, [
			slot("s1", "half", { 0: { fret: 0 } }),
			slot("s2", "quarter", { 0: { fret: 0 } }),
			slot("s3", "eighth", { 0: { fret: 0 } }),
		]);
		expect(getTotalPatternDuration(p, 120)).toBeCloseTo(1.75);
	});

	it("rest slots contribute to total duration", () => {
		// quarter(0.5) + rest(0.5) at 120 BPM = 1.0 s
		const p = pattern(120, [slot("s1", "quarter", { 0: { fret: 0 } }), restSlot("s2")]);
		expect(getTotalPatternDuration(p, 120)).toBeCloseTo(1.0);
	});
});

// ─── computeLoopOffset ───────────────────────────────────────────────────────

describe("computeLoopOffset", () => {
	it("pass 0 always returns 0", () => {
		expect(computeLoopOffset(0, 2.0, 5)).toBe(0);
		expect(computeLoopOffset(0, 2.0, 0)).toBe(0);
	});

	it("pass 1 with no gap = patternDuration", () => {
		expect(computeLoopOffset(1, 2.0, 0)).toBeCloseTo(2.0);
	});

	it("pass 2 with 5 s gap = 2 × (patternDuration + gap)", () => {
		// pass 2, pattern=2s, gap=5s: 2 × (2 + 5) = 14 s
		expect(computeLoopOffset(2, 2.0, 5)).toBeCloseTo(14.0);
	});

	it("pass 3 with 10 s gap = 3 × (patternDuration + gap)", () => {
		expect(computeLoopOffset(3, 4.0, 10)).toBeCloseTo(42.0);
	});

	it("seamless loop (gap = 0): offsets are multiples of patternDuration", () => {
		const dur = 1.5;
		for (let i = 0; i < 5; i++) {
			expect(computeLoopOffset(i, dur, 0)).toBeCloseTo(i * dur);
		}
	});
});

// ─── getProgressAtTime ───────────────────────────────────────────────────────

describe("getProgressAtTime", () => {
	const events = fingerpickPatternToScheduleEvents(
		multiMeasurePattern(120, [
			// measure 0: quarter + quarter
			[slot("s1", "quarter", { 0: { fret: 0 } }), slot("s2", "quarter", { 0: { fret: 0 } })],
			// measure 1: quarter
			[slot("s3", "quarter", { 0: { fret: 0 } })],
		]),
		120,
	);
	// At 120 BPM quarter = 0.5 s: events at t=0, t=0.5, t=1.0

	it("returns null for empty event list", () => {
		expect(getProgressAtTime([], 0)).toBeNull();
	});

	it("returns null for negative elapsed", () => {
		expect(getProgressAtTime(events, -0.1)).toBeNull();
	});

	it("elapsed=0 returns the first slot", () => {
		const p = getProgressAtTime(events, 0);
		expect(p).toEqual({ measureIndex: 0, slotIndex: 0 });
	});

	it("elapsed just before second event still returns first slot", () => {
		const p = getProgressAtTime(events, 0.49);
		expect(p).toEqual({ measureIndex: 0, slotIndex: 0 });
	});

	it("elapsed at second event returns second slot", () => {
		const p = getProgressAtTime(events, 0.5);
		expect(p).toEqual({ measureIndex: 0, slotIndex: 1 });
	});

	it("elapsed in second measure returns correct measureIndex", () => {
		const p = getProgressAtTime(events, 1.0);
		expect(p).toEqual({ measureIndex: 1, slotIndex: 0 });
	});

	it("elapsed past all events returns last slot", () => {
		const p = getProgressAtTime(events, 999);
		expect(p).toEqual({ measureIndex: 1, slotIndex: 0 });
	});
});

// ─── stealVoice — voice stealing logic ───────────────────────────────────────

function makeMockVoice() {
	return {
		gainNode: {
			gain: {
				cancelScheduledValues: vi.fn(),
				setTargetAtTime: vi.fn(),
			},
		},
		source: {
			stop: vi.fn(),
		},
	};
}

describe("stealVoice — same-string cut", () => {
	let voices: Map<number, ReturnType<typeof makeMockVoice>>;

	beforeEach(() => {
		voices = new Map();
	});

	it("no-ops when the string has no active voice", () => {
		const newVoice = makeMockVoice();
		// stealVoice should not throw and should not touch newVoice
		stealVoice(voices, 0, 1.0);
		expect(newVoice.gainNode.gain.cancelScheduledValues).not.toHaveBeenCalled();
	});

	it("calls cancelScheduledValues at `when` on the previous voice's gain", () => {
		const prev = makeMockVoice();
		voices.set(2, prev as ReturnType<typeof makeMockVoice>);

		stealVoice(voices, 2, 1.5);

		expect(prev.gainNode.gain.cancelScheduledValues).toHaveBeenCalledWith(1.5);
	});

	it("calls setTargetAtTime(0, when, VOICE_STEAL_FADE_TAU) on the previous gain", () => {
		const prev = makeMockVoice();
		voices.set(3, prev);

		stealVoice(voices, 3, 2.0);

		expect(prev.gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(
			0,
			2.0,
			VOICE_STEAL_FADE_TAU,
		);
	});

	it("calls source.stop at when + VOICE_STEAL_STOP_BUFFER", () => {
		const prev = makeMockVoice();
		voices.set(1, prev);

		stealVoice(voices, 1, 3.0);

		expect(prev.source.stop).toHaveBeenCalledWith(3.0 + VOICE_STEAL_STOP_BUFFER);
	});

	it("removes the stolen voice from the map", () => {
		const prev = makeMockVoice();
		voices.set(0, prev);

		stealVoice(voices, 0, 1.0);

		expect(voices.has(0)).toBe(false);
	});
});

describe("stealVoice — cross-string independence", () => {
	it("stealing string N does not affect voices on other strings", () => {
		const voices = new Map<number, ReturnType<typeof makeMockVoice>>();
		const voiceA = makeMockVoice();
		const voiceB = makeMockVoice();
		const voiceC = makeMockVoice();
		voices.set(0, voiceA);
		voices.set(2, voiceB);
		voices.set(4, voiceC);

		// Steal only string 2
		stealVoice(voices, 2, 1.0);

		// String 2 stolen
		expect(voiceB.gainNode.gain.setTargetAtTime).toHaveBeenCalled();
		expect(voiceB.source.stop).toHaveBeenCalled();

		// Strings 0 and 4 untouched
		expect(voiceA.gainNode.gain.setTargetAtTime).not.toHaveBeenCalled();
		expect(voiceA.source.stop).not.toHaveBeenCalled();
		expect(voiceC.gainNode.gain.setTargetAtTime).not.toHaveBeenCalled();
		expect(voiceC.source.stop).not.toHaveBeenCalled();

		// Strings 0 and 4 still in map
		expect(voices.has(0)).toBe(true);
		expect(voices.has(4)).toBe(true);
	});

	it("sequential steals on the same string use correct `when` each time", () => {
		const voices = new Map<number, ReturnType<typeof makeMockVoice>>();

		const v1 = makeMockVoice();
		voices.set(5, v1);
		stealVoice(voices, 5, 1.0);

		const v2 = makeMockVoice();
		voices.set(5, v2);
		stealVoice(voices, 5, 1.5);

		expect(v1.gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0, 1.0, VOICE_STEAL_FADE_TAU);
		expect(v2.gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0, 1.5, VOICE_STEAL_FADE_TAU);
	});
});

// ─── _shutdownEngine — unmount cleanup ───────────────────────────────────────

describe("_shutdownEngine — stops all voices and clears timers on unmount", () => {
	it("calls source.stop() on every active voice", () => {
		const v0 = { source: { stop: vi.fn() } };
		const v3 = { source: { stop: vi.fn() } };
		const voices = new Map([
			[0, v0],
			[3, v3],
		]);

		_shutdownEngine(voices, []);

		expect(v0.source.stop).toHaveBeenCalledOnce();
		expect(v3.source.stop).toHaveBeenCalledOnce();
	});

	it("clears the voices map so the engine holds no dangling references", () => {
		const voices = new Map([[2, { source: { stop: vi.fn() } }]]);

		_shutdownEngine(voices, []);

		expect(voices.size).toBe(0);
	});

	it("calls clearTimeout for each non-null timer ID", () => {
		vi.useFakeTimers();
		const id1 = setTimeout(() => {}, 5000);
		const id2 = setTimeout(() => {}, 3000);
		const clearSpy = vi.spyOn(globalThis, "clearTimeout");

		_shutdownEngine(new Map(), [id1, id2]);

		expect(clearSpy).toHaveBeenCalledWith(id1);
		expect(clearSpy).toHaveBeenCalledWith(id2);
		vi.useRealTimers();
	});

	it("skips null timer IDs without throwing", () => {
		vi.useFakeTimers();
		const clearSpy = vi.spyOn(globalThis, "clearTimeout");

		expect(() => _shutdownEngine(new Map(), [null, null])).not.toThrow();
		expect(clearSpy).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("does not throw when a source was already stopped", () => {
		const alreadyStopped = {
			source: {
				stop: vi.fn().mockImplementation(() => {
					throw new DOMException("The source is not started", "InvalidStateError");
				}),
			},
		};
		const voices = new Map([[1, alreadyStopped]]);

		expect(() => _shutdownEngine(voices, [])).not.toThrow();
	});

	it("stops voices before clearing the map (all six strings mid-playback)", () => {
		const stopOrder: number[] = [];
		const voices = new Map(
			[0, 1, 2, 3, 4, 5].map((i) => [
				i,
				{
					source: {
						stop: vi.fn().mockImplementation(() => stopOrder.push(i)),
					},
				},
			]),
		);

		_shutdownEngine(voices, []);

		// All 6 strings were stopped and the map is now empty.
		expect(stopOrder).toHaveLength(6);
		expect(voices.size).toBe(0);
	});
});

// ─── _shutdownEngine — allSources (pre-scheduled intermediate notes) ──────────
//
// Root cause of the pause-doesn't-stop bug:
//   schedulePass() pre-schedules ALL events for a pass synchronously via
//   source.start(futureTimestamp). Voice stealing means perStringVoicesRef only
//   holds the LAST source per string after the loop; all intermediate sources
//   are pre-scheduled but no longer tracked in the voices map. stop() / pause()
//   must cancel ALL pre-scheduled sources, not just the last-per-string subset.

describe("_shutdownEngine — allSources stops every pre-scheduled source immediately", () => {
	it("stops all sources in the Set, including intermediate sources not in the voices map", () => {
		// Simulates: 3 events on string 0 were pre-scheduled.
		// Voice stealing means only the last source (src3) lives in the voices map.
		// Sources src1 and src2 were stolen but source.start(futureT) already called.
		const src1 = { stop: vi.fn() };
		const src2 = { stop: vi.fn() };
		const src3 = { stop: vi.fn() };

		// voices map only holds the last-scheduled voice (as the engine does after schedulePass)
		const voices = new Map([[0, { source: src3 }]]);
		const allSources: Set<{ stop: (when?: number) => void }> = new Set([src1, src2, src3]);

		_shutdownEngine(voices, [], allSources);

		// ALL three sources must be stopped — not just the one in the voices map
		expect(src1.stop).toHaveBeenCalledOnce();
		expect(src2.stop).toHaveBeenCalledOnce();
		expect(src3.stop).toHaveBeenCalledOnce();
	});

	it("clears the allSources Set after shutdown", () => {
		const src = { stop: vi.fn() };
		const voices = new Map([[0, { source: src }]]);
		const allSources: Set<{ stop: (when?: number) => void }> = new Set([src]);

		_shutdownEngine(voices, [], allSources);

		expect(allSources.size).toBe(0);
	});

	it("clears the voices map after shutdown", () => {
		const src = { stop: vi.fn() };
		const voices = new Map([[0, { source: src }]]);
		const allSources: Set<{ stop: (when?: number) => void }> = new Set([src]);

		_shutdownEngine(voices, [], allSources);

		expect(voices.size).toBe(0);
	});

	it("does not throw when a pre-scheduled source was already ended before stop() is called", () => {
		const alreadyEnded = {
			stop: vi.fn().mockImplementation(() => {
				throw new DOMException("The source is not started", "InvalidStateError");
			}),
		};
		const voices = new Map([[0, { source: alreadyEnded }]]);
		const allSources: Set<{ stop: (when?: number) => void }> = new Set([alreadyEnded]);

		expect(() => _shutdownEngine(voices, [], allSources)).not.toThrow();
	});

	it("pausing at various mid-pattern points: stops all sources regardless of how many were pre-scheduled per string", () => {
		// Simulates pausing mid-pass with 4 events on string 3 already pre-scheduled.
		// Only the last source (src4) is in the voices map; src1–src3 are
		// pre-scheduled intermediates that the pause must cancel immediately.
		const makeSource = () => ({ stop: vi.fn() });
		const src1 = makeSource();
		const src2 = makeSource();
		const src3 = makeSource();
		const src4 = makeSource();

		const voices = new Map([[3, { source: src4 }]]);
		const allSources: Set<{ stop: (when?: number) => void }> = new Set([
			src1,
			src2,
			src3,
			src4,
		]);

		_shutdownEngine(voices, [], allSources);

		// All 4 pre-scheduled sources are stopped; the engine is fully silent.
		expect(src1.stop).toHaveBeenCalledOnce();
		expect(src2.stop).toHaveBeenCalledOnce();
		expect(src3.stop).toHaveBeenCalledOnce();
		expect(src4.stop).toHaveBeenCalledOnce();
		expect(allSources.size).toBe(0);
		expect(voices.size).toBe(0);
	});

	it("handles multiple strings: stops all sources across all 6 strings", () => {
		// Simulate all 6 strings having 2 pre-scheduled events each (12 total sources).
		// Only the last source per string lives in the voices map (6 sources).
		const allSrc: { stop: ReturnType<typeof vi.fn> }[] = Array.from({ length: 12 }, () => ({
			stop: vi.fn(),
		}));
		// Last source for each string (indices 1, 3, 5, 7, 9, 11)
		const voices = new Map(
			[0, 1, 2, 3, 4, 5].map((stringIdx) => [
				stringIdx,
				{ source: allSrc[stringIdx * 2 + 1] },
			]),
		);
		const allSources: Set<{ stop: (when?: number) => void }> = new Set(allSrc);

		_shutdownEngine(voices, [], allSources);

		// Every one of the 12 pre-scheduled sources must be stopped.
		for (const src of allSrc) {
			expect(src.stop).toHaveBeenCalledOnce();
		}
		expect(allSources.size).toBe(0);
		expect(voices.size).toBe(0);
	});
});

// ─── findSlotStartTime ───────────────────────────────────────────────────────

describe("findSlotStartTime — maps (measureIndex, slotIndex) to its absolute time", () => {
	it("returns the start time of the target slot", () => {
		// quarter(0s) + quarter(0.5s) at 120 BPM → s2 starts at 0.5 s
		const p = multiMeasurePattern(120, [
			[
				slot("s1", "quarter", { 0: { fret: 0 } }),
				slot("s2", "quarter", { 0: { fret: 2 } }),
			],
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(findSlotStartTime(events, 0, 0)).toBeCloseTo(0);
		expect(findSlotStartTime(events, 0, 1)).toBeCloseTo(0.5);
	});

	it("returns 0 when the slot is not present in the event list", () => {
		const p = pattern(120, [slot("s1", "quarter", { 0: { fret: 0 } })]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		// measureIndex 99 never appears
		expect(findSlotStartTime(events, 99, 0)).toBe(0);
	});

	it("returns 0 for an empty event list", () => {
		expect(findSlotStartTime([], 0, 0)).toBe(0);
	});

	it("returns the slot start time when multiple events share the slot (multi-string)", () => {
		// Slot s1 fires on strings 0, 2, 4 simultaneously — all three events carry
		// the same time; findSlotStartTime should return that shared time.
		const p = pattern(120, [
			slot("s1", "quarter", { 0: { fret: 0 }, 2: { fret: 2 }, 4: { fret: 0 } }),
			slot("s2", "quarter", { 0: { fret: 3 } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		// All three s1 events have time ≈ 0.
		expect(findSlotStartTime(events, 0, 0)).toBeCloseTo(0);
		// s2 is at 0.5 s.
		expect(findSlotStartTime(events, 0, 1)).toBeCloseTo(0.5);
	});

	it("locates slots correctly across two measures", () => {
		// Two measures of two quarter notes each at 120 BPM
		// m0s0=0, m0s1=0.5, m1s0=1.0, m1s1=1.5
		const p = multiMeasurePattern(120, [
			[
				slot("s1", "quarter", { 0: { fret: 0 } }),
				slot("s2", "quarter", { 0: { fret: 2 } }),
			],
			[
				slot("s3", "quarter", { 0: { fret: 3 } }),
				slot("s4", "quarter", { 0: { fret: 5 } }),
			],
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(findSlotStartTime(events, 1, 0)).toBeCloseTo(1.0);
		expect(findSlotStartTime(events, 1, 1)).toBeCloseTo(1.5);
	});
});

// ─── BPM change position conversion ─────────────────────────────────────────
//
// The live-BPM-change mechanism uses getProgressAtTime (old events, elapsed) →
// {measureIndex, slotIndex} → findSlotStartTime (new events) to map the current
// musical position to its absolute time in the recomputed schedule.

describe("BPM change — position conversion via getProgressAtTime + findSlotStartTime", () => {
	// Helper: build a 4-quarter-note single-measure pattern at given BPM.
	function fourQuarters(bpm: number) {
		return pattern(bpm, [
			slot("s1", "quarter", { 0: { fret: 0 } }),
			slot("s2", "quarter", { 0: { fret: 2 } }),
			slot("s3", "quarter", { 0: { fret: 3 } }),
			slot("s4", "quarter", { 0: { fret: 5 } }),
		]);
	}

	it("doubling BPM halves every slot start time", () => {
		const oldEvents = fingerpickPatternToScheduleEvents(fourQuarters(80), 80);
		const newEvents = fingerpickPatternToScheduleEvents(fourQuarters(160), 160);

		// At 80 BPM, quarter = 0.75 s → s2 starts at 0.75 s.
		// At 160 BPM, quarter = 0.375 s → s2 starts at 0.375 s.
		const pos = getProgressAtTime(oldEvents, 0.75); // exactly at s2
		expect(pos).toEqual({ measureIndex: 0, slotIndex: 1 });

		const newTime = findSlotStartTime(newEvents, pos!.measureIndex, pos!.slotIndex);
		expect(newTime).toBeCloseTo(0.375); // halved
	});

	it("halving BPM doubles every slot start time", () => {
		const oldEvents = fingerpickPatternToScheduleEvents(fourQuarters(120), 120);
		const newEvents = fingerpickPatternToScheduleEvents(fourQuarters(60), 60);

		// At 120 BPM, quarter = 0.5 s → s3 starts at 1.0 s.
		// At 60 BPM, quarter = 1.0 s → s3 starts at 2.0 s.
		const pos = getProgressAtTime(oldEvents, 1.0); // exactly at s3
		expect(pos).toEqual({ measureIndex: 0, slotIndex: 2 });

		const newTime = findSlotStartTime(newEvents, pos!.measureIndex, pos!.slotIndex);
		expect(newTime).toBeCloseTo(2.0); // doubled
	});

	it("mid-slot elapsed maps to the start of that slot in the new schedule", () => {
		// Change BPM while partway through slot s2 (between s2 and s3 onsets).
		const oldEvents = fingerpickPatternToScheduleEvents(fourQuarters(80), 80);
		const newEvents = fingerpickPatternToScheduleEvents(fourQuarters(120), 120);

		// At 80 BPM, s2=0.75s, s3=1.5s. Elapsed=1.0 → still in s2.
		const pos = getProgressAtTime(oldEvents, 1.0);
		expect(pos).toEqual({ measureIndex: 0, slotIndex: 1 });

		// In new 120-BPM schedule, s2 = 0.5 s.
		const newTime = findSlotStartTime(newEvents, pos!.measureIndex, pos!.slotIndex);
		expect(newTime).toBeCloseTo(0.5);
	});

	it("BPM change while paused returns start of the paused slot in new schedule", () => {
		// Simulates: paused at elapsed=1.1 s in 80-BPM schedule (in slot s2).
		const oldEvents = fingerpickPatternToScheduleEvents(fourQuarters(80), 80);
		const newEvents = fingerpickPatternToScheduleEvents(fourQuarters(160), 160);

		const pos = getProgressAtTime(oldEvents, 1.1); // s2 started at 0.75 s
		expect(pos).toEqual({ measureIndex: 0, slotIndex: 1 });

		const newPausedAt = findSlotStartTime(newEvents, pos!.measureIndex, pos!.slotIndex);
		// At 160 BPM s2 = 0.375 s; no restart from 0 (seamless BPM change).
		expect(newPausedAt).toBeCloseTo(0.375);
	});

	it("BPM change at elapsed=0 (beginning) maps to t=0 in new schedule", () => {
		const oldEvents = fingerpickPatternToScheduleEvents(fourQuarters(80), 80);
		const newEvents = fingerpickPatternToScheduleEvents(fourQuarters(120), 120);

		const pos = getProgressAtTime(oldEvents, 0);
		expect(pos).toEqual({ measureIndex: 0, slotIndex: 0 });

		const newTime = findSlotStartTime(newEvents, pos!.measureIndex, pos!.slotIndex);
		expect(newTime).toBeCloseTo(0);
	});
});

// ─── Loop-gap timing after BPM change ────────────────────────────────────────

describe("computeLoopOffset — uses updated pattern duration after BPM change", () => {
	it("loop pass offsets scale with the new BPM pattern duration", () => {
		// Four quarter notes: 80 BPM = 3.0 s duration, 160 BPM = 1.5 s duration.
		const p80 = pattern(80, [
			slot("s1", "quarter", { 0: { fret: 0 } }),
			slot("s2", "quarter", { 0: { fret: 0 } }),
			slot("s3", "quarter", { 0: { fret: 0 } }),
			slot("s4", "quarter", { 0: { fret: 0 } }),
		]);
		const p160 = { ...p80, bpm: 160 };

		const dur80 = getTotalPatternDuration(p80, 80);
		const dur160 = getTotalPatternDuration(p160, 160);

		expect(dur80).toBeCloseTo(3.0);
		expect(dur160).toBeCloseTo(1.5);

		const loopGap = 2;
		// After BPM change: pass 1 should use new duration.
		expect(computeLoopOffset(1, dur160, loopGap)).toBeCloseTo(3.5); // 1 × (1.5 + 2)
		expect(computeLoopOffset(2, dur160, loopGap)).toBeCloseTo(7.0); // 2 × (1.5 + 2)

		// Old pass 1 offset for reference
		expect(computeLoopOffset(1, dur80, loopGap)).toBeCloseTo(5.0); // 1 × (3 + 2)
	});

	it("seamless loop (gap=0) offsets are exact multiples of new pattern duration", () => {
		const p = pattern(160, [slot("s1", "whole", { 0: { fret: 0 } })]);
		const dur = getTotalPatternDuration(p, 160); // whole at 160 BPM = 4 × (60/160) = 1.5 s
		expect(dur).toBeCloseTo(1.5);

		for (let i = 0; i < 4; i++) {
			expect(computeLoopOffset(i, dur, 0)).toBeCloseTo(i * dur);
		}
	});
});

// ─── Loop-gap live change — startTimeRef recalibration math ─────────────────
//
// applyLoopGapChange recalibrates startTimeRef so that
//   startTimeNew + computeLoopOffset(passIndex, dur, newGap) + elapsed === ctx.currentTime
// This block verifies the math in isolation: given an old gap, a captured position,
// and a new gap, the recalibrated startTime must satisfy the above identity and
// must place the next pass's first event exactly newGap seconds after the pass ends.

describe("loop-gap live change — startTimeRef recalibration", () => {
	// Simulate the recalibration performed by applyLoopGapChange.
	function recalibrate(
		ctxNow: number,
		passIndex: number,
		elapsed: number,
		patternDuration: number,
		newGap: number,
	): number {
		return ctxNow - computeLoopOffset(passIndex, patternDuration, newGap) - elapsed;
	}

	it("recalibrated startTime satisfies position identity", () => {
		// Playback started at T=0, 4-quarter pattern at 120 BPM → dur = 2s, oldGap = 0.
		// Midway through pass 1 (elapsed = 1s, so ctxNow = 0 + 1*(2+0) + 1 = 3s).
		const patternDuration = 2;
		const passIndex = 1;
		const elapsed = 1;
		const ctxNow = passIndex * (patternDuration + 0) + elapsed; // = 3

		const newGap = 5;
		const newStart = recalibrate(ctxNow, passIndex, elapsed, patternDuration, newGap);

		// Identity: newStart + computeLoopOffset(passIndex, dur, newGap) + elapsed === ctxNow
		expect(newStart + computeLoopOffset(passIndex, patternDuration, newGap) + elapsed).toBeCloseTo(
			ctxNow,
		);
	});

	it("next pass is placed exactly newGap seconds after current pass ends, for gap 0→5", () => {
		// Pattern: 2s, oldGap = 0. Currently at pass 0, elapsed = 0.5s. ctxNow = 0.5.
		const dur = 2;
		const passIndex = 0;
		const elapsed = 0.5;
		const ctxNow = elapsed; // pass 0 started at T=0

		const newGap = 5;
		const newStart = recalibrate(ctxNow, passIndex, elapsed, dur, newGap);
		// Pass 1 offset from newStart:
		const pass1Offset = newStart + computeLoopOffset(1, dur, newGap);
		// Pass 0 ends at ctxNow + (dur - elapsed):
		const pass0End = ctxNow + (dur - elapsed);
		// The gap between pass 0 end and pass 1 first event should be newGap.
		expect(pass1Offset - pass0End).toBeCloseTo(newGap);
	});

	it("next pass is placed exactly newGap seconds after current pass ends, for gap 5→10", () => {
		// Pattern: 3s, oldGap = 5. Currently at pass 2, elapsed = 1s.
		// ctxNow = 2*(3+5) + 1 = 17s.
		const dur = 3;
		const passIndex = 2;
		const elapsed = 1;
		const ctxNow = passIndex * (dur + 5) + elapsed; // = 17

		const newGap = 10;
		const newStart = recalibrate(ctxNow, passIndex, elapsed, dur, newGap);
		const pass2End = newStart + computeLoopOffset(passIndex, dur, newGap) + dur;
		const pass3Start = newStart + computeLoopOffset(passIndex + 1, dur, newGap);
		expect(pass3Start - pass2End).toBeCloseTo(newGap);
	});

	it("gap 0 produces seamless (zero-gap) transitions after live change back to 0", () => {
		const dur = 1.5;
		const passIndex = 0;
		const elapsed = 0.3;
		const ctxNow = elapsed;

		const newGap = 0;
		const newStart = recalibrate(ctxNow, passIndex, elapsed, dur, newGap);
		const pass1Start = newStart + computeLoopOffset(1, dur, newGap);
		const pass0End = newStart + computeLoopOffset(0, dur, newGap) + dur;
		expect(pass1Start - pass0End).toBeCloseTo(0);
	});

	it("recalibration is consistent across all three gap options (0, 5, 10)", () => {
		// 4-second pattern, captured at pass 0 elapsed = 1s, ctxNow = 1s.
		const dur = 4;
		const passIndex = 0;
		const elapsed = 1;
		const ctxNow = elapsed;

		for (const gap of [0, 5, 10]) {
			const newStart = recalibrate(ctxNow, passIndex, elapsed, dur, gap);
			const pass1Start = newStart + computeLoopOffset(1, dur, gap);
			const pass0End = newStart + computeLoopOffset(0, dur, gap) + dur;
			expect(pass1Start - pass0End).toBeCloseTo(gap);
		}
	});

	it("BPM change followed by gap change preserves next-pass spacing", () => {
		// Pattern at 80 BPM → 3s duration.  BPM changed to 160 → 1.5s duration.
		// Then gap changed from 0 to 5s, currently at pass 1, elapsed = 0.3s.
		// ctxNow (in the new-BPM world) = 1*(1.5+0) + 0.3 = 1.8s after new startTime.
		const dur = 1.5; // duration after BPM change
		const passIndex = 1;
		const elapsed = 0.3;
		const startTimeAfterBpmChange = 0; // arbitrary
		const ctxNow = startTimeAfterBpmChange + computeLoopOffset(passIndex, dur, 0) + elapsed;
		// ctxNow = 0 + 1.5 + 0.3 = 1.8

		const newGap = 5;
		const newStart = recalibrate(ctxNow, passIndex, elapsed, dur, newGap);
		const pass2End = newStart + computeLoopOffset(passIndex + 1, dur, newGap) + dur;
		const pass3Start = newStart + computeLoopOffset(passIndex + 2, dur, newGap);
		// Each subsequent transition should also be spaced by newGap.
		expect(pass3Start - pass2End).toBeCloseTo(newGap);
	});
});

// ─── Metronome enable mid-pass — beat onset filtering ───────────────────────
//
// When the metronome toggle is turned on while a pass is already in progress,
// scheduleMetronomePass is called with startOffset = elapsed (current position).
// Only beats at or after that offset should be scheduled; earlier beats are skipped.
//
// The Web Audio oscillator scheduling itself cannot be tested in jsdom (no real
// AudioContext), so these tests verify the pure filtering logic that determines
// which beats would be emitted — the same predicate applied in scheduleMetronomePass.

describe("metronome enable mid-pass — beat onset filtering", () => {
	// Mirror the filtering predicate used by scheduleMetronomePass:
	//   beatTime >= startOffset
	// Returns the subset of onsets that would be scheduled when enabling at `elapsed`.
	function onsetsFromOffset(onsets: number[], elapsed: number): number[] {
		return onsets.filter((t) => t >= elapsed);
	}

	// Mirror computeBeatOnsets from useFingerpickAudioEngine (not exported).
	function beatOnsets(bpm: number, totalDuration: number): number[] {
		const spb = 60 / bpm;
		const result: number[] = [];
		for (let t = 0; t < totalDuration - 0.001; t += spb) {
			result.push(t);
		}
		return result;
	}

	it("enabling at t=0 schedules all beats", () => {
		// 120 BPM, 4 quarter notes → duration 2s, beats at [0, 0.5, 1.0, 1.5].
		const onsets = beatOnsets(120, 2);
		expect(onsetsFromOffset(onsets, 0)).toEqual(onsets);
	});

	it("enabling mid-pass skips beats before elapsed and includes the next upcoming beat", () => {
		// 120 BPM: beats at [0, 0.5, 1.0, 1.5]. Toggle on at elapsed = 0.6s.
		// Beat at 0.5 is in the past; next upcoming is 1.0.
		const onsets = beatOnsets(120, 2);
		const scheduled = onsetsFromOffset(onsets, 0.6);
		expect(scheduled).toEqual([1.0, 1.5]);
	});

	it("enabling on the exact beat time includes that beat", () => {
		// Beat onset is exactly at elapsed — should be included (>= not >).
		const onsets = beatOnsets(120, 2);
		const scheduled = onsetsFromOffset(onsets, 1.0);
		expect(scheduled).toEqual([1.0, 1.5]);
	});

	it("enabling one beat before the last beat includes only the final beat", () => {
		// 60 BPM: beats at [0, 1, 2, 3] for a 4-beat pattern. Toggle on at 2.5s.
		const onsets = beatOnsets(60, 4);
		const scheduled = onsetsFromOffset(onsets, 2.5);
		expect(scheduled).toEqual([3]);
	});

	it("enabling after the last beat schedules nothing for the current pass", () => {
		// 120 BPM: beats at [0, 0.5, 1.0, 1.5]. Toggle on at 1.9s (past last beat).
		const onsets = beatOnsets(120, 2);
		const scheduled = onsetsFromOffset(onsets, 1.9);
		expect(scheduled).toHaveLength(0);
	});

	it("disabling mid-pass — all onsets would be in the unfiltered set (confirms nothing is scheduled on re-enable in same position)", () => {
		// Disabling is tested by cancelling oscillators already queued (engine-level,
		// cannot be tested in jsdom). This test confirms the symmetric invariant:
		// if we were to re-enable at elapsed = 0 after a cancel, all beats return.
		const onsets = beatOnsets(80, 3); // 80 BPM, 3s → beats at [0, 0.75, 1.5, 2.25]
		expect(onsetsFromOffset(onsets, 0)).toHaveLength(4);
	});

	it("mid-pass enable with subdivision at eighth — sub-beat times also fall after startOffset", () => {
		// At 120 BPM, beats at [0, 0.5, 1.0, 1.5]. At elapsed = 0.7s:
		// Quarter beats scheduled: 1.0, 1.5 (>= 0.7)
		// Eighth sub-beats (halfway): 0.25, 0.75, 1.25, 1.75 — only 0.75, 1.25, 1.75 >= 0.7
		const spb = 0.5; // 60/120
		const onsets = beatOnsets(120, 2);
		const elapsed = 0.7;
		const totalDuration = 2;
		const subBeats: number[] = [];
		for (const t of onsets) {
			const t8 = t + spb / 2;
			if (t8 >= elapsed && t8 < totalDuration - 0.001) subBeats.push(t8);
		}
		expect(subBeats).toEqual([0.75, 1.25, 1.75]);
	});
});

// ─── Roll (arpeggiated chord) stroke scheduling ──────────────────────────────
//
// Every assertion in this block would FAIL before the roll feature: the pre-roll
// fingerpickPatternToScheduleEvents ignored `stroke` entirely, so all events in a
// slot shared its start time and none carried `rollGain`. The one exception is the
// "no-stroke byte-identical" test, which is the guard that the roll path never
// touches stroke-free slots.

// Build a slot that carries a stroke (the base `slot()` helper cannot set one).
function rolledSlot(
	id: string,
	duration: Duration,
	stroke: Stroke,
	strOverrides: Record<number, Partial<StringFret>> = {},
): BeatSlot {
	return { ...slot(id, duration, strOverrides), stroke };
}

// Full six-string chord overrides (every string fretted).
const FULL_CHORD: Record<number, Partial<StringFret>> = {
	0: { fret: 0 },
	1: { fret: 1 },
	2: { fret: 0 },
	3: { fret: 2 },
	4: { fret: 3 },
	5: { fret: 0 },
};

// time of the event on a given string index.
function timeOfString(events: { stringIndex: number; time: number }[], stringIndex: number): number {
	const ev = events.find((e) => e.stringIndex === stringIndex);
	if (!ev) throw new Error(`no event for string ${stringIndex}`);
	return ev.time;
}

describe("computeRollOffsets — brush (fast strum)", () => {
	const params: RollParams = { ...DEFAULT_ROLL_PARAMS, staggerMode: "fixed", baseStagger: 0.05, gainTaper: 0.8 };

	it("brush-down sweeps low→high at the fixed brush stagger, ignoring roll params", () => {
		const m = computeRollOffsets([0, 1, 2, 3, 4, 5], "brush-down", 1.0, params);
		const t = (s: number) => m.get(s)!.timeOffset;
		expect(t(5)).toBeCloseTo(0);
		expect(t(4)).toBeCloseTo(BRUSH_STAGGER_SECONDS);
		expect(t(0)).toBeCloseTo(5 * BRUSH_STAGGER_SECONDS);
	});

	it("brush-up sweeps high→low, both directions at the same speed", () => {
		const m = computeRollOffsets([0, 1, 2, 3, 4, 5], "brush-up", 1.0, params);
		const t = (s: number) => m.get(s)!.timeOffset;
		expect(t(0)).toBeCloseTo(0);
		expect(t(5)).toBeCloseTo(5 * BRUSH_STAGGER_SECONDS);
	});

	it("a brush tapers no gain — every string at full weight", () => {
		const m = computeRollOffsets([0, 1, 2, 3, 4, 5], "brush-down", 1.0, params);
		expect([...m.values()].every((o) => o.gain === 1)).toBe(true);
	});

	it("a brush still keeps inside the slot when the slot is very short", () => {
		const m = computeRollOffsets([0, 1, 2, 3, 4, 5], "brush-down", 0.02, params);
		const span = Math.max(...[...m.values()].map((o) => o.timeOffset));
		expect(span).toBeLessThanOrEqual(0.02);
	});
});

describe("computeRollOffsets — sweep order and gain taper", () => {
	const params: RollParams = { ...DEFAULT_ROLL_PARAMS, staggerMode: "fixed", baseStagger: 0.02 };

	it("roll-down orders strings low→high (5 first, 0 last) with increasing offsets", () => {
		const m = computeRollOffsets([0, 1, 2, 3, 4, 5], "roll-down", 1.0, params);
		const t = (s: number) => m.get(s)!.timeOffset;
		expect(t(5)).toBeCloseTo(0);
		expect(t(5)).toBeLessThan(t(4));
		expect(t(4)).toBeLessThan(t(3));
		expect(t(3)).toBeLessThan(t(2));
		expect(t(2)).toBeLessThan(t(1));
		expect(t(1)).toBeLessThan(t(0));
	});

	it("roll-up orders strings high→low (0 first, 5 last)", () => {
		const m = computeRollOffsets([0, 1, 2, 3, 4, 5], "roll-up", 1.0, params);
		const t = (s: number) => m.get(s)!.timeOffset;
		expect(t(0)).toBeCloseTo(0);
		expect(t(0)).toBeLessThan(t(1));
		expect(t(4)).toBeLessThan(t(5));
	});

	it("gain taper is gainTaper^rank in sweep order", () => {
		const p: RollParams = { ...params, gainTaper: 0.9 };
		const m = computeRollOffsets([0, 1, 2, 3, 4, 5], "roll-down", 1.0, p);
		// roll-down rank order: 5,4,3,2,1,0 → ranks 0..5
		expect(m.get(5)!.gain).toBeCloseTo(1);
		expect(m.get(4)!.gain).toBeCloseTo(0.9);
		expect(m.get(3)!.gain).toBeCloseTo(0.81);
		expect(m.get(0)!.gain).toBeCloseTo(Math.pow(0.9, 5));
	});

	it("empty / single-string input produces no roll spread", () => {
		expect(computeRollOffsets([], "roll-down", 1.0, params).size).toBe(0);
		const one = computeRollOffsets([2], "roll-down", 1.0, params);
		expect(one.get(2)!.timeOffset).toBeCloseTo(0);
	});

	it("roll-up multiplier widens up-strokes relative to down-strokes", () => {
		const p: RollParams = { ...params, rollUpMultiplier: 1.5 };
		const down = computeRollOffsets([0, 5], "roll-down", 1.0, p);
		const up = computeRollOffsets([0, 5], "roll-up", 1.0, p);
		// Total span of the up-stroke is 1.5× the down-stroke span.
		const downSpan = Math.abs(down.get(0)!.timeOffset - down.get(5)!.timeOffset);
		const upSpan = Math.abs(up.get(0)!.timeOffset - up.get(5)!.timeOffset);
		expect(upSpan).toBeCloseTo(downSpan * 1.5);
	});
});

describe("fingerpickPatternToScheduleEvents — stroke applies stagger", () => {
	it("a rolled slot no longer shares one start time (stagger IS applied — not silently dropped)", () => {
		const rolled = pattern(120, [rolledSlot("s1", "quarter", "roll-down", FULL_CHORD)]);
		const plain = pattern(120, [slot("s1", "quarter", FULL_CHORD)]);
		const rolledEvents = fingerpickPatternToScheduleEvents(rolled, 120);
		const plainEvents = fingerpickPatternToScheduleEvents(plain, 120);

		const rolledTimes = new Set(rolledEvents.map((e) => e.time));
		const plainTimes = new Set(plainEvents.map((e) => e.time));
		// Plain chord: all six events share t=0. Rolled: six distinct onset times.
		expect(plainTimes.size).toBe(1);
		expect(rolledTimes.size).toBe(6);
	});

	it("roll-down first-on-beat: string 5 lands on the beat, string 0 last", () => {
		const p = pattern(120, [rolledSlot("s1", "quarter", "roll-down", FULL_CHORD)]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(timeOfString(events, 5)).toBeCloseTo(0);
		expect(timeOfString(events, 5)).toBeLessThan(timeOfString(events, 0));
		// The whole roll stays within the slot (quarter at 120 BPM = 0.5 s).
		expect(Math.max(...events.map((e) => e.time))).toBeLessThan(0.5);
	});

	it("roll-up first-on-beat: string 0 lands on the beat, string 5 last", () => {
		const p = pattern(120, [rolledSlot("s1", "quarter", "roll-up", FULL_CHORD)]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(timeOfString(events, 0)).toBeCloseTo(0);
		expect(timeOfString(events, 0)).toBeLessThan(timeOfString(events, 5));
	});

	it("last-on-beat anchor: the final struck string lands exactly on the slot start", () => {
		// Rolled chord as the SECOND slot so the beat is at t=0.5 (quarter @120).
		const p = pattern(120, [
			slot("s0", "quarter", { 0: { fret: 0 } }),
			rolledSlot("s1", "quarter", "roll-down", FULL_CHORD),
		]);
		const params: RollParams = { ...DEFAULT_ROLL_PARAMS, anchor: "last-on-beat" };
		const events = fingerpickPatternToScheduleEvents(p, 120, params);
		const rolled = events.filter((e) => e.slotIndex === 1);
		// roll-down last string is 0 → lands on the beat (0.5); earlier strings before it.
		expect(timeOfString(rolled, 0)).toBeCloseTo(0.5);
		expect(timeOfString(rolled, 5)).toBeLessThan(0.5);
	});

	it("rollGain is stamped on rolled events and absent on plain events", () => {
		const rolled = fingerpickPatternToScheduleEvents(
			pattern(120, [rolledSlot("s1", "quarter", "roll-down", FULL_CHORD)]),
			120,
		);
		expect(rolled.every((e) => typeof e.rollGain === "number")).toBe(true);
		const plain = fingerpickPatternToScheduleEvents(
			pattern(120, [slot("s1", "quarter", FULL_CHORD)]),
			120,
		);
		expect(plain.every((e) => !("rollGain" in e))).toBe(true);
	});
});

describe("fingerpickPatternToScheduleEvents — no-stroke byte-identical", () => {
	it("a stroke-free pattern is identical regardless of rollParams", () => {
		const p = multiMeasurePattern(120, [
			[slot("s1", "quarter", { 0: { fret: 0 }, 2: { fret: 2 } }), slot("s2", "eighth", { 5: { fret: 3 } })],
			[restSlot("s3"), slot("s4", "quarter", { 1: { fret: 1, muted: true } })],
		]);
		const wild: RollParams = {
			baseStagger: 0.09,
			staggerMode: "proportional",
			proportionalFraction: 0.25,
			spanCapFraction: 0.9,
			rollUpMultiplier: 2,
			gainTaper: 0.5,
			gapMode: "consume",
			anchor: "last-on-beat",
		};
		const withDefault = fingerpickPatternToScheduleEvents(p, 120);
		const withWild = fingerpickPatternToScheduleEvents(p, 120, wild);
		// Byte-identical: same order, same field set, same values.
		expect(withWild).toEqual(withDefault);
		expect(withDefault.some((e) => "rollGain" in e)).toBe(false);
	});
});

describe("fingerpickPatternToScheduleEvents — span cap holds at short durations", () => {
	it("fixed-with-cap: total roll span never exceeds spanCapFraction × slot duration", () => {
		// Sixteenth at 240 BPM = 0.0625 s. Default fixed-with-cap, spanCap 0.5.
		const p = pattern(240, [rolledSlot("s1", "sixteenth", "roll-down", FULL_CHORD)]);
		const events = fingerpickPatternToScheduleEvents(p, 240);
		const slotDur = events[0].duration; // 0.0625
		const span = Math.max(...events.map((e) => e.time)) - Math.min(...events.map((e) => e.time));
		expect(span).toBeLessThanOrEqual(DEFAULT_ROLL_PARAMS.spanCapFraction * slotDur + 1e-9);
		// And it genuinely clamped (base 0.03 × 5 = 0.15 ≫ the 0.03125 cap).
		expect(span).toBeGreaterThan(0);
	});

	it("fixed mode: the hard safety ceiling still prevents bleed into the next slot", () => {
		const params: RollParams = { ...DEFAULT_ROLL_PARAMS, staggerMode: "fixed", baseStagger: 0.03 };
		const p = pattern(240, [rolledSlot("s1", "sixteenth", "roll-down", FULL_CHORD)]);
		const events = fingerpickPatternToScheduleEvents(p, 240, params);
		const slotDur = events[0].duration;
		const span = Math.max(...events.map((e) => e.time)) - Math.min(...events.map((e) => e.time));
		expect(span).toBeLessThanOrEqual(ROLL_HARD_SPAN_CEILING * slotDur + 1e-9);
	});
});

describe("fingerpickPatternToScheduleEvents — gap handling modes", () => {
	// Sparse voicing: strings 0, 1, 4, 5 active; holes at 2, 3. Long slot so no clamp.
	const sparse: Record<number, Partial<StringFret>> = {
		0: { fret: 0 },
		1: { fret: 1 },
		4: { fret: 3 },
		5: { fret: 0 },
	};
	const base: RollParams = { ...DEFAULT_ROLL_PARAMS, staggerMode: "fixed", baseStagger: 0.03 };

	function spanFor(gapMode: RollParams["gapMode"]): number {
		const p = pattern(60, [rolledSlot("s1", "whole", "roll-down", sparse)]); // whole @60 = 4 s
		const events = fingerpickPatternToScheduleEvents(p, 60, { ...base, gapMode });
		return Math.max(...events.map((e) => e.time)) - Math.min(...events.map((e) => e.time));
	}

	it("consume spans wider than collapse on a gapped voicing (skipped strings cost a step)", () => {
		// collapse: 4 active → 3 steps × 0.03 = 0.09. consume: sweep 0..5 → 5 steps × 0.03 = 0.15.
		expect(spanFor("collapse")).toBeCloseTo(0.09);
		expect(spanFor("consume")).toBeCloseTo(0.15);
		expect(spanFor("consume")).toBeGreaterThan(spanFor("collapse"));
	});

	it("both modes keep the same sweep order (string 5 first, string 0 last)", () => {
		const p = pattern(60, [rolledSlot("s1", "whole", "roll-down", sparse)]);
		for (const gapMode of ["collapse", "consume"] as const) {
			const events = fingerpickPatternToScheduleEvents(p, 60, { ...base, gapMode });
			expect(timeOfString(events, 5)).toBeCloseTo(0);
			expect(timeOfString(events, 5)).toBeLessThan(timeOfString(events, 0));
		}
	});
});

describe("stroke does not affect slot durations or measure boundaries (Objective 5)", () => {
	it("getTotalPatternDuration and computeMeasureBoundaries are identical with/without a stroke", () => {
		const withStroke = multiMeasurePattern(120, [
			[rolledSlot("s1", "quarter", "roll-down", FULL_CHORD), slot("s2", "quarter", { 0: { fret: 0 } })],
			[rolledSlot("s3", "half", "roll-up", FULL_CHORD)],
		]);
		const withoutStroke = multiMeasurePattern(120, [
			[slot("s1", "quarter", FULL_CHORD), slot("s2", "quarter", { 0: { fret: 0 } })],
			[slot("s3", "half", FULL_CHORD)],
		]);
		expect(getTotalPatternDuration(withStroke, 120)).toBeCloseTo(
			getTotalPatternDuration(withoutStroke, 120),
		);
		expect(computeMeasureBoundaries(withStroke, 120)).toEqual(
			computeMeasureBoundaries(withoutStroke, 120),
		);
	});
});

// ─── Slide: real pitch motion (voice handoff) ────────────────────────────────
//
// Every assertion here would FAIL before this change: resolveSlide / applySlideToVoice /
// scheduleFingerpickNote did not exist, and the engine treated a slide event as an
// ordinary pluck. The scheduleFingerpickNote block in particular exercises the ENGINE
// path with a mock AudioContext, so a slide that silently created no ramp (or dropped the
// note) is caught by a test rather than shipped.

// Rate helper: an invertible, midi-dependent playbackRate so origin and target rates
// differ (proves the ramp targets the TARGET pitch, not the origin's).
const rateFor = (midi: number): number => Math.pow(2, (midi - 60) / 12);

const TEST_GAINS: NoteGains = {
	normal: 0.8,
	technique: 0.5,
	tapping: 0.8,
	ghost: 0.3,
	slap: 0.7,
	palmMute: 0.75,
	tremoloAltGain: 0.85,
	harmonic: 0.6,
	harmonicBody: 0.35,
	scrape: 0.5,
	bodyTap: 0.8,
	accentMultiplier: 1.3,
	letRingLifetimeTaus: 4,
};

const TEST_ENV: NoteEnvelope = {
	decayTcRatio: 0.8,
	minDecayTc: 0.03,
	voiceStealFadeTau: 0.005,
	letRingDecayTc: 1.5,
	palmMuteDecayTc: 0.12,
	harmonicDecayTc: 0.6,
	sourceStopBuffer: 0.05,
};

function noteEvent(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
	return {
		time: 0,
		duration: 0.5,
		stringIndex: 2,
		midi: 62,
		muted: false,
		measureIndex: 0,
		slotIndex: 0,
		...overrides,
	};
}

function mockParam(initial = 0) {
	return {
		value: initial,
		setValueAtTime: vi.fn(),
		setTargetAtTime: vi.fn(),
		cancelScheduledValues: vi.fn(),
		exponentialRampToValueAtTime: vi.fn(),
		linearRampToValueAtTime: vi.fn(),
		setValueCurveAtTime: vi.fn(),
	};
}

function mockSource() {
	return {
		buffer: null as unknown,
		playbackRate: mockParam(1),
		detune: mockParam(0),
		connect: vi.fn((node: unknown) => node),
		start: vi.fn(),
		stop: vi.fn(),
		onended: null as (() => void) | null,
	};
}

function mockGain() {
	return {
		gain: mockParam(0),
		connect: vi.fn((node: unknown) => node),
	};
}

function mockFilter() {
	return {
		type: "" as BiquadFilterType,
		frequency: mockParam(0),
		Q: { value: 0 },
		connect: vi.fn((node: unknown) => node),
	};
}

function mockOscillator() {
	return { type: "sine" as OscillatorType, frequency: mockParam(0), connect: vi.fn((node: unknown) => node), start: vi.fn(), stop: vi.fn() };
}

function mockCtx(currentTime = 0) {
	const sources: ReturnType<typeof mockSource>[] = [];
	const gains: ReturnType<typeof mockGain>[] = [];
	const filters: ReturnType<typeof mockFilter>[] = [];
	const oscillators: ReturnType<typeof mockOscillator>[] = [];
	return {
		currentTime,
		sampleRate: 1000,
		createBuffer: vi.fn((_channels: number, length: number) => ({ length, getChannelData: () => new Float32Array(length) })),
		createOscillator: vi.fn(() => {
			const o = mockOscillator();
			oscillators.push(o);
			return o;
		}),
		_oscillators: oscillators,
		createBufferSource: vi.fn(() => {
			const s = mockSource();
			sources.push(s);
			return s;
		}),
		createGain: vi.fn(() => {
			const g = mockGain();
			gains.push(g);
			return g;
		}),
		createBiquadFilter: vi.fn(() => {
			const f = mockFilter();
			filters.push(f);
			return f;
		}),
		_sources: sources,
		_gains: gains,
		_filters: filters,
	};
}

type MockCtx = ReturnType<typeof mockCtx>;

// A live per-string voice as scheduleFingerpickNote expects to find in the map.
function makeLiveVoice(overrides: {
	currentMidi?: number;
	currentRate?: number;
	stopTime?: number;
} = {}) {
	const currentMidi = overrides.currentMidi ?? 60;
	return {
		gainNode: mockGain(),
		source: mockSource(),
		event: noteEvent({ midi: currentMidi }),
		stopTime: overrides.stopTime ?? 100,
		currentRate: overrides.currentRate ?? rateFor(currentMidi),
		currentMidi,
		attackVolume: 0.8,
		attackTime: 0,
		decayTc: 1.5,
	};
}

function makeDeps(
	ctx: MockCtx,
	voices: Map<number, SlideActiveVoice>,
	opts: {
		legatoTreatment?: LegatoTreatment;
		slideParams?: SlideParams;
		resolveNoteData?: NoteDataResolver;
		forceLetRing?: boolean;
		noiseBuffer?: AudioBuffer | null;
		slapParams?: SlapParams;
	} = {},
): FingerpickNoteSchedulerDeps {
	const target = {} as AudioNode;
	return {
		ctx: ctx as unknown as AudioContext,
		target,
		voices,
		allSources: new Set<AudioBufferSourceNode>(),
		resolveNoteData:
			opts.resolveNoteData ??
			((midi) => ({ buffer: {} as AudioBuffer, playbackRate: rateFor(midi) })),
		gains: TEST_GAINS,
		envelope: TEST_ENV,
		forceLetRing: opts.forceLetRing ?? false,
		legatoTreatment: opts.legatoTreatment ?? "current",
		slideParams: opts.slideParams ?? DEFAULT_SLIDE_PARAMS,
		...(opts.slapParams && { slapParams: opts.slapParams }),
		noiseBuffer: opts.noiseBuffer === undefined ? ({} as AudioBuffer) : opts.noiseBuffer,
	};
}

describe("scheduleFingerpickNote — bend and vibrato detune curves", () => {
	function curveCall(src: ReturnType<typeof mockSource>): { values: Float32Array; start: number; duration: number } {
		expect(src.detune.setValueCurveAtTime).toHaveBeenCalledTimes(1);
		const [values, start, duration] = src.detune.setValueCurveAtTime.mock.calls[0] as [Float32Array, number, number];
		return { values, start, duration };
	}

	it("a plain note gets no curve", () => {
		const ctx = mockCtx(0);
		scheduleFingerpickNote(makeDeps(ctx, new Map()), noteEvent(), 1);
		expect(ctx._sources[0].detune.setValueCurveAtTime).not.toHaveBeenCalled();
	});

	it("a full bend sets one detune curve over the note, leaving playbackRate alone", () => {
		const ctx = mockCtx(0);
		scheduleFingerpickNote(makeDeps(ctx, new Map()), noteEvent({ effects: { bend: { semitones: 2 } }, duration: 0.5 }), 1);
		const src = ctx._sources[0];
		const { values, start, duration } = curveCall(src);
		expect(values).toBeInstanceOf(Float32Array);
		expect(values.length).toBe(curveLength(0.5));
		expect(start).toBe(1);
		expect(duration).toBe(0.5);
		expect(values[0]).toBe(0);
		expect(values[values.length - 1]).toBe(200);
		expect(src.playbackRate.value).toBe(rateFor(62));
		expect(src.playbackRate.setValueAtTime).not.toHaveBeenCalled();
		expect(src.playbackRate.exponentialRampToValueAtTime).not.toHaveBeenCalled();
	});

	it("named bend heights and bendTarget both reach the curve", () => {
		const ctx = mockCtx(0);
		const deps = makeDeps(ctx, new Map());
		scheduleFingerpickNote(deps, noteEvent({ effects: { bend: { semitones: 1 } }, stringIndex: 0 }), 1);
		scheduleFingerpickNote(deps, noteEvent({ effects: { bend: { semitones: 0.5, pre: true } }, stringIndex: 1 }), 1);
		const half = curveCall(ctx._sources[0]).values;
		const pre = curveCall(ctx._sources[1]).values;
		expect(half[half.length - 1]).toBe(100);
		expect(pre[0]).toBe(50);
	});

	it("a vibrato wobbles only above the fretted pitch, within its depth", () => {
		const ctx = mockCtx(0);
		scheduleFingerpickNote(makeDeps(ctx, new Map()), noteEvent({ effects: { vibrato: {} }, duration: 1 }), 0);
		const { values } = curveCall(ctx._sources[0]);
		let lo = Infinity;
		let hi = -Infinity;
		for (const v of values) {
			lo = Math.min(lo, v);
			hi = Math.max(hi, v);
		}
		expect(lo).toBeGreaterThanOrEqual(0);
		expect(hi).toBeLessThanOrEqual(DEFAULT_VIBRATO_PARAMS.depthCents + 1e-6);
		expect(hi).toBeGreaterThan(DEFAULT_VIBRATO_PARAMS.depthCents * 0.9);
	});

	it("a bend-release ends back at 0 and keeps enough gain to be heard coming down", () => {
		const ctx = mockCtx(0);
		scheduleFingerpickNote(makeDeps(ctx, new Map()), noteEvent({ effects: { bend: { semitones: 2, release: true } }, duration: 0.5 }), 0);
		const { values } = curveCall(ctx._sources[0]);
		expect(values[values.length - 1]).toBe(0);
		const tc = ctx._gains[0].gain.setTargetAtTime.mock.calls[0][2] as number;
		const releaseEnd = bendTimeline(expressionForEffects({ bend: { semitones: 2, release: true } })!.bend!, 0.5).releaseEndS;
		expect(Math.exp(-releaseEnd / tc)).toBeGreaterThanOrEqual(EXPRESSION_RELEASE_MIN_GAIN_RATIO - 1e-9);
		// A plain note of the same length decays faster: τ = 0.5 × 0.8.
		expect(tc).toBeGreaterThan(0.4);
	});

	it("a non-release bend keeps the plain note's decay", () => {
		const ctx = mockCtx(0);
		scheduleFingerpickNote(makeDeps(ctx, new Map()), noteEvent({ effects: { bend: { semitones: 2 } }, duration: 0.5 }), 0);
		expect(ctx._gains[0].gain.setTargetAtTime.mock.calls[0][2]).toBeCloseTo(0.4);
	});

	it("a letRing bend's curve covers the voice's whole lifetime", () => {
		const ctx = mockCtx(0);
		scheduleFingerpickNote(makeDeps(ctx, new Map()), noteEvent({ effects: { bend: { semitones: 2 } }, duration: 0.5, letRing: true }), 0);
		const { duration } = curveCall(ctx._sources[0]);
		expect(duration).toBeCloseTo(TEST_ENV.letRingDecayTc * TEST_GAINS.letRingLifetimeTaus);
	});

	it("a staccato bend's curve is as short as the note", () => {
		const ctx = mockCtx(0);
		scheduleFingerpickNote(makeDeps(ctx, new Map()), noteEvent({ effects: { bend: { semitones: 2 }, staccato: true }, duration: 0.5 }), 0);
		expect(curveCall(ctx._sources[0]).duration).toBeCloseTo(0.1);
	});

	it("a bent voice can still be slid from: the handoff ramps playbackRate, the curve stays", () => {
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();
		const deps = makeDeps(ctx, voices);
		scheduleFingerpickNote(deps, noteEvent({ effects: { bend: { semitones: 2 } }, duration: 0.5, letRing: true }), 0);
		scheduleFingerpickNote(deps, noteEvent({ link: { kind: "slide" }, midi: 64, duration: 0.5 }), 0.5);
		expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
		const src = ctx._sources[0];
		expect(src.detune.setValueCurveAtTime).toHaveBeenCalledTimes(1);
		expect(src.playbackRate.exponentialRampToValueAtTime).toHaveBeenCalled();
	});

	it("fingerpickPatternToScheduleEvents carries the effects onto the event", () => {
		const bent = pattern(120, [slot("s0", "quarter", { 2: { fret: 7, effects: { bend: { semitones: 1.0, release: true } } } })]);
		const events = fingerpickPatternToScheduleEvents(bent, 120);
		expect(events).toHaveLength(1);
		expect(events[0].effects).toEqual({ bend: { semitones: 1, release: true } });
		const v2 = pattern(120, [slot("s0", "quarter", { 2: { fret: 7, effects: { bend: { semitones: 1, release: true }, accent: true } } })]);
		expect(fingerpickPatternToScheduleEvents(v2, 120)[0].effects).toEqual({ bend: { semitones: 1, release: true }, accent: true });
		const plain = fingerpickPatternToScheduleEvents(pattern(120, [slot("s0", "quarter", { 2: { fret: 7 } })]), 120);
		expect("effects" in plain[0]).toBe(false);
	});
});

describe("scheduleFingerpickNote — slide handoff vs fallback (no silent drop)", () => {
	it("a slide with a live origin voice creates NO new source and ramps the origin in place", () => {
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();
		const origin = makeLiveVoice({ currentMidi: 60, stopTime: 100 });
		voices.set(2, origin as unknown as SlideActiveVoice);

		scheduleFingerpickNote(makeDeps(ctx, voices), noteEvent({ midi: 62, link: { kind: "slide" } }), 1);

		expect(ctx.createBufferSource).not.toHaveBeenCalled();
		expect(origin.source.playbackRate.exponentialRampToValueAtTime).toHaveBeenCalledTimes(1);
		// The stolen-voice path must NOT run: the origin source is bent, not stopped-and-faded.
		expect(origin.source.stop).toHaveBeenCalledTimes(1); // the single re-scheduled hard-stop
	});

	it("the ramp target rate equals the TARGET pitch's rate, not the origin's", () => {
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();
		const origin = makeLiveVoice({ currentMidi: 60, stopTime: 100 });
		voices.set(2, origin as unknown as SlideActiveVoice);

		scheduleFingerpickNote(makeDeps(ctx, voices), noteEvent({ midi: 62, link: { kind: "slide" } }), 1);

		const rampArg = origin.source.playbackRate.exponentialRampToValueAtTime.mock.calls[0][0];
		expect(rampArg).toBeCloseTo(rateFor(62));
		expect(rampArg).not.toBeCloseTo(rateFor(60));
	});

	it("bends the origin buffer by the pitch INTERVAL, not the target zone's own rate (multi-sample)", () => {
		// Regression: the real guitar instrument is multi-sampled — every note maps to its
		// OWN nearby zone played near rate 1.0. A handoff keeps playing the ORIGIN buffer, so
		// ramping to the target note's independently-resolved rate (≈1.0) moved NO pitch and
		// the slide was silent. The ramp target must be origin.currentRate × 2^(Δst/12).
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();
		// Origin plays its own zone at rate 1.0 (currentMidi 45 = open A).
		const origin = makeLiveVoice({ currentMidi: 45, currentRate: 1.0, stopTime: 100 });
		voices.set(2, origin as unknown as SlideActiveVoice);

		// Multi-sample resolver: EVERY midi resolves to its own zone at rate ~1.0.
		const flatResolver: NoteDataResolver = () => ({ buffer: {} as AudioBuffer, playbackRate: 1.0 });

		// Slide up 5 semitones (A5 → fret 5, midi 50).
		scheduleFingerpickNote(
			makeDeps(ctx, voices, { resolveNoteData: flatResolver }),
			noteEvent({ midi: 50, link: { kind: "slide" } }),
			1,
		);

		const rampArg = origin.source.playbackRate.exponentialRampToValueAtTime.mock.calls[0][0];
		// Correct: bend the sounding buffer up 5 semitones. WRONG (pre-fix): 1.0 → no motion.
		expect(rampArg).toBeCloseTo(Math.pow(2, 5 / 12));
		expect(rampArg).not.toBeCloseTo(1.0);
	});

	it("a slide with NO origin voice falls back to a new source played as an ordinary note", () => {
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();

		scheduleFingerpickNote(makeDeps(ctx, voices), noteEvent({ midi: 62, link: { kind: "slide" } }), 1);

		expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
		// Fallback = ordinary pluck: NORMAL gain, no lowpass filter.
		expect(ctx._gains[0].gain.setValueAtTime).toHaveBeenCalledWith(TEST_GAINS.normal, 1);
		expect(ctx.createBiquadFilter).not.toHaveBeenCalled();
	});

	it("a slide whose origin already hard-stopped (not ringing) falls back to a new source", () => {
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();
		// stopTime 0.5 is before the slide's beat (when = 1) → origin is dead.
		voices.set(2, makeLiveVoice({ currentMidi: 60, stopTime: 0.5 }) as unknown as SlideActiveVoice);

		scheduleFingerpickNote(makeDeps(ctx, voices), noteEvent({ midi: 62, link: { kind: "slide" } }), 1);

		expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
	});

	it("a slide beyond maxIntervalSemitones falls back and retriggers (steals the origin)", () => {
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();
		const origin = makeLiveVoice({ currentMidi: 40, stopTime: 100 });
		voices.set(2, origin as unknown as SlideActiveVoice);

		// interval |60 - 40| = 20 > default max 12 → fallback.
		scheduleFingerpickNote(makeDeps(ctx, voices), noteEvent({ midi: 60, link: { kind: "slide" } }), 1);

		expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
		// A retrigger steals the ringing origin (fade + stop via stealVoice).
		expect(origin.source.stop).toHaveBeenCalledWith(1 + VOICE_STEAL_STOP_BUFFER);
	});

	it("uses the EXPONENTIAL ramp form for pitch (never linear)", () => {
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();
		const origin = makeLiveVoice({ currentMidi: 60, stopTime: 100 });
		voices.set(2, origin as unknown as SlideActiveVoice);

		scheduleFingerpickNote(makeDeps(ctx, voices), noteEvent({ midi: 62, link: { kind: "slide" } }), 1);

		expect(origin.source.playbackRate.exponentialRampToValueAtTime).toHaveBeenCalled();
		expect(origin.source.playbackRate.linearRampToValueAtTime).not.toHaveBeenCalled();
	});

	it("extends the origin voice's hard-stop to cover the slid-into note's duration", () => {
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();
		// Origin's own stop (1.2) is sooner than the target note needs (1 + 0.5 + 0.05 = 1.55).
		const origin = makeLiveVoice({ currentMidi: 60, stopTime: 1.2 });
		voices.set(2, origin as unknown as SlideActiveVoice);

		scheduleFingerpickNote(
			makeDeps(ctx, voices),
			noteEvent({ midi: 62, link: { kind: "slide" }, duration: 0.5 }),
			1,
		);

		expect(origin.source.stop).toHaveBeenCalledWith(1 + 0.5 + TEST_ENV.sourceStopBuffer);
		// And the voice stays registered under the same string for a later steal/chain.
		expect(voices.get(2)).toBe(origin);
	});

	it("a chained slide anchors from the previous slide's target pitch, not the original pluck", () => {
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();
		const origin = makeLiveVoice({ currentMidi: 60, stopTime: 100 });
		voices.set(2, origin as unknown as SlideActiveVoice);

		// First slide 60 → 64.
		scheduleFingerpickNote(makeDeps(ctx, voices), noteEvent({ midi: 64, link: { kind: "slide" } }), 1);
		expect(origin.currentMidi).toBe(64);
		expect(origin.currentRate).toBeCloseTo(rateFor(64));

		// Second slide 64 → 60: interval must be measured from 64 (=4), and the ramp anchored
		// at the current rate. A 24-semitone max still permits it; verify the from-rate anchor.
		scheduleFingerpickNote(makeDeps(ctx, voices), noteEvent({ midi: 60, link: { kind: "slide" } }), 2);
		const secondRamp = origin.source.playbackRate.exponentialRampToValueAtTime.mock.calls[1][0];
		expect(secondRamp).toBeCloseTo(rateFor(60));
		const secondFromAnchor = origin.source.playbackRate.setValueAtTime.mock.calls[1][0];
		expect(secondFromAnchor).toBeCloseTo(rateFor(64)); // anchored at the intermediate pitch
	});

	it("floors the hand-off gain at minGainRatio × the origin's attack (slid-into note stays audible)", () => {
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();
		// attackVolume 0.8, decayTc 1.5, attackTime 0 → natural decay at the beat (t=1) is
		// 0.8·e^(−1/1.5) ≈ 0.41, well below the 0.72 floor a 0.9 ratio imposes.
		const origin = makeLiveVoice({ currentMidi: 60, stopTime: 100 });
		voices.set(2, origin as unknown as SlideActiveVoice);

		const params: SlideParams = { ...DEFAULT_SLIDE_PARAMS, minGainRatio: 0.9 };
		scheduleFingerpickNote(
			makeDeps(ctx, voices, { slideParams: params }),
			noteEvent({ midi: 62, link: { kind: "slide" } }),
			1,
		);

		const handoffGain = origin.gainNode.gain.setValueAtTime.mock.calls.at(-1);
		expect(handoffGain?.[0]).toBeCloseTo(0.8 * 0.9); // floored, not the ~0.41 raw decay
	});

	it("minGainRatio 0 leaves the hand-off gain at the origin's raw decayed level", () => {
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();
		const origin = makeLiveVoice({ currentMidi: 60, stopTime: 100 });
		voices.set(2, origin as unknown as SlideActiveVoice);

		const params: SlideParams = { ...DEFAULT_SLIDE_PARAMS, minGainRatio: 0 };
		scheduleFingerpickNote(
			makeDeps(ctx, voices, { slideParams: params }),
			noteEvent({ midi: 62, link: { kind: "slide" } }),
			1,
		);

		const handoffGain = origin.gainNode.gain.setValueAtTime.mock.calls.at(-1);
		expect(handoffGain?.[0]).toBeCloseTo(0.8 * Math.exp(-1 / 1.5)); // raw decay, no floor
	});
});

describe("scheduleFingerpickNote — no-slide behaviour unchanged (regression guard)", () => {
	it("an ordinary note creates one source + one gain, wires source→gain→target, registers a voice", () => {
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();
		const deps = makeDeps(ctx, voices);

		scheduleFingerpickNote(deps, noteEvent({ midi: 60, duration: 0.5 }), 2);

		expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
		expect(ctx.createGain).toHaveBeenCalledTimes(1);
		expect(ctx.createBiquadFilter).not.toHaveBeenCalled();

		const source = ctx._sources[0];
		const gain = ctx._gains[0];
		expect(source.connect).toHaveBeenCalledWith(gain);
		expect(gain.connect).toHaveBeenCalledWith(deps.target);
		expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(TEST_GAINS.normal, 2);
		expect(source.start).toHaveBeenCalledWith(2);
		expect(source.stop).toHaveBeenCalledWith(2 + 0.5 + TEST_ENV.sourceStopBuffer);
		expect(voices.get(2)).toBeDefined();
	});

	it("hammer-on in 'current' treatment: technique gain + 2 kHz lowpass (production default)", () => {
		const ctx = mockCtx(0);
		const deps = makeDeps(ctx, new Map(), { legatoTreatment: "current" });
		scheduleFingerpickNote(deps, noteEvent({ midi: 62, link: { kind: "hammer" } }), 1);

		expect(ctx.createBiquadFilter).toHaveBeenCalledTimes(1);
		expect(ctx._gains[0].gain.setValueAtTime).toHaveBeenCalledWith(TEST_GAINS.technique, 1);
		expect(ctx._filters[0].frequency.value).toBe(2000);
	});

	it("hammer-on in 'gain-only': technique gain, NO filter", () => {
		const ctx = mockCtx(0);
		const deps = makeDeps(ctx, new Map(), { legatoTreatment: "gain-only" });
		scheduleFingerpickNote(deps, noteEvent({ midi: 62, link: { kind: "hammer" } }), 1);

		expect(ctx.createBiquadFilter).not.toHaveBeenCalled();
		expect(ctx._gains[0].gain.setValueAtTime).toHaveBeenCalledWith(TEST_GAINS.technique, 1);
	});

	it("hammer-on in 'dry': NORMAL gain, NO filter (identical to a plucked note)", () => {
		const ctx = mockCtx(0);
		const deps = makeDeps(ctx, new Map(), { legatoTreatment: "dry" });
		scheduleFingerpickNote(deps, noteEvent({ midi: 62, link: { kind: "hammer" } }), 1);

		expect(ctx.createBiquadFilter).not.toHaveBeenCalled();
		expect(ctx._gains[0].gain.setValueAtTime).toHaveBeenCalledWith(TEST_GAINS.normal, 1);
	});

	it("trill keeps technique gain + filter regardless of treatment (dry) — A/B is HO/PO only", () => {
		const ctx = mockCtx(0);
		const deps = makeDeps(ctx, new Map(), { legatoTreatment: "dry" });
		scheduleFingerpickNote(deps, noteEvent({ midi: 62, effects: { trill: {} } }), 1);

		expect(ctx.createBiquadFilter).toHaveBeenCalledTimes(1);
		expect(ctx._gains[0].gain.setValueAtTime).toHaveBeenCalledWith(TEST_GAINS.technique, 1);
	});
});

describe("resolveSlide — decision + ramp geometry", () => {
	const origin = { currentRate: rateFor(60), currentMidi: 60, stopTime: 100 };
	const base = {
		targetMidi: 62,
		targetRate: rateFor(62),
		targetDuration: 0.5,
		when: 1,
		now: 0,
		params: DEFAULT_SLIDE_PARAMS,
		sourceStopBuffer: 0.05,
	};

	it("hands off when a live origin voice exists, targeting the target pitch's rate", () => {
		const r = resolveSlide({ link: { kind: "slide" }, origin, ...base });
		expect(r.action).toBe("handoff");
		if (r.action !== "handoff") return;
		expect(r.plan.targetRate).toBeCloseTo(rateFor(62));
		expect(r.plan.fromRate).toBeCloseTo(rateFor(60));
	});

	it("finish-on-target: the ramp ENDS on the beat and starts one ramp-duration earlier", () => {
		const params: SlideParams = { ...DEFAULT_SLIDE_PARAMS, anchor: "finish-on-target" };
		const r = resolveSlide({ link: { kind: "slide" }, origin, ...base, params });
		if (r.action !== "handoff") throw new Error("expected handoff");
		expect(r.plan.rampEndTime).toBeCloseTo(1);
		expect(r.plan.rampStartTime).toBeCloseTo(1 - params.rampDurationS);
	});

	it("start-on-target (the default): the ramp STARTS on the beat", () => {
		const r = resolveSlide({ link: { kind: "slide" }, origin, ...base });
		if (r.action !== "handoff") throw new Error("expected handoff");
		expect(DEFAULT_SLIDE_PARAMS.anchor).toBe("start-on-target");
		expect(r.plan.rampStartTime).toBeCloseTo(1);
		expect(r.plan.rampEndTime).toBeCloseTo(1 + DEFAULT_SLIDE_PARAMS.rampDurationS);
	});

	it("interval-scaled: ramp duration scales with the interval size", () => {
		const params: SlideParams = {
			...DEFAULT_SLIDE_PARAMS,
			durationScaling: "interval-scaled",
			intervalScaleSecPerSemitone: 0.03,
			anchor: "start-on-target",
		};
		// 5-fret slide: 60 → 65, interval 5 → ramp = 5 × 0.03 = 0.15 s.
		const r = resolveSlide({
			link: { kind: "slide" },
			origin,
			...base,
			targetMidi: 65,
			targetRate: rateFor(65),
			params,
		});
		if (r.action !== "handoff") throw new Error("expected handoff");
		expect(r.plan.rampEndTime - r.plan.rampStartTime).toBeCloseTo(0.15);
	});

	it("clamps a finish-on-target ramp so it never starts before `now`", () => {
		// now = 0.98 leaves only 0.02 s before the beat at 1 — less than the 0.08 default ramp.
		const params: SlideParams = { ...DEFAULT_SLIDE_PARAMS, anchor: "finish-on-target" };
		const r = resolveSlide({ link: { kind: "slide" }, origin, ...base, now: 0.98, params });
		if (r.action !== "handoff") throw new Error("expected handoff");
		expect(r.plan.rampStartTime).toBeCloseTo(0.98);
		expect(r.plan.rampEndTime).toBeCloseTo(1);
	});

	it("extends the stop time to cover the target note", () => {
		const shortOrigin = { ...origin, stopTime: 1.1 };
		const r = resolveSlide({ link: { kind: "slide" }, origin: shortOrigin, ...base });
		if (r.action !== "handoff") throw new Error("expected handoff");
		expect(r.plan.newStopTime).toBeCloseTo(1 + 0.5 + 0.05);
	});

	it("falls back (not-a-slide) for a non-slide link, and for a picked (shift) slide", () => {
		const r = resolveSlide({ link: { kind: "hammer" }, origin, ...base });
		expect(r).toEqual({ action: "fallback", reason: "not-a-slide" });
		const picked = resolveSlide({ link: { kind: "slide", picked: true }, origin, ...base });
		expect(picked).toEqual({ action: "fallback", reason: "not-a-slide" });
		const none = resolveSlide({ link: undefined, origin, ...base });
		expect(none).toEqual({ action: "fallback", reason: "not-a-slide" });
	});

	it("falls back (no-origin-voice) when there is no live voice", () => {
		const r = resolveSlide({ link: { kind: "slide" }, origin: undefined, ...base });
		expect(r).toEqual({ action: "fallback", reason: "no-origin-voice" });
	});

	it("falls back (origin-not-ringing) when the origin has already stopped", () => {
		const dead = { ...origin, stopTime: 0.5 }; // < when (1)
		const r = resolveSlide({ link: { kind: "slide" }, origin: dead, ...base });
		expect(r).toEqual({ action: "fallback", reason: "origin-not-ringing" });
	});

	it("falls back (interval-too-wide) beyond maxIntervalSemitones", () => {
		// 60 → 80 = 20 semitones > default 12.
		const r = resolveSlide({
			link: { kind: "slide" },
			origin,
			...base,
			targetMidi: 80,
			targetRate: rateFor(80),
		});
		expect(r).toEqual({ action: "fallback", reason: "interval-too-wide" });
	});
});

describe("applySlideToVoice — ramp + envelope extension on a live voice", () => {
	const plan: SlidePlan = {
		fromRate: rateFor(60),
		targetRate: rateFor(64),
		rampStartTime: 0.92,
		rampMidTime: 0.96,
		rampEndTime: 1.0,
		newStopTime: 1.55,
		decayFromTime: 1.0,
		gainDip: 0,
	};

	it("ramps playbackRate exponentially from fromRate to targetRate", () => {
		const voice = { source: mockSource(), gainNode: mockGain() };
		applySlideToVoice(voice, plan, { gainAtRampStart: 0.7, decayTc: 0.4 });

		expect(voice.source.playbackRate.cancelScheduledValues).toHaveBeenCalledWith(0.92);
		expect(voice.source.playbackRate.setValueAtTime).toHaveBeenCalledWith(rateFor(60), 0.92);
		expect(voice.source.playbackRate.exponentialRampToValueAtTime).toHaveBeenCalledWith(rateFor(64), 1.0);
		expect(voice.source.playbackRate.linearRampToValueAtTime).not.toHaveBeenCalled();
	});

	it("re-arms the gain decay from the target beat and extends the hard-stop", () => {
		const voice = { source: mockSource(), gainNode: mockGain() };
		applySlideToVoice(voice, plan, { gainAtRampStart: 0.7, decayTc: 0.4 });

		expect(voice.gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0, 1.0, 0.4);
		expect(voice.source.stop).toHaveBeenCalledWith(1.55);
	});

	it("with no dip: holds the current gain level across the ramp (no gain ramps)", () => {
		const voice = { source: mockSource(), gainNode: mockGain() };
		applySlideToVoice(voice, plan, { gainAtRampStart: 0.7, decayTc: 0.4 });

		expect(voice.gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.7, 0.92);
		expect(voice.gainNode.gain.exponentialRampToValueAtTime).not.toHaveBeenCalled();
	});

	it("with a dip: dips mid-ramp and recovers (two gain ramps)", () => {
		const voice = { source: mockSource(), gainNode: mockGain() };
		applySlideToVoice(voice, { ...plan, gainDip: 0.5 }, { gainAtRampStart: 0.8, decayTc: 0.4 });

		const calls = voice.gainNode.gain.exponentialRampToValueAtTime.mock.calls;
		expect(calls).toHaveLength(2);
		expect(calls[0][0]).toBeCloseTo(0.8 * 0.5); // dip to 50%
		expect(calls[0][1]).toBeCloseTo(0.96); // at the ramp midpoint
		expect(calls[1][0]).toBeCloseTo(0.8); // recover to the sustain level
		expect(calls[1][1]).toBeCloseTo(1.0); // by the ramp end
	});
});

// ─── Model v2: spans, hits, links read off the registry's model ──────────────

describe("fingerpickPatternToScheduleEvents — model v2 reads", () => {
	it("a tie is a link: the held note lengthens, nothing re-attacks", () => {
		const p: FingerpickPattern = {
			...pattern(120, [slot("s1", "quarter", { 0: { fret: 5 } }), slot("s2", "quarter", { 0: { fret: 5, link: { kind: "tie" } } })]),
			schemaVersion: 2,
		};
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(1);
		expect(events[0].duration).toBeCloseTo(1);
	});

	it("letRing and palmMute come from the spans, per string", () => {
		const p: FingerpickPattern = {
			...pattern(120, [slot("s1", "quarter", { 0: { fret: 3 }, 4: { fret: 0 } }), slot("s2", "quarter", { 4: { fret: 0 } })]),
			schemaVersion: 2,
			spans: [
				{ id: "lr", kind: "letRing", from: "s1", to: "s1", strings: [0] },
				{ id: "pm", kind: "palmMute", from: "s1", to: "s2", strings: [4] },
			],
		};
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events.map((e) => [e.stringIndex, e.letRing === true, e.palmMute === true])).toEqual([
			[0, true, false],
			[4, false, true],
			[4, false, true],
		]);
	});


	it("a hit strikes its strings dead, skipping the strings the slot already strikes, with one landing under them", () => {
		const slap = { ...pattern(120, [{ ...slot("s1", "quarter", { 4: { fret: 0 } }), percussion: { kind: "slap" as const } }]), schemaVersion: 2 };
		const events = fingerpickPatternToScheduleEvents(slap, 120);
		expect(events).toHaveLength(7);
		const strikes = events.filter((e) => e.percussion && !e.slapNoise);
		expect(strikes.map((e) => e.stringIndex)).toEqual([0, 1, 2, 3, 5]);
		expect(strikes.every((e) => e.muted && e.time === 0)).toBe(true);
		// The hand lands once: the noise event carries the hit (for its accent) and the strings it landed on.
		expect(events.filter((e) => e.slapNoise)).toMatchObject([{ stringIndex: 5, muted: true, time: 0, slapStrings: [0, 1, 2, 3, 5], percussion: { kind: "slap" } }]);
		const thumb = { ...pattern(120, [{ ...slot("s1", "quarter"), percussion: { kind: "thumbSlap" as const, accent: true } }]), schemaVersion: 2 };
		const thumbEvents = fingerpickPatternToScheduleEvents(thumb, 120);
		expect(thumbEvents.filter((e) => !e.slapNoise).map((e) => e.stringIndex)).toEqual([...PERCUSSION_STRINGS.thumbSlap]);
		expect(thumbEvents.filter((e) => e.slapNoise)).toMatchObject([{ slapStrings: [3, 4, 5], percussion: { kind: "thumbSlap", accent: true } }]);
		const tap = { ...pattern(120, [{ ...slot("s1", "quarter"), percussion: { kind: "bodyTap" as const } }]), schemaVersion: 2 };
		// A body tap is one knock, filed under the low E, nothing struck and no landing of its own.
		expect(fingerpickPatternToScheduleEvents(tap, 120)).toMatchObject([{ stringIndex: 5, muted: true, percussion: { kind: "bodyTap" } }]);
		expect(fingerpickPatternToScheduleEvents(tap, 120).some((e) => e.slapNoise)).toBe(false);
	});

	it("an x is a slap on its string, sounding with the slot's other notes, and the slot gets one landing however many x's it has", () => {
		const one = pattern(120, [slot("s1", "quarter", { 5: { muted: true }, 2: { fret: 2 } })]);
		const events = fingerpickPatternToScheduleEvents(one, 120);
		expect(events.filter((e) => !e.slapNoise)).toMatchObject([
			{ stringIndex: 2, midi: OPEN_STRING_MIDI[2] + 2, muted: false, time: 0 },
			{ stringIndex: 5, midi: OPEN_STRING_MIDI[5], muted: true, time: 0 },
		]);
		expect(events.filter((e) => e.slapNoise)).toMatchObject([{ stringIndex: 5, muted: true, time: 0, slapStrings: [5] }]);
		expect(events.filter((e) => e.slapNoise)[0].percussion).toBeUndefined();
		const three = pattern(120, [slot("s1", "quarter", { 3: { muted: true }, 4: { muted: true }, 5: { muted: true } })]);
		expect(fingerpickPatternToScheduleEvents(three, 120).filter((e) => e.slapNoise)).toHaveLength(1);
		const none = pattern(120, [slot("s1", "quarter", { 2: { fret: 2 } })]);
		expect(fingerpickPatternToScheduleEvents(none, 120).some((e) => e.slapNoise)).toBe(false);
	});

	it("a shift (picked) slide is not a glide: its origin is not promoted", () => {
		const p = {
			...pattern(120, [slot("s1", "quarter", { 2: { fret: 5 } }), slot("s2", "quarter", { 2: { fret: 7, link: { kind: "slide", picked: true } } })]),
			schemaVersion: 2,
		};
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events[0].letRing).toBeUndefined();
		expect(isGlide(events[1].link)).toBe(false);
		expect(isGlide({ kind: "slide" })).toBe(true);
	});
});

describe("scheduleFingerpickNote — model v2 voices", () => {
	it("noteGain: hits, ghosts, links and effects read the tables; accent, palm mute and roll multiply", () => {
		expect(noteGain(noteEvent(), TEST_GAINS, "current")).toBe(TEST_GAINS.normal);
		expect(noteGain(noteEvent({ link: { kind: "pull" } }), TEST_GAINS, "current")).toBe(TEST_GAINS.technique);
		expect(noteGain(noteEvent({ link: { kind: "pull" } }), TEST_GAINS, "dry")).toBe(TEST_GAINS.normal);
		expect(noteGain(noteEvent({ effects: { tap: true } }), TEST_GAINS, "current")).toBe(TEST_GAINS.tapping);
		expect(noteGain(noteEvent({ effects: { ghost: true, tap: true } }), TEST_GAINS, "current")).toBe(TEST_GAINS.ghost);
		expect(noteGain(noteEvent({ percussion: { kind: "slap", accent: true } }), TEST_GAINS, "current")).toBeCloseTo(TEST_GAINS.slap * TEST_GAINS.accentMultiplier);
		// An x is a slap on its string, hit or not: never the normal gain.
		expect(noteGain(noteEvent({ muted: true }), TEST_GAINS, "current")).toBe(TEST_GAINS.slap);
		expect(noteGain(noteEvent({ effects: { accent: true }, palmMute: true, rollGain: 0.5 }), TEST_GAINS, "current")).toBeCloseTo(
			TEST_GAINS.normal * TEST_GAINS.accentMultiplier * TEST_GAINS.palmMute * 0.5,
		);
	});

	it("a palm-muted note is quieter, duller and short, and never rings on", () => {
		const ctx = mockCtx(0);
		const deps = makeDeps(ctx, new Map(), { forceLetRing: true });
		scheduleFingerpickNote(deps, noteEvent({ palmMute: true, duration: 1, letRing: true }), 1);
		expect(ctx._gains[0].gain.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(TEST_GAINS.normal * TEST_GAINS.palmMute, 6), 1);
		expect(ctx._filters[0].frequency.value).toBe(900);
		const tc = ctx._gains[0].gain.setTargetAtTime.mock.calls[0][2] as number;
		expect(tc).toBeLessThanOrEqual(TEST_ENV.palmMuteDecayTc);
		// Not a letRing voice: its stop is the note's end, not the long lifetime.
		expect(ctx._sources[0].stop).toHaveBeenCalledWith(1 + 1 + TEST_ENV.sourceStopBuffer);
	});

	it("a palm-muted hammer-on takes the lower of the two cutoffs", () => {
		const ctx = mockCtx(0);
		scheduleFingerpickNote(makeDeps(ctx, new Map()), noteEvent({ palmMute: true, link: { kind: "hammer" } }), 1);
		expect(ctx.createBiquadFilter).toHaveBeenCalledTimes(1);
		expect(ctx._filters[0].frequency.value).toBe(900);
	});

	it("a slap is the string's own sample at the slap gain, cut off at the strike window, registering no voice", () => {
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();
		const resolve = vi.fn((midi: number) => ({ buffer: {} as AudioBuffer, playbackRate: rateFor(midi) }));
		scheduleFingerpickNote(makeDeps(ctx, voices, { resolveNoteData: resolve, forceLetRing: true }), noteEvent({ muted: true, percussion: { kind: "slap" }, duration: 0.5 }), 1);
		expect(resolve).toHaveBeenCalledWith(62);
		expect(ctx._gains[0].gain.setValueAtTime).toHaveBeenCalledWith(TEST_GAINS.slap, 1);
		expect(ctx._gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0, 1, DEFAULT_SLAP_PARAMS.strikeTc);
		// Even under let-ring, the strike ends at the window: no ring, no voice to slide from.
		expect(ctx._sources[0].stop).toHaveBeenCalledWith(expect.closeTo(1 + DEFAULT_SLAP_PARAMS.strikeS + TEST_ENV.sourceStopBuffer, 9));
		expect(voices.size).toBe(0);
		// An x alone (no hit) is the same strike.
		const x = mockCtx(0);
		scheduleFingerpickNote(makeDeps(x, new Map()), noteEvent({ muted: true, duration: 0.5 }), 1);
		expect(x._gains[0].gain.setValueAtTime).toHaveBeenCalledWith(TEST_GAINS.slap, 1);
		expect(x._sources[0].stop).toHaveBeenCalledWith(expect.closeTo(1 + DEFAULT_SLAP_PARAMS.strikeS + TEST_ENV.sourceStopBuffer, 9));
		// The lab's parameters take over the window.
		const lab = mockCtx(0);
		scheduleFingerpickNote(makeDeps(lab, new Map(), { slapParams: { ...DEFAULT_SLAP_PARAMS, strikeS: 0.1, strikeTc: 0.03 } }), noteEvent({ muted: true, duration: 0.5 }), 1);
		expect(lab._gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0, 1, 0.03);
		expect(lab._sources[0].stop).toHaveBeenCalledWith(expect.closeTo(1.1 + TEST_ENV.sourceStopBuffer, 9));
	});

	it("a slap's landing is a clack of noise on the frets and a thud under it, the thud mostly on the bass strings, registering no voice", () => {
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();
		scheduleFingerpickNote(makeDeps(ctx, voices), noteEvent({ muted: true, slapNoise: true, slapStrings: [5] }), 1);
		const p = DEFAULT_SLAP_PARAMS;
		// Two noise sources and the sine; no sample.
		expect(ctx._sources).toHaveLength(2);
		expect(ctx._oscillators).toHaveLength(1);
		expect(ctx._filters[0]).toMatchObject({ type: "bandpass" });
		expect(ctx._filters[0].frequency.value).toBe(p.clackHz);
		expect(ctx._gains[0].gain.setValueAtTime).toHaveBeenCalledWith(p.clackGain, 1);
		expect(ctx._gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0, 1, p.clackTc);
		expect(ctx._filters[1]).toMatchObject({ type: "lowpass" });
		expect(ctx._filters[1].frequency.value).toBe(p.thudHz);
		expect(ctx._gains[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(expect.closeTo(p.thudGain, 9), 1.002);
		expect(ctx._oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(p.thudToneFromHz, 1);
		expect(ctx._oscillators[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(p.thudToneToHz, expect.closeTo(1 + p.thudTc * 2, 9));
		expect(voices.size).toBe(0);
		// On the treble strings alone the thud is mostly gone; an accented hit is louder.
		const treble = mockCtx(0);
		scheduleFingerpickNote(makeDeps(treble, new Map()), noteEvent({ muted: true, slapNoise: true, slapStrings: [0, 1], percussion: { kind: "slap", accent: true } }), 1);
		expect(treble._gains[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(expect.closeTo(p.thudGain * p.trebleThud * TEST_GAINS.accentMultiplier, 9), 1.002);
		expect(treble._gains[0].gain.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(p.clackGain * TEST_GAINS.accentMultiplier, 9), 1);
		// Without a noise buffer the landing is silent, not an error.
		const silent = mockCtx(0);
		scheduleFingerpickNote(makeDeps(silent, new Map(), { noiseBuffer: null }), noteEvent({ muted: true, slapNoise: true, slapStrings: [5] }), 1);
		expect(silent._sources).toHaveLength(0);
	});

	it("a shift slide re-plucks even with a live origin voice", () => {
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();
		const origin = makeLiveVoice({ currentMidi: 60, stopTime: 100 });
		voices.set(2, origin as unknown as SlideActiveVoice);
		scheduleFingerpickNote(makeDeps(ctx, voices), noteEvent({ midi: 62, link: { kind: "slide", picked: true } }), 1);
		expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
		expect(origin.source.playbackRate.exponentialRampToValueAtTime).not.toHaveBeenCalled();
	});

	it("a bend and a vibrato on one note compose into one curve, the vibrato riding the bend's peak", () => {
		const ctx = mockCtx(0);
		scheduleFingerpickNote(makeDeps(ctx, new Map()), noteEvent({ effects: { bend: { semitones: 2 }, vibrato: {} }, duration: 1 }), 0);
		const src = ctx._sources[0];
		expect(src.detune.setValueCurveAtTime).toHaveBeenCalledTimes(1);
		const values = src.detune.setValueCurveAtTime.mock.calls[0][0] as Float32Array;
		let hi = -Infinity;
		for (const v of values) hi = Math.max(hi, v);
		expect(values[0]).toBe(0);
		expect(hi).toBeGreaterThan(200);
		expect(hi).toBeLessThanOrEqual(200 + DEFAULT_VIBRATO_PARAMS.depthCents + 1e-6);
	});

	it("a staccato effect shortens the note", () => {
		const ctx = mockCtx(0);
		scheduleFingerpickNote(makeDeps(ctx, new Map()), noteEvent({ effects: { staccato: true }, duration: 1 }), 0);
		expect(ctx._sources[0].stop).toHaveBeenCalledWith(0.2 + TEST_ENV.sourceStopBuffer);
	});
});

describe("fingerpickPatternToScheduleEvents — tremolo picking", () => {
	it("tremoloStrokes spaces the strokes evenly so they always add up to the slot", () => {
		const quarter = 0.5; // 120 BPM
		expect(tremoloStrokes(0.5, "16th", quarter)).toEqual([
			{ offset: 0, duration: 0.125 },
			{ offset: 0.125, duration: 0.125 },
			{ offset: 0.25, duration: 0.125 },
			{ offset: 0.375, duration: 0.125 },
		]);
		expect(tremoloStrokes(0.5, "8th", quarter)).toHaveLength(2);
		expect(tremoloStrokes(0.5, "32nd", quarter)).toHaveLength(8);
		// A dotted quarter at 16ths: six strokes, no spill.
		const dotted = tremoloStrokes(0.75, "16th", quarter);
		expect(dotted).toHaveLength(6);
		expect(dotted.reduce((sum, s) => sum + s.duration, 0)).toBeCloseTo(0.75);
		// A slot shorter than a stroke is one stroke the slot's length.
		expect(tremoloStrokes(0.05, "8th", quarter)).toEqual([{ offset: 0, duration: 0.05 }]);
	});

	it("a quarter at 120 BPM with a 16th tremolo emits four strokes, every second one softer", () => {
		const p = pattern(120, [slot("s1", "quarter", { 2: { fret: 7, effects: { tremolo: { speed: "16th" }, accent: true } } })]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(4);
		expect(events.map((e) => e.time)).toEqual([0, 0.125, 0.25, 0.375]);
		expect(events.every((e) => e.duration === 0.125 && e.midi === OPEN_STRING_MIDI[2] + 7)).toBe(true);
		expect(events.map((e) => e.altStroke === true)).toEqual([false, true, false, true]);
		// The tremolo itself is taken off the strokes; the other effects stay.
		expect(events.every((e) => e.effects?.tremolo === undefined && e.effects?.accent === true)).toBe(true);
		expect(events.every((e) => e.measureIndex === 0 && e.slotIndex === 0)).toBe(true);
	});

	it("a tie after a tremolo lengthens its last stroke only", () => {
		const p = pattern(120, [
			slot("s1", "quarter", { 2: { fret: 7, effects: { tremolo: { speed: "8th" } } } }),
			slot("s2", "quarter", { 2: { fret: 7, link: { kind: "tie" } } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events.map((e) => e.duration)).toEqual([0.25, 0.75]);
	});

	it("a plain tremolo stroke plays at the normal gain, an alternate one softer", () => {
		expect(noteGain(noteEvent({}), TEST_GAINS, "current")).toBe(TEST_GAINS.normal);
		expect(noteGain(noteEvent({ altStroke: true }), TEST_GAINS, "current")).toBeCloseTo(TEST_GAINS.normal * TEST_GAINS.tremoloAltGain);
	});
});

// ─── #332–#339: the rest of the registry ─────────────────────────────────────

describe("fingerpickPatternToScheduleEvents — trill, harmonic, slur, body tap", () => {
	it("a trill alternates the note with its upper neighbour at a hand's speed, the strokes hammered and pulled", () => {
		const p = pattern(60, [slot("s1", "quarter", { 2: { fret: 7, effects: { trill: {}, accent: true } } })]);
		const events = fingerpickPatternToScheduleEvents(p, 60);
		expect(events).toHaveLength(10);
		expect(events.map((e) => e.midi - OPEN_STRING_MIDI[2])).toEqual([7, 8, 7, 8, 7, 8, 7, 8, 7, 8]);
		expect(events.map((e) => e.link?.kind)).toEqual([undefined, "hammer", "pull", "hammer", "pull", "hammer", "pull", "hammer", "pull", "hammer"]);
		expect(events.every((e) => e.effects?.trill === undefined && e.effects?.accent === true && e.duration === 0.1)).toBe(true);
		expect(trillStrokes(0.25)).toHaveLength(3);
		const wide = fingerpickPatternToScheduleEvents(pattern(60, [slot("s1", "quarter", { 2: { fret: 7, effects: { trill: { fret: 9 } } } })]), 60);
		expect(wide[1].midi - OPEN_STRING_MIDI[2]).toBe(9);
	});

	it("a natural harmonic sounds the open string's partial; an artificial or pinch one the fretted note's", () => {
		const at = (effects: NonNullable<StringFret["effects"]>, fret = 12) =>
			fingerpickPatternToScheduleEvents(pattern(120, [slot("s1", "quarter", { 2: { fret, effects } })]), 120)[0].midi - OPEN_STRING_MIDI[2];
		expect(at({ harmonic: { type: "natural" } }, 12)).toBe(12);
		expect(at({ harmonic: { type: "natural" } }, 7)).toBe(19);
		expect(at({ harmonic: { type: "natural" } }, 5)).toBe(24);
		expect(at({ harmonic: { type: "natural" } }, 8)).toBe(12);
		expect(at({ harmonic: { type: "artificial", touchFret: 17 } }, 5)).toBe(5 + 12);
		expect(at({ harmonic: { type: "pinch" } }, 7)).toBe(7 + 12);
	});

	it("notes inside a slur after its first are marked slurred", () => {
		const p = {
			...pattern(120, [slot("a", "quarter", { 2: { fret: 5 } }), slot("b", "quarter", { 2: { fret: 7 } }), slot("c", "quarter", { 2: { fret: 8 } }), slot("d", "quarter", { 2: { fret: 7 } })]),
			schemaVersion: 2,
			spans: [{ id: "s", kind: "slur" as const, from: "a", to: "c" }],
		};
		expect(fingerpickPatternToScheduleEvents(p, 120).map((e) => e.slurred === true)).toEqual([false, true, true, false]);
	});
});

describe("scheduleFingerpickNote — the rest of the registry", () => {
	it("a harmonic is the sample at its partial, lighter, with a quiet octave under it and no filter", () => {
		const ctx = mockCtx(0);
		const resolve = vi.fn((midi: number) => ({ buffer: {} as AudioBuffer, playbackRate: rateFor(midi) }));
		scheduleFingerpickNote(makeDeps(ctx, new Map(), { resolveNoteData: resolve }), noteEvent({ midi: 74, effects: { harmonic: { type: "natural" } }, duration: 2 }), 1);
		expect(ctx._gains[0].gain.setValueAtTime).toHaveBeenCalledWith(TEST_GAINS.harmonic, 1);
		expect(ctx._filters).toHaveLength(0);
		expect(resolve).toHaveBeenCalledWith(62);
		expect(ctx._sources).toHaveLength(2);
		expect(ctx._sources[1].playbackRate.value).toBe(rateFor(62));
		expect(ctx._gains[1].gain.value).toBe(TEST_GAINS.harmonicBody);
		expect(ctx._sources[1].stop).toHaveBeenCalledWith(ctx._sources[0].stop.mock.calls[0][0]);
		expect(ctx._gains[0].gain.setTargetAtTime.mock.calls[0][2]).toBeLessThanOrEqual(TEST_ENV.harmonicDecayTc);
	});

	it("a tapped note starts past the pick transient, eases in, and takes the legato lowpass", () => {
		const ctx = mockCtx(0);
		scheduleFingerpickNote(makeDeps(ctx, new Map()), noteEvent({ effects: { tap: true } }), 1);
		expect(ctx._sources[0].start).toHaveBeenCalledWith(1, TAP_SKIP_S);
		expect(ctx._gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(TEST_GAINS.tapping, 1.005);
		expect(ctx._filters.map((f) => f.type)).toEqual(["lowpass"]);
	});

	it("a slide in ramps the rate up from two frets below; a slide out leaves at the note's end and fades", () => {
		const ctx = mockCtx(0);
		const deps = makeDeps(ctx, new Map());
		scheduleFingerpickNote(deps, noteEvent({ effects: { slideIn: { from: "below" } }, duration: 0.5, stringIndex: 0 }), 1);
		const inSrc = ctx._sources[0];
		const fromRate = rateFor(62) * Math.pow(2, -SLIDE_IN_OUT_SEMITONES / 12);
		expect(inSrc.playbackRate.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(fromRate, 9), 1);
		expect(inSrc.playbackRate.exponentialRampToValueAtTime).toHaveBeenCalledWith(rateFor(62), 1 + DEFAULT_SLIDE_PARAMS.rampDurationS);
		scheduleFingerpickNote(deps, noteEvent({ effects: { slideOut: { to: "above" } }, duration: 0.5, stringIndex: 1 }), 1);
		const outSrc = ctx._sources[1];
		const outStart = 1.5 - DEFAULT_SLIDE_PARAMS.rampDurationS;
		expect(outSrc.playbackRate.setValueAtTime).toHaveBeenCalledWith(rateFor(62), expect.closeTo(outStart, 9));
		expect(outSrc.playbackRate.exponentialRampToValueAtTime).toHaveBeenCalledWith(expect.closeTo(rateFor(62) * Math.pow(2, SLIDE_IN_OUT_SEMITONES / 12), 9), expect.closeTo(1.5, 9));
		const fade = ctx._gains[1].gain.setTargetAtTime.mock.calls.at(-1) as [number, number, number];
		expect(fade[1]).toBeCloseTo(outStart);
	});

	it("a whammy dive is a detune curve down a tone over three quarters of the note, back up by its end when released", () => {
		const ctx = mockCtx(0);
		scheduleFingerpickNote(makeDeps(ctx, new Map()), noteEvent({ effects: { whammy: { kind: "dive" } }, duration: 1 }), 0);
		const values = ctx._sources[0].detune.setValueCurveAtTime.mock.calls[0][0] as Float32Array;
		expect(values[0]).toBe(0);
		expect(values[Math.round(values.length * 0.375)]).toBeCloseTo(-100, 0);
		expect(values[Math.round(values.length * 0.75)]).toBeCloseTo(-200, 0);
		expect(values[values.length - 1]).toBe(-200);
		const released = mockCtx(0);
		scheduleFingerpickNote(makeDeps(released, new Map()), noteEvent({ effects: { whammy: { kind: "pull", semitones: 1, release: true } }, duration: 1 }), 0);
		const back = released._sources[0].detune.setValueCurveAtTime.mock.calls[0][0] as Float32Array;
		expect(Math.max(...back)).toBe(100);
		expect(back[back.length - 1]).toBe(0);
	});

	it("a slurred note plays legato: the technique gain through the lowpass", () => {
		const ctx = mockCtx(0);
		scheduleFingerpickNote(makeDeps(ctx, new Map()), noteEvent({ slurred: true }), 1);
		expect(ctx._gains[0].gain.setValueAtTime).toHaveBeenCalledWith(TEST_GAINS.technique, 1);
		expect(ctx._filters.map((f) => f.type)).toEqual(["lowpass"]);
		expect(noteGain(noteEvent({ slurred: true }), TEST_GAINS, "dry")).toBe(TEST_GAINS.normal);
	});

	it("a pick scrape is a noise sweep, no sample and no voice", () => {
		const ctx = mockCtx(0);
		const voices = new Map<number, SlideActiveVoice>();
		const resolve = vi.fn(() => ({ buffer: {} as AudioBuffer, playbackRate: 1 }));
		scheduleFingerpickNote(makeDeps(ctx, voices, { resolveNoteData: resolve }), noteEvent({ effects: { scrape: true }, duration: 0.5 }), 1);
		expect(resolve).not.toHaveBeenCalled();
		expect(ctx._sources).toHaveLength(1);
		expect(ctx._filters[0].type).toBe("bandpass");
		expect(ctx._filters[0].frequency.setValueAtTime).toHaveBeenCalledWith(3000, 1);
		expect(ctx._filters[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(400, 1.5);
		expect(ctx._gains[0].gain.setValueAtTime).toHaveBeenCalledWith(TEST_GAINS.scrape, 1);
		expect(voices.size).toBe(0);
	});

	it("a body tap is a low thump with a tone under it, louder when accented", () => {
		const ctx = mockCtx(0);
		scheduleFingerpickNote(makeDeps(ctx, new Map()), noteEvent({ muted: true, percussion: { kind: "bodyTap", accent: true } }), 1);
		expect(ctx._filters[0].type).toBe("lowpass");
		expect(ctx._filters[0].frequency.value).toBe(150);
		expect(ctx._oscillators).toHaveLength(1);
		expect(ctx._oscillators[0].frequency.value).toBe(80);
		expect(ctx._gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(expect.closeTo(TEST_GAINS.bodyTap * TEST_GAINS.accentMultiplier, 9), 1.002);
	});

	it("without a noise buffer a scrape and a body tap are silent, not errors", () => {
		const ctx = mockCtx(0);
		scheduleFingerpickNote(makeDeps(ctx, new Map(), { noiseBuffer: null }), noteEvent({ effects: { scrape: true } }), 1);
		expect(ctx._sources).toHaveLength(0);
	});

	it("noiseBufferFor makes one buffer per context", () => {
		const ctx = mockCtx(0) as unknown as AudioContext;
		expect(noiseBufferFor(ctx)).toBe(noiseBufferFor(ctx));
	});
});

describe("computeSlotStarts / slotAtTime", () => {
	// 4/4 at 60 bpm: a quarter is a second. Bar 1: a half, then two quarters; bar 2: four quarters.
	const pattern = makeDefaultPattern();
	pattern.bpm = 60;
	pattern.measures[0].slots = pattern.measures[0].slots.slice(0, 3).map((slot, i) => ({ ...slot, duration: i === 0 ? "half" : "quarter" }));
	pattern.measures.push({ ...makeDefaultPattern().measures[0], id: "m2" });
	const starts = computeSlotStarts(pattern, 60);

	it("starts every slot, empty ones too, at its place in time", () => {
		expect(starts.map((s) => [s.measureIndex, s.slotIndex, s.time])).toEqual([
			[0, 0, 0],
			[0, 1, 2],
			[0, 2, 3],
			[1, 0, 4],
			[1, 1, 5],
			[1, 2, 6],
			[1, 3, 7],
		]);
	});

	it("finds the slot sounding at a time, through slots with nothing struck", () => {
		expect(slotAtTime(starts, -0.1)).toBeNull();
		expect(slotAtTime(starts, 0)).toMatchObject({ measureIndex: 0, slotIndex: 0 });
		expect(slotAtTime(starts, 1.9)).toMatchObject({ measureIndex: 0, slotIndex: 0 });
		expect(slotAtTime(starts, 2.5)).toMatchObject({ measureIndex: 0, slotIndex: 1 });
		expect(slotAtTime(starts, 5.2)).toMatchObject({ measureIndex: 1, slotIndex: 1 });
		expect(slotAtTime(starts, 99)).toMatchObject({ measureIndex: 1, slotIndex: 3 });
	});
});
