import { describe, expect, it } from "vitest";
import { parseRecentChords, pushRecentChord, RECENT_CHORDS_LIMIT } from "../recentChords";

const am = { root: "A", suffix: "minor", voicingId: null };
const c = { root: "C", suffix: "major", voicingId: null };

describe("pushRecentChord", () => {
	it("puts the chord first and drops its older entry, whatever shape that was pinned to", () => {
		const list = [c, { root: "A", suffix: "minor", voicingId: "v2" }];
		expect(pushRecentChord(list, am)).toEqual([am, c]);
	});

	it("keeps at most the limit", () => {
		const many = Array.from({ length: RECENT_CHORDS_LIMIT }, (_, i) => ({ root: "C", suffix: `s${i}`, voicingId: null }));
		const next = pushRecentChord(many, am);
		expect(next).toHaveLength(RECENT_CHORDS_LIMIT);
		expect(next[0]).toEqual(am);
		expect(next.at(-1)?.suffix).toBe(`s${RECENT_CHORDS_LIMIT - 2}`);
	});

	it("stores a missing voicing as null", () => {
		expect(pushRecentChord([], { root: "G", suffix: "major" })).toEqual([{ root: "G", suffix: "major", voicingId: null }]);
	});
});

describe("parseRecentChords", () => {
	it("reads back what was stored", () => {
		const list = [am, { root: "D", suffix: "7", voicingId: "u1" }];
		expect(parseRecentChords(JSON.stringify(list))).toEqual(list);
	});

	it("leaves out malformed entries", () => {
		expect(parseRecentChords(JSON.stringify([am, { root: 3 }, null, "C", { root: "", suffix: "x" }]))).toEqual([am]);
	});

	it("is null for something that is not a list", () => {
		expect(parseRecentChords("{")).toBeNull();
		expect(parseRecentChords(JSON.stringify({ root: "A" }))).toBeNull();
	});
});
