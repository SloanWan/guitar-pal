import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChordProgression, StrumPattern } from "@/lib/strumPatterns";
import {
	importStrumPattern,
	patternColumns,
	progressionColumns,
	readStoredProgressions,
	STRUM_PATTERNS_STORAGE_KEY,
	STRUM_PROGRESSIONS_STORAGE_KEY,
} from "@/lib/strumStorage";

const beats: StrumPattern["beats"] = [
	["D", ""],
	["D", "U"],
	["", "U"],
	["D", "U"],
];
const pattern: StrumPattern = { id: "p1", name: "Folk", beats, bpm: 96, meter: [4, 4] };
const progression: ChordProgression = {
	id: "pr1",
	patternId: "p1",
	bars: [{ beats, chord: { root: "C", suffix: "major", voicingId: null } }],
	orderIndex: 0,
	name: "Verse",
	capo: 2,
};
// The guest path never touches the client; a throwing stand-in proves it.
const noClient = new Proxy({}, { get: () => { throw new Error("no database for a guest"); } }) as SupabaseClient;

describe("patternColumns / progressionColumns", () => {
	it("writes the bar twice (beats and the mirrored bars column) with tempo and meter filled in", () => {
		expect(patternColumns({ id: "x", name: "n", beats })).toEqual({
			name: "n",
			beats,
			bars: [{ beats, chord: null }],
			bpm: 80,
			meter: [4, 4],
		});
	});

	it("maps a progression to its row, nulling what it does not carry", () => {
		expect(progressionColumns(progression, "user-1")).toEqual({
			id: "pr1",
			user_id: "user-1",
			pattern_id: "p1",
			bars: progression.bars,
			order_index: 0,
			name: "Verse",
			bpm: null,
			capo: 2,
			synced_beats: null,
			follows_pattern: null,
			sync_notice_dismissed: null,
		});
	});
});

describe("importStrumPattern as a guest", () => {
	beforeEach(() => localStorage.clear());

	it("stamps the pattern, lists it newest first, and files the progressions", async () => {
		localStorage.setItem(
			STRUM_PATTERNS_STORAGE_KEY,
			JSON.stringify([{ id: "old", name: "Old", beats, createdAt: "2020-01-01T00:00:00.000Z" }]),
		);
		await importStrumPattern(noClient, null, pattern, [progression, { ...progression, id: "pr2", name: "Chorus", orderIndex: 1 }]);

		const stored = JSON.parse(localStorage.getItem(STRUM_PATTERNS_STORAGE_KEY)!) as StrumPattern[];
		expect(stored.map((p) => p.id)).toEqual(["p1", "old"]);
		expect(typeof stored[0].createdAt).toBe("string");
		expect(readStoredProgressions().map((p) => p.id)).toEqual(["pr1", "pr2"]);
	});

	it("leaves the progressions alone when there is none to import", async () => {
		await importStrumPattern(noClient, null, pattern, []);
		expect(localStorage.getItem(STRUM_PROGRESSIONS_STORAGE_KEY)).toBeNull();
	});

	it("starts a fresh list over unreadable storage rather than losing the import", async () => {
		localStorage.setItem(STRUM_PATTERNS_STORAGE_KEY, "{not json");
		await importStrumPattern(noClient, null, pattern, []);
		const stored = JSON.parse(localStorage.getItem(STRUM_PATTERNS_STORAGE_KEY)!) as StrumPattern[];
		expect(stored.map((p) => p.id)).toEqual(["p1"]);
	});
});
