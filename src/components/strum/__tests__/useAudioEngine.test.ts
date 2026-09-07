import { describe, it, expect } from "vitest";
import {
	_resolveStrumBuffer,
	_flattenBars,
	_pitchesForBar,
	type BarPitches,
} from "@/components/strum/useAudioEngine";
import type { Bar } from "@/lib/strumPatterns";

function makeFakeBuffer(): AudioBuffer {
	return {} as AudioBuffer;
}

describe("_resolveStrumBuffer — step-to-buffer resolution and pending-sample fallback", () => {
	const downBuf = makeFakeBuffer();
	const upBuf = makeFakeBuffer();
	const mutedBuf = makeFakeBuffer();
	const fullBuffers = { down: downBuf, up: upBuf, muted: mutedBuf };

	it("D maps to the down AudioBuffer", () => {
		expect(_resolveStrumBuffer("D", fullBuffers)).toBe(downBuf);
	});

	it("D3 maps to the down AudioBuffer", () => {
		expect(_resolveStrumBuffer("D3", fullBuffers)).toBe(downBuf);
	});

	it("U maps to the up AudioBuffer", () => {
		expect(_resolveStrumBuffer("U", fullBuffers)).toBe(upBuf);
	});

	it("U3 maps to the up AudioBuffer", () => {
		expect(_resolveStrumBuffer("U3", fullBuffers)).toBe(upBuf);
	});

	it("X maps to the muted AudioBuffer", () => {
		expect(_resolveStrumBuffer("X", fullBuffers)).toBe(mutedBuf);
	});

	it("DG returns null (ghost strum — silent)", () => {
		expect(_resolveStrumBuffer("DG", fullBuffers)).toBeNull();
	});

	it("UG returns null (ghost strum — silent)", () => {
		expect(_resolveStrumBuffer("UG", fullBuffers)).toBeNull();
	});

	it('empty string returns null (rest — silent)', () => {
		expect(_resolveStrumBuffer("", fullBuffers)).toBeNull();
	});

	it("returns null for any active step when no buffers have loaded yet (pending-sample fallback)", () => {
		expect(_resolveStrumBuffer("D", {})).toBeNull();
		expect(_resolveStrumBuffer("U", {})).toBeNull();
		expect(_resolveStrumBuffer("X", {})).toBeNull();
	});

	it("returns null for a step whose buffer has not loaded even when other types are ready", () => {
		expect(_resolveStrumBuffer("U", { down: downBuf })).toBeNull();
		expect(_resolveStrumBuffer("X", { down: downBuf, up: upBuf })).toBeNull();
	});
});

// ─── Multi-bar scheduling (#134) ─────────────────────────────────────────────

const FOUR_BEATS: Bar["beats"] = [
	["D", "UG"],
	["D", "U"],
	["DG", "U"],
	["D", "UG"],
];

function bar(beats: Bar["beats"], root?: string): Bar {
	return { beats, chord: root ? { root, suffix: "major" } : null };
}

describe("_flattenBars — bar boundaries come from the bars, not a hardcoded 4", () => {
	it("a single bar flattens to its own beats, all in bar 0", () => {
		const flat = _flattenBars([bar(FOUR_BEATS)]);
		expect(flat.beats).toEqual(FOUR_BEATS);
		expect(flat.barIndexOfBeat).toEqual([0, 0, 0, 0]);
	});

	it("maps each flat beat index to the bar it belongs to", () => {
		const flat = _flattenBars([bar(FOUR_BEATS, "C"), bar(FOUR_BEATS, "G")]);
		expect(flat.beats).toHaveLength(8);
		expect(flat.barIndexOfBeat).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
	});

	it("handles bars of unequal length", () => {
		const flat = _flattenBars([
			bar(FOUR_BEATS.slice(0, 3), "C"),
			bar(FOUR_BEATS, "G"),
			bar(FOUR_BEATS.slice(0, 2), "F"),
		]);
		expect(flat.beats).toHaveLength(9);
		expect(flat.barIndexOfBeat).toEqual([0, 0, 0, 1, 1, 1, 1, 2, 2]);
	});

	it("flags the first beat of every bar as a bar head — accent fires there", () => {
		const flat = _flattenBars([bar(FOUR_BEATS, "C"), bar(FOUR_BEATS, "G")]);
		expect(flat.barHeadFlags).toEqual([
			true, false, false, false,
			true, false, false, false,
		]);
	});

	it("a single-bar pattern accents only beat 0, exactly as before", () => {
		const flat = _flattenBars([bar(FOUR_BEATS)]);
		expect(flat.barHeadFlags).toEqual([true, false, false, false]);
	});

	it("skips empty bars rather than emitting a phantom beat", () => {
		const flat = _flattenBars([bar(FOUR_BEATS, "C"), bar([], "G"), bar(FOUR_BEATS, "F")]);
		expect(flat.beats).toHaveLength(8);
		expect(flat.barIndexOfBeat).toEqual([0, 0, 0, 0, 2, 2, 2, 2]);
	});

	it("empty bars produce an empty sequence the scheduler can bail out on", () => {
		expect(_flattenBars([]).beats).toHaveLength(0);
		expect(_flattenBars([bar([])]).beats).toHaveLength(0);
	});
});

describe("playOnce end position — the wrap point is the end of the LAST bar", () => {
	// playOnce stops when the flat beat index wraps back to 0, so the total flat
	// length is what decides where a single pass ends.
	it("a 4-bar pattern wraps after 16 beats, not after the first bar", () => {
		const bars = [
			bar(FOUR_BEATS, "C"),
			bar(FOUR_BEATS, "G"),
			bar(FOUR_BEATS, "A"),
			bar(FOUR_BEATS, "F"),
		];
		const flat = _flattenBars(bars);
		expect(flat.beats).toHaveLength(16);

		const wrapIndexes: number[] = [];
		for (let i = 0, idx = 0; i < flat.beats.length; i++) {
			idx = (idx + 1) % flat.beats.length;
			if (idx === 0) wrapIndexes.push(i);
		}
		expect(wrapIndexes).toEqual([15]);
		expect(flat.barIndexOfBeat[15]).toBe(3);
	});

	it("a single-bar pattern still wraps after its own last beat", () => {
		expect(_flattenBars([bar(FOUR_BEATS)]).beats).toHaveLength(4);
	});
});

describe("_pitchesForBar — bar index to chord pitches", () => {
	const C = [48, 52, 55, 60, 64];
	const G = [43, 47, 50, 55, 59, 67];
	const table: BarPitches = [C, null, G];

	it("selects the pitches of the sounding bar", () => {
		expect(_pitchesForBar(table, 0)).toEqual(C);
		expect(_pitchesForBar(table, 2)).toEqual(G);
	});

	it("returns undefined for a bar with no chord, so the default voicing plays", () => {
		expect(_pitchesForBar(table, 1)).toBeUndefined();
	});

	it("keeps a silent bar's empty table distinct from undefined", () => {
		// The distinction playStrum acts on: undefined means "no chord picked, play
		// the default voicing", an empty array means "sound nothing at all".
		expect(_pitchesForBar([C, [], null], 1)).toEqual([]);
		expect(_pitchesForBar([C, [], null], 2)).toBeUndefined();
	});

	it("returns undefined when no chord table was supplied at all", () => {
		expect(_pitchesForBar(undefined, 0)).toBeUndefined();
	});

	it("returns undefined for a bar index past the end of the table", () => {
		expect(_pitchesForBar(table, 7)).toBeUndefined();
	});

	it("a one-element table reproduces the old single-chord behaviour", () => {
		expect(_pitchesForBar([C], 0)).toEqual(C);
	});
});
