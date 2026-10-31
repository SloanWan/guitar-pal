import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChordProgression, StrumPattern } from "@/lib/strumPatterns";
import {
	GUEST_RHYTHM_LIFT_KEY,
	importStrumPattern,
	liftDivergedProgressions,
	migrateGuestStrumStorage,
	patternColumns,
	patternFromRow,
	progressionColumns,
	readStoredProgressions,
	STRUM_PATTERNS_STORAGE_KEY,
	STRUM_PROGRESSIONS_STORAGE_KEY,
} from "@/lib/strumStorage";
import { patternRhythm } from "@/lib/strumRhythm";

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

	it("writes a longer rhythm whole into bars, its first bar into beats", () => {
		const second: StrumPattern["beats"] = [["D", ""], ["", ""], ["D", "U"], ["D", ""]];
		const columns = patternColumns({ id: "x", name: "n", beats, extraBars: [second] });
		expect(columns.beats).toEqual(beats);
		expect(columns.bars).toEqual([
			{ beats, chord: null },
			{ beats: second, chord: null },
		]);
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
		});
	});
});

describe("patternFromRow", () => {
	const second: StrumPattern["beats"] = [["X", "X"], ["D", ""], ["D", ""], ["D", ""]];

	it("reads the further bars of a rhythm out of the bars column", () => {
		const read = patternFromRow({
			pattern_id: "p",
			name: "Two",
			beats,
			bars: [
				{ beats, chord: null },
				{ beats: second, chord: null },
			],
		});
		expect(patternRhythm(read)).toEqual([beats, second]);
	});

	it("reads a single-bar row as one bar, with no extraBars at all", () => {
		const read = patternFromRow({ pattern_id: "p", name: "One", beats, bars: [{ beats, chord: null }] });
		expect(read.extraBars).toBeUndefined();
		expect(patternFromRow({ pattern_id: "p", name: "Legacy", beats }).extraBars).toBeUndefined();
	});

	it("does not trust a bars column left over from the chord-carrying era", () => {
		const chorded = patternFromRow({
			pattern_id: "p",
			name: "Old",
			beats,
			bars: [
				{ beats, chord: { root: "C", suffix: "major" } },
				{ beats: second, chord: null },
			],
		});
		expect(chorded.extraBars).toBeUndefined();
		const drifted = patternFromRow({
			pattern_id: "p",
			name: "Old",
			beats,
			bars: [
				{ beats: second, chord: null },
				{ beats, chord: null },
			],
		});
		expect(drifted.extraBars).toBeUndefined();
	});
});

describe("liftDivergedProgressions", () => {
	const own: StrumPattern["beats"] = [["D", "U"], ["D", "U"], ["D", "U"], ["D", "U"]];
	let n = 0;
	const newId = () => `lifted-${++n}`;
	beforeEach(() => {
		n = 0;
	});

	it("leaves a sequence that still plays its pattern's rhythm where it is", () => {
		expect(liftDivergedProgressions([pattern], [progression], newId)).toEqual({ patterns: [], progressions: [] });
	});

	it("gives a sequence with a rhythm of its own that rhythm as a new pattern, and moves it there", () => {
		const diverged: ChordProgression = {
			...progression,
			bars: [
				{ beats: own, chord: { root: "C", suffix: "major" } },
				{ beats: own, chord: { root: "G", suffix: "major" } },
			],
		};
		const lift = liftDivergedProgressions([pattern], [diverged], newId);
		expect(lift.patterns).toHaveLength(1);
		const made = lift.patterns[0];
		expect(made.id).toBe("lifted-1");
		expect(made.name).toBe("Folk · Verse");
		// The shortest rhythm the bars repeat: both bars were the same.
		expect(patternRhythm(made)).toEqual([own]);
		expect(made.bpm).toBe(96);
		expect(lift.progressions).toEqual([{ ...diverged, patternId: "lifted-1" }]);
	});

	it("keeps a rhythm that changes bar to bar as a multi-bar pattern", () => {
		const diverged: ChordProgression = {
			...progression,
			name: "",
			bars: [
				{ beats, chord: { root: "C", suffix: "major" } },
				{ beats: own, chord: { root: "G", suffix: "major" } },
			],
		};
		const [made] = liftDivergedProgressions([pattern], [diverged], newId).patterns;
		expect(patternRhythm(made)).toEqual([beats, own]);
		expect(made.name).toBe("Folk · C|G");
	});

	it("measures against presets too, and skips a sequence whose pattern is gone", () => {
		const overPreset: ChordProgression = {
			...progression,
			patternId: "4-4 on the beats",
			bars: [{ beats: own, chord: null }],
		};
		const orphan: ChordProgression = { ...progression, patternId: "deleted", bars: [{ beats: own, chord: null }] };
		const lift = liftDivergedProgressions([], [overPreset, orphan], newId);
		expect(lift.progressions.map((p) => p.id)).toEqual([overPreset.id]);
		expect(lift.patterns[0].name).toBe("on the beat · Verse");
	});
});

describe("migrateGuestStrumStorage", () => {
	beforeEach(() => localStorage.clear());
	const own: StrumPattern["beats"] = [["X", "X"], ["X", "X"], ["X", "X"], ["X", "X"]];

	it("lifts a diverged guest sequence once and records that it has", () => {
		localStorage.setItem(STRUM_PATTERNS_STORAGE_KEY, JSON.stringify([pattern]));
		localStorage.setItem(
			STRUM_PROGRESSIONS_STORAGE_KEY,
			JSON.stringify([{ ...progression, bars: [{ beats: own, chord: null }], syncedBeats: beats, followsPattern: false }]),
		);
		migrateGuestStrumStorage();
		const patterns = JSON.parse(localStorage.getItem(STRUM_PATTERNS_STORAGE_KEY)!) as StrumPattern[];
		expect(patterns).toHaveLength(2);
		const [stored] = readStoredProgressions();
		expect(stored.patternId).not.toBe("p1");
		expect(patterns.some((p) => p.id === stored.patternId)).toBe(true);
		// The old bookkeeping is not carried on.
		expect(stored).not.toHaveProperty("followsPattern");
		expect(localStorage.getItem(GUEST_RHYTHM_LIFT_KEY)).toBe("1");

		migrateGuestStrumStorage();
		expect(JSON.parse(localStorage.getItem(STRUM_PATTERNS_STORAGE_KEY)!)).toHaveLength(2);
	});

	it("writes nothing but the flag when nothing diverged", () => {
		localStorage.setItem(STRUM_PATTERNS_STORAGE_KEY, JSON.stringify([pattern]));
		localStorage.setItem(STRUM_PROGRESSIONS_STORAGE_KEY, JSON.stringify([progression]));
		migrateGuestStrumStorage();
		expect(JSON.parse(localStorage.getItem(STRUM_PATTERNS_STORAGE_KEY)!)).toEqual([pattern]);
		expect(localStorage.getItem(GUEST_RHYTHM_LIFT_KEY)).toBe("1");
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

	it("writes an imported sequence with the pattern's rhythm, whatever it arrived with", async () => {
		const offbeat: StrumPattern["beats"] = [["", "U"], ["", "U"], ["", "U"], ["", "U"]];
		await importStrumPattern(noClient, null, pattern, [{ ...progression, bars: [{ beats: offbeat, chord: null }] }]);
		expect(readStoredProgressions()[0].bars[0].beats).toEqual(beats);
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
