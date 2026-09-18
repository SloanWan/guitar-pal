import { describe, expect, it } from "vitest";
import type { ChordProgression, StrumPattern } from "@/lib/strumPatterns";
import { readSharedItem, toSharePayload, type SharedStrum } from "@/lib/sharedItems";

const pattern: StrumPattern = {
	id: "owner-pattern-id",
	name: "Folk strum",
	beats: [
		["D", ""],
		["D", "U"],
		["", "U"],
		["D", "U"],
	],
	bpm: 96,
	meter: [4, 4],
	createdAt: "2026-01-01T00:00:00.000Z",
};

const progression: ChordProgression = {
	id: "owner-progression-id",
	patternId: "owner-pattern-id",
	bars: [
		{ beats: pattern.beats, chord: { root: "C", suffix: "major", voicingId: null } },
		{ beats: pattern.beats, chord: { root: "G", suffix: "major", voicingId: "v-open-g" } },
		{ beats: pattern.beats, chord: null, unknownChord: "Xm7b5" },
	],
	orderIndex: 3,
	name: "  Verse  ",
	bpm: 88,
	capo: 2,
	syncedBeats: pattern.beats,
	followsPattern: false,
	syncNoticeDismissed: true,
};

function roundTrip(item: SharedStrum, rowId = "abcDEF0123") {
	const stored = JSON.parse(JSON.stringify(toSharePayload(item))) as unknown;
	return readSharedItem({ id: rowId, kind: "strum", payload: stored });
}

describe("strum share payload", () => {
	it("keeps the rhythm, tempo and meter, and drops the sharer's identity and stamp", () => {
		const payload = toSharePayload({ kind: "strum", pattern, progression: null });
		expect(payload).toEqual({
			pattern: { name: "Folk strum", beats: pattern.beats, bpm: 96, meter: [4, 4] },
		});
	});

	it("keeps the progression's bars, name, tempo and capo, and nothing about its place in a library", () => {
		const payload = toSharePayload({ kind: "strum", pattern, progression });
		expect(payload.progression).toEqual({
			bars: progression.bars,
			name: "Verse",
			bpm: 88,
			capo: 2,
		});
	});

	it("omits a progression's optional fields when they say nothing", () => {
		const bare: ChordProgression = { id: "p", patternId: "x", bars: progression.bars, orderIndex: 0, name: " ", capo: 0 };
		const payload = toSharePayload({ kind: "strum", pattern, progression: bare });
		expect(payload.progression).toEqual({ bars: progression.bars });
	});
});

describe("readSharedItem (strum)", () => {
	it("round-trips a pattern alone, under the row id", () => {
		const item = roundTrip({ kind: "strum", pattern, progression: null });
		expect(item?.kind).toBe("strum");
		if (item?.kind !== "strum") return;
		expect(item.pattern).toEqual({ id: "abcDEF0123", name: "Folk strum", beats: pattern.beats, bpm: 96, meter: [4, 4] });
		expect(item.progression).toBeNull();
	});

	it("round-trips the progression as a pair with the pattern, reconciled to it", () => {
		const item = roundTrip({ kind: "strum", pattern, progression });
		if (item?.kind !== "strum") throw new Error("expected a strum share");
		expect(item.progression).toEqual({
			id: "abcDEF0123-progression",
			patternId: "abcDEF0123",
			bars: progression.bars,
			orderIndex: 0,
			name: "Verse",
			bpm: 88,
			capo: 2,
			syncedBeats: pattern.beats,
		});
		expect(item.progression?.followsPattern).toBeUndefined();
		expect(item.progression?.syncNoticeDismissed).toBeUndefined();
	});

	it("falls back to a name, a tempo and 4/4 when the pattern carries junk for them", () => {
		const item = readSharedItem({
			id: "abcDEF0123",
			kind: "strum",
			payload: { pattern: { name: "  ", beats: pattern.beats, bpm: "fast", meter: [7, 8] } },
		});
		if (item?.kind !== "strum") throw new Error("expected a strum share");
		expect(item.pattern.name).toBe("Shared pattern");
		expect(item.pattern.bpm).toBe(80);
		expect(item.pattern.meter).toEqual([4, 4]);
	});

	it("rejects a payload whose pattern does not read", () => {
		expect(readSharedItem({ id: "abcDEF0123", kind: "strum", payload: null })).toBeNull();
		expect(readSharedItem({ id: "abcDEF0123", kind: "strum", payload: {} })).toBeNull();
		expect(readSharedItem({ id: "abcDEF0123", kind: "strum", payload: { pattern: { beats: [] } } })).toBeNull();
		expect(readSharedItem({ id: "abcDEF0123", kind: "strum", payload: { pattern: { beats: [["D", "", "", "", ""]] } } })).toBeNull();
	});

	it("rejects the whole share when its progression does not read", () => {
		const good = { name: "x", beats: pattern.beats };
		expect(readSharedItem({ id: "abcDEF0123", kind: "strum", payload: { pattern: good, progression: "C G" } })).toBeNull();
		expect(readSharedItem({ id: "abcDEF0123", kind: "strum", payload: { pattern: good, progression: { bars: [] } } })).toBeNull();
		expect(
			readSharedItem({ id: "abcDEF0123", kind: "strum", payload: { pattern: good, progression: { bars: [{ beats: pattern.beats, chord: { root: "" } }] } } }),
		).toBeNull();
	});
});
