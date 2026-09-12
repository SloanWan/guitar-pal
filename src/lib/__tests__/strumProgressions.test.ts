import { describe, it, expect } from "vitest";
import {
	parseChordSequence,
	hasShapeToken,
	progressionBarsFromTokens,
	keptTokens,
	syncBarsToPattern,
	chordAbbreviation,
	defaultProgressionName,
	progressionDisplayName,
	sortProgressions,
	nextOrderIndex,
	progressionsForPattern,
	normalizeCapo,
	progressionCapo,
	NO_CHORD_LABEL,
	patternSyncState,
	applyPatternSync,
	declinePatternSync,
	resumePatternSync,
	dismissPatternNotice,
	markPatternSynced,
	normalizeProgressionSync,
} from "@/lib/strumProgressions";
import { STRUM_CAPO_MAX } from "@/lib/strumPatterns";
import type { Bar, Beat, ChordProgression } from "@/lib/strumPatterns";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { parseTabSequence } from "@/lib/chordTabSequence";

function progression(overrides: Partial<ChordProgression>): ChordProgression {
	return {
		id: "pr1",
		patternId: "4-4 old faithful",
		bars: [{ beats: [["D", ""]], chord: null }],
		orderIndex: 0,
		...overrides,
	};
}

describe("normalizeCapo", () => {
	it("keeps a fret in range", () => {
		expect(normalizeCapo(2)).toBe(2);
		expect(normalizeCapo(STRUM_CAPO_MAX)).toBe(STRUM_CAPO_MAX);
	});

	it("clamps below zero and above the highest offered fret", () => {
		expect(normalizeCapo(-3)).toBe(0);
		expect(normalizeCapo(40)).toBe(STRUM_CAPO_MAX);
	});

	it("rounds a fractional fret", () => {
		expect(normalizeCapo(2.4)).toBe(2);
		expect(normalizeCapo(2.6)).toBe(3);
	});

	it("reads a missing or unusable value as no capo", () => {
		expect(normalizeCapo(undefined)).toBe(0);
		expect(normalizeCapo(null)).toBe(0);
		expect(normalizeCapo(NaN)).toBe(0);
		expect(normalizeCapo("2")).toBe(0);
	});

	it("reads a progression's capo, defaulting to none", () => {
		expect(progressionCapo(progression({ capo: 5 }))).toBe(5);
		expect(progressionCapo(progression({}))).toBe(0);
		expect(progressionCapo(null)).toBe(0);
	});
});

describe("progression naming", () => {
	it("abbreviates chords the way a chart does", () => {
		expect(chordAbbreviation({ root: "C", suffix: "major" })).toBe("C");
		expect(chordAbbreviation({ root: "A", suffix: "minor" })).toBe("Am");
		expect(chordAbbreviation({ root: "G", suffix: "7" })).toBe("G7");
		expect(chordAbbreviation({ root: "C", suffix: "/G" })).toBe("C/G");
	});

	it("names an unnamed progression after its chords, pipe separated", () => {
		const bars: Bar[] = [
			{ beats: [["D"]], chord: { root: "C", suffix: "major" } },
			{ beats: [["D"]], chord: { root: "A", suffix: "minor" } },
		];
		expect(defaultProgressionName(bars)).toBe("C|Am");
	});

	it("marks bars with no chord picked yet", () => {
		const bars: Bar[] = [
			{ beats: [["D"]], chord: { root: "G", suffix: "major" } },
			{ beats: [["D"]], chord: null },
		];
		expect(defaultProgressionName(bars)).toBe(`G|${NO_CHORD_LABEL}`);
		expect(defaultProgressionName([])).toBe(NO_CHORD_LABEL);
	});

	it("lists a bar kept as a name under that name, not as a blank", () => {
		const bars: Bar[] = [
			{ beats: [["D"]], chord: { root: "C", suffix: "major" } },
			{ beats: [["D"]], chord: null, unknownChord: "Cadd9#11" },
		];
		expect(defaultProgressionName(bars)).toBe("C|Cadd9#11");
	});

	it("prefers a user-given name, ignoring a blank one", () => {
		const bars: Bar[] = [{ beats: [["D"]], chord: { root: "C", suffix: "major" } }];
		expect(progressionDisplayName(progression({ bars, name: "Verse" }))).toBe("Verse");
		expect(progressionDisplayName(progression({ bars, name: "   " }))).toBe("C");
		expect(progressionDisplayName(progression({ bars }))).toBe("C");
	});
});

describe("ordering", () => {
	it("sorts by order index without mutating the input", () => {
		const list = [
			progression({ id: "b", orderIndex: 2 }),
			progression({ id: "a", orderIndex: 1 }),
		];
		expect(sortProgressions(list).map((p) => p.id)).toEqual(["a", "b"]);
		expect(list.map((p) => p.id)).toEqual(["b", "a"]);
	});

	it("appends after the highest index", () => {
		expect(nextOrderIndex([])).toBe(0);
		expect(
			nextOrderIndex([progression({ orderIndex: 0 }), progression({ orderIndex: 4 })]),
		).toBe(5);
	});
});

describe("progressionsForPattern", () => {
	it("keeps only the pattern's own progressions, in order", () => {
		const list = [
			progression({ id: "other", patternId: "muted", orderIndex: 0 }),
			progression({ id: "second", orderIndex: 1 }),
			progression({ id: "first", orderIndex: 0 }),
		];
		expect(progressionsForPattern(list, "4-4 old faithful").map((p) => p.id)).toEqual([
			"first",
			"second",
		]);
	});
});

// A slice of the real index: the roots and qualities the tests type.
const INDEX: readonly ChordIndexEntry[] = [
	{ root: "C", suffix: "major" },
	{ root: "C", suffix: "minor" },
	{ root: "C", suffix: "/G" },
	{ root: "G", suffix: "major" },
	{ root: "G", suffix: "7" },
	{ root: "A", suffix: "major" },
	{ root: "A", suffix: "minor" },
	{ root: "F", suffix: "major" },
	{ root: "Eb", suffix: "major" },
];

describe("parseChordSequence", () => {
	it("reads a space-separated sequence", () => {
		const { chords, unmatched } = parseChordSequence("C G Am F", INDEX);
		expect(unmatched).toEqual([]);
		expect(chords).toEqual([
			{ root: "C", suffix: "major", voicingId: null },
			{ root: "G", suffix: "major", voicingId: null },
			{ root: "A", suffix: "minor", voicingId: null },
			{ root: "F", suffix: "major", voicingId: null },
		]);
	});

	it("accepts dashes, commas and pipes as separators", () => {
		expect(parseChordSequence("C - G", INDEX).chords).toHaveLength(2);
		expect(parseChordSequence("C,G,Am", INDEX).chords).toHaveLength(3);
		expect(parseChordSequence("C | G", INDEX).chords).toHaveLength(2);
	});

	it("splits a dashed chord line with no spaces", () => {
		// The way a chord line is most often written, and the one case the
		// separator list could not take on its own without breaking dashed shapes.
		const { chords, unmatched } = parseChordSequence("C-G-Am-F", INDEX);
		expect(unmatched).toEqual([]);
		expect(chords.map((c) => c.root)).toEqual(["C", "G", "A", "F"]);
		expect(parseChordSequence("C–G—Am", INDEX).chords).toHaveLength(3);
	});

	it("keeps a dashed shape as one token", () => {
		const { tokens } = parseChordSequence("0-1-0-2-2-0", INDEX);
		expect(tokens).toHaveLength(1);
		expect(tokens[0].shape).toBe(true);
	});

	it("resolves the same spellings the chord picker accepts", () => {
		expect(parseChordSequence("g7", INDEX).chords[0]).toMatchObject({
			root: "G",
			suffix: "7",
		});
		expect(parseChordSequence("D#", INDEX).chords[0]).toMatchObject({ root: "Eb" });
		expect(parseChordSequence("C/G", INDEX).chords[0]).toMatchObject({ suffix: "/G" });
	});

	it("reports tokens no chord matches, keeping the rest", () => {
		const { chords, unmatched } = parseChordSequence("C zzz G", INDEX);
		expect(chords).toHaveLength(2);
		expect(unmatched).toEqual(["zzz"]);
	});

	it("reads an empty input as no chords", () => {
		expect(parseChordSequence("   ", INDEX)).toEqual({
			tokens: [],
			chords: [],
			unmatched: [],
		});
	});

	it("keeps every token in typed order for the live preview", () => {
		const { tokens } = parseChordSequence("C zzz Am", INDEX);
		expect(tokens.map((t) => t.input)).toEqual(["C", "zzz", "Am"]);
		expect(tokens.map((t) => t.chord?.root ?? null)).toEqual(["C", null, "A"]);
	});
});

describe("a shape written into a chord sequence", () => {
	// Stands in for the voicing lookup: only this one grip is held by anything.
	const HELD = "01023x";
	const resolve = (frets: (number | "x")[]) =>
		frets.join(",") === parseTabSequence(HELD).frets!.join(",")
			? { root: "C", suffix: "major", voicingId: "lib-1" }
			: null;

	it("resolves a written shape to the chord held that way, pinned to it", () => {
		const { tokens } = parseChordSequence(`G ${HELD}`, INDEX, resolve);
		expect(tokens[0].shape).toBeUndefined();
		expect(tokens[1]).toMatchObject({
			input: HELD,
			shape: true,
			chord: { root: "C", suffix: "major", voicingId: "lib-1" },
		});
	});

	it("leaves a shape nothing is held with unresolved, and says it was a shape", () => {
		const { tokens, unmatched } = parseChordSequence("007707", INDEX, resolve);
		expect(tokens[0]).toMatchObject({ input: "007707", shape: true, chord: null });
		expect(unmatched).toEqual(["007707"]);
	});

	it("reads a dashed shape, which is how one survives a URL", () => {
		expect(parseChordSequence("x-3-2-0-1-0", INDEX, resolve).tokens[0].shape).toBe(true);
	});

	it("resolves nothing without a lookup, rather than guessing", () => {
		expect(parseChordSequence(HELD, INDEX).tokens[0]).toMatchObject({
			shape: true,
			chord: null,
		});
	});

	it("never reads a chord name as a shape", () => {
		const { tokens } = parseChordSequence("C G Am F", INDEX, resolve);
		expect(tokens.every((t) => t.shape === undefined)).toBe(true);
	});

	describe("hasShapeToken — asked before the voicings are fetched", () => {
		it("is true only when a shape is actually written", () => {
			expect(hasShapeToken("C G Am F")).toBe(false);
			expect(hasShapeToken("C 007707 G")).toBe(true);
			expect(hasShapeToken("")).toBe(false);
		});
	});
});

describe("keptTokens — the answer to the unknown-chord prompt", () => {
	const TOKENS = parseChordSequence("C zzz G", INDEX).tokens;

	it("drops the words no chord matched when the answer is skip", () => {
		expect(keptTokens(TOKENS, "skip").map((t) => t.input)).toEqual(["C", "G"]);
	});

	it("writes every word down when the answer is keep", () => {
		expect(keptTokens(TOKENS, "keep").map((t) => t.input)).toEqual(["C", "zzz", "G"]);
	});

	it("leaves the parsed tokens alone", () => {
		keptTokens(TOKENS, "keep").pop();
		expect(TOKENS).toHaveLength(3);
	});
});

describe("progressionBarsFromTokens", () => {
	it("gives every chord a bar of the pattern's rhythm", () => {
		const beats = [["D", ""], ["", "U"]];
		const bars = progressionBarsFromTokens(beats, parseChordSequence("C G", INDEX).tokens);
		expect(bars).toHaveLength(2);
		expect(bars[0].beats).toEqual(beats);
		expect(bars[1].chord).toMatchObject({ root: "G" });
		bars[0].beats[0][0] = "X";
		expect(beats[0][0]).toBe("D");
	});

	it("keeps a word the library could not match as the bar's name", () => {
		const beats: Beat[] = [["D", ""]];
		const bars = progressionBarsFromTokens(beats, parseChordSequence("C zzz", INDEX).tokens);
		expect(bars).toHaveLength(2);
		expect(bars[1].chord).toBeNull();
		expect(bars[1].unknownChord).toBe("zzz");
	});

	it("leaves a resolved bar with no name to carry", () => {
		const bars = progressionBarsFromTokens([["D"]], parseChordSequence("C", INDEX).tokens);
		expect(bars[0].unknownChord).toBeUndefined();
	});
});

describe("syncBarsToPattern", () => {
	const OLD: Beat[] = [
		["D", ""],
		["D", ""],
	];
	const NEW: Beat[] = [
		["D", "U"],
		["", "U"],
	];
	const HAND_EDITED: Beat[] = [["X", "X"], ["D", "U"]];

	it("rewrites bars that still play the pattern's old rhythm, keeping their chords", () => {
		const bars: Bar[] = [
			{ beats: OLD.map((b) => [...b]), chord: { root: "C", suffix: "major" } },
			{ beats: OLD.map((b) => [...b]), chord: { root: "G", suffix: "major" } },
		];
		const next = syncBarsToPattern(bars, OLD, NEW);
		expect(next.map((b) => b.beats)).toEqual([NEW, NEW]);
		expect(next.map((b) => b.chord?.root)).toEqual(["C", "G"]);
	});

	it("leaves a bar the user re-wrote in the progression editor alone", () => {
		const bars: Bar[] = [
			{ beats: OLD.map((b) => [...b]), chord: null },
			{ beats: HAND_EDITED.map((b) => [...b]), chord: null },
		];
		const next = syncBarsToPattern(bars, OLD, NEW);
		expect(next[0].beats).toEqual(NEW);
		expect(next[1].beats).toEqual(HAND_EDITED);
	});

	it("returns the input untouched when the rhythm did not change", () => {
		const bars: Bar[] = [{ beats: OLD.map((b) => [...b]), chord: null }];
		expect(syncBarsToPattern(bars, OLD, OLD.map((b) => [...b]))).toBe(bars);
	});

	it("returns the input untouched when no bar matched the old rhythm", () => {
		const bars: Bar[] = [{ beats: HAND_EDITED.map((b) => [...b]), chord: null }];
		expect(syncBarsToPattern(bars, OLD, NEW)).toBe(bars);
	});

	it("copies the new beats per bar rather than sharing one array", () => {
		const bars: Bar[] = [
			{ beats: OLD.map((b) => [...b]), chord: null },
			{ beats: OLD.map((b) => [...b]), chord: null },
		];
		const next = syncBarsToPattern(bars, OLD, NEW);
		next[0].beats[0][0] = "X";
		expect(next[1].beats[0][0]).toBe("D");
		expect(NEW[0][0]).toBe("D");
	});
});

describe("reconciling a progression with its pattern", () => {
	const OLD: Beat[] = [["D", ""], ["D", "U"]];
	const NEW: Beat[] = [["D", "U"], ["D", "U"]];
	const OWN: Beat[] = [["X", "X"], ["X", "X"]];

	function progression(over: Partial<ChordProgression> = {}): ChordProgression {
		return {
			id: "p1",
			patternId: "pat",
			orderIndex: 0,
			bars: [
				{ beats: OLD.map((b) => [...b]), chord: { root: "C", suffix: "major" } },
				{ beats: OLD.map((b) => [...b]), chord: { root: "G", suffix: "major" } },
			],
			...over,
		};
	}

	describe("patternSyncState", () => {
		it("asks when the pattern has moved since the sequence was reconciled", () => {
			const state = patternSyncState(progression({ syncedBeats: OLD }), NEW);
			expect(state.kind).toBe("ask");
			if (state.kind !== "ask") return;
			expect(state.previousBeats).toEqual(OLD);
		});

		it("stays quiet when the sequence already plays the pattern's rhythm", () => {
			expect(patternSyncState(progression({ syncedBeats: NEW }), NEW).kind).toBe("in-sync");
		});

		it("never asks a sequence written before the prompt existed", () => {
			// No baseline to diff or to sync from; asking would be a question with
			// no describable answer.
			expect(patternSyncState(progression(), NEW).kind).toBe("backfill");
		});

		it("stays quiet once the player has declined", () => {
			const declined = progression({ syncedBeats: OLD, followsPattern: false });
			expect(patternSyncState(declined, NEW).kind).toBe("detached");
		});

		it("compares by content, not by reference", () => {
			const copy = OLD.map((b) => [...b]);
			expect(patternSyncState(progression({ syncedBeats: copy }), OLD).kind).toBe("in-sync");
		});
	});

	describe("answering yes", () => {
		it("carries the pattern's new rhythm into the bars that still followed it", () => {
			const next = applyPatternSync(progression({ syncedBeats: OLD }), NEW);
			expect(next.bars[0].beats).toEqual(NEW);
			expect(next.bars[1].beats).toEqual(NEW);
		});

		it("leaves a bar the player re-wrote inside the progression alone", () => {
			const p = progression({ syncedBeats: OLD });
			p.bars[1] = { ...p.bars[1], beats: OWN.map((b) => [...b]) };
			const next = applyPatternSync(p, NEW);
			expect(next.bars[0].beats).toEqual(NEW);
			expect(next.bars[1].beats).toEqual(OWN);
		});

		it("never touches the chords", () => {
			const next = applyPatternSync(progression({ syncedBeats: OLD }), NEW);
			expect(next.bars.map((b) => b.chord?.root)).toEqual(["C", "G"]);
		});

		it("records the answer, so the same edit is not asked about twice", () => {
			const next = applyPatternSync(progression({ syncedBeats: OLD }), NEW);
			expect(patternSyncState(next, NEW).kind).toBe("in-sync");
		});
	});

	describe("answering no", () => {
		it("stops the sequence following the pattern", () => {
			const next = declinePatternSync(progression({ syncedBeats: OLD }));
			expect(patternSyncState(next, NEW).kind).toBe("detached");
		});

		it("changes no bar", () => {
			const p = progression({ syncedBeats: OLD });
			expect(declinePatternSync(p).bars).toEqual(p.bars);
		});

		it("stays quiet through a later pattern edit", () => {
			const declined = declinePatternSync(progression({ syncedBeats: OLD }));
			expect(patternSyncState(declined, OWN).kind).toBe("detached");
		});

		it("leaves the snapshot where it was, so following again still has a baseline", () => {
			// Moving it would strand the sequence: its bars would match no snapshot
			// the pattern will ever have, and "follow again" would do nothing.
			const declined = declinePatternSync(progression({ syncedBeats: OLD }));
			expect(declined.syncedBeats).toEqual(OLD);
		});
	});

	describe("following again", () => {
		it("only lifts the refusal", () => {
			const declined = declinePatternSync(progression({ syncedBeats: OLD }));
			const resumed = resumePatternSync(declined);
			expect(resumed.bars).toEqual(declined.bars);
			expect(resumed.followsPattern).toBe(true);
		});

		it("asks again rather than applying a later edit unseen", () => {
			const declined = declinePatternSync(progression({ syncedBeats: OLD }));
			expect(patternSyncState(resumePatternSync(declined), OWN).kind).toBe("ask");
		});
	});

	describe("reading the fields back from storage", () => {
		it("keeps a well-formed snapshot and a refusal", () => {
			expect(normalizeProgressionSync({ syncedBeats: OLD, followsPattern: false })).toEqual({
				syncedBeats: OLD,
				followsPattern: false,
			});
		});

		it("drops a snapshot that is not a bar's worth of beats", () => {
			for (const junk of [null, "D DU", 5, [], [[]], {}, [["D", "U", "U", "U", "U"]]]) {
				expect(normalizeProgressionSync({ syncedBeats: junk }).syncedBeats).toBeUndefined();
			}
		});

		it("checks the shape here and the cell values on the way in", () => {
			// validateBars still only judges the shape, but a snapshot crosses the
			// storage boundary like every other rhythm: a retired ghost reads back as
			// the unstruck cell it always was, and a value from nowhere reads as one
			// too rather than being carried around as a rhythm nothing can play.
			expect(normalizeProgressionSync({ syncedBeats: [["D", "UG"]] }).syncedBeats).toEqual([
				["D", ""],
			]);
			expect(normalizeProgressionSync({ syncedBeats: [["Q"]] }).syncedBeats).toEqual([[""]]);
		});

		it("treats anything but an explicit false as still following", () => {
			for (const value of [undefined, true, "false", 0, null]) {
				expect(normalizeProgressionSync({ followsPattern: value }).followsPattern).toBeUndefined();
			}
		});

		it("makes a dropped snapshot backfill rather than prompt", () => {
			const restored = { ...progression(), ...normalizeProgressionSync({ syncedBeats: "junk" }) };
			expect(patternSyncState(restored, NEW).kind).toBe("backfill");
		});
	});

	it("copies the snapshot rather than aliasing the pattern's own beats", () => {
		const patternBeats: Beat[] = [["D", ""]];
		const next = markPatternSynced(progression(), patternBeats);
		expect(next.syncedBeats).toEqual(patternBeats);
		expect(next.syncedBeats?.[0]).not.toBe(patternBeats[0]);
	});
});

describe("a pattern edit only asks when this sequence would actually change", () => {
	const OLD: Beat[] = [["D", ""], ["D", "U"]];
	const NEW: Beat[] = [["D", "U"], ["D", "U"]];
	const OWN: Beat[] = [["X", "X"], ["X", "X"]];

	function withBars(beats: Beat[][], syncedBeats: Beat[]): ChordProgression {
		return {
			id: "p1",
			patternId: "pat",
			orderIndex: 0,
			syncedBeats,
			bars: beats.map((b) => ({ beats: b.map((x) => [...x]), chord: null })),
		};
	}

	it("asks when at least one bar still follows the pattern", () => {
		expect(patternSyncState(withBars([OLD, OWN], OLD), NEW).kind).toBe("ask");
	});

	it("stays quiet when every bar has been re-written in the progression editor", () => {
		// The pattern moved, but nothing here follows it, so there is no question
		// to put — only noise on every future pattern edit.
		expect(patternSyncState(withBars([OWN, OWN], OLD), NEW).kind).toBe("no-change");
	});

	it("stays quiet when the bars already read the way the pattern now does", () => {
		// Reached by editing the progression to match the pattern's new rhythm by
		// hand: the snapshot is stale, but applying it would change nothing.
		expect(patternSyncState(withBars([NEW, NEW], OLD), NEW).kind).toBe("no-change");
	});

	it("does not ask again once the quiet case has been settled", () => {
		const settled = markPatternSynced(withBars([OWN, OWN], OLD), NEW);
		expect(patternSyncState(settled, NEW).kind).toBe("in-sync");
	});

	it("still asks a sequence that follows, even beside one that does not", () => {
		const mixed = withBars([OWN, OLD, OWN], OLD);
		const state = patternSyncState(mixed, NEW);
		expect(state.kind).toBe("ask");
		if (state.kind !== "ask") return;
		// And applying touches only the bar that followed.
		const next = applyPatternSync(mixed, NEW);
		expect(next.bars.map((b) => b.beats)).toEqual([OWN, NEW, OWN]);
	});
});

describe("dismissing the not-following notice", () => {
	const OLD: Beat[] = [["D", ""], ["D", "U"]];
	const NEW: Beat[] = [["D", "U"], ["D", "U"]];

	function declined(): ChordProgression {
		return declinePatternSync({
			id: "p1",
			patternId: "pat",
			orderIndex: 0,
			syncedBeats: OLD,
			bars: [{ beats: OLD.map((b) => [...b]), chord: null }],
		});
	}

	it("shows the notice until it is dismissed", () => {
		expect(patternSyncState(declined(), NEW).kind).toBe("detached");
		expect(patternSyncState(dismissPatternNotice(declined()), NEW).kind).toBe(
			"detached-dismissed",
		);
	});

	it("changes nothing about the sequence itself", () => {
		const before = declined();
		const after = dismissPatternNotice(before);
		expect(after.bars).toEqual(before.bars);
		expect(after.followsPattern).toBe(false);
		expect(after.syncedBeats).toEqual(OLD);
	});

	it("stays dismissed through later pattern edits", () => {
		const dismissed = dismissPatternNotice(declined());
		expect(patternSyncState(dismissed, [["X", "X"]]).kind).toBe("detached-dismissed");
	});

	it("is lifted by following again, so a later refusal is visible", () => {
		// The silence was agreed to about one decision; re-engaging should not
		// inherit it for the next.
		const resumed = resumePatternSync(dismissPatternNotice(declined()));
		expect(resumed.syncNoticeDismissed).toBeUndefined();
		expect(patternSyncState(declinePatternSync(resumed), NEW).kind).toBe("detached");
	});

	it("is only read from storage when it is exactly true", () => {
		for (const value of [undefined, false, "true", 1, null]) {
			expect(
				normalizeProgressionSync({ syncNoticeDismissed: value }).syncNoticeDismissed,
			).toBeUndefined();
		}
		expect(normalizeProgressionSync({ syncNoticeDismissed: true }).syncNoticeDismissed).toBe(true);
	});
});
