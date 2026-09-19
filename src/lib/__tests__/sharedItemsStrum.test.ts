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

const second: ChordProgression = {
	id: "owner-progression-2",
	patternId: "owner-pattern-id",
	bars: [{ beats: pattern.beats, chord: { root: "D", suffix: "minor", voicingId: null } }],
	orderIndex: 4,
	name: "Chorus",
};

describe("strum share payload", () => {
	it("keeps the rhythm, tempo and meter, and drops the sharer's identity and stamp", () => {
		const payload = toSharePayload({ kind: "strum", pattern, progressions: [], openIndex: 0 });
		expect(payload).toEqual({
			pattern: { name: "Folk strum", beats: pattern.beats, bpm: 96, meter: [4, 4] },
		});
	});

	it("keeps each progression's bars, name, tempo and capo, and nothing about its place in a library", () => {
		const payload = toSharePayload({ kind: "strum", pattern, progressions: [progression], openIndex: 0 });
		expect(payload.progressions).toEqual([
			{
				bars: progression.bars,
				name: "Verse",
				bpm: 88,
				capo: 2,
			},
		]);
		expect(payload).not.toHaveProperty("open");
	});

	it("omits a progression's optional fields when they say nothing", () => {
		const bare: ChordProgression = { id: "p", patternId: "x", bars: progression.bars, orderIndex: 0, name: " ", capo: 0 };
		const payload = toSharePayload({ kind: "strum", pattern, progressions: [bare], openIndex: 0 });
		expect(payload.progressions).toEqual([{ bars: progression.bars }]);
	});

	it("records which progression opens, only when it is not the first", () => {
		const payload = toSharePayload({ kind: "strum", pattern, progressions: [progression, second], openIndex: 1 });
		expect(payload.open).toBe(1);
		expect(toSharePayload({ kind: "strum", pattern, progressions: [progression, second], openIndex: 7 })).not.toHaveProperty("open");
	});
});

describe("readSharedItem (strum)", () => {
	it("round-trips a pattern alone, under the row id", () => {
		const item = roundTrip({ kind: "strum", pattern, progressions: [], openIndex: 0 });
		expect(item?.kind).toBe("strum");
		if (item?.kind !== "strum") return;
		expect(item.pattern).toEqual({ id: "abcDEF0123", name: "Folk strum", beats: pattern.beats, bpm: 96, meter: [4, 4] });
		expect(item.progressions).toEqual([]);
		expect(item.openIndex).toBe(0);
	});

	it("round-trips the progressions as a set with the pattern, reconciled to it, opening where the sharer was", () => {
		const item = roundTrip({ kind: "strum", pattern, progressions: [progression, second], openIndex: 1 });
		if (item?.kind !== "strum") throw new Error("expected a strum share");
		expect(item.progressions).toEqual([
			{
				id: "abcDEF0123-progression-0",
				patternId: "abcDEF0123",
				bars: progression.bars,
				orderIndex: 0,
				name: "Verse",
				bpm: 88,
				capo: 2,
				syncedBeats: pattern.beats,
			},
			{
				id: "abcDEF0123-progression-1",
				patternId: "abcDEF0123",
				bars: second.bars,
				orderIndex: 1,
				name: "Chorus",
				syncedBeats: pattern.beats,
			},
		]);
		expect(item.openIndex).toBe(1);
		expect(item.progressions[0].followsPattern).toBeUndefined();
		expect(item.progressions[0].syncNoticeDismissed).toBeUndefined();
	});

	it("opens on the first progression when the recorded index is missing or out of range", () => {
		const good = { name: "x", beats: pattern.beats };
		const one = { bars: progression.bars };
		const read = (open: unknown) =>
			readSharedItem({ id: "abcDEF0123", kind: "strum", payload: { pattern: good, progressions: [one, one], open } });
		expect(read(undefined)?.kind === "strum" && read(undefined)?.openIndex).toBe(0);
		expect(read(5)?.kind === "strum" && read(5)?.openIndex).toBe(0);
		expect(read("1")?.kind === "strum" && read("1")?.openIndex).toBe(0);
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

	it("rejects the whole share when any progression does not read", () => {
		const good = { name: "x", beats: pattern.beats };
		const one = { bars: progression.bars };
		expect(readSharedItem({ id: "abcDEF0123", kind: "strum", payload: { pattern: good, progressions: "C G" } })).toBeNull();
		expect(readSharedItem({ id: "abcDEF0123", kind: "strum", payload: { pattern: good, progressions: [] } })).toBeNull();
		expect(readSharedItem({ id: "abcDEF0123", kind: "strum", payload: { pattern: good, progressions: [one, { bars: [] }] } })).toBeNull();
		expect(
			readSharedItem({ id: "abcDEF0123", kind: "strum", payload: { pattern: good, progressions: [{ bars: [{ beats: pattern.beats, chord: { root: "" } }] }] } }),
		).toBeNull();
	});
});
