import { describe, it, expect } from "vitest";
import {
	USER_VOICING_ID_PREFIX,
	chordIndexWithUser,
	dedupeUserVoicing,
	isUserVoicingId,
	sameShape,
	mergeVoicings,
	rawUserVoicingId,
	rowToUserVoicing,
	userVoicingColumns,
	userVoicingId,
	withUserVoicings,
	type UserChordVoicing,
	type UserVoicingRow,
} from "@/lib/userChordVoicings";
import { chordShapeToVoicing, MUTED, type ChordShape } from "@/lib/chordShape";
import { chordVoicingToMidi } from "@/lib/chordVoicingToMidi";
import { resolveBarChords, selectRefVoicing } from "@/lib/strumBars";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

const SHAPE: ChordShape = {
	startFret: 9,
	frets: [MUTED, 9, 11, 11, 10, MUTED],
	fingers: [0, 1, 3, 4, 2, 0],
	barreFret: null,
};

function row(over: Partial<UserVoicingRow> = {}): UserVoicingRow {
	const encoded = chordShapeToVoicing(SHAPE, "raw-1", "my shape");
	return {
		id: "raw-1",
		root: "A",
		suffix: "minor",
		label: "my shape",
		start_fret: encoded.start_fret,
		barre_fret: encoded.barre_fret,
		capo: encoded.capo,
		frets: encoded.frets,
		fingers: encoded.fingers,
		...over,
	};
}

function libraryVoicing(id: string): ChordVoicing {
	return {
		id,
		label: null,
		start_fret: 1,
		barre_fret: null,
		capo: false,
		frets: "x02210",
		fingers: "002310",
	};
}

describe("telling a player's shape from the library's", () => {
	it("marks and unmarks an id", () => {
		expect(userVoicingId("abc")).toBe(`${USER_VOICING_ID_PREFIX}abc`);
		expect(isUserVoicingId(userVoicingId("abc"))).toBe(true);
		expect(isUserVoicingId("abc")).toBe(false);
		expect(rawUserVoicingId(userVoicingId("abc"))).toBe("abc");
	});

	it("does not double-mark an id that is already marked", () => {
		const once = userVoicingId("abc");
		expect(userVoicingId(once)).toBe(once);
	});

	it("leaves a library id alone when asked for its raw form", () => {
		expect(rawUserVoicingId("library-id")).toBe("library-id");
	});
});

describe("mergeVoicings", () => {
	const user: UserChordVoicing[] = [
		{ ...chordShapeToVoicing(SHAPE, "u:1", "mine"), root: "A", suffix: "minor" },
		{ ...chordShapeToVoicing(SHAPE, "u:2", "other"), root: "C", suffix: "major" },
	];

	it("offers the library's shapes and the player's own for that chord", () => {
		const merged = mergeVoicings([libraryVoicing("lib-1")], user, "A", "minor");
		expect(merged.map((v) => v.id)).toEqual(["lib-1", "u:1"]);
	});

	it("keeps another chord's shapes out", () => {
		const merged = mergeVoicings([], user, "C", "major");
		expect(merged.map((v) => v.id)).toEqual(["u:2"]);
	});

	it("leaves the standard voicing the library's", () => {
		// A shape written for one song must not silently become what every bar of
		// that chord sounds like: the library's come first, so selectStandardVoicing
		// still picks from them.
		const merged = mergeVoicings([libraryVoicing("lib-1")], user, "A", "minor");
		expect(merged[0].id).toBe("lib-1");
	});

	it("returns just the library's when the player has none", () => {
		expect(mergeVoicings([libraryVoicing("lib-1")], [], "A", "minor")).toHaveLength(1);
	});
});

describe("pinning a shape on a chord", () => {
	const user: UserChordVoicing = {
		...chordShapeToVoicing(SHAPE, "u:1", "mine"),
		root: "A",
		suffix: "minor",
	};

	it("resolves a pinned user shape through the existing selector", () => {
		const merged = mergeVoicings([libraryVoicing("lib-1")], [user], "A", "minor");
		const picked = selectRefVoicing({ root: "A", suffix: "minor", voicingId: "u:1" }, merged);
		expect(picked?.id).toBe("u:1");
	});

	it("falls back to the standard voicing when the shape has been deleted", () => {
		// The player deleted their shape; the bar must still play, not break.
		const picked = selectRefVoicing(
			{ root: "A", suffix: "minor", voicingId: "u:1" },
			[libraryVoicing("lib-1")],
		);
		expect(picked?.id).toBe("lib-1");
	});

	it("sounds the frets it was drawn with, not the chord it is named after", () => {
		const merged = mergeVoicings([libraryVoicing("lib-1")], [user], "A", "minor");
		const picked = selectRefVoicing({ root: "A", suffix: "minor", voicingId: "u:1" }, merged);
		expect(chordVoicingToMidi(picked!).map((n) => n.midi)).toEqual(
			chordVoicingToMidi(chordShapeToVoicing(SHAPE, "x")).map((n) => n.midi),
		);
	});
});

describe("reading a stored row", () => {
	it("reads a well-formed row and marks its id", () => {
		const voicing = rowToUserVoicing(row());
		expect(voicing).not.toBeNull();
		expect(voicing!.id).toBe("u:raw-1");
		expect(voicing!.root).toBe("A");
		expect(voicing!.label).toBe("my shape");
	});

	it("drops a row whose frets could not be drawn", () => {
		// A malformed shape is a silent wrong pitch, so it is dropped rather than
		// repaired into something plausible.
		for (const frets of ["", "xxx", "x0221", "x02210x", "x0z210"]) {
			expect(rowToUserVoicing(row({ frets }))).toBeNull();
		}
	});

	it("drops a row with no chord identity", () => {
		expect(rowToUserVoicing(row({ root: "" }))).toBeNull();
		expect(rowToUserVoicing(row({ suffix: "" }))).toBeNull();
		expect(rowToUserVoicing(row({ id: "" }))).toBeNull();
	});

	it("drops a row whose window is off the neck", () => {
		expect(rowToUserVoicing(row({ start_fret: 0 }))).toBeNull();
		expect(rowToUserVoicing(row({ start_fret: 99 }))).toBeNull();
	});

	it("falls back rather than dropping for the parts that only affect drawing", () => {
		expect(rowToUserVoicing(row({ fingers: "bogus" }))!.fingers).toBe("000000");
		expect(rowToUserVoicing(row({ fingers: null }))!.fingers).toBe("000000");
		expect(rowToUserVoicing(row({ start_fret: null }))!.start_fret).toBe(1);
		expect(rowToUserVoicing(row({ barre_fret: 99 }))!.barre_fret).toBeNull();
		expect(rowToUserVoicing(row({ capo: null }))!.capo).toBe(false);
	});

	it("treats a blank name as no name", () => {
		expect(rowToUserVoicing(row({ label: "   " }))!.label).toBeNull();
		expect(rowToUserVoicing(row({ label: null }))!.label).toBeNull();
		expect(rowToUserVoicing(row({ label: " kept " }))!.label).toBe("kept");
	});
});

describe("writing a row back", () => {
	it("stores the id bare — the prefix is a client concern", () => {
		const voicing: UserChordVoicing = {
			...chordShapeToVoicing(SHAPE, "u:raw-1", "mine"),
			root: "A",
			suffix: "minor",
		};
		expect(userVoicingColumns(voicing, "user-1").id).toBe("raw-1");
		expect(userVoicingColumns(voicing, "user-1").user_id).toBe("user-1");
	});

	it("round-trips through storage unchanged", () => {
		const original = rowToUserVoicing(row())!;
		const again = rowToUserVoicing(userVoicingColumns(original, "user-1"));
		expect(again).toEqual(original);
	});
});

describe("what the engine and the grid resolve", () => {
	const mine: UserChordVoicing = {
		...chordShapeToVoicing(SHAPE, "u:1", "mine"),
		root: "A",
		suffix: "minor",
	};
	const library = [libraryVoicing("lib-1")];
	const base = async () => library;

	const pinnedBar = [
		{ beats: [["D", "U"]], chord: { root: "A", suffix: "minor", voicingId: "u:1" } },
	] as Parameters<typeof resolveBarChords>[0];

	it("plays the player's shape once the lookup knows about it", () => {
		// The bug this covers: the lookup returned the library only, so the pinned
		// id was never found, selectRefVoicing fell back to the standard voicing,
		// and the bar was drawn and played wrong with nothing raised anywhere.
		return resolveBarChords(pinnedBar, withUserVoicings(base, [mine])).then((pitches) => {
			expect(pitches[0]).toEqual(
				chordVoicingToMidi(chordShapeToVoicing(SHAPE, "x")).map((n) => n.midi),
			);
		});
	});

	it("plays the library's shape when the lookup does not", () => {
		// Same bar, same pin — the difference is only whether the shapes were
		// merged in, which is what makes forgetting it silent.
		return resolveBarChords(pinnedBar, async (ref) => base(ref.root, ref.suffix)).then(
			(pitches) => {
				expect(pitches[0]).toEqual(chordVoicingToMidi(library[0]).map((n) => n.midi));
			},
		);
	});

	it("still returns the library's shapes for a chord the player has not touched", async () => {
		const lookup = withUserVoicings(base, [mine]);
		expect((await lookup({ root: "C", suffix: "major" })).map((v) => v.id)).toEqual(["lib-1"]);
	});

	it("offers a shape for a chord the library has nothing for", async () => {
		const lookup = withUserVoicings(async () => [], [mine]);
		expect((await lookup({ root: "A", suffix: "minor" })).map((v) => v.id)).toEqual(["u:1"]);
	});
});

describe("saving the same shape twice", () => {
	const stored: UserChordVoicing = {
		...chordShapeToVoicing(SHAPE, "u:1", "mine"),
		root: "A",
		suffix: "minor",
	};

	function candidate(over: Partial<UserChordVoicing> = {}): UserChordVoicing {
		return {
			...chordShapeToVoicing(SHAPE, "u:fresh", "mine"),
			root: "A",
			suffix: "minor",
			...over,
		};
	}

	it("reuses the row already on record", () => {
		// Every save mints a fresh id, so pressing apply twice on the same grip
		// would file it twice without this.
		expect(dedupeUserVoicing([stored], candidate()).id).toBe("u:1");
	});

	it("keeps the pin working by keeping the stored id", () => {
		const kept = dedupeUserVoicing([stored], candidate());
		expect(selectRefVoicing({ root: "A", suffix: "minor", voicingId: kept.id }, [stored])?.id).toBe(
			"u:1",
		);
	});

	it("files a genuinely different grip separately", () => {
		const moved = chordShapeToVoicing({ ...SHAPE, frets: [MUTED, 9, 11, 11, 9, MUTED] }, "u:fresh");
		expect(dedupeUserVoicing([stored], { ...moved, root: "A", suffix: "minor" }).id).toBe("u:fresh");
	});

	it("files the same grip under a different chord separately", () => {
		// The same fingering can function as more than one chord.
		expect(dedupeUserVoicing([stored], candidate({ root: "C", suffix: "major" })).id).toBe(
			"u:fresh",
		);
	});

	it("treats a differently fingered grip as a different shape", () => {
		const refingered = {
			...stored,
			id: "u:fresh",
			fingers: "013400",
		};
		expect(dedupeUserVoicing([stored], refingered).id).toBe("u:fresh");
	});

	it("names a shape that had none, without making a second copy", () => {
		const unnamed = { ...stored, label: null };
		const result = dedupeUserVoicing([unnamed], candidate({ label: "at last" }));
		expect(result.id).toBe("u:1");
		expect(result.label).toBe("at last");
	});

	it("does not rename a shape that already has one", () => {
		const result = dedupeUserVoicing([stored], candidate({ label: "something else" }));
		expect(result.label).toBe("mine");
	});

	it("keeps the candidate when nothing is on record", () => {
		expect(dedupeUserVoicing([], candidate()).id).toBe("u:fresh");
	});
});

describe("sameShape", () => {
	const base = chordShapeToVoicing(SHAPE, "a");

	it("ignores the id and the name", () => {
		expect(sameShape(base, { ...base, id: "b", label: "other" })).toBe(true);
	});

	it("notices every part of the grip", () => {
		expect(sameShape(base, { ...base, frets: "x1332x".replace("3", "4") })).toBe(false);
		expect(sameShape(base, { ...base, fingers: "000000" })).toBe(false);
		expect(sameShape(base, { ...base, start_fret: base.start_fret + 1 })).toBe(false);
		expect(sameShape(base, { ...base, barre_fret: 1 })).toBe(false);
		expect(sameShape(base, { ...base, capo: true })).toBe(false);
	});
});

describe("chordIndexWithUser — the player's own chords are searchable too", () => {
	const shape = (root: string, suffix: string): UserChordVoicing => ({
		id: "u:1",
		label: null,
		start_fret: 1,
		barre_fret: null,
		capo: false,
		frets: "x32010",
		fingers: "032010",
		root,
		suffix,
	});
	const INDEX = [
		{ root: "C", suffix: "major" },
		{ root: "G", suffix: "major" },
	];

	it("adds a chord the library does not carry, so it can be typed again", () => {
		expect(chordIndexWithUser(INDEX, [shape("C", "add9#11")])).toEqual([
			...INDEX,
			{ root: "C", suffix: "add9#11" },
		]);
	});

	it("does not repeat a chord the library already has", () => {
		expect(chordIndexWithUser(INDEX, [shape("C", "major")])).toEqual(INDEX);
	});

	it("lists a chord once however many shapes were written for it", () => {
		const two = [shape("C", "add9#11"), { ...shape("C", "add9#11"), id: "u:2" }];
		expect(chordIndexWithUser(INDEX, two)).toHaveLength(INDEX.length + 1);
	});

	it("leaves the index it was given alone", () => {
		chordIndexWithUser(INDEX, [shape("C", "add9#11")]).push({ root: "X", suffix: "y" });
		expect(INDEX).toHaveLength(2);
	});
});
