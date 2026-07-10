import { describe, it, expect, vi, beforeEach } from "vitest";

import {
	fingerpickPatternToScheduleEvents,
	getTotalPatternDuration,
	computeLoopOffset,
	getProgressAtTime,
	findSlotStartTime,
	stealVoice,
	_shutdownEngine,
	OPEN_STRING_MIDI,
	VOICE_STEAL_FADE_TAU,
	VOICE_STEAL_STOP_BUFFER,
} from "@/lib/fingerpickScheduler";
import type { FingerpickPattern, BeatSlot, StringFret, Duration } from "@/lib/fingerpickTypes";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function strings6(
	overrides: Record<number, Partial<StringFret>> = {},
): [StringFret, StringFret, StringFret, StringFret, StringFret, StringFret] {
	const make = (i: number): StringFret => ({
		fret: null,
		technique: null,
		tied: false,
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
			slot("s2", "rest"), // no strings active, duration = quarter = 0.5 s
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

describe("fingerpickPatternToScheduleEvents — tied / silent strings", () => {
	it("tied string produces no event (sustain — no re-attack)", () => {
		const p = pattern(120, [
			slot("s1", "quarter", { 0: { fret: 5 } }),
			slot("s2", "quarter", { 0: { fret: 5, tied: true } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		// Only one event: the initial pluck; the tied slot produces nothing.
		expect(events).toHaveLength(1);
		expect(events[0].time).toBeCloseTo(0);
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
			slot("s2", "quarter", { 0: { fret: 2, technique: "hammer-on" } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events[1].technique).toBe("hammer-on");
	});

	it("slide-down destination emits its own event with technique='slide-down'", () => {
		// Destination model: technique on the note you arrive at (s2), not the source (s1).
		// Both source and destination emit separate events; audio plays as normal pluck.
		const p = pattern(120, [
			slot("s1", "quarter", { 3: { fret: 7 } }),
			slot("s2", "quarter", { 3: { fret: 5, technique: "slide-down" } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(2);
		expect(events[0].stringIndex).toBe(3);
		expect(events[0].midi).toBe(OPEN_STRING_MIDI[3] + 7); // source pitch
		expect(events[0].technique).toBeNull();
		expect(events[1].midi).toBe(OPEN_STRING_MIDI[3] + 5); // destination pitch
		expect(events[1].technique).toBe("slide-down");
	});
});

describe("fingerpickPatternToScheduleEvents — slide destinations", () => {
	it("slide-up destination emits its own event with technique='slide-up'", () => {
		const p = pattern(120, [
			slot("s1", "quarter", { 0: { fret: 5 } }),
			slot("s2", "quarter", { 0: { fret: 7, technique: "slide-up" } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(2);
		expect(events[0].midi).toBe(OPEN_STRING_MIDI[0] + 5);
		expect(events[0].technique).toBeNull();
		expect(events[1].midi).toBe(OPEN_STRING_MIDI[0] + 7);
		expect(events[1].technique).toBe("slide-up");
	});

	it("chained slides (5→9→5): all three slots emit separate events", () => {
		const p = pattern(120, [
			slot("s1", "eighth", { 1: { fret: 5 } }),
			slot("s2", "eighth", { 1: { fret: 9, technique: "slide-up" } }),
			slot("s3", "half",   { 1: { fret: 5, technique: "slide-down" } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(3);
		expect(events[0].midi).toBe(OPEN_STRING_MIDI[1] + 5);
		expect(events[1].midi).toBe(OPEN_STRING_MIDI[1] + 9);
		expect(events[1].technique).toBe("slide-up");
		expect(events[2].midi).toBe(OPEN_STRING_MIDI[1] + 5);
		expect(events[2].technique).toBe("slide-down");
	});

	it("slide destination followed by a normal note: all three slots emit events", () => {
		const p = pattern(120, [
			slot("s1", "quarter", { 2: { fret: 3 } }),
			slot("s2", "quarter", { 2: { fret: 7, technique: "slide-up" } }),
			slot("s3", "quarter", { 2: { fret: 5 } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(3);
		expect(events[0].midi).toBe(OPEN_STRING_MIDI[2] + 3);
		expect(events[1].midi).toBe(OPEN_STRING_MIDI[2] + 7);
		expect(events[1].technique).toBe("slide-up");
		expect(events[2].midi).toBe(OPEN_STRING_MIDI[2] + 5);
		expect(events[2].technique).toBeNull();
	});

	it("slide destination on str0 does not suppress str3 events in the same slot", () => {
		const p = pattern(120, [
			slot("s1", "quarter", { 0: { fret: 5 }, 3: { fret: 2 } }),
			slot("s2", "quarter", { 0: { fret: 9, technique: "slide-up" }, 3: { fret: 4 } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		// str0 s1, str3 s1, str0 s2, str3 s2 = 4 events
		expect(events).toHaveLength(4);
		const str0Events = events.filter((e) => e.stringIndex === 0);
		const str3Events = events.filter((e) => e.stringIndex === 3);
		expect(str0Events).toHaveLength(2);
		expect(str0Events[1].technique).toBe("slide-up");
		expect(str3Events).toHaveLength(2);
	});

	it("slide destination across a measure boundary emits its own event in the correct measure", () => {
		const p = multiMeasurePattern(120, [
			[slot("s1", "quarter", { 4: { fret: 0 } })],
			[slot("s2", "quarter", { 4: { fret: 5, technique: "slide-up" } })],
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(2);
		expect(events[0].measureIndex).toBe(0);
		expect(events[1].measureIndex).toBe(1);
		expect(events[1].midi).toBe(OPEN_STRING_MIDI[4] + 5);
		expect(events[1].technique).toBe("slide-up");
	});

	it("a note without slide technique emits normally with no slideChain field", () => {
		const p = pattern(120, [slot("s1", "quarter", { 0: { fret: 5 } })]);
		const [ev] = fingerpickPatternToScheduleEvents(p, 120);
		expect(ev.technique).toBeNull();
		expect((ev as Record<string, unknown>)["slideChain"]).toBeUndefined();
	});

	it("each slide destination event has the correct duration at 120 BPM", () => {
		// eighth(0.25s) → quarter(0.5s) → half(1.0s)
		const p = pattern(120, [
			slot("s1", "eighth",  { 0: { fret: 5 } }),
			slot("s2", "quarter", { 0: { fret: 7, technique: "slide-up" } }),
			slot("s3", "half",    { 0: { fret: 9, technique: "slide-up" } }),
		]);
		const events = fingerpickPatternToScheduleEvents(p, 120);
		expect(events).toHaveLength(3);
		expect(events[0].duration).toBeCloseTo(0.25); // eighth at 120 BPM
		expect(events[1].duration).toBeCloseTo(0.5);  // quarter at 120 BPM
		expect(events[2].duration).toBeCloseTo(1.0);  // half at 120 BPM
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
		const p = pattern(120, [slot("s1", "quarter", { 0: { fret: 0 } }), slot("s2", "rest")]);
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
